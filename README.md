# anyreason（言之有理）开发基线

这是一个“AI 漫剧创作管理平台”的代码基线仓库：先把 **前后端骨架、鉴权、类型契约、统一运行方式** 搭起来，再逐步接入 RBAC、Provider/模型管理、资产管理、画布与分镜、导出闭环。

当前基线已具备：
- 前端：Next.js + shadcn/ui + Tailwind（含登录页与 Dashboard 占位页）
- 后端：FastAPI（含账号体系/鉴权基础能力）
- 契约：通过 OpenAPI 生成前端 typed client（`nextjs-frontend/app/openapi-client`）
- 本地基础设施：Postgres + MinIO +（可选）Redis（见 `docker/`）

## 一键启动（推荐）

前置：Docker Desktop（或任意 Docker Daemon）已启动。

```powershell
cd .\docker
Copy-Item .\.env.example .\.env
docker compose -f docker-compose.yml -f compose.app.yml --profile app up -d --build
```

- 后端 Swagger：`http://localhost:8000/docs`
- 前端：`http://localhost:3000`

## 本机运行（不使用应用容器）

你仍然可以只用 Docker 跑依赖（Postgres/MinIO/Redis），应用跑在本机：

```powershell
cd .\docker
Copy-Item .\.env.example .\.env
docker compose up -d
```

如果你所在网络无法访问 Docker Hub（例如出现 `failed to fetch anonymous token`），建议优先采用本机运行方式，只让 Docker 承担基础设施服务。

### 后端

```powershell
cd .\fastapi_backend
Copy-Item .\.env.example .\.env
uv python install 3.12
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

- 如果希望本地开箱即用一个可登录账号，可在 `fastapi_backend/.env` 里开启 `CREATE_DEFAULT_ADMIN=true`，并设置 `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD`。

### 前端

```powershell
cd .\nextjs-frontend
Copy-Item .\.env.example .\.env
Copy-Item .\.env.local.example .\.env.local
pnpm install
pnpm dev
```

可选：快速验证后端登录（从前端侧发起请求）：

```powershell
cd .\nextjs-frontend
node .\scripts\verify-login.mjs
```

## OpenAPI → 前端客户端生成

后端生成 OpenAPI 文件：

```powershell
cd .\fastapi_backend
uv run python -m commands.generate_openapi_schema
```

可选：验证默认管理员账号（需要已启动 Postgres/后端可连接数据库）：

```powershell
cd .\fastapi_backend
uv run python -m commands.verify_default_admin
```

前端生成 typed client：

```powershell
cd .\nextjs-frontend
pnpm generate-client
```
