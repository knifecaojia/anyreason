# 本地开发基础设施（Docker Compose）

此目录用于按 `tech-route-fast-delivery.md` 第 1 步提供“一键启动”的本地基础设施：PostgreSQL + MinIO +（可选）Redis。

## 快速开始

确保本机 Docker Daemon 已启动（Windows 通常为 Docker Desktop 处于运行状态）。

在本目录下执行：

```powershell
Copy-Item .\.env.example .\.env
docker compose up -d
```

启动后：
- Postgres: `localhost:5432`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`

## 启动前后端（登录 + Dashboard）

本项目把“基础设施”和“应用服务”拆成两个 compose 文件，便于按阶段推进：

```powershell
docker compose -f docker-compose.yml -f compose.app.yml --profile app up -d --build
```

启动后：
- 后端 Swagger: `http://localhost:8000/docs`
- 前端: `http://localhost:3000`

## 可选：启用 Redis（用于队列/异步任务）

```powershell
docker compose --profile queue up -d
```

## 不落地 .env 的临时启动方式

如果只是想快速验证 compose 可用，可以直接用 `.env.example` 作为 env_file：

```powershell
$env:ANYREASON_ENV_FILE = '.env.example'
docker compose up -d
```

## 常见问题

### 1) open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified

这通常表示 Docker Desktop 的 Linux Engine 没启动（或 Docker Desktop 未运行），也可能是当前处于 Windows Containers 模式。

排查步骤（在 PowerShell 执行）：

```powershell
docker context ls
docker context use desktop-linux
docker version
```

- 如果 `docker version` 仍然连不上：启动/重启 Docker Desktop（确保启用 WSL2 后端），再重试。
- 如果你只能使用 Windows Containers：本项目的 Postgres/MinIO 镜像需要 Linux Containers，请切换到 Linux 模式。

### 2) failed to fetch anonymous token / auth.docker.io 超时

这表示当前网络无法访问 Docker Hub（常见于公司网络策略、代理未配置、或需要 VPN）。

推荐处理：
- 优先配置 Docker Desktop 的网络代理/镜像加速（公司内网一般会提供 registry mirror）
- 或临时使用 VPN/可访问外网的网络环境

快速诊断脚本：

```powershell
.\diagnose-dockerhub.ps1
```

兜底方案（不依赖拉取 python/node 基础镜像）：

```powershell
docker compose -f docker-compose.yml up -d
```

然后在本机直接运行后端/前端（见项目根目录 README 的“本机运行”）。

## 停止与清理

```powershell
docker compose down
```

清理包含数据卷（会删除 Postgres/MinIO/Redis 数据）：

```powershell
docker compose down -v
```

## 连接信息（应用侧常用）

- Postgres
  - DB: `POSTGRES_DB`
  - Admin 用户: `POSTGRES_USER` / `POSTGRES_PASSWORD`
  - 业务用户: `APP_DB_USER` / `APP_DB_PASSWORD`
- MinIO
  - Root 用户: `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`
  - 默认桶: `MINIO_BUCKET_ASSETS`、`MINIO_BUCKET_EXPORTS`
