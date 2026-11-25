# ────────────────────────────────────────────────────────────
# Actualiza una instalación existente del Sistema Stock.
#
# Flujo (pensado para ejecutarse por SSH o en una ventana de Administrador):
#   1) Detiene el servicio de Windows (si está instalado).
#   2) git pull --ff-only (si la carpeta es un clon de git).
#   3) npm ci en backend y frontend.
#   4) Verifica duplicados, genera Prisma y aplica migraciones.
#   5) Compila backend y frontend.
#   6) Vuelve a iniciar el servicio y espera a que responda.
#
# Uso típico:
#   powershell -ExecutionPolicy Bypass -File scripts\actualizar.ps1
#
# Opciones:
#   -AppDir <ruta>      Carpeta de la instalación (default: padre de scripts\).
#   -ServiceName        Nombre del servicio (default "SistemaStock").
#   -SkipGitPull        No ejecuta git pull (útil si copiaste archivos a mano).
#   -SkipNpmCi          No reinstala dependencias.
#   -SkipMigrations     No corre Prisma/migraciones.
#   -SkipBuild          No compila.
#   -NoRestart          No vuelve a iniciar el servicio al terminar.
#   -Force              Continúa aunque el backend esté corriendo en modo
#                       ventana (puede fallar npm ci por archivos bloqueados).
#   -DryRun             Muestra los pasos sin ejecutarlos.
#
# IMPORTANTE: no crea tareas programadas ni servicios. El servicio se instala
# aparte y de forma opcional con scripts\instalar_servicio.ps1.
# ────────────────────────────────────────────────────────────
param(
    [string]$AppDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$ServiceName = "SistemaStock",
    [switch]$SkipGitPull,
    [switch]$SkipNpmCi,
    [switch]$SkipMigrations,
    [switch]$SkipBuild,
    [switch]$NoRestart,
    [switch]$Force,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$backendDir = Join-Path $AppDir "stock-ventas-backend"
$frontendDir = Join-Path $AppDir "stock-ventas-frontend"
$urlSalud = "http://localhost:3000/api/v1/health"

function Test-EsAdministrador {
    $identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identidad)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-Salud {
    try {
        $respuesta = Invoke-WebRequest -UseBasicParsing -Uri $urlSalud -TimeoutSec 2
        return ($respuesta.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Wait-Salud([int]$Segundos = 30) {
    for ($i = 0; $i -lt $Segundos; $i++) {
        if (Test-Salud) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Invoke-Paso {
    param(
        [string]$Descripcion,
        [scriptblock]$Accion
    )
    Write-Host "==> $Descripcion" -ForegroundColor Cyan
    if ($DryRun) {
        Write-Host "    (dry-run) se omite" -ForegroundColor DarkGray
        return
    }
    & $Accion
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        throw "Falló: $Descripcion (código $LASTEXITCODE)."
    }
}

function Wait-ServicioDetenido([int]$Segundos = 30) {
    $limite = (Get-Date).AddSeconds($Segundos)
    while ((Get-Date) -lt $limite) {
        $estado = (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue).Status
        if ($estado -eq 'Stopped' -or $null -eq $estado) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

# ── Validaciones previas ─────────────────────────────────────
if (-not (Test-Path -LiteralPath $backendDir)) {
    Write-Host "ERROR: no existe $backendDir" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path -LiteralPath $frontendDir)) {
    Write-Host "ERROR: no existe $frontendDir" -ForegroundColor Red
    exit 1
}

$servicio = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
$esAdmin = Test-EsAdministrador

if ($servicio -and -not $esAdmin -and -not $DryRun) {
    Write-Host "ERROR: el servicio '$ServiceName' existe y para actualizar hay que detenerlo." -ForegroundColor Red
    Write-Host "       Abrí PowerShell como Administrador y volvé a ejecutar este script." -ForegroundColor Yellow
    exit 1
}

if (-not $servicio -and -not $DryRun -and (Test-Salud) -and -not $Force) {
    Write-Host "ERROR: el sistema está corriendo en modo ventana (sin servicio)." -ForegroundColor Red
    Write-Host "       Cerrá la ventana 'Sistema Stock - Backend' y volvé a ejecutar." -ForegroundColor Yellow
    Write-Host "       Si querés intentarlo igual (puede fallar por archivos bloqueados), usá -Force." -ForegroundColor Yellow
    exit 1
}

$servicioEstabaCorriendo = $false
$fallo = $false

try {
    # ── 1) Detener el servicio ───────────────────────────────
    if ($servicio) {
        $servicioEstabaCorriendo = ($servicio.Status -eq 'Running')
        if ($servicioEstabaCorriendo) {
            Write-Host "==> Deteniendo servicio '$ServiceName'..." -ForegroundColor Cyan
            if (-not $DryRun) {
                Stop-Service -Name $ServiceName -Force -ErrorAction Stop
                if (-not (Wait-ServicioDetenido 30)) {
                    throw "El servicio '$ServiceName' no se detuvo en 30 segundos."
                }
            }
        }
    } else {
        Write-Host "==> No hay servicio '$ServiceName' instalado; se actualiza en modo manual." -ForegroundColor Yellow
    }

    # ── 2) Código ────────────────────────────────────────────
    if (-not $SkipGitPull) {
        if (Test-Path -LiteralPath (Join-Path $AppDir ".git")) {
            Invoke-Paso "Actualizando código (git pull --ff-only)..." {
                & git -C $AppDir pull --ff-only
            }
        } else {
            Write-Host "==> No hay repositorio git en $AppDir; se omite git pull." -ForegroundColor Yellow
            Write-Host "    (Si instalaste con el .exe, copiá los archivos nuevos o usá -SkipGitPull.)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "==> git pull omitido (-SkipGitPull)." -ForegroundColor Yellow
    }

    # ── 3) Dependencias ──────────────────────────────────────
    if (-not $SkipNpmCi) {
        Push-Location $backendDir
        try {
            if (Test-Path -LiteralPath (Join-Path $backendDir "package-lock.json")) {
                Invoke-Paso "Instalando dependencias del backend (npm ci)..." { & npm ci }
            } else {
                Invoke-Paso "Instalando dependencias del backend (npm install)..." { & npm install }
            }
        } finally {
            Pop-Location
        }

        Push-Location $frontendDir
        try {
            if (Test-Path -LiteralPath (Join-Path $frontendDir "package-lock.json")) {
                Invoke-Paso "Instalando dependencias del frontend (npm ci)..." { & npm ci }
            } else {
                Invoke-Paso "Instalando dependencias del frontend (npm install)..." { & npm install }
            }
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "==> npm ci omitido (-SkipNpmCi)." -ForegroundColor Yellow
    }

    # ── 4) Base de datos y Prisma ────────────────────────────
    if (-not $SkipMigrations) {
        Push-Location $backendDir
        try {
            Invoke-Paso "Verificando comprobantes duplicados..." {
                & node scripts\verificar-duplicados-comprobantes.js
            }
            Invoke-Paso "Generando cliente Prisma..." { & npx prisma generate }
            Invoke-Paso "Aplicando migraciones pendientes..." { & npx prisma migrate deploy }
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "==> Migraciones omitidas (-SkipMigrations)." -ForegroundColor Yellow
    }

    # ── 5) Compilación ───────────────────────────────────────
    if (-not $SkipBuild) {
        Push-Location $backendDir
        try {
            Invoke-Paso "Compilando backend..." { & npm run build }
        } finally {
            Pop-Location
        }

        Push-Location $frontendDir
        try {
            Invoke-Paso "Compilando frontend..." { & npm run build }
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "==> Compilación omitida (-SkipBuild)." -ForegroundColor Yellow
    }

    # ── 6) Reiniciar servicio ────────────────────────────────
    if ($servicio -and -not $NoRestart) {
        Write-Host "==> Iniciando servicio '$ServiceName'..." -ForegroundColor Cyan
        if (-not $DryRun) {
            Start-Service -Name $ServiceName -ErrorAction Stop
            if (-not (Wait-Salud 30)) {
                throw "El servicio se inició pero no respondió en $urlSalud."
            }
            Write-Host "Servicio OK: $urlSalud" -ForegroundColor Green
        }
    } elseif ($servicio -and $NoRestart) {
        Write-Host "==> Servicio detenido. Inicialo a mano con: Start-Service $ServiceName" -ForegroundColor Yellow
    } else {
        Write-Host "==> No hay servicio instalado. Iniciá el sistema con 'Iniciar Sistema.bat'." -ForegroundColor Yellow
    }
} catch {
    $fallo = $true
    Write-Host ""
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    # Si el servicio existía y lo detuvimos, intentar dejarlo funcionando
    # incluso si la actualización falló (mejor un sistema viejo andando que
    # uno apagado). Si el arranque falla, se informa.
    if ($servicio -and $servicioEstabaCorriendo -and -not $NoRestart -and -not $DryRun) {
        $estado = (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue).Status
        if ($estado -ne 'Running') {
            Write-Host "==> Reintentando iniciar el servicio tras la actualización..." -ForegroundColor Yellow
            try {
                Start-Service -Name $ServiceName -ErrorAction Stop
                if (Wait-Salud 30) {
                    Write-Host "Servicio OK: $urlSalud" -ForegroundColor Green
                } else {
                    Write-Host "Aviso: el servicio arrancó pero no respondió en $urlSalud." -ForegroundColor Yellow
                }
            } catch {
                Write-Host "No se pudo reiniciar el servicio: $($_.Exception.Message)" -ForegroundColor Red
                Write-Host "Revisá los logs en $env:ProgramData\SistemaStock\Logs" -ForegroundColor Yellow
            }
        }
    }
}

if ($DryRun) {
    Write-Host ""
    Write-Host "Dry-run completado: no se modificó nada." -ForegroundColor Green
    exit 0
}

if ($fallo) {
    Write-Host ""
    Write-Host "La actualización no terminó correctamente. Revisá los mensajes de arriba." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Actualización completada." -ForegroundColor Green
exit 0
