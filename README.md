# Backend — Sistema de Gestión de Stock y Ventas

Node + Express + TypeScript + Prisma + PostgreSQL.

## Puesta en marcha

Para un usuario final en Windows sin conocimientos técnicos, seguí la guía
completa en [`INSTALACION.md`](../INSTALACION.md) (raíz del repo) y usá
`Iniciar Sistema.bat` para el uso diario. Lo que sigue es la puesta en
marcha resumida para desarrollo.

1. **Instalar dependencias**
   ```bash
   npm install
   ```

2. **Base de datos**: PostgreSQL corriendo de forma nativa (recomendado,
   ver `INSTALACION.md`) o, si preferís seguir usando Docker en desarrollo,
   con el script alternativo:
   ```bash
   npm run predev:docker   # levanta el contenedor stock-ventas-db (ver scripts/ensure-docker.js)
   ```
   Con PostgreSQL nativo instalado, `npm run dev` ya se encarga de
   verificar/levantar el servicio automáticamente (`scripts/ensure-postgres.js`,
   corre como hook `predev`) — no hace falta nada manual acá.

3. **Variables de entorno**
   ```bash
   cp .env.example .env
   ```
   Editá `.env` y ajustá `DATABASE_URL` con tus credenciales reales (usuario
   y contraseña de tu PostgreSQL nativo, no las del viejo contenedor Docker),
   y `JWT_SECRET` con un valor random largo (podés generar uno con
   `openssl rand -hex 32`).

4. **Migración inicial** (crea las tablas en la base de datos)
   ```bash
   npx prisma migrate dev --name init
   ```

5. **Seed** (crea el usuario admin inicial: `admin` / `admin123`)
   ```bash
   npm run seed
   ```

6. **Levantar el servidor en desarrollo**
   ```bash
   npm run dev
   ```
   Esto corre primero `scripts/ensure-postgres.js` (verifica/levanta el
   servicio de PostgreSQL nativo y crea la base `stock_ventas` si no existe)
   y después arranca el servidor. Debería quedar escuchando en
   `http://localhost:3000`.

   Si preferís seguir usando el contenedor Docker en vez de PostgreSQL
   nativo durante el desarrollo, usá `npm run dev:docker` en su lugar
   (corre `scripts/ensure-docker.js`, que se conserva como alternativa).

7. **Probar que responde**
   ```bash
   curl http://localhost:3000/api/v1/health
   ```

## Estructura del proyecto

```
src/
  app.ts              # configuración de Express y montaje de rutas
  server.ts            # punto de entrada
  lib/prisma.ts         # cliente de Prisma (singleton)
  middleware/
    auth.ts             # requireAuth, requireRole
    errorHandler.ts      # manejo centralizado de errores
  utils/
    AppError.ts          # clase de error de aplicación
    asyncHandler.ts       # wrapper para controllers async
  modules/
    auth/                # login
    productos/            # CRUD + búsqueda + ajuste de stock
    ventas/                # el módulo más importante: venta transaccional
prisma/
  schema.prisma          # modelo de datos completo
  seed.ts                 # usuario admin inicial
```

## Lo ya implementado

- **Auth**: login con JWT (`POST /api/v1/auth/login`)
- **Productos**: CRUD completo, búsqueda rápida para POS, ajuste manual de stock
- **Ventas**: creación transaccional (con lock de fila `FOR UPDATE` para evitar sobreventa en concurrencia), listado, detalle, anulación con reversión de stock

## Lo que falta implementar (mismo patrón que productos/ventas)

Cada uno sigue la estructura `modulo/modulo.service.ts` + `modulo/modulo.routes.ts`, montado en `app.ts`:

- [ ] **categorias**: CRUD simple
- [ ] **proveedores**: CRUD simple
- [ ] **compras**: similar a ventas pero sumando stock en vez de restando
- [ ] **clientes**: CRUD + cuenta corriente
- [ ] **caja**: apertura/cierre con cálculo de diferencia
- [ ] **reportes**: agregaciones sobre `ventas` y `movimientos_stock` (usar `prisma.venta.groupBy` o `$queryRaw` para las agregaciones más complejas)

## Notas de diseño importantes

- **Nunca se actualiza `stock_actual` directamente desde una ruta.** Todo cambio de stock pasa por una transacción que también crea un registro en `movimientos_stock` — es la fuente de verdad para auditoría.
- **Todos los montos usan `Decimal`**, nunca `number`/`float`, para evitar errores de redondeo con plata real.
- **La venta usa `SELECT ... FOR UPDATE`** sobre cada producto antes de descontar stock, para que dos ventas simultáneas no puedan vender más unidades de las que hay disponibles.
- **Los productos nunca se borran físicamente**, solo baja lógica (`activo: false`), porque ya pueden tener ventas o compras asociadas.