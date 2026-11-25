# ────────────────────────────────────────────────────────────
# Programa el backup diario de PostgreSQL en el Programador de tareas de
# Windows (Task Scheduler). Pensado para correr como Administrador.
#
# Ejemplo (lo que usa el instalador):
#   powershell -ExecutionPolicy Bypass -File scripts\programar_backup.ps1 `
#       -BackupTime "21:30" -RetentionDays 30
#
# Parámetros:
#   -TaskName       Nombre de la tarea (default "Sistema Stock - Backup DB").
#   -BackupTime     Hora diaria HH:mm (default 21:30).
#   -RetentionDays  Días de retención (default 30; configurable).
#   -BackupDir      Carpeta destino (default %ProgramData%\SistemaStock\Backups).
#   -PgBinPath      Carpeta bin de PostgreSQL (default: autodetección).
#   -RunNow         Ejecuta la tarea inmediatamente después de crearla.
#   -Unregister     Elimina la tarea programada y sale.
#
# La tarea se registra como SYSTEM con RunLevel Highest para que pueda leer
# el .env de la instalación, ejecutar pg_dump y escribir en ProgramData sin
# depender de que haya un usuario con sesión iniciada.
# ────────────────────────────────────────────────────────────
param(
    [string]$TaskName = "Sistema Stock - Backup DB",
    [string]$BackupTime = "21:30",
    [int]$RetentionDays = 30,
    [string]$BackupDir,
    [string]$PgBinPath,
    [switch]$RunNow,
    [switch]$Unregister
)

$ErrorActionPreference = 'Stop'

function Test-EsAdministrador {
    $identidad = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identidad)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-PowerShellExe {
    $candidato = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    if (Test-Path -LiteralPath $candidato) { return $candidato }
    return (Get-Command powershell.exe -ErrorAction Stop).Source
}

if (-not $IsWindows -and $PSVersionTable.PSEdition -eq 'Core') {
    # $IsWindows no existe en Windows PowerShell 5.1; solo se evalúa en PS 7+.
    Write-Host "ERROR: este script es específico de Windows (Task Scheduler)." -ForegroundColor Red
    exit 1
}

if (-not (Test-EsAdministrador)) {
    Write-Host "ERROR: ejecutá este script como Administrador (clic derecho → Ejecutar como administrador)." -ForegroundColor Red
    exit 1
}

if ($Unregister) {
    $tarea = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($tarea) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Tarea '$TaskName' eliminada." -ForegroundColor Green
    } else {
        Write-Host "La tarea '$TaskName' no existía." -ForegroundColor Yellow
    }
    exit 0
}

$scriptBackup = Join-Path $PSScriptRoot "backup_base_datos.ps1"
if (-not (Test-Path -LiteralPath $scriptBackup)) {
    Write-Host "ERROR: no se encontró $scriptBackup" -ForegroundColor Red
    exit 1
}

if ($BackupTime -notmatch '^(?:[01]\d|2[0-3]):[0-5]\d$') {
    Write-Host "ERROR: -BackupTime debe tener formato HH:mm (ej. 21:30)." -ForegroundColor Red
    exit 1
}

if (-not $BackupDir) {
    $baseProgramData = if ($env:ProgramData) { $env:ProgramData } else { "C:\ProgramData" }
    $BackupDir = Join-Path $baseProgramData "SistemaStock\Backups"
}
if (-not (Test-Path -LiteralPath $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$argumentos = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptBackup`" -OutputDir `"$BackupDir`" -RetentionDays $RetentionDays"
if ($PgBinPath) {
    $argumentos += " -PgBinPath `"$PgBinPath`""
}

$powershell = Get-PowerShellExe
$accion = New-ScheduledTaskAction -Execute $powershell -Argument $argumentos
$disparador = New-ScheduledTaskTrigger -Daily -At $BackupTime
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$configuracion = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $accion `
    -Trigger $disparador `
    -Principal $principal `
    -Settings $configuracion `
    -Description "Backup diario de la base PostgreSQL del Sistema Stock (retención $RetentionDays días)." `
    -Force | Out-Null

Write-Host "Tarea programada creada/actualizada:" -ForegroundColor Green
Write-Host "  Nombre:    $TaskName"
Write-Host "  Horario:   todos los días a las $BackupTime"
Write-Host "  Ejecuta:   $scriptBackup"
Write-Host "  Destino:   $BackupDir"
Write-Host "  Retención: $RetentionDays días"
Write-Host "  Usuario:   SYSTEM (RunLevel Highest)"

if ($RunNow) {
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "Tarea iniciada ahora. Revisá la carpeta de backups en unos segundos." -ForegroundColor Cyan
}
