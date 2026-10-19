@echo off
setlocal enabledelayedexpansion
title Sistema Stock - Panel de Control
cd /d "%~dp0"

echo ============================================
echo   Sistema de Gestion de Stock y Ventas
echo   Iniciando...
echo ============================================
echo.

REM ────────────────────────────────────────────
REM 0) Verificar Node.js y node_modules
REM ────────────────────────────────────────────
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: No se encontro Node.js. Instalalo desde https://nodejs.org y volve a ejecutar este archivo.
    pause
    exit /b 1
)

if not exist "stock-ventas-backend\node_modules" (
    echo ERROR: Falta "stock-ventas-backend\node_modules". Ejecuta "npm install" ahi adentro una vez.
    pause
    exit /b 1
)
if not exist "stock-ventas-frontend\node_modules" (
    echo ERROR: Falta "stock-ventas-frontend\node_modules". Ejecuta "npm install" ahi adentro una vez.
    pause
    exit /b 1
)

REM ────────────────────────────────────────────
REM 1) Verificar/iniciar PostgreSQL
REM    (misma logica que "npm run dev":
REM     scripts/ensure-postgres.js)
REM ────────────────────────────────────────────
echo [1/5] Verificando PostgreSQL...
pushd stock-ventas-backend
call node scripts\ensure-postgres.js
if errorlevel 1 (
    echo.
    echo No se pudo verificar/iniciar PostgreSQL. Revisa el mensaje de arriba.
    popd
    pause
    exit /b 1
)
popd
echo.

REM ────────────────────────────────────────────
REM 2) Prisma: generar cliente y aplicar
REM    migraciones pendientes
REM ────────────────────────────────────────────
echo [2/5] Aplicando base de datos (Prisma)...
pushd stock-ventas-backend
call npx prisma generate >nul
if errorlevel 1 (
    echo ERROR: fallo "prisma generate". Revisa el error de arriba.
    popd
    pause
    exit /b 1
)
call npx prisma migrate deploy
if errorlevel 1 (
    echo ERROR: fallo "prisma migrate deploy". Revisa el error de arriba.
    popd
    pause
    exit /b 1
)
popd
echo.

REM ────────────────────────────────────────────
REM 3) Compilar backend y frontend SIEMPRE
REM    (asi cualquier cambio de codigo queda
REM     reflejado en cada arranque)
REM ────────────────────────────────────────────
echo [3/5] Compilando backend...
pushd stock-ventas-backend
call npm run build
if errorlevel 1 (
    echo ERROR: fallo la compilacion del backend. Revisa el error de arriba.
    popd
    pause
    exit /b 1
)
popd

echo [4/5] Compilando frontend...
pushd stock-ventas-frontend
call npm run build
if errorlevel 1 (
    echo ERROR: fallo la compilacion del frontend. Revisa el error de arriba.
    popd
    pause
    exit /b 1
)
popd
echo.

REM ────────────────────────────────────────────
REM 5) Levantar el backend (el mismo servidor
REM    Express sirve la app en :3000), esperar
REM    a que responda y abrir el navegador.
REM ────────────────────────────────────────────
echo [5/5] Levantando el sistema...
start "Sistema Stock - Backend" /min cmd /c "cd /d "%~dp0stock-ventas-backend" && npm run start"

set "READY=0"
for /l %%i in (1,1,30) do (
    curl -s -o nul -w "%%{http_code}" http://localhost:3000/api/v1/health > "%TEMP%\stockcheck.txt" 2>nul
    set /p HTTP_CODE=<"%TEMP%\stockcheck.txt"
    if "!HTTP_CODE!"=="200" (
        set "READY=1"
        goto :ready
    )
    timeout /t 1 /nobreak > nul
)
:ready
del "%TEMP%\stockcheck.txt" >nul 2>nul

if "!READY!"=="0" (
    echo.
    echo El backend no respondio a tiempo ^(30 segundos^).
    echo Revisa la ventana "Sistema Stock - Backend" para ver el error.
) else (
    echo   Sistema listo.
)

echo   Abriendo el navegador...
start http://localhost:3000

echo.
echo ============================================
echo   Sistema iniciado - no cierres esta ventana
echo.
echo   Aplicacion: http://localhost:3000
echo.
echo   Presiona una tecla en esta ventana para
echo   cerrar el sistema.
echo ============================================
pause > nul

echo.
echo Cerrando el sistema...
taskkill /FI "WINDOWTITLE eq Sistema Stock - Backend*" /T /F > nul 2>nul
echo Listo. Podes cerrar esta ventana.
timeout /t 2 /nobreak > nul
exit /b 0
