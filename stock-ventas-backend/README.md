# Backend — Sistema de Gestión de Stock y Ventas

Node.js + Express + TypeScript + Prisma + PostgreSQL.

El contexto del proyecto, la puesta en marcha general y la documentación
viven en el [README de la raíz](../README.md); acá solo lo específico del
backend.

## Puesta en marcha (desarrollo)

1. **Dependencias**
   ```bash
   npm install
   ```

2. **Variables de entorno**
   ```bash
   cp .env.example .env
   ```
   Ajustá `DATABASE_URL` (tu PostgreSQL nativo) y `JWT_SECRET`
   (`openssl rand -hex 32`). El resto tiene defaults razonables
   (ARCA en modo `mock`, etc.).

3. **Base de datos**: con PostgreSQL nativo instalado, `npm run dev` ya
   verifica/levanta el servicio y crea la base si no existe
   (`scripts/ensure-postgres.js`, hook `predev`). Si preferís Docker:
   `npm run predev:docker` y después `npm run dev:docker`.

4. **Migraciones y seed**
   ```bash
   npx prisma migrate dev
   npm run seed            # usuario admin: admin / admin123
   ```

5. **Servidor**
   ```bash
   npm run dev             # http://localhost:3000
   curl http://localhost:3000/api/v1/health
   ```
   El servidor además sirve el build del frontend
   (`../stock-ventas-frontend/dist`, si existe) en el mismo puerto.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | desarrollo con watch (tsx) |
| `npm run build` | compila TypeScript a `dist/` |
| `npm start` | corre `dist/server.js` |
| `npm test` | vitest: crea/dropea la base `stock_ventas_test` y corre `tests/` |
| `npm run lint` | oxlint sobre `src/` y `tests/` |
| `npm run typecheck` | `tsc --noEmit` del código y de los tests |
| `npm run prisma:migrate` | crear/aplicar migraciones en desarrollo |
| `npm run seed` | usuario admin inicial |

## Estructura

```
src/
  app.ts               # Express: rutas, estáticos del front, SPA fallback
  server.ts             # entrypoint, apagado ordenado (cerrarBrowser, etc.)
  config/arca.config.ts # configuración ARCA desde .env
  lib/prisma.ts         # cliente Prisma (singleton)
  middleware/           # auth (JWT + roles), errorHandler
  utils/                # AppError, asyncHandler, fechas
  modules/<modulo>/     # <modulo>.service.ts + <modulo>.routes.ts
prisma/
  schema.prisma         # modelo de datos
  migrations/           # migraciones versionadas
  seed.ts               # admin inicial
tests/
  globalSetup.ts        # crea stock_ventas_test + migrate deploy; teardown la dropea
  setup.ts              # apunta DATABASE_URL a la base de tests por worker
  *.test.ts             # suite (servicios, sin HTTP)
```

## Tests

`npm test` (vitest + PostgreSQL):

- La base `stock_ventas_test` se crea desde cero con las migraciones y se
  elimina al final de la corrida. Nunca toca la base de desarrollo.
- Si no hay `.env`, se usa la variable de entorno `DATABASE_URL` (así funciona
  en CI).
- Los tests ejercitan los services directamente (sin pasar por HTTP).

## ARCA (facturación electrónica)

`ARCA_MODO=mock` (default) genera un CAE simulado: sirve para desarrollar y
probar el flujo completo sin certificado. `homologacion` / `produccion`
requieren certificado digital y CUIT habilitados (ver `.env.example`).
