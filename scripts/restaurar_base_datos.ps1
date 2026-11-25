# ────────────────────────────────────────────────────────────
# Restaura un backup .dump generado por scripts\backup_base_datos.ps1.
#
# IMPORTANTE: sobrescribe los datos actuales de la base. Antes de restaurar,
# por defecto genera un backup de seguridad del estado actual (fuera de la
# carpeta de la aplicación). Cerrá el sistema ("Iniciar Sistema.bat") antes de
# ejecutar este script.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\restaurar_base_datos.ps1 `
#       -BackupFile "C:\ProgramData\SistemaStock\Backups\stock_ventas_2026-11-25_21-30.dump"
#
# Parámetros:
#   -BackupFile       .dump a restaurar (obligatorio).
#   -DatabaseUrl      Connection string destino. Si falta, usa DATABASE_URL de
#                     stock-ventas-backend\.env.
#   -PgBinPath        Carpeta bin de PostgreSQL (default: autodetección).
#   -SafetyBackupDir  Carpeta del backup previo (default: %ProgramData%\SistemaStock\Backups).
#   -SkipSafetyBackup No generar el backup previo (no recomendado).
#   -Force            No pedir confirmación interactiva.
#
# Códigos de salida:
#   0  restauración OK
#   5  no se pudo leer/obtener DATABASE_URL
#   20 no se encontraron pg_restore/psql/pg_dump
#   21 archivo de backup inexistente o inválido
#   30 falló el backup de seguridad previo
#   40 falló pg_restore o la verificación posterior
#   1  error inesperado
# ────────────────────────────────────────────────────────────
param(
    [Parameter(Mandatory = $true)][string]$BackupFile,
    [string]$DatabaseUrl,
    [string]$PgBinPath,
    [string]$SafetyBackupDir,
    [switch]$SkipSafetyBackup,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Read-DatabaseUrlFromEnv {
    $envFile = Join-Path $PSScriptRoot "..\stock-ventas-backend\.env"
    if (-not (Test-Path -LiteralPath $envFile)) { return $null }
    $linea = Get-Content -LiteralPath $envFile | Select-String -Pattern '^\s*DATABASE_URL=' | Select-Object -First 1
    if (-not $linea) { return $null }
    return ($linea.Line -replace '^\s*DATABASE_URL=', '').Trim().Trim('"').Trim("'")
}

function Find-PgTool([string]$Nombre) {
    if ($PgBinPath) {
        $cand = Join-Path $PgBinPath "$Nombre.exe"
        if (Test-Path -LiteralPath $cand) { return $cand }
        Write-Host "[aviso] -PgBinPath no contiene $Nombre.exe: $PgBinPath" -ForegroundColor Yellow
    }
    $dirs = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending
    foreach ($d in $dirs) {
        $cand = Join-Path $d.FullName "bin\$Nombre.exe"
        if (Test-Path -LiteralPath $cand) { return $cand }
    }
    $cmd = Get-Command $Nombre -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

$exitCode = 0
try {
    if (-not (Test-Path -LiteralPath $BackupFile)) {
        Write-Host "ERROR: no existe el archivo de backup: $BackupFile" -ForegroundColor Red
        exit 21
    }
    $BackupFile = (Resolve-Path -LiteralPath $BackupFile).Path

    if (-not $DatabaseUrl) { $DatabaseUrl = Read-DatabaseUrlFromEnv }
    if (-not $DatabaseUrl) {
        Write-Host "ERROR: no se pudo obtener DATABASE_URL (ni stock-ventas-backend\.env ni -DatabaseUrl)" -ForegroundColor Red
        exit 5
    }

    $cargar = [regex]::Match($DatabaseUrl, '^postgresql://(?<user>[^:/?]+)(?::(?<pass>[^@/?]*))?@(?<host>[^/:?]+)(?::(?<port>[0-9]+))?/(?<db>[^?]+)')
    if (-not $cargar.Success) {
        Write-Host "ERROR: no se pudo interpretar DATABASE_URL." -ForegroundColor Red
        exit 5
    }
    $env:PGUSER     = [System.Uri]::UnescapeDataString($cargar.Groups['user'].Value)
    $env:PGPASSWORD = [System.Uri]::UnescapeDataString($cargar.Groups['pass'].Value)
    $env:PGHOST     = $cargar.Groups['host'].Value
    $env:PGPORT     = $cargar.Groups['port'].Value
    if (-not $env:PGPORT) { $env:PGPORT = '5432' }
    $env:PGDATABASE = $cargar.Groups['db'].Value

    if (-not $SafetyBackupDir) {
        $baseProgramData = if ($env:ProgramData) { $env:ProgramData } else { "C:\ProgramData" }
        $SafetyBackupDir = Join-Path $baseProgramData "SistemaStock\Backups"
    }

    $pgrestore = Find-PgTool "pg_restore"
    $pgdump    = Find-PgTool "pg_dump"
    $pgpsql    = Find-PgTool "psql"
    if (-not $pgrestore -or -not $pgpsql -or (-not $SkipSafetyBackup -and -not $pgdump)) {
        Write-Host "ERROR: no se encontraron las herramientas de PostgreSQL (pg_restore/psql/pg_dump)." -ForegroundColor Red
        Write-Host "        Pasá -PgBinPath con la carpeta bin de PostgreSQL." -ForegroundColor Yellow
        exit 20
    }

    # Validar que el .dump sea legible ANTES de tocar la base real.
    & $pgrestore --list "$BackupFile" > $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: el archivo no es un .dump válido para pg_restore: $BackupFile" -ForegroundColor Red
        exit 21
    }

    Write-Host ""
    Write-Host "Base destino: $env:PGDATABASE en ${env:PGHOST}:${env:PGPORT}" -ForegroundColor Cyan
    Write-Host "Backup:       $BackupFile" -ForegroundColor Cyan
    Write-Host "ATENCION: se van a reemplazar los datos actuales." -ForegroundColor Yellow
    if (-not $Force) {
        $respuesta = Read-Host "Escribí RESTAURAR para continuar"
        if ($respuesta -ne 'RESTAURAR') {
            Write-Host "Cancelado." -ForegroundColor Yellow
            exit 0
        }
    }

    if (-not $SkipSafetyBackup) {
        if (-not (Test-Path -LiteralPath $SafetyBackupDir)) {
            New-Item -ItemType Directory -Path $SafetyBackupDir -Force | Out-Null
        }
        $safety = Join-Path $SafetyBackupDir ("stock_ventas_antes_restaurar_" + (Get-Date -Format "yyyy-MM-dd_HH-mm-ss") + ".dump")
        Write-Host "Generando backup de seguridad: $safety"
        & $pgdump --format=custom --no-owner --no-privileges --file="$safety"
        if ($LASTEXITCODE -ne 0) {
            if (Test-Path -LiteralPath $safety) { Remove-Item -LiteralPath $safety -Force }
            Write-Host "ERROR: falló el backup de seguridad; no se restauró nada." -ForegroundColor Red
            exit 30
        }
    }

    Write-Host "Restaurando..."
    & $pgrestore --clean --if-exists --exit-on-error --no-owner --no-privileges --dbname=$env:PGDATABASE "$BackupFile"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: pg_restore falló con código $LASTEXITCODE." -ForegroundColor Red
        Write-Host "Cerrá el sistema/backend (puede haber conexiones abiertas) y volvé a intentar." -ForegroundColor Yellow
        exit 40
    }

    $tablas = & $pgpsql -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"
    if ($LASTEXITCODE -ne 0 -or [int]$tablas -le 0) {
        Write-Host "ERROR: la restauración terminó pero no se detectaron tablas." -ForegroundColor Red
        exit 40
    }
    $usuarios = & $pgpsql -tAc "SELECT COUNT(*) FROM usuarios"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: no se pudo consultar la tabla usuarios después de restaurar." -ForegroundColor Red
        exit 40
    }

    Write-Host ""
    Write-Host "Restauración OK: $tablas tablas, $usuarios usuarios." -ForegroundColor Green
    Write-Host "Iniciá el sistema con 'Iniciar Sistema.bat'." -ForegroundColor Cyan
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $exitCode = 1
}

exit $exitCode
