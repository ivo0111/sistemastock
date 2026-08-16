<#
    postinstall.ps1
    ────────────────
    Lógica real de instalación, invocada por setup.iss después de copiar
    los archivos del proyecto. Se puede correr también a mano (fuera del
    instalador) para debug:

        powershell -ExecutionPolicy Bypass -File postinstall.ps1 `
            -AppDir "C:\SistemaStock" -PgUser postgres -PgPassword "miclave" -PgPort 5432

    Códigos de salida (Inno Setup los interpreta después de correr esto):
        0  → todo OK
        10 → PostgreSQL no está instalado / no se pudo verificar (no es un
             error del instalador: el usuario tiene que instalarlo a mano
             y volver a correr el instalador o "Iniciar Sistema.bat")
        20 → falló la instalación/verificación de Node.js
        30 → falló algún paso de npm/prisma (install, migrate, seed, build)
        1  → error inesperado no anticipado (ver install-log.txt)

    Si algo falla, esta ventana NO se cierra sola: queda esperando que
    presiones una tecla, y además queda un log completo en
    installer\install-log.txt dentro de la carpeta de instalación —
    útil para mandarlo si necesitás ayuda para diagnosticar.
#>

param(
    [Parameter(Mandatory = $true)][string]$AppDir,
    [Parameter(Mandatory = $true)][string]$PgUser,
    [Parameter(Mandatory = $true)][string]$PgPassword,
    [Parameter(Mandatory = $true)][string]$PgPort
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = 'Stop'
$exitCode = 0

function Write-Step($msg) {
    Write-Host ""
    Write-Host "=== $msg ===" -ForegroundColor Cyan
}

function Write-Err($msg) {
    Write-Host $msg -ForegroundColor Red
}

function Test-NodeInstalled {
    try {
        $v = & node --version
        return $v -match '^v\d+'
    } catch {
        return $false
    }
}

# Log persistente: aunque la ventana se cierre o el texto se corra de
# pantalla, todo lo que se imprime durante la instalación queda acá.
$logPath = Join-Path $AppDir "installer\install-log.txt"
try { Start-Transcript -Path $logPath -Append -Force | Out-Null } catch {}

try {
    # ────────────────────────────────────────────────────────────
    # 1) Node.js: verificar, instalar si falta
    # ────────────────────────────────────────────────────────────
    Write-Step "Verificando Node.js"

    if (Test-NodeInstalled) {
        Write-Host "Node.js ya está instalado: $(node --version)"
    } else {
        Write-Host "Node.js no está instalado. Descargando instalador LTS oficial..."

        # NOTA: esta URL apunta a una versión LTS fija. Convendría revisarla
        # periódicamente contra https://nodejs.org/dist/index.json y
        # actualizarla cuando salga una LTS nueva, en vez de dejarla atada
        # a una versión para siempre.
        $nodeUrl = "https://nodejs.org/dist/v24.19.0/node-v24.19.0-x64.msi"
        $nodeMsi = Join-Path $env:TEMP "node-installer.msi"

        try {
            Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeMsi -UseBasicParsing
        } catch {
            Write-Err "No se pudo descargar el instalador de Node.js. Verificá tu conexión a internet."
            Write-Err "Detalle: $($_.Exception.Message)"
            $exitCode = 20
            throw "Descarga de Node.js falló."
        }

        Write-Host "Instalando Node.js (silencioso, puede tardar un minuto)..."
        $proc = Start-Process msiexec.exe -ArgumentList "/i `"$nodeMsi`" /quiet /norestart" -Wait -PassThru
        Remove-Item $nodeMsi -ErrorAction SilentlyContinue

        if ($proc.ExitCode -ne 0) {
            Write-Err "La instalación de Node.js terminó con código $($proc.ExitCode)."
            $exitCode = 20
            throw "Instalación de Node.js falló."
        }

        # msiexec actualiza el PATH del sistema, pero este proceso de PowerShell
        # ya arrancó con el PATH viejo. Lo refrescamos manualmente.
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                    [System.Environment]::GetEnvironmentVariable("Path", "User")

        if (-not (Test-NodeInstalled)) {
            Write-Err "Node.js se instaló pero no se detecta en el PATH de esta sesión."
            Write-Err "Reiniciá la PC y volvé a correr el instalador (o 'Iniciar Sistema.bat')."
            $exitCode = 20
            throw "Node.js no detectado tras instalar."
        }
        Write-Host "Node.js instalado correctamente: $(node --version)"
    }

    # ────────────────────────────────────────────────────────────
    # 2) PostgreSQL: SOLO verificar. Nunca instalar.
    # ────────────────────────────────────────────────────────────
    Write-Step "Verificando PostgreSQL"

    $pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1

    if (-not $pgService) {
        Write-Err "No se detectó ningún servicio de PostgreSQL instalado en este equipo."
        Write-Err ""
        Write-Err "Este instalador NO instala PostgreSQL automáticamente."
        Write-Err "1) Instalalo desde https://www.postgresql.org/download/windows/"
        Write-Err "   (durante la instalación, anotá la contraseña del usuario 'postgres')"
        Write-Err "2) Volvé a ejecutar este instalador."
        Write-Err ""
        Start-Process "https://www.postgresql.org/download/windows/"
        $exitCode = 10
        throw "PostgreSQL no está instalado."
    }

    if ($pgService.Status -ne 'Running') {
        Write-Host "Servicio '$($pgService.Name)' encontrado pero detenido. Iniciando..."
        try {
            Start-Service -Name $pgService.Name
        } catch {
            Write-Err "No se pudo iniciar el servicio '$($pgService.Name)'."
            Write-Err "Probá ejecutar este instalador como Administrador, o iniciá el servicio"
            Write-Err "a mano desde 'Servicios' de Windows (services.msc)."
            $exitCode = 10
            throw "No se pudo iniciar el servicio de PostgreSQL."
        }
    }
    Write-Host "Servicio de PostgreSQL '$($pgService.Name)' corriendo."

    # Asegurar que psql esté en el PATH (Algunos instaladores de PostgreSQL no lo agregan al PATH de la sesión actual)
    $pgBin = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pgBin) {
        $pgBinDir = $pgBin.DirectoryName
        if ($env:PATH -notlike "*$pgBinDir*") {
            $env:PATH = "$pgBinDir;$env:PATH"
            Write-Host "psql agregado al PATH: $pgBinDir"
        }
    }

    # Probar conexión con las credenciales que ingresó el usuario, usando psql.
    $env:PGPASSWORD = $PgPassword
    $psqlCheck = & psql -h localhost -p $PgPort -U $PgUser -d postgres -tAc "SELECT 1" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Err "No se pudo conectar a PostgreSQL con el usuario/contraseña ingresados."
        Write-Err "(el detalle del error de psql debería verse arriba de este mensaje)"
        Write-Err "Verificá la contraseña e intentá de nuevo."
        $exitCode = 10
        throw "Conexión a PostgreSQL falló."
    }
    Write-Host "Conexión a PostgreSQL verificada."

    # Crear la base "stock_ventas" si no existe.
    $dbExists = & psql -h localhost -p $PgPort -U $PgUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'stock_ventas'" 2>&1
    if ($null -eq $dbExists -or $dbExists.Trim() -ne '1') {
        Write-Host "Creando base de datos 'stock_ventas'..."
        & psql -h localhost -p $PgPort -U $PgUser -d postgres -c "CREATE DATABASE stock_ventas" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Err "No se pudo crear la base de datos 'stock_ventas'."
            $exitCode = 10
            throw "No se pudo crear la base de datos."
        }
    }
    Write-Host "Base de datos 'stock_ventas' lista."

    # ────────────────────────────────────────────────────────────
    # 3) Generar stock-ventas-backend\.env
    # ────────────────────────────────────────────────────────────
    Write-Step "Generando archivo .env"

    $backendDir = Join-Path $AppDir "stock-ventas-backend"
    $envPath = Join-Path $backendDir ".env"

    # JWT secret random (32 bytes -> hex), sin depender de openssl.
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $jwtSecret = -join ($bytes | ForEach-Object { $_.ToString("x2") })

    $encodedPassword = [System.Uri]::EscapeDataString($PgPassword)
    $databaseUrl = "postgresql://${PgUser}:${encodedPassword}@localhost:${PgPort}/stock_ventas"

    @"
# Generado automáticamente por el instalador. Podés editarlo a mano después
# si necesitás cambiar algo (ver INSTALACION.md).
DATABASE_URL="$databaseUrl"
PORT=3000
JWT_SECRET="$jwtSecret"
JWT_EXPIRES_IN=8h

# ARCA (facturación electrónica) — modo mock por default.
ARCA_MODO=mock
ARCA_CUIT_EMISOR=
ARCA_RAZON_SOCIAL="Mi Empresa"
ARCA_CONDICION_IVA_EMISOR=MONOTRIBUTO
ARCA_PUNTO_VENTA=1
ARCA_DOMICILIO_COMERCIAL=
ARCA_INGRESOS_BRUTOS=
ARCA_FECHA_INICIO_ACTIVIDADES=
ARCA_CERT_PATH=
ARCA_KEY_PATH=
"@ | Set-Content -Path $envPath -Encoding UTF8

    Write-Host ".env generado en $envPath"

    # ────────────────────────────────────────────────────────────
    # 4) Backend: install, migrate, seed, build
    # ────────────────────────────────────────────────────────────
    Write-Step "Instalando dependencias del backend (puede tardar unos minutos)"
    Push-Location $backendDir

    cmd /c npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Err "npm install falló en el backend (código $LASTEXITCODE)."
        Write-Host ""
        Write-Host "Revisá la salida de npm de arriba. Posibles causas:" -ForegroundColor Yellow
        Write-Host "  - Sin conexión a internet"
        Write-Host "  - Puppeteer no pudo descargar Chromium (requiere conexión)"
        Write-Host "  - Espacio en disco insuficiente"
        Pop-Location
        $exitCode = 30
        throw "npm install falló en el backend."
    }

    # Verificar que node_modules se creó correctamente
    $nmDir = Join-Path $backendDir "node_modules"
    if (-not (Test-Path $nmDir)) {
        Write-Err "npm install terminó OK pero la carpeta node_modules no se creó en:"
        Write-Err "  $nmDir"
        Write-Host "Contenido de la carpeta backend:" -ForegroundColor Yellow
        Get-ChildItem $backendDir | ForEach-Object { Write-Host "  $($_.Name)" }
        Pop-Location
        $exitCode = 30
        throw "node_modules no se creó en el backend."
    }
    $pkgCount = (Get-ChildItem $nmDir -Directory | Measure-Object).Count
    Write-Host "node_modules verificado: $pkgCount paquetes instalados en $nmDir"

    Write-Step "Aplicando migraciones de la base de datos"
    cmd /c npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) {
        Write-Err "prisma migrate deploy falló."
        Pop-Location
        $exitCode = 30
        throw "prisma migrate deploy falló."
    }

    Write-Step "Creando usuario administrador inicial"
    cmd /c npm run seed
    if ($LASTEXITCODE -ne 0) {
        Write-Host "El seed falló o el usuario admin ya existía (esto es normal si ya lo habías corrido antes)." -ForegroundColor Yellow
    }

    Write-Step "Compilando backend"
    cmd /c npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Err "La compilación del backend falló."
        Pop-Location
        $exitCode = 30
        throw "La compilación del backend falló."
    }

    Pop-Location

    # ────────────────────────────────────────────────────────────
    # 5) Frontend: install, build
    # ────────────────────────────────────────────────────────────
    Write-Step "Instalando dependencias del frontend"
    $frontendDir = Join-Path $AppDir "stock-ventas-frontend"
    Push-Location $frontendDir

    cmd /c npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Err "npm install falló en el frontend (código $LASTEXITCODE)."
        Write-Host "Revisá la salida de npm de arriba."
        Pop-Location
        $exitCode = 30
        throw "npm install falló en el frontend."
    }

    # Verificar que node_modules se creó correctamente
    $nmDirFe = Join-Path $frontendDir "node_modules"
    if (-not (Test-Path $nmDirFe)) {
        Write-Err "npm install terminó OK pero la carpeta node_modules no se creó en:"
        Write-Err "  $nmDirFe"
        Write-Host "Contenido de la carpeta frontend:" -ForegroundColor Yellow
        Get-ChildItem $frontendDir | ForEach-Object { Write-Host "  $($_.Name)" }
        Pop-Location
        $exitCode = 30
        throw "node_modules no se creó en el frontend."
    }
    $pkgCountFe = (Get-ChildItem $nmDirFe -Directory | Measure-Object).Count
    Write-Host "node_modules verificado: $pkgCountFe paquetes instalados en $nmDirFe"

    Write-Step "Compilando frontend"
    cmd /c npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Err "La compilación del frontend falló."
        Pop-Location
        $exitCode = 30
        throw "La compilación del frontend falló."
    }

    Pop-Location

    Write-Step "Instalación completa"
    Write-Host "Usuario admin inicial: admin / admin123 (cambiala al entrar al sistema)."

    # Marcar instalación exitosa para que Inno Setup sepa que puede ofrecer "Iniciar Sistema"
    $postinstallOk = Join-Path $AppDir "installer\.postinstall-ok"
    Set-Content -Path $postinstallOk -Value (Get-Date -Format "o")
}
catch {
    # Red de seguridad: cualquier error (anticipado con $exitCode ya seteado,
    # o completamente inesperado) cae acá. Si $exitCode sigue en 0 es que
    # fue algo que no anticipamos — lo marcamos como error genérico (1).
    if ($exitCode -eq 0) { $exitCode = 1 }
    Write-Host ""
    Write-Err "ERROR: $($_.Exception.Message)"
}
finally {
    try { Stop-Transcript | Out-Null } catch {}

    if ($exitCode -ne 0) {
        Write-Host ""
        Write-Host "============================================" -ForegroundColor Red
        Write-Host "  La instalación NO se completó (código $exitCode)" -ForegroundColor Red
        Write-Host "============================================" -ForegroundColor Red
        Write-Host "Log completo guardado en:"
        Write-Host "  $logPath"
        Write-Host ""
        Write-Host "Presioná una tecla para cerrar esta ventana..." -ForegroundColor Yellow
        try {
            [System.Console]::ReadKey($true) | Out-Null
        } catch {
            Start-Sleep -Seconds 20
        }
    }
}

exit $exitCode