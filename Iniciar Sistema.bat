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
REM 0) Verificar que node_modules exista en el backend
REM ────────────────────────────────────────────
if not exist "stock-ventas-backend\node_modules" (
    echo.
    echo ERROR: No se encontro la carpeta "node_modules" en el backend.
    echo Esto significa que "npm install" no se ejecuto correctamente.
    echo.
    echo --- Diagnostico ---
    echo Directorio actual: %cd%
    echo Buscando en:       %cd%\stock-ventas-backend\node_modules
    echo.
    echo Contenido de stock-ventas-backend\:
    dir /b "stock-ventas-backend" 2>nul
    echo.
    echo --- Soluciones ---
    echo - Si instalaste con el instalador, verifica que este archivo se
    echo   ejecuto desde la carpeta de instalacion.
    echo - Si corriste desde la carpeta del proyecto fuente, necesitas
    echo   correr el instalador primero, o ejecutar "npm install" manualmente.
    echo - Si el instalador fallo, revisa el log en installer\install-log.txt.
    echo.
    pause
    exit /b 1
)

REM ────────────────────────────────────────────
REM 1) Verificar que PostgreSQL este corriendo
REM    (reutiliza la misma logica que "npm run dev"
REM    usa en desarrollo: scripts/ensure-postgres.js)
REM ────────────────────────────────────────────
echo [1/4] Verificando PostgreSQL...
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
REM 2) Backend: compilar si hace falta, y levantar
REM    en una consola aparte minimizada.
REM ────────────────────────────────────────────
echo [2/4] Preparando backend...
if not exist "stock-ventas-backend\dist\server.js" (
    echo   dist\ no existe todavia. Compilando backend por primera vez...
    pushd stock-ventas-backend
    call npm run build
    if errorlevel 1 (
        echo.
        echo La compilacion del backend fallo. Revisa el error de arriba.
        popd
        pause
        exit /b 1
    )
    popd
)

echo   Levantando backend en segundo plano...
start "Sistema Stock - Backend" /min cmd /c "cd /d "%~dp0stock-ventas-backend" && npm run start"
echo.

REM ────────────────────────────────────────────
REM 3) Frontend: compilar si hace falta (o si esta
REM    desactualizado), y servir el build estatico.
REM
REM    Eleccion: "vite preview" en vez de agregar la
REM    dependencia "serve". vite preview ya viene con
REM    el proyecto, sirve exactamente el contenido de
REM    dist/, y permite reusar el mismo proxy de "/api"
REM    hacia el backend que ya esta configurado para
REM    "vite dev" (ver vite.config.js, seccion "preview").
REM    Eso evita tener que tocar como el frontend llama
REM    a la API (usa rutas relativas "/api/v1/...").
REM ────────────────────────────────────────────
echo [3/4] Preparando frontend...

REM Nota: detectar "desactualizado" de forma robusta (comparar timestamps de
REM todo src/ contra dist/) es fragil en batch puro. Simplificamos: se
REM compila solo si dist/ no existe todavia. Si haces cambios en el codigo
REM y queres verlos reflejados, borra "stock-ventas-frontend\dist" (o corre
REM "npm run build" a mano ahi adentro) antes de volver a ejecutar este .bat.
set "NEED_BUILD=0"
if not exist "stock-ventas-frontend\dist\index.html" set "NEED_BUILD=1"

if "!NEED_BUILD!"=="1" (
    echo   dist\ no existe todavia. Compilando frontend por primera vez...
    pushd stock-ventas-frontend
    call npm run build
    if errorlevel 1 (
        echo.
        echo La compilacion del frontend fallo. Revisa el error de arriba.
        popd
        pause
        exit /b 1
    )
    popd
) else (
    echo   Usando build existente en stock-ventas-frontend\dist
    echo   (si hiciste cambios y queres verlos, borra esa carpeta y volve a ejecutar este archivo)
)

echo   Levantando frontend en segundo plano...
start "Sistema Stock - Frontend" /min cmd /c "cd /d "%~dp0stock-ventas-frontend" && npm run preview"
echo.

REM ────────────────────────────────────────────
REM 4) Esperar a que el backend responda y abrir
REM    el navegador. Polling en vez de sleep fijo.
REM ────────────────────────────────────────────
echo [4/4] Esperando a que el sistema levante...
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
    echo El frontend puede seguir intentando conectarse una vez que el backend levante.
) else (
    echo   Backend listo.
)

echo   Abriendo el navegador...
start http://localhost:5173

echo.
echo ============================================
echo   Sistema iniciado - no cierres esta ventana
echo.
echo   Backend:  http://localhost:3000
echo   Frontend: http://localhost:5173
echo.
echo   Presiona una tecla en esta ventana para
echo   cerrar el sistema (backend y frontend).
echo ============================================
pause > nul

echo.
echo Cerrando el sistema...
taskkill /FI "WINDOWTITLE eq Sistema Stock - Backend*" /T /F > nul 2>nul
taskkill /FI "WINDOWTITLE eq Sistema Stock - Frontend*" /T /F > nul 2>nul
echo Listo. Podes cerrar esta ventana.
timeout /t 2 /nobreak > nul
exit /b 0
