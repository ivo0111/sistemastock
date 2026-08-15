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
#>

param(
    [Parameter(Mandatory = $true)][string]$AppDir,
    [Parameter(Mandatory = $true)][string]$PgUser,
    [Parameter(Mandatory = $true)][string]$PgPassword,
    [Parameter(Mandatory = $true)][string]$PgPort
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) {
    Write-Host ""
    Write-Host "=== $msg ===" -ForegroundColor Cyan
}

function Write-Err($msg) {
    Write-Host $msg -ForegroundColor Red
}

# ────────────────────────────────────────────────────────────
# 1) Node.js: verificar, instalar si falta
# ────────────────────────────────────────────────────────────
Write-Step "Verificando Node.js"

function Test-NodeInstalled {
    try {
        $v = & node --version 2>$null
        return $v -match '^v\d+'
    } catch {
        return $false
    }
}

if (Test-NodeInstalled) {
    Write-Host "Node.js ya está instalado: $(node --version)"
} else {
    Write-Host "Node.js no está instalado. Descargando instalador LTS oficial..."

    # NOTA: esta URL apunta a una versión LTS fija. Convendría revisarla
    # periódicamente contra https://nodejs.org/dist/index.json y
    # actualizarla cuando salga una LTS nueva, en vez de dejarla atada
    # a una versión para siempre.
    $nodeUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
    $nodeMsi = Join-Path $env:TEMP "node-installer.msi"

    try {
        Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeMsi -UseBasicParsing
    } catch {
        Write-Err "No se pudo descargar el instalador de Node.js. Verificá tu conexión a internet."
        Write-Err "Detalle: $($_.Exception.Message)"
        exit 20
    }

    Write-Host "Instalando Node.js (silencioso, puede tardar un minuto)..."
    $proc = Start-Process msiexec.exe -ArgumentList "/i `"$nodeMsi`" /quiet /norestart" -Wait -PassThru
    Remove-Item $nodeMsi -ErrorAction SilentlyContinue

    if ($proc.ExitCode -ne 0) {
        Write-Err "La instalación de Node.js terminó con código $($proc.ExitCode)."
        exit 20
    }

    # msiexec actualiza el PATH del sistema, pero este proceso de PowerShell
    # ya arrancó con el PATH viejo. Lo refrescamos manualmente.
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")

    if (-not (Test-NodeInstalled)) {
        Write-Err "Node.js se instaló pero no se detecta en el PATH de esta sesión."
        Write-Err "Reiniciá la PC y volvé a correr el instalador (o 'Iniciar Sistema.bat')."
        exit 20
    }
    Write-Host "Node.js instalado correctamente: $(node --version)"
}

# ────────────────────────────────────────────────────────────
# 2) PostgreSQL: SOLO verificar. Nunca instalar.
#    Misma lógica que scripts/ensure-postgres.js, portada a PowerShell.
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
    exit 10
}

if ($pgService.Status -ne 'Running') {
    Write-Host "Servicio '$($pgService.Name)' encontrado pero detenido. Iniciando..."
    try {
        Start-Service -Name $pgService.Name
    } catch {
        Write-Err "No se pudo iniciar el servicio '$($pgService.Name)'."
        Write-Err "Probá ejecutar este instalador como Administrador, o iniciá el servicio"
        Write-Err "a mano desde 'Servicios' de Windows (services.msc)."
        exit 10
    }
}
Write-Host "Servicio de PostgreSQL '$($pgService.Name)' corriendo."

# Probar conexión con las credenciales que ingresó el usuario, usando psql.
$env:PGPASSWORD = $PgPassword
$psqlCheck = & psql -h localhost -p $PgPort -U $PgUser -d postgres -tAc "SELECT 1" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "No se pudo conectar a PostgreSQL con el usuario/contraseña ingresados."
    Write-Err "Detalle: $psqlCheck"
    Write-Err "Verificá la contraseña e intentá de nuevo."
    exit 10
}
Write-Host "Conexión a PostgreSQL verificada."

# Crear la base "stock_ventas" si no existe.
$dbExists = & psql -h localhost -p $PgPort -U $PgUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'stock_ventas'" 2>&1
if ($dbExists.Trim() -ne '1') {
    Write-Host "Creando base de datos 'stock_ventas'..."
    & psql -h localhost -p $PgPort -U $PgUser -d postgres -c "CREATE DATABASE stock_ventas" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Err "No se pudo crear la base de datos 'stock_ventas'."
        exit 10
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

$databaseUrl = "postgresql://${PgUser}:${PgPassword}@localhost:${PgPort}/stock_ventas"

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

& npm install
if ($LASTEXITCODE -ne 0) { Write-Err "npm install falló en el backend."; Pop-Location; exit 30 }

Write-Step "Aplicando migraciones de la base de datos"
& npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { Write-Err "prisma migrate deploy falló."; Pop-Location; exit 30 }

Write-Step "Creando usuario administrador inicial"
& npm run seed
if ($LASTEXITCODE -ne 0) {
    Write-Host "El seed falló o el usuario admin ya existía (esto es normal si ya lo habías corrido antes)." -ForegroundColor Yellow
}

Write-Step "Compilando backend"
& npm run build
if ($LASTEXITCODE -ne 0) { Write-Err "La compilación del backend falló."; Pop-Location; exit 30 }

Pop-Location

# ────────────────────────────────────────────────────────────
# 5) Frontend: install, build
# ────────────────────────────────────────────────────────────
Write-Step "Instalando dependencias del frontend"
$frontendDir = Join-Path $AppDir "stock-ventas-frontend"
Push-Location $frontendDir

& npm install
if ($LASTEXITCODE -ne 0) { Write-Err "npm install falló en el frontend."; Pop-Location; exit 30 }

Write-Step "Compilando frontend"
& npm run build
if ($LASTEXITCODE -ne 0) { Write-Err "La compilación del frontend falló."; Pop-Location; exit 30 }

Pop-Location

Write-Step "Instalación completa"
Write-Host "Usuario admin inicial: admin / admin123 (cambiala al entrar al sistema)."
exit 0
