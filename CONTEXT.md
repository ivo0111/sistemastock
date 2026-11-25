# Contexto del proyecto (para futuros modelos de IA)

## Objetivo
Sistema full-stack de gestión de stock y ventas para tiendas minoristas. Incluye POS, inventario con auditoría de movimientos, facturación electrónica ARCA (modo mock), cuenta corriente de clientes, caja, compras a proveedores y reportes.

## Arquitectura clave
- **Backend**: Node.js + Express + TypeScript + Prisma + PostgreSQL.
  - Módulos principales: auth, productos, stock, ventas, compras, clientes, caja, promociones, reportes, usuarios, proveedores, arca, categorías.
  - Prisma como ORM, PostgreSQL como base de datos.
  - Migraciones gestionadas vía `prisma migrate`.
- **Frontend**: React + Vite (SPA). En producción el backend sirve los archivos estáticos.
- **Instalador**: Inno Setup + script `postinstall.ps1` que verifica/instala Node.js, verifica PostgreSQL, genera `.env`, corre `npm install`, migraciones, seed, build.
- **Tests**: Vitest con base de datos descartable `stock_ventas_test` (no afecta desarrollo).

## Estado actual (30/11/2026)
- Último commit: `9e31874 FIX: integridad de caja y fechas del negocio`.
- Todos los cambios pendientes ya están **commiteados** (git status limpio).
- Tests: 30/30 pasados, lint y typecheck sin errores.
- Backend compila, typecheck y build OK; frontend compila OK.
- Scripts nuevos: `scripts/backup_base_datos.ps1` (backup PostgreSQL) y `scripts/backup_base_datos.ps1` (script de backup).

## Riesgos pendientes / ítems de mejora
1. **Credenciales iniciales**: admin / admin123; el instalador debe pedir/generar la contraseña del admin.
2. **Backups automáticos**: script listo, pero no está programado (se sugiere `schtasks` DAILY).
3. **Descuento global en ARCA**: se resta una vez del total sin prorratear por alícuota (pendiente revisión contable).
4. **xlsx vía CDN**: depende de `cdn.sheetjs.com`; posible fallo de red.
5. **Launcher recompila siempre**: backend y frontend se recompilan en cada arranque (`Iniciar Sistema.bat`).

## Puntos clave para futuros modelos de IA
- **Zona de negocio**: Argentina (UTC-3). Uso de `src/utils/fechas.ts` (`zFechaDesde`, `zFechaHasta`, `TZ_NEGOCIO`) para interpretar fechas.
- **Caja**: una caja abierta por usuario; venta en efectivo o PAGO requiere caja abierta (`CAJA_NO_ABIERTA`).
- **Comprobante fiscal**: QR ARCA en `comprobante.template.ts`; fecha en zona de negocio; IVA calculado por alícuota (no ítem por ítem).
- **Anulación de venta**: revierte cargo como `AJUSTE`, no como `PAGO`.
- **Backups**: script `scripts/backup_base_datos.ps1` genera `.dump` en `stock-ventas-backend/backups/` con retención de 30 días.

## Comandos útiles
```bash
npm run dev          # backend + frontend en modo dev
npm run test         # ejecutar tests (base descartable)
npm run backup       # (opcional) ejecutar script de backup manualmente
powershell -ExecutionPolicy Bypass -File scripts\backup_base_datos.ps1
```

## Documentación principal
- `README.md` – guía de instalación y uso diario.
- `INSTALACION.md` – pasos detallados para usuarios finales.
- `INSTALACION.md` (sección 5) – descripción de los backups automáticos.
- `api.md` – contrato de la API REST.

## Acceso rápido
- **Backend**: http://localhost:3000
- **Frontend**: http://localhost:5173 (en dev) o `/` (en prod)
- **Instalador**: ejecutar `SistemaStock-Setup.exe` (Windows) o `./SistemaStock-Setup.exe` (Linux/macOS) para instalar todo en una sola pasada.
```

Now I need to commit the pending changes (the commit that already exists) and then commit the new CONTEXT.md. Since the pending changes are already committed (git status says clean), I only need to commit the new file. But to be safe, let's commit the new file as a separate commit.

But first, let's verify the commit history to ensure we are on the right branch and see the commit we just made:
</think>
<tool_call>
<function=execute>
<parameter=code>
git log --oneline -5