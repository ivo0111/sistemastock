/**
 * ensure-postgres.js
 *
 * Reemplaza a ensure-docker.js. En vez de gestionar un contenedor Docker,
 * verifica que el servicio nativo de PostgreSQL de Windows esté corriendo
 * y que la base de datos "stock_ventas" exista, creándola si hace falta.
 *
 * No instala PostgreSQL: si no hay ningún servicio instalado, corta con un
 * mensaje claro remitiendo a INSTALACION.md (el usuario lo instala una sola
 * vez, siguiendo la guía).
 *
 * Requiere que `psql` esté disponible en el PATH. El instalador oficial de
 * PostgreSQL para Windows (postgresql.org) agrega su carpeta `bin` al PATH
 * por default, así que en una instalación estándar esto ya funciona solo.
 */

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

// Carga stock-ventas-backend/.env aunque este script se invoque directamente
// (ej. desde "Iniciar Sistema.bat"), no solo a través de "npm run dev".
require('dotenv').config();

const DB_NAME = 'stock_ventas';
const PG_SUPERUSER = process.env.PGUSER || 'postgres';
const PG_HOST = process.env.PGHOST || 'localhost';
const PG_PORT = process.env.PGPORT || '5432';

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf-8', ...opts });
}

/**
 * Intenta encontrar el ejecutable `psql` ya sea en el PATH del sistema o
 * escaneando directorios de instalación comunes de PostgreSQL en Windows.
 * Devuelve la ruta completa a psql.exe o null si no lo encuentra.
 */
function findPsqlPath() {
  // 1) Probar si psql ya está en el PATH
  try {
    const cmd = process.platform === 'win32' ? 'where psql' : 'which psql';
    const result = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const firstLine = result.split(/\r?\n/)[0].trim();
    if (firstLine && existsSync(firstLine)) return firstLine;
  } catch {
    // no está en el PATH, seguimos buscando
  }

  // 2) Escanear directorios de instalación conocidos
  const programFiles = [
    process.env['ProgramFiles'] || 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  ];
  const pgDirs = [];

  for (const pf of programFiles) {
    const pgRoot = join(pf, 'PostgreSQL');
    if (!existsSync(pgRoot)) continue;
    try {
      const entries = require('fs').readdirSync(pgRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && /^\d+$/.test(entry.name)) {
          pgDirs.push(join(pgRoot, entry.name, 'bin', 'psql.exe'));
        }
      }
    } catch {
      // ignorar errores de lectura
    }
  }

  // Buscar en orden descendente de versión (la más reciente primero)
  pgDirs.sort().reverse();
  for (const candidate of pgDirs) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

/**
 * Busca servicios de Windows cuyo nombre empiece con "postgresql"
 * (los instalados por el instalador oficial se llaman típicamente
 * "postgresql-x64-<version>"). Devuelve una lista de nombres de servicio.
 */
function findPostgresServices() {
  try {
    // `sc query state= all` lista todos los servicios; filtramos por nombre.
    const output = run('sc query state= all');
    const names = [];
    const lines = output.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/(?:SERVICE_NAME|NOMBRE_DE_SERVICIO|NOMBRE_SERVICIO):\s*(postgresql\S*)/i);
      if (match) names.push(match[1]);
    }
    return names;
  } catch {
    return [];
  }
}

/**
 * Devuelve 'running' | 'stopped' para un servicio de Windows dado.
 */
function getServiceState(serviceName) {
  try {
    const output = run(`sc query "${serviceName}"`);
    if (/(?:STATE|ESTADO)\s*:\s*4\s*RUNNING/i.test(output)) return 'running';
    return 'stopped';
  } catch {
    return 'unknown';
  }
}

function startService(serviceName) {
  console.log(`▶️  Servicio "${serviceName}" está detenido. Iniciando...`);
  try {
    run(`net start "${serviceName}"`, { stdio: 'pipe' });
    console.log(`✅ Servicio "${serviceName}" iniciado.`);
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    console.error(`\n❌ No se pudo iniciar el servicio "${serviceName}".`);
    if (/acceso denegado|access is denied|5:/i.test(output)) {
      console.error(
        '   Parece un problema de permisos. Probá una de estas opciones:\n' +
        '   1) Cerrá esta ventana y volvé a ejecutar como Administrador\n' +
        '      (clic derecho sobre "Iniciar Sistema.bat" → "Ejecutar como administrador").\n' +
        '   2) O iniciá el servicio manualmente: abrí "Servicios" de Windows\n' +
        `      (Win + R, escribí "services.msc"), buscá "${serviceName}" y hacé clic en "Iniciar".`
      );
    } else {
      console.error(`   Detalle: ${output.trim() || err.message}`);
    }
    process.exit(1);
  }
}

function ensureServiceRunning() {
  const services = findPostgresServices();

  if (services.length === 0) {
    console.error(
      '\n❌ No se detectó ningún servicio de PostgreSQL instalado en este equipo.\n' +
      '   Este script no instala PostgreSQL automáticamente.\n' +
      '   Instalalo siguiendo la guía en INSTALACION.md (sección "Requisitos previos")\n' +
      '   y volvé a intentar.'
    );
    process.exit(1);
  }

  // Si hay varios (raro, pero posible si se reinstaló alguna vez), usamos el primero.
  const serviceName = services[0];
  const state = getServiceState(serviceName);

  if (state === 'running') {
    console.log(`✅ Servicio de PostgreSQL "${serviceName}" ya está corriendo.`);
    return;
  }

  if (state === 'stopped') {
    startService(serviceName);
    return;
  }

  console.error(`\n❌ No se pudo determinar el estado del servicio "${serviceName}".`);
  process.exit(1);
}

/**
 * Verifica que la base "stock_ventas" exista conectando a la base "postgres"
 * por defecto vía psql. Si no existe, la crea.
 *
 * Usa PGPASSWORD tomado de la variable de entorno del mismo nombre, o de
 * DATABASE_URL si está seteada, para no pedir la contraseña interactivamente.
 */
function getPgPasswordFromEnv() {
  if (process.env.PGPASSWORD) return process.env.PGPASSWORD;

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const parsed = new URL(dbUrl);
      if (parsed.password) return decodeURIComponent(parsed.password);
    } catch {
      // DATABASE_URL mal formada; seguimos sin contraseña (psql la pedirá o fallará).
    }
  }
  return undefined;
}

function ensureDatabaseExists() {
  const psqlBin = findPsqlPath();
  if (!psqlBin) {
    console.error(
      '\n❌ No se encontró el ejecutable "psql" en el PATH ni en directorios de instalación comunes.\n' +
      '   Agregá la carpeta "bin" de tu instalación de PostgreSQL al PATH del sistema.\n' +
      '   Ejemplo: C:\\Program Files\\PostgreSQL\\18\\bin'
    );
    process.exit(1);
  }

  const password = getPgPasswordFromEnv();
  const env = { ...process.env };
  if (password) env.PGPASSWORD = password;

  const psqlBase = `"${psqlBin}" -h ${PG_HOST} -p ${PG_PORT} -U ${PG_SUPERUSER} -d postgres -tAc`;

  let exists = false;
  try {
    const output = run(
      `${psqlBase} "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'"`,
      { env, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    exists = output.trim() === '1';
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    console.error('\n❌ No se pudo conectar a PostgreSQL con psql.');
    console.error(
      '   Verificá que el usuario/contraseña de PGUSER/PGPASSWORD (o de DATABASE_URL en .env)\n' +
      '   sean correctos, y que psql esté en el PATH.'
    );
    if (output.trim()) console.error(`   Detalle: ${output.trim()}`);
    process.exit(1);
  }

  if (exists) {
    console.log(`✅ Base de datos "${DB_NAME}" ya existe.`);
    return;
  }

  console.log(`📦 Base de datos "${DB_NAME}" no existe. Creándola...`);
  try {
    run(`${psqlBase} "CREATE DATABASE ${DB_NAME}"`, { env, stdio: 'inherit' });
    console.log(`✅ Base de datos "${DB_NAME}" creada.`);
  } catch (err) {
    console.error(`\n❌ No se pudo crear la base de datos "${DB_NAME}".`);
    console.error(`   Detalle: ${err.message}`);
    process.exit(1);
  }
}

function main() {
  ensureServiceRunning();
  ensureDatabaseExists();
}

main();
