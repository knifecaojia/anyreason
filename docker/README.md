# 本地开发基础设施（Docker Compose）

此目录用于按 `tech-route-fast-delivery.md` 第 1 步提供"一键启动"的本地基础设施：PostgreSQL + MinIO +（可选）Redis。

> **对象存储双后端支持**：本项目支持 MinIO（本地开发，默认）和腾讯云 COS（生产部署）。通过环境变量 `OBJECT_STORAGE_PROVIDER` 切换，默认值为 `minio`。详见下方"对象存储提供商配置"章节。

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

本项目把"基础设施"和"应用服务"拆成两个 compose 文件，便于按阶段推进：

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

## 对象存储提供商配置

本项目的对象存储后端可通过 `OBJECT_STORAGE_PROVIDER` 环境变量切换：

| 值 | 说明 | 适用场景 |
|---|---|---|
| `minio` | S3 兼容对象存储（默认） | 本地开发 |
| `cos` | 腾讯云 COS | 生产部署 |

### MinIO（默认，本地开发）

默认使用 Docker Compose 内置的 MinIO 容器，无需额外配置。相关环境变量：

- `MINIO_ENDPOINT` — MinIO API 地址
- `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` — 访问凭证
- `MINIO_BUCKET_ASSETS`、`MINIO_BUCKET_EXPORTS`、`MINIO_BUCKET_SCRIPTS` — 存储桶名称

### 腾讯云 COS

切换到 COS 时，在 `.env` 中设置：

```env
OBJECT_STORAGE_PROVIDER=cos
COS_SECRET_ID=your-secret-id
COS_SECRET_KEY=your-secret-key
COS_REGION=ap-shanghai
COS_BUCKET=your-bucket-appid
COS_DOMAIN=https://your-bucket-appid.cos.ap-shanghai.myqcloud.com
```

> **注意**：使用 COS 时，MinIO 容器可以不启动（compose 文件中的 MinIO 服务仅在 `OBJECT_STORAGE_PROVIDER=minio` 时需要）。

## 上线指导（Rollout Guidance）

### 启用 COS

1. 在腾讯云控制台手动创建存储桶（Bucket），记下完整桶名（含 APPID，如 `my-app-125xxxxxxx`）、地域（如 `ap-shanghai`）。
2. 在 `.env` 或运行时配置中设置：

```env
OBJECT_STORAGE_PROVIDER=cos
COS_SECRET_ID=<your-secret-id>
COS_SECRET_KEY=<your-secret-key>
COS_REGION=<your-region>
COS_BUCKET=<your-bucket-appid>
COS_DOMAIN=https://<your-bucket-appid>.cos.<your-region>.myqcloud.com
```

3. 重启后端服务即可。**无需数据库变更，无需数据迁移。**

> **安全提醒**：`COS_SECRET_ID` 和 `COS_SECRET_KEY` 仅允许出现在私有运行时配置（`.env`、密钥管理服务、CI secrets）中，**绝不可**写入代码仓库、文档或示例文件。

### 回退到 MinIO

将 `OBJECT_STORAGE_PROVIDER` 设回 `minio`（或删除该变量，默认值即为 `minio`），重启服务即可：

```env
OBJECT_STORAGE_PROVIDER=minio
```

回退后，新的上传/读取操作走 MinIO。**已写入 COS 的对象不会自动迁移回 MinIO**，需要手动处理。

### Phase 1 不包含的功能（Non-Goals）

以下能力**不在本次实现范围内**，请勿依赖：

- **数据库字段重命名**：`minio_bucket`、`minio_key` 等 DB 字段名称保持不变（即使 COS 也在使用这些字段存储路径）。
- **历史数据迁移**：不会自动将已有 MinIO 对象迁移到 COS，或反向迁移。新对象走当前选择的 provider，旧对象留在原处。
- **双写（Dual-Write）**：不支持同时向两个 provider 写入同一对象。
- **CDN 加速、生命周期策略、多地域复制、后台同步**：这些属于 COS 平台级特性，本项目未集成。
- **自动创建 COS 存储桶**：COS 桶必须在腾讯云控制台预先创建，后端不会自动创建。

## 已知限制（Known Limitations）

- **`minio_*` 字段命名**：数据库中的 `minio_bucket`、`minio_key` 等字段同时存储 COS 路径。这是 Phase 1 的已知技术债务，不影响功能。
- **URL 格式差异**：
  - MinIO：`http://host:port/bucket/key`
  - COS：`https://bucket.cos.region.myqcloud.com/key`
  - 切换 provider 后，新生成的 URL 格式会随之变化，已存储的旧 URL 格式不变。
- **`download_by_url` 仅限同 provider**：通过 URL 下载对象时，只匹配当前 provider 的 URL 模式。MinIO 实例无法下载 COS URL，反之亦然。

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

然后在本机直接运行后端/前端（见项目根目录 README 的"本机运行"）。

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
- MinIO（`OBJECT_STORAGE_PROVIDER=minio` 时使用）
  - Root 用户: `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`
  - 默认桶: `MINIO_BUCKET_ASSETS`、`MINIO_BUCKET_EXPORTS`
- 腾讯云 COS（`OBJECT_STORAGE_PROVIDER=cos` 时使用）
  - 凭证: `COS_SECRET_ID` / `COS_SECRET_KEY`
  - 存储桶: `COS_BUCKET`（格式: `{name}-{appid}`）
  - 访问域名: `COS_DOMAIN`（可选，用于生成公开 URL）
