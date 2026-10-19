import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { NOMBRE_DB_TEST, urlsDeTest } from "./testDbUrl";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// globalSetup corre ANTES que los tests (en otro proceso): crea la base
// stock_ventas_test desde cero y le aplica las migraciones con
// `prisma migrate deploy`. Al terminar (teardown) la vuelve a dropear para
// no dejar basura en la máquina.
export default async function globalSetup() {
  const { test, mantenimiento } = urlsDeTest();

  const crearBase = async () => {
    const cliente = new Client({ connectionString: mantenimiento });
    await cliente.connect();
    try {
      await cliente.query(`DROP DATABASE IF EXISTS ${NOMBRE_DB_TEST} WITH (FORCE)`);
      await cliente.query(`CREATE DATABASE ${NOMBRE_DB_TEST}`);
    } finally {
      await cliente.end();
    }
  };

  await crearBase();

  // CLI de Prisma invocado vía node (evita `npx` + shell: portátil y sin
  // warnings de shell injection de child_process).
  const cliPrisma = path.join(backendRoot, "node_modules", "prisma", "build", "index.js");
  if (!existsSync(cliPrisma)) {
    throw new Error(`No se encontró el CLI de Prisma en ${cliPrisma}. Corré "npm install".`);
  }

  const migraciones = spawnSync(process.execPath, [cliPrisma, "migrate", "deploy"], {
    cwd: backendRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: test },
  });

  if (migraciones.status !== 0) {
    throw new Error("Fallo `prisma migrate deploy` sobre la base de tests");
  }

  return async function teardown() {
    try {
      const cliente = new Client({ connectionString: mantenimiento });
      await cliente.connect();
      await cliente.query(`DROP DATABASE IF EXISTS ${NOMBRE_DB_TEST} WITH (FORCE)`);
      await cliente.end();
    } catch (err) {
      console.warn("No se pudo dropear la base de tests:", (err as Error).message);
    }
  };
}
