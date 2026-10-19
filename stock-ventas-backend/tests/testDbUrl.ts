import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Infra de URLs para los tests: la suite corre siempre contra una base
// DEDICADA (stock_ventas_test), nunca contra la base real de desarrollo.
//
// Fuente de verdad de la URL base:
//   1. `DATABASE_URL` del archivo .env del backend (desarrollo local)
//   2. `DATABASE_URL` del entorno (CI, donde no hay .env)
export const NOMBRE_DB_TEST = process.env.TEST_DB_NAME || "stock_ventas_test";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function leerUrlDelEnvFile(): string | null {
  const envPath = path.join(backendRoot, ".env");
  if (!existsSync(envPath)) return null;
  const contenido = readFileSync(envPath, "utf8");
  const linea = contenido
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith("DATABASE_URL="));
  if (!linea) return null;
  const valor = linea.slice("DATABASE_URL=".length).trim();
  return valor.replace(/^["']|["']$/g, "") || null;
}

export function urlBase(): string {
  const url = leerUrlDelEnvFile() || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "No se pudo determinar DATABASE_URL: falta el archivo .env (copialo desde .env.example) o la variable de entorno."
    );
  }
  return url;
}

// Reemplaza el nombre de la base en una connection string, conservando
// host/puerto/credenciales y query string.
export function conNombreDeBase(url: string, nombreBase: string): string {
  const [sinQuery, query] = url.split("?");
  const idx = sinQuery.lastIndexOf("/");
  if (idx === -1) throw new Error(`DATABASE_URL inválida: ${url}`);
  const nueva = sinQuery.slice(0, idx + 1) + nombreBase;
  return query ? `${nueva}?${query}` : nueva;
}

function agregarParametro(url: string, clave: string, valor: string): string {
  const [base, query] = url.split("?");
  const params = new URLSearchParams(query || "");
  if (!params.has(clave)) params.set(clave, valor);
  return `${base}?${params.toString()}`;
}

export function urlsDeTest(): { base: string; test: string; mantenimiento: string } {
  const base = urlBase();
  // connection_limit explícito: la suite dispara ventas concurrentes (cada
  // transacción interactiva necesita una conexión y además consulta
  // promociones por fuera), y el default de Prisma (cpus*2+1) queda corto en
  // máquinas de pocas cores (p. ej. runners de CI).
  const test = agregarParametro(conNombreDeBase(base, NOMBRE_DB_TEST), "connection_limit", "20");
  // Base de mantenimiento para CREATE/DROP DATABASE ("postgres" existe
  // por defecto en toda instalación de PostgreSQL).
  const mantenimiento = conNombreDeBase(base, "postgres");
  return { base, test, mantenimiento };
}
