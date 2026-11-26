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
   El lanzador primero comprueba si el backend ya responde; si no, verifica
   PostgreSQL, aplica **solo migraciones pendientes** y recompila
   backend/frontend **solo si cambiaron los archivos** (fingerprint SHA-256).
   En un arranque normal no compila nada.
3. Opcional: instalar el backend como servicio de Windows con NSSM para que
   arranque solo al encender la PC. En ese caso `Iniciar Sistema.bat` solo abre
   el navegador. Ver [INSTALACION.md](INSTALACION.md#inicio-automatico-como-servicio-opcional).

Usuario inicial: `admin`. La contraseña se define en el instalador o se genera
automáticamente y queda en `installer\credenciales-admin.txt`. El primer ingreso
obliga a cambiarla (no existe `admin123`).

## Estructura del repositorio

```
.
├── Iniciar Sistema.bat        # arranque diario para usuarios finales
├── INSTALACION.md             # guía de instalación (usuarios finales)
├── api.md                     # contrato de la API REST
├── installer/                 # Inno Setup (el .exe se genera, no se versiona)
├── scripts/                   # backups, servicio, actualización, build condicional
│   ├── backup_base_datos.ps1  # pg_dump + retención + validación
│   ├── restaurar_base_datos.ps1
│   ├── programar_backup.ps1   # Task Scheduler (SYSTEM, 21:30)
│   ├── actualizar.ps1         # git pull + npm ci + migraciones + build + servicio
│   ├── instalar_servicio.ps1  # servicio NSSM (opcional, no automático)
│   ├── desinstalar_servicio.ps1
│   └── build-if-needed.js     # compila solo si cambiaron las fuentes
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
│   ├── scripts/               # ensure-postgres, preparar-arranque, duplicados
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

## Arranque y actualizaciones

`Iniciar Sistema.bat` no recompila en cada arranque:

1. Si `http://localhost:3000/api/v1/health` responde, solo abre el navegador.
2. Si existe el servicio de Windows `SistemaStock`, lo inicia y espera; no toca
   Prisma ni builds.
3. Si no hay servicio, ejecuta `ensure-postgres`, `preparar-arranque.js`
   (migraciones solo si hay pendientes y `prisma generate` solo si cambió el
   schema) y `build-if-needed.js` antes de levantar `node dist/server.js`.

Servicio opcional con NSSM (el instalador **no** lo crea):

```powershell
# Como Administrador, con nssm.exe descargado
powershell -ExecutionPolicy Bypass -File scripts\instalar_servicio.ps1 `
  -NssmPath "C:\tools\nssm\nssm.exe"

# Para volver al modo ventana
powershell -ExecutionPolicy Bypass -File scripts\desinstalar_servicio.ps1
```

Actualización completa (detiene el servicio, `git pull`, `npm ci`, migraciones,
build y reinicio):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\actualizar.ps1

# Ver qué haría, sin ejecutar nada
powershell -ExecutionPolicy Bypass -File scripts\actualizar.ps1 -DryRun
```

Si la instalación no es un clon de git, `actualizar.ps1` omite `git pull`; para
actualizar el código hay que copiar los archivos nuevos o ejecutar el instalador.
Ver [INSTALACION.md](INSTALACION.md) para el paso a paso y las opciones.

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
- **Importación de facturas de compra**: subida de PDF electrónico ARCA,
  extracción local de proveedor/comprobante/ítems, sugerencia de productos y
  confirmación en una transacción. Nada impacta stock hasta confirmar y el PDF
  queda adjunto en la base. IA opcional por `FACTURA_IA_*` (ver `.env.example`).
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
- **Descuento global**: se prorratea en centavos entre todos los ítems y por
  alícuota de IVA (`modules/ventas/descuentoComprobante.ts`). El comprobante y
  la solicitud ARCA usan el mismo cálculo; nunca se resta una sola vez del total.
- **Contraseña inicial**: se define/genera en el instalador y `debeCambiarPassword`
  obliga a cambiarla; el backend bloquea el resto de la API mientras siga activa.
- **Migración de numeración fiscal**: antes de crear el índice único de
  comprobantes, una migración preflight detecta duplicados
  `(puntoVenta, tipoComprobante, numeroComprobante)` y aborta con los IDs a
  corregir (`npm run verificar:comprobantes`).

## Backups automáticos

La base de datos (ventas, stock, cuenta corriente de clientes y caja) vive en
PostgreSQL en el mismo equipo que el sistema. El instalador programa un backup
diario a las **21:30**; también se puede ejecutar a mano.

`scripts\backup_base_datos.ps1` genera respaldos con `pg_dump --format=custom`
(restaurables con `pg_restore`) en `%ProgramData%\SistemaStock\Backups`, **fuera
de la carpeta de la aplicación**, valida cada archivo con `pg_restore --list` y
borra los más viejos que la retención (`-RetentionDays`, default 30 días; también
`STOCK_BACKUP_RETENTION_DAYS`). Lee la conexión desde `stock-ventas-backend\.env`
(`DATABASE_URL`), así que no hay que escribir contraseñas a mano:

```powershell
# Backup manual
powershell -ExecutionPolicy Bypass -File scripts\backup_base_datos.ps1

# Backup + prueba real de restauración (base temporal, se borra sola)
powershell -ExecutionPolicy Bypass -File scripts\backup_base_datos.ps1 -TestRestore
```

Programar/cambiar el backup diario (Task Scheduler, como Administrador):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\programar_backup.ps1 `
  -BackupTime "21:30" -RetentionDays 30

# Eliminar la tarea
powershell -ExecutionPolicy Bypass -File scripts\programar_backup.ps1 -Unregister
```

La tarea se registra como `SYSTEM` con `RunLevel Highest`, para que corra aunque
no haya un usuario con sesión iniciada.

Restaurar un respaldo (cerrar el sistema antes):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\restaurar_base_datos.ps1 `
  -BackupFile "C:\ProgramData\SistemaStock\Backups\stock_ventas_2026-11-25_21-30.dump"
```

El script valida el `.dump`, pide confirmación y genera un backup de seguridad
del estado actual antes de reemplazar los datos. También se puede usar
`pgAdmin` (clic derecho en la base → "Restore...").

> Los backups quedan en el mismo equipo. Para protección ante falla de disco,
> copiar `%ProgramData%\SistemaStock\Backups` a otro disco o a la nube.

## Compilar el instalador

`installer/setup.iss` con [Inno Setup](https://jrsoftware.org/isinfo.php).
El resultado queda en `installer/Output/` (ignorado por git); para
distribuirlo, súbelo a una GitHub Release del repositorio.
