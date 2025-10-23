param(
    [int]$HttpPort,
    [string]$TcpHost,
    [int]$TcpPort,
    [int]$TimeoutMs,
    [string]$NodePath = $(if ($env:NODE_PATH) { $env:NODE_PATH } else { "node" })
)

$projectRoot = Join-Path -Path $PSScriptRoot -ChildPath ".."
$proxyScript = Join-Path -Path $projectRoot -ChildPath "proxy\http_to_tcp_proxy.js"

if (-not (Test-Path -Path $proxyScript)) {
    Write-Error "Proxy script not found: $proxyScript"
    exit 1
}

if (-not (Get-Command $NodePath -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js executable not found: $NodePath"
    Write-Host "Please install Node.js or set NODE_PATH environment variable to the node executable." -ForegroundColor Yellow
    exit 1
}

Write-Host "== Starting HTTP->TCP proxy ==" -ForegroundColor Cyan

$previousEnv = @{
    PROXY_HTTP_PORT = $env:PROXY_HTTP_PORT
    PROXY_TCP_HOST  = $env:PROXY_TCP_HOST
    PROXY_TCP_PORT  = $env:PROXY_TCP_PORT
    PROXY_TIMEOUT_MS = $env:PROXY_TIMEOUT_MS
}

try {
    if ($PSBoundParameters.ContainsKey("HttpPort")) {
        $env:PROXY_HTTP_PORT = $HttpPort
    }
    if ($PSBoundParameters.ContainsKey("TcpHost")) {
        $env:PROXY_TCP_HOST = $TcpHost
    }
    if ($PSBoundParameters.ContainsKey("TcpPort")) {
        $env:PROXY_TCP_PORT = $TcpPort
    }
    if ($PSBoundParameters.ContainsKey("TimeoutMs")) {
        $env:PROXY_TIMEOUT_MS = $TimeoutMs
    }

    $effectiveHttpPort = $(if ($env:PROXY_HTTP_PORT) { $env:PROXY_HTTP_PORT } else { "8081" })
    $effectiveTcpHost  = $(if ($env:PROXY_TCP_HOST)  { $env:PROXY_TCP_HOST } else { "127.0.0.1" })
    $effectiveTcpPort  = $(if ($env:PROXY_TCP_PORT)  { $env:PROXY_TCP_PORT } else { "8080" })
    $effectiveTimeout  = $(if ($env:PROXY_TIMEOUT_MS) { $env:PROXY_TIMEOUT_MS } else { "8000" })

    Write-Host ("Listening at: http://127.0.0.1:{0}" -f $effectiveHttpPort) -ForegroundColor Green
    Write-Host ("Backend TCP: {0}:{1}" -f $effectiveTcpHost, $effectiveTcpPort)
    Write-Host ("Timeout: {0}ms" -f $effectiveTimeout)
    Write-Host "Tip: Press Ctrl+C to stop."

    Push-Location -Path $projectRoot
    try {
        & $NodePath $proxyScript
    } finally {
        Pop-Location
    }
}
finally {
    $env:PROXY_HTTP_PORT = $previousEnv.PROXY_HTTP_PORT
    $env:PROXY_TCP_HOST = $previousEnv.PROXY_TCP_HOST
    $env:PROXY_TCP_PORT = $previousEnv.PROXY_TCP_PORT
    $env:PROXY_TIMEOUT_MS = $previousEnv.PROXY_TIMEOUT_MS
}
