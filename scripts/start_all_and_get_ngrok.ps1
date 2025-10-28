<#
  start_all_and_get_ngrok.ps1

  按用户要求严格实现以下步骤（并仅实现这些步骤）：
  1) 在终端1 中依次执行： mvn -q compile ; mvn exec:java
  2) 在终端2 中执行： powershell -ExecutionPolicy Bypass -File ".\scripts\serve_static.ps1"
  3) 在终端3 中执行： powershell -ExecutionPolicy Bypass -File ".\scripts\start_proxy.ps1"
  4) 在终端4 中执行： powershell -ExecutionPolicy Bypass -NoExit -Command ".\scripts\start_reverse_proxy.ps1 -ListenPort 8083 -StaticPort 8082 -ApiPort 8081"
  5) 在终端5 中执行： ngrok http 8083
  6) 脚本轮询本地 ngrok API (http://127.0.0.1:4040/api/tunnels) 并将终端5 输出的对外 URL 写到标准输出并作为脚本输出返回。

  使用方法：在项目根目录运行此脚本（PowerShell）即可。脚本会打开 5 个新 PowerShell 窗口来运行指定命令。
#>

param()

function Wait-ForPort {
    param(
        [string]$HostName = '127.0.0.1',
        [int]$Port,
        [int]$TimeoutSec = 60
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Test-NetConnection -ComputerName $HostName -Port $Port -WarningAction SilentlyContinue
            if ($r -and $r.TcpTestSucceeded) { return $true }
        } catch { }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Start-NewPwshWindowAsync {
    param(
        [string[]]$ArgArray
    )
    # Open a visible PowerShell window running the specified argument array. Return the Process object.
    $argList = $ArgArray -join ' '
    return Start-Process -FilePath 'powershell' -ArgumentList $argList -WindowStyle Normal -WorkingDirectory (Get-Location) -PassThru
}

Write-Host "Starting services sequentially and waiting for readiness..." -ForegroundColor Cyan

# Step 1a: compile synchronously in this script (wait until compile finishes)
Write-Host "Running: mvn -q compile (will wait until finished)" -ForegroundColor Yellow
try {
    $proc = Start-Process -FilePath 'mvn' -ArgumentList '-q','compile' -NoNewWindow -WorkingDirectory (Get-Location) -PassThru -Wait
} catch {
    Write-Host "Failed to run mvn -q compile: $_" -ForegroundColor Red
    exit 1
}

# Step 1b: start mvn exec:java in a new terminal and wait until backend port 8080 is ready
Write-Host "Starting Java backend: mvn exec:java (new window)" -ForegroundColor Yellow
$p1 = Start-NewPwshWindowAsync -ArgArray @('-NoExit','-Command','"mvn exec:java"')
if (-not $p1) { Write-Host 'Failed to start Java window' -ForegroundColor Red; exit 1 }

# Immediately start remaining services (no blocking) to minimize idle time between starts
Write-Host "Starting static server (serve_static.ps1)" -ForegroundColor Yellow
$p2 = Start-NewPwshWindowAsync -ArgArray @('-NoExit','-ExecutionPolicy','Bypass','-File','."\scripts\serve_static.ps1"')
if (-not $p2) { Write-Host 'Failed to start static server window' -ForegroundColor Red; exit 1 }

Write-Host "Starting HTTP->TCP proxy (start_proxy.ps1)" -ForegroundColor Yellow
$p3 = Start-NewPwshWindowAsync -ArgArray @('-NoExit','-ExecutionPolicy','Bypass','-File','."\scripts\start_proxy.ps1"')
if (-not $p3) { Write-Host 'Failed to start proxy window' -ForegroundColor Red; exit 1 }

Write-Host "Starting reverse proxy (start_reverse_proxy.ps1)" -ForegroundColor Yellow
$p4 = Start-NewPwshWindowAsync -ArgArray @('-NoExit','-ExecutionPolicy','Bypass','-Command','".\scripts\start_reverse_proxy.ps1 -ListenPort 8083 -StaticPort 8082 -ApiPort 8081"')
if (-not $p4) { Write-Host 'Failed to start reverse proxy window' -ForegroundColor Red; exit 1 }

Write-Host "Starting ngrok (ngrok http 8083)" -ForegroundColor Yellow
$p5 = Start-NewPwshWindowAsync -ArgArray @('-NoExit','-Command','"ngrok http 8083"')
if (-not $p5) { Write-Host 'Failed to start ngrok window' -ForegroundColor Red; exit 1 }

# Removed explicit port readiness checks per request; proceed to poll ngrok local API for public URL
# 等待并轮询 ngrok 本地 API 获取公网 URL
$ngrokApi = 'http://127.0.0.1:4040/api/tunnels'
$timeoutSec = 120
$deadline = (Get-Date).AddSeconds($timeoutSec)
$publicUrl = $null

Write-Host "Polling ngrok local API ($ngrokApi) for public URL (timeout ${timeoutSec}s)..." -ForegroundColor Yellow
while ((Get-Date) -lt $deadline) {
    try {
        Start-Sleep -Seconds 1
        $resp = Invoke-RestMethod -Uri $ngrokApi -Method Get -ErrorAction Stop
        if ($resp.tunnels -and $resp.tunnels.Count -gt 0) {
            # 优先选 https
            $https = $resp.tunnels | Where-Object { $_.public_url -like 'https:*' } | Select-Object -First 1
            if ($https) { $publicUrl = $https.public_url } else { $publicUrl = $resp.tunnels[0].public_url }
            break
        }
    } catch {
        # 忽略，继续重试
    }
}

if (-not $publicUrl) {
    Write-Host "Failed to get ngrok public URL within ${timeoutSec} seconds; ensure ngrok is running and listening on 127.0.0.1:4040." -ForegroundColor Red
    exit 1
}

Write-Host "ngrok public URL: $publicUrl" -ForegroundColor Green

# 输出 URL 到 stdout（作为脚本返回值）
Write-Output $publicUrl
try {
    # 写入项目根目录下的 ngrok_public_url.txt 以便其它工具读取
    $projectRoot = Split-Path -Parent $PSScriptRoot | Resolve-Path
    $pubFile = Join-Path -Path $projectRoot -ChildPath 'ngrok_public_url.txt'
    Set-Content -Path $pubFile -Value $publicUrl -Encoding UTF8
    Write-Host "Wrote public URL to: $pubFile" -ForegroundColor Cyan
} catch {
    Write-Host "Warning: failed to write ngrok_public_url.txt: $_" -ForegroundColor Yellow
}
 
