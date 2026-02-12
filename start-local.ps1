$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = "F:\animate-serial\apps\anyreason"
$backendDir = Join-Path $repoRoot "fastapi_backend"
$frontendDir = Join-Path $repoRoot "nextjs-frontend"

$backendHost = "0.0.0.0"
$backendPort = "8000"
$frontendHost = "0.0.0.0"
$frontendPort = "3000"

Start-Process -WorkingDirectory $backendDir -FilePath "uv" -ArgumentList @("run","fastapi","dev","app/main.py","--host",$backendHost,"--port",$backendPort,"--reload") | Out-Null
Start-Process -WorkingDirectory $backendDir -FilePath "uv" -ArgumentList @("run","python","watcher.py") | Out-Null
Start-Process -WorkingDirectory $backendDir -FilePath "uv" -ArgumentList @("run","python","-m","app.tasks.worker","--reload") | Out-Null
Start-Process -WorkingDirectory $frontendDir -FilePath "pnpm" -ArgumentList @("dev","--hostname",$frontendHost,"--port",$frontendPort) | Out-Null

Write-Output "backend:  http://localhost:$backendPort"
Write-Output "frontend: http://localhost:$frontendPort"
Write-Output "minio:    http://localhost:9001"
Write-Output "litellm:  http://localhost:4000"
