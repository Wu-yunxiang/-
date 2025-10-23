param(
    [int]$Port = $(if ($env:RESOURCE_HTTP_PORT) { [int]$env:RESOURCE_HTTP_PORT } else { 8082 }),
    [string]$BindAddress = $(if ($env:RESOURCE_HTTP_HOST) { $env:RESOURCE_HTTP_HOST } else { "127.0.0.1" }),
    [string]$Python = $(if ($env:PYTHON) { $env:PYTHON } else { "python" })
)

$resourceDir = Join-Path -Path $PSScriptRoot -ChildPath "..\resource"
if (-not (Test-Path -Path $resourceDir)) {
    Write-Error "resource directory not found: $resourceDir"
    exit 1
}

Write-Host "== Starting static resource server ==" -ForegroundColor Cyan
Write-Host "Resource directory: $resourceDir"
Write-Host ("Access URL: http://{0}:{1}/index.html" -f $BindAddress, $Port) -ForegroundColor Green
Write-Host "Tip: Open the URL above in a browser to access the client. Press Ctrl+C to stop."

Push-Location -Path $resourceDir
try {
    # Invoke Python using Start-Process to avoid quoting/parse issues when launched via -File
    $args = @("-m", "http.server", [string]$Port, "--bind", $BindAddress)
    Write-Host "Starting Python: $Python $($args -join ' ')" -ForegroundColor Yellow
    Start-Process -FilePath $Python -ArgumentList $args -NoNewWindow -Wait
} finally {
    Pop-Location
}
