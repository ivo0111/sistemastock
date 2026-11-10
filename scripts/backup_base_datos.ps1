# ────────────────────────────────────────────────────────────
# Backup de la base de datos PostgreSQL de la aplicación, con `pg_dump`.
#
# Uso:
#     powershell -ExecutionPolicy Bypass -File scripts\backup_base_datos.ps1
#
# Parámetros (todos opcionales):
#     -DatabaseUrl   Connection string de la base a respaldar. Si no se
#                    pasa, se lee DATABASE_URL de stock-ventas-backend\.env
#     -OutputDir     Carpeta donde dejar los .dump (default: ..\stock-ventas-backend\backups)
#     -RetentionDays Cuántos días conservar los .dump (default: 30; los más viejos se borran)
#     -PgBinPath     Carpeta bin de PostgreSQL que contiene pg_dump.exe
#                    (default: detección automática en C:\Program Files\PostgreSQL\*\bin)
#
# Códigos de salida:
#     0  respaldo generado con éxito
#     5  no se pudo leer/obtener DATABASE_URL
#     20 pg_dump no encontrado o falló
#     1  error inesperado
#
# Restaurar un respaldo (sobrescribe la base existente):
#     pg_restore --clean --if-exists --dbname="DATABASE_URL" "archivo.dump"
#
# Para programarlo (Task Scheduler) ver "Backups automáticos" en README.md.
# ────────────────────────────────────────────────────────────
param(
    [string]$DatabaseUrl,
    [string]$OutputDir = (Join-Path $PSScriptRoot "..\stock-ventas-backend\backups"),
    [int]$RetentionDays = 30,
    [string]$PgBinPath
)

$ErrorActionPreference = 'Stop'

function Read-DatabaseUrlFromEnv {
    $envFile = Join-Path $PSScriptRoot "..\stock-ventas-backend\.env"
    if (-not (Test-Path -LiteralPath $envFile)) { return $null }
    $linea = Get-Content -LiteralPath $envFile | Select-String -Pattern '^\s*DATABASE_URL=' | Select-Object -First 1
    if (-not $linea) { return $null }
    return ($linea.Line -replace '^\s*DATABASE_URL=', '').Trim().Trim('"').Trim("'")
}

function Find-PgDump {
    if ($PgBinPath) {
        $cand = Join-Path $PgBinPath "pg_dump.exe"
        if (Test-Path -LiteralPath $cand) { return $cand }
        Write-Host "[aviso] -PgBinPath no contiene pg_dump.exe: $PgBinPath" -ForegroundColor Yellow
    }
    $dirs = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending
    foreach ($d in $dirs) {
        $cand = Join-Path $d.FullName "bin\pg_dump.exe"
        if (Test-Path -LiteralPath $cand) { return $cand }
    }
    $cmd = Get-Command pg_dump -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

$exitCode = 0
try {
    if (-not $DatabaseUrl) { $DatabaseUrl = Read-DatabaseUrlFromEnv }
    if (-not $DatabaseUrl) {
        Write-Host "ERROR: no se pudo obtener DATABASE_URL (ni stock-ventas-backend\.env ni -DatabaseUrl)" -ForegroundColor Red
        Write-Host "       pasala a mano con -DatabaseUrl 'postgresql://usuario:clave@localhost:5432/stock_ventas'" -ForegroundColor Yellow
        exit 5
    }

    # Desarmar la URL y pasarla por variables de entorno (PGUSER/PGPASSWORD/
    # PGHOST/PGPORT/PGDATABASE/PGOPTIONS) en vez de la línea de comandos de
    # pg_dump, para no exponer la contraseña en el listado de procesos.
    $cargar = [regex]::Match($DatabaseUrl, '^postgresql://(?<user>[^:/?]+)(?::(?<pass>[^@/?]*))?@(?<host>[^/:?]+)(?::(?<port>[0-9]+))?/(?<db>[^?]+)')
    if (-not $cargar.Success) {
        Write-Host "ERROR: no se pudo interpretar DATABASE_URL (formato esperado postgresql://usuario:clave@host:puerto/base)" -ForegroundColor Red
        exit 5
    }
    $env:PGUSER     = [System.Uri]::UnescapeDataString($cargar.Groups['user'].Value)
    $env:PGPASSWORD = [System.Uri]::UnescapeDataString($cargar.Groups['pass'].Value)
    $env:PGHOST     = $cargar.Groups['host'].Value
    $env:PGPORT     = $cargar.Groups['port'].Value
    if (-not $env:PGPORT) { $env:PGPORT = '5432' }
    $env:PGDATABASE = $cargar.Groups['db'].Value

    if (-not (Test-Path -LiteralPath $OutputDir)) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    }

    $pgdump = Find-PgDump
    if (-not $pgdump) {
        Write-Host "ERROR: no se encontró pg_dump.exe (buscado en C:\Program Files\PostgreSQL\*\bin y en el PATH)." -ForegroundColor Red
        Write-Host "        Verificá que PostgreSQL esté instalado (INSTALACION.md paso 1) o pasá -PgBinPath." -ForegroundColor Yellow
        exit 20
    }

    Write-Host "pg_dump:  $pgdump"
    Write-Host "Destino:  $OutputDir (retención $RetentionDays días)"

    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
    $target = Join-Path $OutputDir "stock_ventas_$timestamp.dump"
    & $pgdump --format=custom --file="$target"
    if ($LASTEXITCODE -ne 0) {
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }
        Write-Host "ERROR: pg_dump falló con código $LASTEXITCODE (archivo incompleto borrado)." -ForegroundColor Red
        exit 20
    }

    # Retención: borrar respaldos más viejos que RetentionDays.
    $cutoff = (Get-Date).AddDays(-$RetentionDays)
    $viejos = Get-ChildItem -LiteralPath $OutputDir -Filter "stock_ventas_*.dump" |
              Where-Object { $_.LastWriteTime -lt $cutoff }
    foreach ($v in $viejos) {
        Remove-Item -LiteralPath $v.FullName -Force
        Write-Host "  Borrado por retención: $($v.Name)" -ForegroundColor DarkGray
    }

    Write-Host ""
    Write-Host "Respaldo OK -> $target" -ForegroundColor Green
    Write-Host ""
    Write-Host "Respaldos guardados:" -ForegroundColor Cyan
    Get-ChildItem -LiteralPath $OutputDir -Filter "stock_ventas_*.dump" |
        Sort-Object LastWriteTime -Descending |
        ForEach-Object { Write-Host ("  {0,-30} {1:n0} KB  {2:yyyy-MM-dd HH:mm}" -f $_.Name, [math]::Round($_.Length / 1KB), $_.LastWriteTime) }
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $exitCode = 1
}

exit $exitCode
