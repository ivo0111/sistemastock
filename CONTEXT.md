# Contexto del proyecto (para futuros modelos de IA)

## Objetivo
Sistema full-stack de gestión de stock y ventas para tiendas minoristas. Incluye POS, inventario con auditoría de movimientos, facturación electrónica ARCA (modo mock por default), cuenta corriente de clientes, caja, compras a proveedores y reportes.

## Arquitectura clave
- **Backend**: Node.js + Express + TypeScript + Prisma + PostgreSQL.
  - Módulos principales: auth, productos, stock, ventas, compras, clientes, caja, promociones, reportes, usuarios, proveedores, arca, categorías.
  - Prisma como ORM, PostgreSQL como base de datos.
  - Migraciones gestionadas vía `prisma migrate`.
- **Frontend**: React + Vite (SPA). En producción el backend sirve los archivos estáticos.
- **Instalador**: Inno Setup + `postinstall.ps1`. Verifica/instala Node.js, verifica PostgreSQL, genera `.env`, corre `npm install`, migraciones, seed, build y programa el backup diario.
- **Tests**: Vitest con base descartable `stock_ventas_test` (no afecta desarrollo).

## Estado actual (25/11/2026)
- Último commit: `9e31874 FIX: integridad de caja y fechas del negocio`.
- Los cambios de esta iteración están en el working tree (todavía sin commit).
- Tests: 35/35 OK. Typecheck y build de backend OK; build de frontend OK.
- Migraciones nuevas aplicadas en desarrollo y en la base de tests.

## Medidas implementadas en esta iteración
1. **Credenciales iniciales seguras**
   - El instalador pide la contraseña de `admin`; si se deja vacía, genera una aleatoria de 16 caracteres.
   - La contraseña viaja al seed por la variable de entorno `ADMIN_PASSWORD` (no por línea de comandos).
   - Si se generó automáticamente, queda en `installer\credenciales-admin.txt` dentro de la instalación.
   - El seed ya no usa `admin123`; si encuentra un admin existente con esa contraseña, la rota y marca cambio obligatorio. Si el instalador define `ADMIN_PASSWORD`, esa contraseña se aplica siempre (también al reinstalar) y se fuerza el cambio.
   - `Usuario.debeCambiarPassword` + claim en el JWT: `requireAuth` bloquea todo salvo `POST /auth/cambiar-password` mientras sea `true`; el frontend redirige a `/cambiar-password`.
2. **Backups automáticos**
   - `scripts\backup_base_datos.ps1`: `pg_dump` custom, destino por defecto `%ProgramData%\SistemaStock\Backups` (fuera de la carpeta de la app), retención configurable (`-RetentionDays` / `STOCK_BACKUP_RETENTION_DAYS`, default 30) y validación con `pg_restore --list`. `-TestRestore` restaura en una base temporal y la borra.
   - `scripts\programar_backup.ps1`: registra tarea diaria (default 21:30) como `SYSTEM` con `RunLevel Highest`; soporta `-Unregister` y `-RunNow`.
   - `scripts\restaurar_base_datos.ps1`: valida el `.dump`, pide confirmación, genera backup de seguridad previo y restaura con `pg_restore`.
   - El instalador programa la tarea al finalizar (se puede omitir con `-SkipBackupSchedule`).
3. **Descuento global fiscal**
   - `src/modules/ventas/descuentoComprobante.ts` centraliza el cálculo: prorratea el descuento global en centavos (método de mayor resto) entre todos los ítems, lo imputa a la alícuota de IVA de cada uno y arma el desglose por alícuota.
   - Lo usan tanto `comprobante.template.ts` (impresión) como `ventas.service.ts` al armar la solicitud a ARCA (WSFEv1), así el comprobante y la presentación fiscal no pueden divergir.
   - Invariante: suma de bases imponibles + IVA = total de la venta; suma de descuentos por ítem = descuento global.
4. **`xlsx` sin CDN**
   - El frontend usa `xlsx@^0.18.5` desde el registry público de npm; ya no depende de `cdn.sheetjs.com` para instalar.
5. **Launcher condicional**
   - `Iniciar Sistema.bat` llama a `scripts\build-if-needed.js`, que calcula un fingerprint SHA-256 de fuentes/configuración y solo recompila backend/frontend cuando cambió algo. La estampilla vive en `node_modules/.cache/sistema-stock-build.json`.
6. **Preflight de migración por comprobantes duplicados**
   - `scripts/verificar-duplicados-comprobantes.js` (`npm run verificar:comprobantes`) lista duplicados `(puntoVenta, tipoComprobante, numeroComprobante)` antes de migrar.
   - La migración `20261018999999_verificar_duplicados_comprobantes` repite el chequeo en SQL y aborta con `RAISE EXCEPTION` indicando los IDs a corregir.

## Consideraciones / riesgos remanentes
- **Descuento global**: la implementación sigue el criterio de prorrateo por ítem y alícuota. Conviene que un contador valide un caso real con ARCA en homologación antes de pasar a producción.
- **Backups**: están en el mismo equipo. Para protección ante falla física hace falta copiar `%ProgramData%\SistemaStock\Backups` a otro disco o nube.
- **ARCA**: `ARCA_MODO=mock` por default; `homologacion` / `produccion` requieren certificado y CUIT habilitados.
- **`xlsx` 0.18.5**: es la última versión publicada en el registry público de npm y tiene avisos de seguridad conocidos (la versión parcheada solo se distribuye por el CDN de SheetJS). Solo se usa para importar archivos locales elegidos por el usuario; no procesa datos de terceros. Si se necesita la versión parcheada, evaluar vendorizar el paquete o migrar a otra librería.
- **Migración de numeración**: si hay comprobantes duplicados, la migración falla a propósito. Corregir/anular los listados por el script y volver a ejecutar.

## Puntos clave para futuros modelos de IA
- **Zona de negocio**: Argentina (UTC-3). Uso de `src/utils/fechas.ts` (`zFechaDesde`, `zFechaHasta`, `TZ_NEGOCIO`) para interpretar fechas.
- **Caja**: una caja abierta por usuario; venta en efectivo o PAGO requiere caja abierta (`CAJA_NO_ABIERTA`).
- **Comprobante fiscal**: QR ARCA en `comprobante.template.ts`; fecha en zona de negocio; IVA y descuento global calculados por alícuota con `descuentoComprobante.ts`.
- **Anulación de venta**: revierte cargo como `AJUSTE`, no como `PAGO`.
- **Contraseña inicial**: `debeCambiarPassword` se guarda en la BD y viaja en el JWT; no alcanza con ocultar la pantalla en el frontend.
- **Scripts PowerShell**: pensados para Windows PowerShell 5.1; autodetectan `C:\Program Files\PostgreSQL\*\bin` y no exponen contraseñas en la línea de comandos.

## Comandos útiles
```bash
npm run dev                 # backend + frontend en modo dev
npm run test                # tests (base descartable)
npm run verificar:comprobantes  # (en stock-ventas-backend) duplicados antes de migrar
node scripts/build-if-needed.js stock-ventas-backend  # build condicional usado por el launcher
```

```powershell
# Backup manual
powershell -ExecutionPolicy Bypass -File scripts\backup_base_datos.ps1

# Backup + prueba de restauración
powershell -ExecutionPolicy Bypass -File scripts\backup_base_datos.ps1 -TestRestore

# Programar backup diario (como Administrador)
powershell -ExecutionPolicy Bypass -File scripts\programar_backup.ps1 -BackupTime "21:30" -RetentionDays 30

# Restaurar un backup (cerrar el sistema antes)
powershell -ExecutionPolicy Bypass -File scripts\restaurar_base_datos.ps1 -BackupFile "C:\ProgramData\SistemaStock\Backups\stock_ventas_2026-11-25_21-30.dump"
```

## Documentación principal
- `README.md` – guía general, desarrollo, backups y compilación del instalador.
- `INSTALACION.md` – pasos detallados para usuarios finales.
- `api.md` – contrato de la API REST.

## Acceso rápido
- **Backend**: http://localhost:3000
- **Frontend**: http://localhost:5173 (en dev) o `/` (en prod)
- **Instalador**: ejecutar `SistemaStock-Setup.exe` para instalar todo en una sola pasada.
