# ────────────────────────────────────────────────────────────
# Instala (o actualiza) el backend como servicio de Windows usando NSSM.
#
# ESTE SCRIPT ES OPCIONAL Y NO LO EJECUTA EL INSTALADOR. Sirve para que el
# sistema arranque solo al encender la PC y para que "Iniciar Sistema.bat"
# solo abra el navegador (sin ventana de consola ni compilaciones).
#
# Requisitos:
#   - Ejecutar PowerShell como Administrador.
#   - NSSM descargado (https://nssm.cc/download), por ejemplo en
#     C:\tools\nssm\nssm.exe. También se busca en el PATH, en tools\nssm\
#     y en C:\ProgramData\chocolatey\bin.
#   - Backend ya compilado (dist\server.js) y .env configurado.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\instalar_servicio.ps1 `
#       -NssmPath "C:\tools\nssm\nssm.exe"
#
# Opciones:
#   -ServiceName   Nombre del servicio (default "SistemaStock").
#   -AppDir        Carpeta de la instalación (default: padre de scripts\).
#   -NssmPath      Ruta a nssm.exe (si no está en el PATH).
#   -NodePath      Ruta a node.exe (default: el node del PATH).
#   -NoStart       Configura el servicio pero no lo inicia.
#
# Para desinstalarlo: scripts\desinstalar_servicio.ps1
# ────────────────────────────────────────────────────────────
param(
    [string]$ServiceName = "SistemaStock",
    [string]$AppDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$NssmPath,
    [string]$NodePath,
    [switch]$NoStart
)

$ErrorActionPreference = 'Stop'

function Test-EsAdministrador {
    $identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identidad)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Find-Nssm {
    if ($NssmPath) {
        if (Test-Path -LiteralPath $NssmPath) { return (Resolve-Path -LiteralPath $NssmPath).Path }
        return $null
    }
    $cmd = Get-Command nssm -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $candidatos = @(
        (Join-Path $AppDir "tools\nssm\nssm.exe"),
        (Join-Path $PSScriptRoot "..\tools\nssm\nssm.exe"),
        "C:\ProgramData\chocolatey\bin\nssm.exe",
        "C:\nssm\nssm.exe",
        (Join-Path $env:ProgramFiles "nssm\nssm.exe")
    )
    foreach ($candidato in $candidatos) {
        if ($candidato -and (Test-Path -LiteralPath $candidato)) { return $candidato }
    }
    return $null
}

function Find-Node {
    if ($NodePath) {
        if (Test-Path -LiteralPath $NodePath) { return (Resolve-Path -LiteralPath $NodePath).Path }
        return $null
    }
    $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $candidatos = @(
        (Join-Path $env:ProgramFiles "nodejs\node.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe")
    )
    foreach ($candidato in $candidatos) {
        if ($candidato -and (Test-Path -LiteralPath $candidato)) { return $candidato }
    }
    return $null
}

function Test-Salud([int]$Segundos = 20) {
    for ($i = 0; $i -lt $Segundos; $i++) {
        try {
            $respuesta = Invoke-WebRequest -UseBasicParsing `
                -Uri "http://localhost:3000/api/v1/health" -TimeoutSec 2
            if ($respuesta.StatusCode -eq 200) { return $true }
        } catch {
            // todavía no responde
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

if (-not (Test-EsAdministrador)) {
    Write-Host "ERROR: ejecutá este script como Administrador (clic derecho → Ejecutar como administrador)." -ForegroundColor Red
    exit 1
}

$backendDir = Join-Path $AppDir "stock-ventas-backend"
$serverJs = Join-Path $backendDir "dist\server.js"
if (-not (Test-Path -LiteralPath $serverJs)) {
    Write-Host "ERROR: no existe $serverJs" -ForegroundColor Red
    Write-Host "       Compilá primero el backend (npm run build) o ejecutá 'Iniciar Sistema.bat' una vez." -ForegroundColor Yellow
    exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $backendDir ".env"))) {
    Write-Host "AVISO: no se encontró $backendDir\.env; el servicio no va a poder conectarse a la base." -ForegroundColor Yellow
}

$nssm = Find-Nssm
if (-not $nssm) {
    Write-Host "ERROR: no se encontró nssm.exe." -ForegroundColor Red
    Write-Host "       Descargalo de https://nssm.cc/download, descomprimilo y pasá la ruta con -NssmPath." -ForegroundColor Yellow
    Write-Host '       Ejemplo: -NssmPath "C:\tools\nssm\nssm.exe"' -ForegroundColor Yellow
    exit 1
}

$node = Find-Node
if (-not $node) {
    Write-Host "ERROR: no se encontró node.exe. Pasá la ruta con -NodePath." -ForegroundColor Red
    exit 1
}

$programData = if ($env:ProgramData) { $env:ProgramData } else { "C:\ProgramData" }
$logDir = Join-Path $programData "SistemaStock\Logs"
if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logOut = Join-Path $logDir "backend-out.log"
$logErr = Join-Path $logDir "backend-err.log"

function Invoke-Nssm {
    param([string[]]$Argumentos)
    & $nssm @Argumentos
    if ($LASTEXITCODE -ne 0) {
        throw "nssm falló: nssm $($Argumentos -join ' ')"
    }
}

$parametros = '"' + $serverJs + '"'
$existe = $null -ne (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)

if ($existe) {
    Write-Host "==> Actualizando el servicio existente '$ServiceName'..." -ForegroundColor Cyan
    Invoke-Nssm -Argumentos @("set", $ServiceName, "Application", $node)
    Invoke-Nssm -Argumentos @("set", $ServiceName, "AppParameters", $parametros)
} else {
    Write-Host "==> Creando el servicio '$ServiceName'..." -ForegroundColor Cyan
    Invoke-Nssm -Argumentos @("install", $ServiceName, $node, $parametros)
}

Invoke-Nssm -Argumentos @("set", $ServiceName, "AppDirectory", $backendDir)
Invoke-Nssm -Argumentos @("set", $ServiceName, "DisplayName", "Sistema Stock")
Invoke-Nssm -Argumentos @("set", $ServiceName, "Description", "Backend del Sistema de Gestion de Stock y Ventas")
Invoke-Nssm -Argumentos @("set", $ServiceName, "Start", "SERVICE_AUTO_START")
Invoke-Nssm -Argumentos @("set", $ServiceName, "AppStdout", $logOut)
Invoke-Nssm -Argumentos @("set", $ServiceName, "AppStderr", $logErr)
Invoke-Nssm -Argumentos @("set", $ServiceName, "AppRotateFiles", "1")
Invoke-Nssm -Argumentos @("set", $ServiceName, "AppRotateOnline", "1")
Invoke-Nssm -Argumentos @("set", $ServiceName, "AppRotateBytes", "10485760")
Invoke-Nssm -Argumentos @("set", $ServiceName, "AppStopMethodConsole", "15000")

if (-not $NoStart) {
    Write-Host "==> Iniciando/reiniciando el servicio..." -ForegroundColor Cyan
    $estadoServicio = (Get-Service -Name $ServiceName).Status
    if ($estadoServicio -eq 'Running') {
        Restart-Service -Name $ServiceName -Force -ErrorAction Stop
    } else {
        Start-Service -Name $ServiceName -ErrorAction Stop
    }
    if (Test-Salud 30) {
        Write-Host "Servicio OK: http://localhost:3000" -ForegroundColor Green
    } else {
        Write-Host "AVISO: el servicio arrancó pero no respondió en 30 segundos." -ForegroundColor Yellow
        Write-Host "       Revisá $logErr" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Servicio instalado/actualizado." -ForegroundColor Green
Write-Host "  Nombre:      $ServiceName"
Write-Host "  Ejecuta:     $node"
Write-Host "  Parámetros:  $parametros"
Write-Host "  Directorio:  $backendDir"
Write-Host "  Inicio:      automático (al iniciar Windows)"
Write-Host "  Logs:        $logDir"
Write-Host ""
Write-Host "Desde ahora, 'Iniciar Sistema.bat' solo abre el navegador." -ForegroundColor Cyan
Write-Host "Para desinstalar el servicio: scripts\desinstalar_servicio.ps1" -ForegroundColor Cyan
exit 0
