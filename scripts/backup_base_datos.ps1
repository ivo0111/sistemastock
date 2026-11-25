# ────────────────────────────────────────────────────────────
# Backup de la base de datos PostgreSQL de la aplicación, con `pg_dump`.
#
# Uso:
#     powershell -ExecutionPolicy Bypass -File scripts\backup_base_datos.ps1
#
# Parámetros (todos opcionales):
#     -DatabaseUrl   Connection string de la base a respaldar. Si no se
#                    pasa, se lee DATABASE_URL de stock-ventas-backend\.env
#     -OutputDir     Carpeta donde dejar los .dump. Default:
#                    %ProgramData%\SistemaStock\Backups (FUERA de la carpeta
#                    de la aplicación). También se puede fijar con la variable
#                    de entorno STOCK_BACKUP_DIR.
#     -RetentionDays Cuántos días conservar los .dump (default: 30; los más
#                    viejos se borran). También se puede fijar con
#                    STOCK_BACKUP_RETENTION_DAYS.
#     -PgBinPath     Carpeta bin de PostgreSQL que contiene pg_dump.exe
#                    (default: detección automática en C:\Program Files\PostgreSQL\*\bin)
#     -TestRestore   Después del backup, restaura el .dump en una base temporal
#                    y la borra. Verifica que pg_restore realmente funcione.
#
# Códigos de salida:
#     0  respaldo generado con éxito
#     5  no se pudo leer/obtener DATABASE_URL
#     20 pg_dump/pg_restore no encontrado, o falló la creación/validación del dump
#     25 falló la prueba de restauración (-TestRestore)
#     1  error inesperado
#
# Restaurar un respaldo (sobrescribe la base existente):
#     powershell -ExecutionPolicy Bypass -File scripts\restaurar_base_datos.ps1 -BackupFile "...\stock_ventas_....dump"
#
# Para programarlo (Task Scheduler) usar scripts\programar_backup.ps1, que
# crea la tarea diaria (default 21:30) con privilegios de SYSTEM.
# ────────────────────────────────────────────────────────────
param(
    [string]$DatabaseUrl,
    [string]$OutputDir,
    [int]$RetentionDays = 0,
    [string]$PgBinPath,
    [switch]$TestRestore
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

# Defaults "seguros": fuera de la carpeta de la aplicación, para que un
# borrado/actualización del sistema no se lleve los respaldos.
if (-not $OutputDir) {
    if ($env:STOCK_BACKUP_DIR) {
        $OutputDir = $env:STOCK_BACKUP_DIR
    } else {
        $baseProgramData = if ($env:ProgramData) { $env:ProgramData } else { "C:\ProgramData" }
        $OutputDir = Join-Path $baseProgramData "SistemaStock\Backups"
    }
}
if ($RetentionDays -le 0) {
    $retencionEnv = 0
    if ($env:STOCK_BACKUP_RETENTION_DAYS -and [int]::TryParse($env:STOCK_BACKUP_RETENTION_DAYS, [ref]$retencionEnv)) {
        $RetentionDays = $retencionEnv
    } else {
        $RetentionDays = 30
    }
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
    # PGHOST/PGPORT/PGDATABASE) en vez de la línea de comandos de pg_dump,
    # para no exponer la contraseña en el listado de procesos.
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

    $pgdump = Find-PgTool "pg_dump"
    if (-not $pgdump) {
        Write-Host "ERROR: no se encontró pg_dump.exe (buscado en C:\Program Files\PostgreSQL\*\bin y en el PATH)." -ForegroundColor Red
        Write-Host "        Verificá que PostgreSQL esté instalado (INSTALACION.md paso 1) o pasá -PgBinPath." -ForegroundColor Yellow
        exit 20
    }
    $pgrestore = Find-PgTool "pg_restore"
    if (-not $pgrestore) {
        Write-Host "ERROR: no se encontró pg_restore.exe (necesario para validar/probar el backup)." -ForegroundColor Red
        Write-Host "        Pasá -PgBinPath con la carpeta bin de PostgreSQL." -ForegroundColor Yellow
        exit 20
    }

    Write-Host "pg_dump:  $pgdump"
    Write-Host "Destino:  $OutputDir (retención $RetentionDays días)"

    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
    $target = Join-Path $OutputDir "stock_ventas_$timestamp.dump"
    & $pgdump --format=custom --no-owner --no-privileges --file="$target"
    if ($LASTEXITCODE -ne 0) {
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }
        Write-Host "ERROR: pg_dump falló con código $LASTEXITCODE (archivo incompleto borrado)." -ForegroundColor Red
        exit 20
    }

    # Validación básica del archivo: pg_restore --list detecta un .dump
    # truncado/corrupto sin tener que tocar la base real.
    & $pgrestore --list "$target" > $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: pg_restore no pudo leer el backup generado (archivo inválido)." -ForegroundColor Red
        exit 20
    }

    if ($TestRestore) {
        Write-Host "Probando restauración en una base temporal..."
        $pgpsql = Find-PgTool "psql"
        if (-not $pgpsql) {
            Write-Host "ERROR: no se encontró psql.exe para la prueba de restauración." -ForegroundColor Red
            exit 25
        }
        $tempDb = "stock_ventas_restore_test_" + (Get-Date -Format "yyyyMMddHHmmss")
        $tempCreada = $false
        try {
            & $pgpsql -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $tempDb" | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "No se pudo crear la base temporal $tempDb" }
            $tempCreada = $true

            & $pgrestore --no-owner --no-privileges --dbname=$tempDb "$target"
            if ($LASTEXITCODE -ne 0) { throw "pg_restore falló con código $LASTEXITCODE" }

            $tablas = & $pgpsql -d $tempDb -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'"
            if ($LASTEXITCODE -ne 0 -or [int]$tablas -le 0) {
                throw "La restauración no creó tablas en la base temporal"
            }
            Write-Host "Restauración verificada OK ($tablas tablas restauradas)." -ForegroundColor Green
        } catch {
            Write-Host "ERROR en la prueba de restauración: $($_.Exception.Message)" -ForegroundColor Red
            $exitCode = 25
        } finally {
            if ($tempCreada) {
                & $pgpsql -d postgres -c "DROP DATABASE IF EXISTS $tempDb" | Out-Null
            }
        }
        if ($exitCode -ne 0) { exit $exitCode }
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
