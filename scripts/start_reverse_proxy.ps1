param(
    [int]$ListenPort,
    [string]$StaticHost,
    [int]$StaticPort,
    [string]$ApiHost,
    [int]$ApiPort,
    [string]$NodePath = $(if ($env:NODE_PATH) { $env:NODE_PATH } else { "node" })
)

$projectRoot = Join-Path -Path $PSScriptRoot -ChildPath ".."
$reverseProxyScript = Join-Path -Path $projectRoot -ChildPath "proxy\reverse_proxy.js"

if (-not (Test-Path -Path $reverseProxyScript)) {
    Write-Error "Reverse proxy script not found: $reverseProxyScript"
    exit 1
}

if (-not (Get-Command $NodePath -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js executable not found: $NodePath"
    Write-Host "Please install Node.js or set NODE_PATH environment variable to the node executable." -ForegroundColor Yellow
    exit 1
}

Write-Host "== Starting reverse proxy (static + API) ==" -ForegroundColor Cyan

$previousEnv = @{
    REVERSE_PROXY_PORT = $env:REVERSE_PROXY_PORT
    STATIC_SERVICE_HOST = $env:STATIC_SERVICE_HOST
    STATIC_SERVICE_PORT = $env:STATIC_SERVICE_PORT
    API_SERVICE_HOST = $env:API_SERVICE_HOST
    API_SERVICE_PORT = $env:API_SERVICE_PORT
}

try {
    if ($PSBoundParameters.ContainsKey("ListenPort")) {
        $env:REVERSE_PROXY_PORT = $ListenPort
    }
    if ($PSBoundParameters.ContainsKey("StaticHost")) {
        $env:STATIC_SERVICE_HOST = $StaticHost
    }
    if ($PSBoundParameters.ContainsKey("StaticPort")) {
        $env:STATIC_SERVICE_PORT = $StaticPort
    }
    if ($PSBoundParameters.ContainsKey("ApiHost")) {
        $env:API_SERVICE_HOST = $ApiHost
    }
    if ($PSBoundParameters.ContainsKey("ApiPort")) {
        $env:API_SERVICE_PORT = $ApiPort
    }

    $effectiveListenPort = $(if ($env:REVERSE_PROXY_PORT) { $env:REVERSE_PROXY_PORT } else { "8080" })
    $effectiveStaticHost = $(if ($env:STATIC_SERVICE_HOST) { $env:STATIC_SERVICE_HOST } else { "127.0.0.1" })
    $effectiveStaticPort = $(if ($env:STATIC_SERVICE_PORT) { $env:STATIC_SERVICE_PORT } else { "8082" })
    $effectiveApiHost = $(if ($env:API_SERVICE_HOST) { $env:API_SERVICE_HOST } else { "127.0.0.1" })
    $effectiveApiPort = $(if ($env:API_SERVICE_PORT) { $env:API_SERVICE_PORT } else { "8081" })

    Write-Host ("Public port: http://127.0.0.1:{0}" -f $effectiveListenPort) -ForegroundColor Green
    Write-Host ("Static upstream: {0}:{1}" -f $effectiveStaticHost, $effectiveStaticPort)
    Write-Host ("API upstream: {0}:{1}" -f $effectiveApiHost, $effectiveApiPort)
    Write-Host "Tip: Press Ctrl+C to stop."

    Push-Location -Path $projectRoot
    try {
        & $NodePath $reverseProxyScript
    } finally {
        Pop-Location
    }
}
finally {
    $env:REVERSE_PROXY_PORT = $previousEnv.REVERSE_PROXY_PORT
    $env:STATIC_SERVICE_HOST = $previousEnv.STATIC_SERVICE_HOST
    $env:STATIC_SERVICE_PORT = $previousEnv.STATIC_SERVICE_PORT
    $env:API_SERVICE_HOST = $previousEnv.API_SERVICE_HOST
    $env:API_SERVICE_PORT = $previousEnv.API_SERVICE_PORT
}
