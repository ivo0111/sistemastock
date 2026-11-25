@echo off
setlocal enabledelayedexpansion
title Sistema Stock - Panel de Control
cd /d "%~dp0"

set "SERVICE_NAME=SistemaStock"
set "APP_URL=http://localhost:3000"
set "HEALTH_URL=%APP_URL%/api/v1/health"
set "HEALTH_FILE=%TEMP%\stockcheck.txt"

echo ============================================
echo   Sistema de Gestion de Stock y Ventas
echo ============================================
echo.

REM ────────────────────────────────────────────
REM 0) Camino rapido: si el backend ya responde
REM    (servicio de Windows o ventana previa),
REM    solo abrir el navegador.
REM ────────────────────────────────────────────
call :check_health
if "!HEALTH!"=="200" (
    echo El sistema ya esta corriendo en %APP_URL%
    start "" "%APP_URL%"
    timeout /t 2 /nobreak >nul
    exit /b 0
)

REM ────────────────────────────────────────────
REM 1) Si el backend esta instalado como
REM    servicio, iniciarlo y esperar. No se
REM    compila ni se ejecuta Prisma.
REM ────────────────────────────────────────────
sc query "%SERVICE_NAME%" >nul 2>nul
if errorlevel 1 goto :manual

call :service_state
if /i "!SERVICE_STATE!"=="Running" (
    echo El servicio "%SERVICE_NAME%" ya esta iniciado.
    goto :wait_service
)
if /i "!SERVICE_STATE!"=="StartPending" (
    echo El servicio "%SERVICE_NAME%" esta iniciando...
    goto :wait_service
)

echo [1/2] Iniciando servicio "%SERVICE_NAME%"...
net start "%SERVICE_NAME%" >nul 2>nul
if errorlevel 1 (
    echo.
    echo No se pudo iniciar el servicio ^(puede requerir permisos de Administrador^).
    echo Se intentara iniciar el backend en modo manual...
    echo.
    goto :manual
)
echo [2/2] Servicio iniciado.
goto :wait_service

REM ────────────────────────────────────────────
REM Modo manual: verificar Node, PostgreSQL,
REM migraciones pendientes y compilar solo si
REM cambiaron las fuentes.
REM ────────────────────────────────────────────
:manual
echo [1/5] Verificando Node.js y dependencias...
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
echo.

echo [2/5] Verificando PostgreSQL...
pushd stock-ventas-backend
call node scripts\ensure-postgres.js
if errorlevel 1 (
    echo.
    echo No se pudo verificar/iniciar PostgreSQL. Revisa el mensaje de arriba.
    popd
    pause
    exit /b 1
)

echo.
echo [3/5] Verificando base de datos y migraciones...
call node scripts\preparar-arranque.js
if errorlevel 1 (
    echo.
    echo No se pudo preparar la base de datos. Revisa el mensaje de arriba.
    popd
    pause
    exit /b 1
)
popd
echo.

echo [4/5] Compilando backend (solo si hubo cambios)...
call node "%~dp0scripts\build-if-needed.js" stock-ventas-backend
if errorlevel 1 (
    echo ERROR: fallo la compilacion del backend. Revisa el error de arriba.
    pause
    exit /b 1
)

echo [5/5] Compilando frontend (solo si hubo cambios)...
call node "%~dp0scripts\build-if-needed.js" stock-ventas-frontend
if errorlevel 1 (
    echo ERROR: fallo la compilacion del frontend. Revisa el error de arriba.
    pause
    exit /b 1
)
echo.

echo Levantando el backend...
start "Sistema Stock - Backend" /min /d "%~dp0stock-ventas-backend" cmd /c "node dist\server.js"
goto :wait_manual

:wait_service
echo Esperando a que el servicio responda...
call :wait_health
if "!READY!"=="0" (
    echo.
    echo El servicio no respondio a tiempo.
    echo Revisa los logs en %ProgramData%\SistemaStock\Logs
    pause
    exit /b 1
)
goto :open_service

:wait_manual
call :wait_health
if "!READY!"=="0" (
    echo.
    echo El backend no respondio a tiempo ^(30 segundos^).
    echo Revisa la ventana "Sistema Stock - Backend" para ver el error.
) else (
    echo   Sistema listo.
)
goto :open_manual

:open_service
echo   Sistema listo.
echo   Abriendo el navegador...
start "" "%APP_URL%"
echo.
echo ============================================
echo   Sistema iniciado (servicio de Windows)
echo.
echo   Aplicacion: %APP_URL%
echo   Este panel se puede cerrar.
echo ============================================
timeout /t 3 /nobreak >nul
exit /b 0

:open_manual
echo   Abriendo el navegador...
start "" "%APP_URL%"
echo.
echo ============================================
echo   Sistema iniciado - no cierres esta ventana
echo.
echo   Aplicacion: %APP_URL%
echo.
echo   Presiona una tecla en esta ventana para
echo   cerrar el sistema.
echo ============================================
pause >nul

echo.
echo Cerrando el sistema...
taskkill /FI "WINDOWTITLE eq Sistema Stock - Backend*" /T /F >nul 2>nul
echo Listo. Podes cerrar esta ventana.
timeout /t 2 /nobreak >nul
exit /b 0

REM ────────────────────────────────────────────
REM Subrutinas
REM ────────────────────────────────────────────
:check_health
set "HEALTH=0"
curl -s -o nul -w "%%{http_code}" --max-time 2 "%HEALTH_URL%" > "%HEALTH_FILE%" 2>nul
if exist "%HEALTH_FILE%" set /p HEALTH=<"%HEALTH_FILE%"
del "%HEALTH_FILE%" >nul 2>nul
exit /b 0

:wait_health
set "READY=0"
for /l %%i in (1,1,30) do (
    call :check_health
    if "!HEALTH!"=="200" (
        set "READY=1"
        goto :eof
    )
    timeout /t 1 /nobreak >nul
)
exit /b 0

:service_state
set "SERVICE_STATE="
for /f "usebackq delims=" %%s in (`powershell -NoProfile -Command "$s = Get-Service -Name '%SERVICE_NAME%' -ErrorAction SilentlyContinue; if ($s) { $s.Status }"`) do set "SERVICE_STATE=%%s"
exit /b 0
