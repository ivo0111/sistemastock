# Sistema de Gestión de Stock y Ventas

Aplicación full-stack para comercio minorista: POS, stock con auditoría de
movimientos, facturación electrónica ARCA (modo mock por default), cuenta
corriente de clientes, caja, compras a proveedores y reportes.

## Stack

- **Backend** (`stock-ventas-backend/`): Node.js + Express + TypeScript + Prisma + PostgreSQL
- **Frontend** (`stock-ventas-frontend/`): React + Vite. En producción no necesita
  servidor aparte: el build queda en `stock-ventas-frontend/dist/` y el propio
  backend lo sirve en el mismo puerto.
- **Instalador Windows** (`installer/`): Inno Setup + `Iniciar Sistema.bat`

## Usuarios finales (Windows)

1. Seguí la guía paso a paso en [INSTALACION.md](INSTALACION.md).
2. Uso diario: doble clic en `Iniciar Sistema.bat`. Abre `http://localhost:3000`.
   El script verifica PostgreSQL, aplica migraciones pendientes, compila backend
   y frontend, y levanta el servidor.

Usuario inicial: `admin` / `admin123` (cambialo en el primer ingreso).

## Estructura del repositorio

```
.
├── Iniciar Sistema.bat        # arranque diario para usuarios finales
├── INSTALACION.md             # guía de instalación (usuarios finales)
├── api.md                     # contrato de la API REST
├── installer/                 # Inno Setup (el .exe se genera, no se versiona)
├── stock-ventas-backend/
│   ├── src/
│   │   ├── app.ts             # Express: rutas + estáticos + SPA fallback
│   │   ├── server.ts          # punto de entrada + apagado ordenado
│   │   ├── lib/prisma.ts      # cliente Prisma (singleton)
│   │   ├── middleware/        # requireAuth, requireRole, errorHandler
│   │   └── modules/           # auth, productos, ventas, compras, clientes,
│   │                          # caja, categorias, proveedores, stock,
│   │                          # reportes, usuarios, promociones, arca
│   ├── prisma/                # schema.prisma, migraciones, seed
│   └── tests/                 # vitest (crea/dropea stock_ventas_test sola)
└── stock-ventas-frontend/
    └── src/
        ├── api/client.js      # cliente fetch con JWT
        ├── pages/             # POS, productos, ventas, compras, clientes,
        │                      # caja, reportes, promociones, usuarios...
        └── components/        # Layout y componentes compartidos
```

## Desarrollo

Requisitos: Node.js 20+ (probado con 24) y PostgreSQL 14+ local
(ver `INSTALACION.md`; en desarrollo `npm run dev` lo verifica/levanta solo).

### Backend

```bash
cd stock-ventas-backend
npm install
cp .env.example .env    # editar DATABASE_URL y JWT_SECRET
npx prisma migrate dev  # crea las tablas
npm run seed            # usuario admin inicial
npm run dev             # http://localhost:3000
```

Comandos útiles: `npm run build`, `npm start`, `npm test`, `npm run lint`,
`npm run typecheck`, `npm run prisma:migrate`, `npm run seed`.

### Frontend

```bash
cd stock-ventas-frontend
npm install
npm run dev             # http://localhost:5173 (proxy /api -> :3000)
```

En desarrollo se labura contra `vite dev`; para probar como usuario final,
`npm run build` y arrancá el backend (o `Iniciar Sistema.bat`).

## Tests

```bash
cd stock-ventas-backend
npm test
```

Vitest contra una base descartable `stock_ventas_test` que se crea y se
elimina sola al principio y al final de cada corrida
(`stock-ventas-backend/tests/globalSetup.ts`): nunca toca la base de
desarrollo. Cubren venta transaccional (incluida concurrencia/sobreventa),
anulación, ajuste de stock, importación masiva y cuenta corriente.

## CI

`.github/workflows/ci.yml` (GitHub Actions): lint + typecheck + build de ambos
proyectos y tests del backend contra un PostgreSQL efímero.

## Documentación

- [INSTALACION.md](INSTALACION.md): instalación para usuarios finales.
- [api.md](api.md): contrato de la API REST (endpoints, payloads, roles).

## Funcionalidades

- **Auth**: JWT con roles `ADMIN` / `VENDEDOR`, rate-limit en login.
- **Productos**: CRUD, búsqueda rápida para POS, etiquetas de precios,
  importación masiva Excel/CSV por lotes de 500 filas.
- **Stock**: todo cambio pasa por `movimientos_stock` (auditoría completa);
  ajustes manuales con motivo.
- **Ventas (POS)**: transacción única con `SELECT ... FOR UPDATE` (sin
  sobreventa), bonificaciones, promociones vigentes, descuento global,
  formas de pago efectivo/tarjeta/transferencia/cuenta corriente.
- **Comprobante**: HTML + PDF (puppeteer-core sobre Chrome/Edge del sistema,
  o `PDF_BROWSER_PATH`), QR local y datos ARCA (CAE, punto de venta, tipo de
  comprobante). `ARCA_MODO=mock` genera CAE simulado; `homologacion` /
  `produccion` requieren certificado digital (ver `.env.example`).
- **Cuenta corriente**: cargos por venta a crédito, pagos/ajustes con
  validación de signo, historial de movimientos por cliente.
- **Caja**: una caja abierta por usuario, ventas imputadas a la caja del
  turno, cierre con diferencia contado vs. esperado.
- **Compras**: registran proveedor y usuario, suman stock y actualizan
  precio costo opcionalmente; rechazan productos inactivos.
- **Promociones**: porcentual, segunda unidad y dos por uno; globales o por
  producto; el backend garantiza la mejor bonificación vigente.
- **Reportes**: ventas por día/semana/mes, productos más vendidos, margen,
  stock bajo.

## Notas de diseño

- **Nunca se escribe `stock_actual` "a mano"**: todo cambio crea un
  movimiento de stock (fuente de verdad de auditoría).
- **Montos con `Decimal`**, nunca float, para no acumular errores de redondeo.
- **Concurrencia**: `SELECT ... FOR UPDATE` sobre la fila del producto en
  venta, ajuste de stock e importación: dos operaciones simultáneas no pueden
  vender más de lo disponible.
- **Productos no se borran físicamente**: baja lógica (`activo: false`), ya
  pueden tener ventas/compras asociadas.
- **Correlativo de comprobante**: asignado con advisory lock dentro de la
  transacción que pide el CAE; dos comprobantes concurrentes no se pisan.

## Backups automáticos

La base de datos (ventas, stock, cuenta corriente de clientes y caja) vive en
PostgreSQL en el mismo equipo que el sistema. Un respaldo periódico es la única
garantía real contra pérdida de datos; **el instalador no lo hace por vos**.

`scripts\backup_base_datos.ps1` genera respaldos con `pg_dump --format=custom`
(los restaurables con `pg_restore`), en la carpeta `backups\` dentro de
`stock-ventas-backend\`, y borra los más viejos que la retención
(`-RetentionDays`, default 30 días). Lee la conexión desde
`stock-ventas-backend\.env` (`DATABASE_URL`), así que no necesitás escribir
contraseñas a mano:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup_base_datos.ps1
```

Para respaldo diario programado (Task Scheduler), como Administrador:

```cmd
schtasks /Create /TN "Sistema Stock - Backup DB" /SC DAILY /ST 21:30 /RL HIGHEST /F ^
  /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\Program Files\SistemaStock\scripts\backup_base_datos.ps1\""
```

(El sistema es de un solo usuario; `SYSTEM` también sirve como `/RU`.)

Restaurar un respaldo sobre la base existente:

```cmd
"\Program Files\PostgreSQL\18\bin\pg_restore.exe" --clean --if-exists --no-owner -U postgres -h localhost -d stock_ventas "stock_ventas_2026-11-10_21-30.dump"
```

(O con `pgAdmin`: clic derecho en la base → "Restore...").

## Compilar el instalador

`installer/setup.iss` con [Inno Setup](https://jrsoftware.org/isinfo.php).
El resultado queda en `installer/Output/` (ignorado por git); para
distribuirlo, súbelo a una GitHub Release del repositorio.
