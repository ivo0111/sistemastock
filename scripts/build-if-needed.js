#!/usr/bin/env node
/*
 * Compila un proyecto SOLO si cambiaron sus fuentes/configuración desde la
 * última compilación exitosa. Lo usa "Iniciar Sistema.bat" para no recompilar
 * backend y frontend en cada arranque.
 *
 * Uso:
 *   node scripts/build-if-needed.js stock-ventas-backend
 *   node scripts/build-if-needed.js stock-ventas-frontend
 *   node scripts/build-if-needed.js stock-ventas-frontend --force
 *
 * Es multiplataforma (Windows/Linux/macOS) y no depende de PowerShell ni de
 * utilidades externas: sirve igual en la máquina del cliente y en CI.
 *
 * El "fingerprint" combina contenido + mtime + tamaño de las fuentes y de los
 * archivos de configuración. Si no hay cambios, existen los artefactos de
 * salida y no se pidió --force, se omite `npm run build`.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const VERSION_ESTAMPILLA = 1;
const RAIZ = path.resolve(__dirname, "..");

const PROYECTOS = {
  "stock-ventas-backend": {
    directorios: ["src", "prisma"],
    archivos: [
      "package.json",
      "package-lock.json",
      "tsconfig.json",
      "tsconfig.tests.json",
      "vitest.config.mts",
    ],
    salidas: ["dist/server.js"],
  },
  "stock-ventas-frontend": {
    directorios: ["src", "public"],
    archivos: [
      "package.json",
      "package-lock.json",
      "index.html",
      "vite.config.js",
      "vite.config.ts",
      ".oxlintrc.json",
    ],
    salidas: ["dist/index.html"],
  },
};

const IGNORADOS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  "backups",
  ".cache",
  ".build-stamp.json",
]);

function uso() {
  console.error(
    "Uso: node scripts/build-if-needed.js <stock-ventas-backend|stock-ventas-frontend> [--force]"
  );
}

function listarArchivos(ruta, salida) {
  if (!fs.existsSync(ruta)) return;
  const stat = fs.statSync(ruta);
  if (stat.isFile()) {
    salida.push(ruta);
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entrada of fs.readdirSync(ruta).sort()) {
    if (IGNORADOS.has(entrada)) continue;
    listarArchivos(path.join(ruta, entrada), salida);
  }
}

function calcularFingerprint(proyectoDir, config) {
  const archivos = [];
  for (const directorio of config.directorios) {
    listarArchivos(path.join(proyectoDir, directorio), archivos);
  }
  for (const archivo of config.archivos) {
    const ruta = path.join(proyectoDir, archivo);
    if (fs.existsSync(ruta) && fs.statSync(ruta).isFile()) archivos.push(ruta);
  }

  const hash = crypto.createHash("sha256");
  hash.update(`v${VERSION_ESTAMPILLA}\0`);
  for (const archivo of archivos.sort()) {
    const relativo = path.relative(proyectoDir, archivo).replace(/\\/g, "/");
    const stat = fs.statSync(archivo);
    hash.update(relativo);
    hash.update("\0");
    hash.update(String(stat.size));
    hash.update("\0");
    hash.update(String(Math.trunc(stat.mtimeMs)));
    hash.update("\0");
    hash.update(fs.readFileSync(archivo));
    hash.update("\0");
  }
  return { hash: hash.digest("hex"), cantidadArchivos: archivos.length };
}

function rutaEstampilla(proyectoDir) {
  return path.join(proyectoDir, "node_modules", ".cache", "sistema-stock-build.json");
}

function leerEstampilla(proyectoDir) {
  try {
    return JSON.parse(fs.readFileSync(rutaEstampilla(proyectoDir), "utf8"));
  } catch {
    return null;
  }
}

function guardarEstampilla(proyectoDir, datos) {
  const ruta = rutaEstampilla(proyectoDir);
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 2) + "\n", "utf8");
}

function main() {
  const nombreProyecto = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const forzar =
    process.argv.includes("--force") ||
    process.env.FORCE_BUILD === "1" ||
    process.env.FORCE_BUILD === "true";

  if (!nombreProyecto || !PROYECTOS[nombreProyecto]) {
    uso();
    process.exit(2);
  }

  const config = PROYECTOS[nombreProyecto];
  const proyectoDir = path.join(RAIZ, nombreProyecto);
  if (!fs.existsSync(proyectoDir)) {
    console.error(`[build] No existe el proyecto: ${proyectoDir}`);
    process.exit(2);
  }

  const { hash, cantidadArchivos } = calcularFingerprint(proyectoDir, config);
  const estampilla = leerEstampilla(proyectoDir);
  const salidasOk = config.salidas.every((salida) =>
    fs.existsSync(path.join(proyectoDir, salida))
  );

  if (!forzar && estampilla && estampilla.hash === hash && salidasOk) {
    console.log(
      `[build] ${nombreProyecto}: sin cambios (${cantidadArchivos} archivos), se omite la compilación.`
    );
    return;
  }

  const motivo = forzar
    ? "se pidió --force"
    : !salidasOk
      ? "faltan artefactos de salida"
      : !estampilla
        ? "primera compilación"
        : "cambiaron las fuentes";

  console.log(`[build] ${nombreProyecto}: compilando (${motivo})...`);

  // Se ejecuta como comando (sin array de argumentos) para evitar el warning
  // DEP0190 de Node en Windows al combinar shell:true con args.
  const comando = "npm run build";
  const resultado = spawnSync(comando, {
    cwd: proyectoDir,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  if (resultado.error) {
    console.error(`[build] ERROR al ejecutar npm: ${resultado.error.message}`);
    process.exit(1);
  }
  if (resultado.status !== 0) {
    console.error(`[build] ERROR: npm run build terminó con código ${resultado.status}.`);
    process.exit(resultado.status || 1);
  }

  guardarEstampilla(proyectoDir, {
    version: VERSION_ESTAMPILLA,
    proyecto: nombreProyecto,
    hash,
    cantidadArchivos,
    compiladoEn: new Date().toISOString(),
  });
  console.log(`[build] ${nombreProyecto}: compilación OK.`);
}

main();
