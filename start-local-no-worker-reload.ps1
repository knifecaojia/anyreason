$ErrorActionPreference = "Stop"

$repoRoot = "F:\animate-serial\apps\anyreason"
$backendDir = Join-Path $repoRoot "fastapi_backend"
$frontendDir = Join-Path $repoRoot "nextjs-frontend"

$backendHost = "0.0.0.0"
$backendPort = "8000"
$frontendHost = "0.0.0.0"
$frontendPort = "3000"

# ── Kill existing processes on target ports ──
Write-Host "Cleaning up existing processes..." -ForegroundColor DarkGray

Get-NetTCPConnection -LocalPort $backendPort -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Write-Host "  Killing PID $_ (port $backendPort)" -ForegroundColor DarkGray; Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

Get-NetTCPConnection -LocalPort $frontendPort -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Write-Host "  Killing PID $_ (port $frontendPort)" -ForegroundColor DarkGray; Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*app.tasks.worker*"
} | ForEach-Object {
    Write-Host "  Killing PID $($_.ProcessId) ($($_.CommandLine.Substring(0, [Math]::Min(60, $_.CommandLine.Length)))...)" -ForegroundColor DarkGray
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 500
Write-Host "Done." -ForegroundColor DarkGray
Write-Host ""

# ── Launch local services ──
$backend  = "cd '$backendDir'; uv run fastapi dev app/main.py --host $backendHost --port $backendPort --reload"
$worker   = "cd '$backendDir'; uv run python -m app.tasks.worker"
$frontend = "cd '$frontendDir'; pnpm dev --hostname $frontendHost --port $frontendPort"

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backend  -WindowStyle Normal
Start-Process powershell -ArgumentList "-NoExit", "-Command", $worker   -WindowStyle Normal
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontend -WindowStyle Normal

Write-Host "All 3 services launched in separate terminals:" -ForegroundColor Green
Write-Host "  backend:  http://localhost:$backendPort (reload enabled)" -ForegroundColor Cyan
Write-Host "  worker:   task worker (redis, no reload)" -ForegroundColor Yellow
Write-Host "  frontend: http://localhost:$frontendPort" -ForegroundColor Green
