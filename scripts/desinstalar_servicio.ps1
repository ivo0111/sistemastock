# ────────────────────────────────────────────────────────────
# Elimina el servicio de Windows del backend (creado con NSSM).
#
# ESTE SCRIPT ES OPCIONAL. No borra la base de datos, los backups ni la
# carpeta de la aplicación; solo quita el servicio.
#
# Uso (PowerShell como Administrador):
#   powershell -ExecutionPolicy Bypass -File scripts\desinstalar_servicio.ps1
#
# Opciones:
#   -ServiceName   Nombre del servicio (default "SistemaStock").
#   -AppDir        Carpeta de la instalación (default: padre de scripts\).
#   -NssmPath      Ruta a nssm.exe (si no está en el PATH).
# ────────────────────────────────────────────────────────────
param(
    [string]$ServiceName = "SistemaStock",
    [string]$AppDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$NssmPath
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

if (-not (Test-EsAdministrador)) {
    Write-Host "ERROR: ejecutá este script como Administrador (clic derecho → Ejecutar como administrador)." -ForegroundColor Red
    exit 1
}

$servicio = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $servicio) {
    Write-Host "El servicio '$ServiceName' no existe; no hay nada que desinstalar." -ForegroundColor Yellow
    exit 0
}

$nssm = Find-Nssm
if ($nssm) {
    Write-Host "==> Deteniendo el servicio '$ServiceName'..." -ForegroundColor Cyan
    & $nssm stop $ServiceName | Out-Null
    Start-Sleep -Seconds 1

    Write-Host "==> Eliminando el servicio..." -ForegroundColor Cyan
    & $nssm remove $ServiceName confirm | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "nssm no pudo eliminar el servicio '$ServiceName' (código $LASTEXITCODE)."
    }
} else {
    Write-Host "AVISO: no se encontró nssm.exe; se usa 'sc.exe' para detener/eliminar." -ForegroundColor Yellow
    & sc.exe stop $ServiceName | Out-Null
    for ($i = 0; $i -lt 20; $i++) {
        $estado = (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue).Status
        if ($null -eq $estado -or $estado -eq 'Stopped') { break }
        Start-Sleep -Milliseconds 500
    }
    & sc.exe delete $ServiceName | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "sc.exe no pudo eliminar el servicio '$ServiceName' (código $LASTEXITCODE)."
    }
}

Write-Host ""
Write-Host "Servicio '$ServiceName' eliminado." -ForegroundColor Green
Write-Host "El sistema sigue disponible con 'Iniciar Sistema.bat' (modo ventana)." -ForegroundColor Cyan
Write-Host "Los logs quedaron en $env:ProgramData\SistemaStock\Logs" -ForegroundColor DarkGray
exit 0
