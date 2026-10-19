import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["tests/globalSetup.ts"],
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Base de datos compartida: los archivos corren de a uno en el mismo
    // proceso, así los TRUNCATE entre archivos no pisan tests en paralelo.
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
