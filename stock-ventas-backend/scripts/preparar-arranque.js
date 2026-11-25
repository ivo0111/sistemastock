#!/usr/bin/env node
/*
 * Preparación rápida del arranque.
 *
 * Reemplaza la secuencia "verificar duplicados + prisma generate + prisma
 * migrate deploy" que se ejecutaba en CADA inicio. Acá:
 *   - Se consulta una sola vez la tabla _prisma_migrations.
 *   - Solo si hay migraciones pendientes o fallidas se corre el chequeo de
 *     duplicados y `prisma migrate deploy`.
 *   - `prisma generate` solo corre si falta el cliente o cambió el schema /
 *     la versión de Prisma (estampilla en node_modules/.cache).
 *
 * Resultado: en un arranque normal no se lanzan procesos de Prisma; el
 * launcher pasa casi directo a levantar el backend.
 *
 * Uso (desde stock-ventas-backend):
 *   node scripts/preparar-arranque.js
 *
 * Códigos de salida:
 *   0  todo listo
 *   5  falta DATABASE_URL o no se pudo conectar a PostgreSQL
 *   *  el código del comando que falló (prisma, verificación, etc.)
 */
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const DIR_MIGRACIONES = path.join(RAIZ, "prisma", "migrations");
const DIR_CACHE = path.join(RAIZ, "node_modules", ".cache");
const ESTAMPILLA_PRISMA = path.join(DIR_CACHE, "prisma-generate.json");
const VERSION_ESTAMPILLA = 1;

try {
  require("dotenv").config({ path: path.join(RAIZ, ".env") });
} catch {
  // Sin dotenv instalado no se puede seguir: el launcher ya valida
  // node_modules antes de llegar acá.
  console.error("[prep] ERROR: falta el paquete dotenv. Ejecutá npm install en stock-ventas-backend.");
  process.exit(5);
}

function ejecutar(comando, descripcion) {
  console.log(`[prep] ${descripcion}`);
  const resultado = spawnSync(comando, {
    cwd: RAIZ,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (resultado.error) {
    console.error(`[prep] ERROR: ${resultado.error.message}`);
    process.exit(1);
  }
  if (resultado.status !== 0) {
    process.exit(resultado.status || 1);
  }
}

function hashArchivo(ruta) {
  return crypto.createHash("sha256").update(fs.readFileSync(ruta)).digest("hex");
}

/**
 * Huella de lo que determina el cliente generado: schema + versión de Prisma
 * (package.json / package-lock.json). Si no cambia, no hace falta regenerar.
 */
function hashEntradaPrisma() {
  const hash = crypto.createHash("sha256");
  for (const relativo of ["prisma/schema.prisma", "package.json", "package-lock.json"]) {
    const ruta = path.join(RAIZ, relativo);
    hash.update(relativo);
    hash.update("\0");
    if (fs.existsSync(ruta)) hash.update(fs.readFileSync(ruta));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function motivoPrismaGenerate() {
  const cliente = path.join(RAIZ, "node_modules", ".prisma", "client", "index.js");
  const paquete = path.join(RAIZ, "node_modules", "@prisma", "client", "default.js");
  if (!fs.existsSync(cliente) || !fs.existsSync(paquete)) {
    return "falta el cliente generado";
  }

  const hashActual = hashEntradaPrisma();
  try {
    const estampilla = JSON.parse(fs.readFileSync(ESTAMPILLA_PRISMA, "utf8"));
    if (estampilla.version === VERSION_ESTAMPILLA && estampilla.hash === hashActual) {
      return null;
    }
  } catch {
    // Sin estampilla (primera vez o node_modules recreado): regenerar.
  }
  return "cambió el schema o la versión de Prisma";
}

function guardarEstampillaPrisma() {
  fs.mkdirSync(DIR_CACHE, { recursive: true });
  fs.writeFileSync(
    ESTAMPILLA_PRISMA,
    JSON.stringify(
      {
        version: VERSION_ESTAMPILLA,
        hash: hashEntradaPrisma(),
        generadoEn: new Date().toISOString(),
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
}

function listarMigracionesEnDisco() {
  if (!fs.existsSync(DIR_MIGRACIONES)) return [];
  return fs
    .readdirSync(DIR_MIGRACIONES, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .sort();
}

async function estadoMigraciones() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "[prep] ERROR: falta DATABASE_URL (definila en stock-ventas-backend/.env o como variable de entorno)."
    );
    process.exit(5);
  }

  let Client;
  try {
    ({ Client } = require("pg"));
  } catch {
    console.error("[prep] ERROR: falta el paquete pg. Ejecutá npm install en stock-ventas-backend.");
    process.exit(5);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
  } catch (error) {
    console.error(`[prep] ERROR: no se pudo conectar a PostgreSQL: ${error.message}`);
    process.exit(5);
  }

  try {
    const tabla = await client.query(
      "SELECT to_regclass('public._prisma_migrations') AS tabla"
    );
    const enDisco = listarMigracionesEnDisco();

    if (!tabla.rows[0]?.tabla) {
      // Base nueva (o sin historial de Prisma): migrate deploy se encarga.
      return { pendientes: enDisco, fallidas: [], aplicadas: 0 };
    }

    const { rows } = await client.query(
      'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"'
    );
    const aplicadas = new Set(
      rows
        .filter((fila) => fila.finished_at && !fila.rolled_back_at)
        .map((fila) => fila.migration_name)
    );
    const fallidas = rows
      .filter((fila) => !fila.finished_at && !fila.rolled_back_at)
      .map((fila) => fila.migration_name);

    return {
      pendientes: enDisco.filter((nombre) => !aplicadas.has(nombre)),
      fallidas,
      aplicadas: aplicadas.size,
    };
  } finally {
    await client.end();
  }
}

async function main() {
  console.log("[prep] Verificando estado de la base de datos...");
  const estado = await estadoMigraciones();

  if (estado.fallidas.length > 0) {
    console.log(
      `[prep] Hay migraciones fallidas (${estado.fallidas.join(", ")}). Se reintentará migrate deploy.`
    );
  }

  if (estado.pendientes.length > 0 || estado.fallidas.length > 0) {
    console.log(`[prep] Migraciones pendientes: ${estado.pendientes.length}.`);
    // El chequeo solo hace falta cuando se va a migrar (es el momento en que
    // el índice único de comprobantes podría fallar).
    ejecutar(
      "node scripts/verificar-duplicados-comprobantes.js",
      "Verificando comprobantes duplicados..."
    );
    ejecutar("npx prisma migrate deploy", "Aplicando migraciones pendientes...");
  } else {
    console.log(
      `[prep] Base de datos al día (${estado.aplicadas} migraciones aplicadas).`
    );
  }

  const motivo = motivoPrismaGenerate();
  if (motivo) {
    ejecutar("npx prisma generate", `Generando cliente Prisma (${motivo})...`);
    guardarEstampillaPrisma();
  } else {
    console.log("[prep] Cliente Prisma al día, se omite generate.");
  }

  console.log("[prep] Listo.");
}

main().catch((error) => {
  console.error(`[prep] ERROR inesperado: ${error?.message || error}`);
  process.exit(1);
});
