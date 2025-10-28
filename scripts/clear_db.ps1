# Removes generated H2 database files in the project root.
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$files = @(
    "accounting_db.mv.db",
    "accounting_db.trace.db",
    "accounting_db.lock.db"
)

foreach ($file in $files) {
    $target = Join-Path $projectRoot $file
    if (Test-Path $target) {
        Remove-Item $target -Force
        Write-Host "Removed $target"
    }
}

Write-Host "Database artifacts cleared in $projectRoot"
