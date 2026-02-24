$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = "F:\animate-serial\apps\anyreason"
$backendDir = Join-Path $repoRoot "fastapi_backend"
$frontendDir = Join-Path $repoRoot "nextjs-frontend"

$backendHost = "0.0.0.0"
$backendPort = "8100"
$frontendHost = "0.0.0.0"
$frontendPort = "3000"

# 终止已运行的进程
function Stop-ExistingProcesses {
    Write-Output "检查并终止已运行的进程..."
    
    # 终止占用 8000 端口的进程（后端）
    $backend = Get-NetTCPConnection -LocalPort $backendPort -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    if ($backend) {
        $backend | ForEach-Object {
            Write-Output "  终止后端进程 PID: $_"
            Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        }
    }
    
    # 终止占用 3000 端口的进程（前端）
    $frontend = Get-NetTCPConnection -LocalPort $frontendPort -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    if ($frontend) {
        $frontend | ForEach-Object {
            Write-Output "  终止前端进程 PID: $_"
            Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        }
    }
    
    # 终止 worker 进程（通过命令行匹配）
    Get-Process -Name "python" -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*app.tasks.worker*"
    } | ForEach-Object {
        Write-Output "  终止 Worker 进程 PID: $($_.Id)"
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    
    # 终止 watcher 进程
    Get-Process -Name "python" -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*watcher.py*"
    } | ForEach-Object {
        Write-Output "  终止 Watcher 进程 PID: $($_.Id)"
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    
    # 等待端口释放
    Start-Sleep -Milliseconds 500
    Write-Output "已清理旧进程"
}

# 先终止已有进程
Stop-ExistingProcesses

Write-Output ""
Write-Output "启动服务..."

Start-Process -WorkingDirectory $backendDir -FilePath "uv" -ArgumentList @("run","fastapi","dev","app/main.py","--host",$backendHost,"--port",$backendPort,"--reload") | Out-Null
Start-Process -WorkingDirectory $backendDir -FilePath "uv" -ArgumentList @("run","python","watcher.py") | Out-Null
Start-Process -WorkingDirectory $backendDir -FilePath "uv" -ArgumentList @("run","python","-m","app.tasks.worker","--reload") | Out-Null
Start-Process -WorkingDirectory $frontendDir -FilePath "pnpm" -ArgumentList @("dev","--hostname",$frontendHost,"--port",$frontendPort) | Out-Null

Write-Output ""
Write-Output "backend:  http://localhost:$backendPort"
Write-Output "frontend: http://localhost:$frontendPort"
Write-Output "minio:    http://localhost:9001"
Write-Output "litellm:  http://localhost:4000"
