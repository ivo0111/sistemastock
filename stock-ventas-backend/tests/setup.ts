import { afterAll } from "vitest";
import { urlsDeTest } from "./testDbUrl";

// Se ejecuta en el worker ANTES de cada archivo de test: apunta Prisma a la
// base de tests. Hay que asignar el env y recién después importar
// src/lib/prisma (un import estático se evaluaría antes de esta línea).
process.env.DATABASE_URL = urlsDeTest().test;
process.env.NODE_ENV = "test";

const { prisma } = await import("../src/lib/prisma");

afterAll(async () => {
  await prisma.$disconnect();
});
