# AnyReason 远程部署指南

## 概述

本文档描述 AnyReason 项目的远程部署流程，包括镜像构建、数据库同步、服务更新等操作。

## 服务器信息

- **远程服务器 IP**: 101.34.74.166
- **域名**: 101.34.74.166
- **SSH 密钥**: `C:\Users\Administrator\.ssh\id_ed25519`
- **项目目录**: `/root/anyreason`

## 部署架构

```
┌─────────────────────────────────────────────────────────┐
│                    Nginx (80/443)                        │
│                          │                               │
│          ┌───────────────┼───────────────┐              │
│          ▼               ▼               ▼              │
│    Frontend         Backend         Task-Worker         │
│    (Next.js)        (FastAPI)       (FastAPI)           │
│    :3000            :8000            :8000              │
│          │               │               │              │
│          └───────────────┼───────────────┘              │
│                          │                               │
│     ┌────────────────────┼────────────────────┐         │
│     ▼                    ▼                    ▼         │
│  PostgreSQL            Redis               MinIO        │
│  :5432                 :6379             :9000-9001     │
└─────────────────────────────────────────────────────────┘
```

## 部署流程

### 方案一：完整重新部署

适用于重大更新或数据库结构变化。

```bash
# 1. 本地构建验证
cd F:\animate-serial\apps\anyreason\docker-deploy
docker compose build

# 2. 提交代码
git add -A
git commit -m "描述变更内容"
git push

# 3. 远程部署
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 << 'EOF'
  cd /root/anyreason/docker-deploy
  docker compose down
  docker rmi $(docker images -q 'anyreason-*') 2>/dev/null || true
  git pull
  docker compose up -d --build
EOF
```

### 方案二：仅更新应用服务（保留数据库数据）

适用于更新前后端和 Worker，但不希望停止 PostgreSQL/Redis/MinIO 等基础设施容器（保留数据）。

```bash
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 << 'EOF'
  cd /root/anyreason
  git pull
  cd docker-deploy
  # 停止并移除旧容器（不影响数据库）
  docker compose stop frontend backend task-worker
  docker compose rm -f frontend backend task-worker
  # 重新构建并启动
  docker compose build --no-cache frontend backend task-worker
  docker compose up -d frontend backend task-worker
EOF
```

### 方案三：数据库同步部署

适用于本地数据库有更新，需要同步到远程。

```bash
# 1. 导出本地数据库
docker exec anyreason-postgres sh -c "pg_dump -U postgres anyreason --clean --if-exists > /tmp/db_dump.sql"
docker cp anyreason-postgres:/tmp/db_dump.sql F:\animate-serial\apps\anyreason\docker-deploy\init-db\db_dump.sql

# 2. 上传到远程服务器
scp -i C:\Users\Administrator\.ssh\id_ed25519 F:\animate-serial\apps\anyreason\docker-deploy\init-db\db_dump.sql root@101.34.74.166:/tmp/db_dump.sql

# 3. 停止后端服务
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "cd /root/anyreason/docker-deploy && docker compose stop backend task-worker"

# 4. 恢复数据库
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "cat /tmp/db_dump.sql | docker exec -i docker-deploy-postgres-1 psql -U postgres -d anyreason"

# 5. 重启服务
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "cd /root/anyreason/docker-deploy && docker compose start backend task-worker"
```

## 常用命令速查

### 连接远程服务器

```bash
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166
```

### 查看容器状态

```bash
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
```

### 查看服务日志

```bash
# 后端日志
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "docker logs docker-deploy-backend-1 --tail 100"

# 任务工作器日志
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "docker logs docker-deploy-task-worker-1 --tail 100"

# 查看错误日志
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "docker logs docker-deploy-backend-1 --tail 200 2>&1 | grep -i 'error\|exception\|traceback'"
```

### 数据库操作

```bash
# 连接数据库
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "docker exec -it docker-deploy-postgres-1 psql -U postgres -d anyreason"

# 查看所有表
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "docker exec -i docker-deploy-postgres-1 psql -U postgres -d anyreason -c '\dt'"

# 执行 SQL 查询
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "docker exec -i docker-deploy-postgres-1 psql -U postgres -d anyreason -c 'SELECT * FROM users LIMIT 5;'"

### Alembic 数据库迁移

如果代码中有新的迁移文件，需要手动执行更新：

```bash
# 查看当前迁移版本
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "docker exec docker-deploy-backend-1 alembic current"

# 执行迁移到最新版本
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "docker exec docker-deploy-backend-1 alembic upgrade head"

# 查看迁移历史
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "docker exec docker-deploy-backend-1 alembic history"
```

```

### 重启服务

```bash
# 重启所有服务
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "cd /root/anyreason/docker-deploy && docker compose restart"

# 重启单个服务
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "cd /root/anyreason/docker-deploy && docker compose restart backend"
```

## 故障排查

### 1. API 返回 500 错误

**可能原因**：

- 数据库表不存在或结构不匹配
- 迁移文件有问题

**排查步骤**：

```bash
# 1. 查看后端日志
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "docker logs docker-deploy-backend-1 --tail 200 2>&1 | grep -i 'error'"

# 2. 检查数据库表结构
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "docker exec -i docker-deploy-postgres-1 psql -U postgres -d anyreason -c '\dt'"

# 3. 如需要，同步本地数据库到远程（参考方案三）
```

### 2. 任务执行失败

**可能原因**：

- 外部 API 超时
- 配置错误

**排查步骤**：

```bash
# 查看任务工作器日志
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "docker logs docker-deploy-task-worker-1 --tail 300 2>&1 | grep -i 'error\|exception'"
```

### 3. 容器无法启动

**排查步骤**：

```bash
# 查看容器日志
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "docker logs docker-deploy-backend-1"

# 检查容器状态
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "docker ps -a"

# 重新构建
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "cd /root/anyreason/docker-deploy && docker compose up -d --build"
```

### 4. 网络连接问题

```bash
# 测试服务器网络
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "curl -I https://api.openai.com"

# 测试容器内网络
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "docker exec docker-deploy-backend-1 curl -I https://api.openai.com"
```

### 5. 前端构建失败 (pnpm lockfile 错误)

**现象**：`ERR_PNPM_OUTDATED_LOCKFILE`

**解决方法**：
在本地执行 `pnpm install` 更新 `pnpm-lock.yaml`，提交并 push，然后在远程 `git pull` 后重新构建。

> [!TIP]
> 也可以临时修改 `nextjs-frontend/Dockerfile.prod`，将 `pnpm install --frozen-lockfile` 改为 `pnpm install --no-frozen-lockfile`，但建议在本地维护好 lockfile。

### 6. 容器状态显示 (unhealthy)

**现象**：`docker ps` 中显示 `Up XX minutes (unhealthy)`

**原因**：通常是因为 Dockerfile 中的 `HEALTHCHECK` 路径与应用实际路径不匹配（例如后端设置了 `/health` 但应用中没有该路由，或者端口不通）。
**排查**：只要服务日志正常且外部 Nginx 能正常转发，通常不影响业务运行。

## 登录凭据

### 默认管理员账户

- **邮箱**: `admin@example.com`
- **密码**: `12345678`

> [!NOTE]
> 此密码已通过 Playwright 实际登录验证。若远程部署时登录失败，需检查 `.env` 中的 `DEFAULT_ADMIN_PASSWORD` 配置或确认数据库中用户记录存在。

### 环境变量

环境变量配置在 `/root/anyreason/docker-deploy/.env` 文件中。

```bash
# 查看环境变量
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "cat /root/anyreason/docker-deploy/.env | grep -i 'DEFAULT_ADMIN\|API_KEY'"
```

## 已知部署问题与解决方案

### 1. HTTP 环境下 Cookie 认证失败

**现象**：登录后页面跳转成功，但 API 请求返回 `401 Unauthorized`，控制台显示 `POST /api/tasks/ws-ticket 401`

**原因**：Next.js 在 `NODE_ENV=production` 时设置 cookie 的 `secure: true`，导致浏览器在 HTTP 环境下不发送 cookie

**解决方案**：
- 方案 A：配置 HTTPS（推荐，见下方 HTTPS 部署章节）
- 方案 B：临时修改 `nextjs-frontend/components/actions/login-action.ts`：
  ```typescript
  // 将 secure 设置为 false 以支持 HTTP
  const isSecure = false;
  cookieStore.set("accessToken", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,  // 改为 false
    path: "/",
    maxAge: maxAge,
  });
  ```

### 2. 前端构建失败（TypeScript 测试文件错误）

**现象**：`./__tests__/serverApiConfig.test.ts:26:17 TS2540: Cannot assign to 'NODE_ENV' because it is a read-only property`

**原因**：Docker 构建时复制了测试文件，测试代码中包含对 `process.env.NODE_ENV` 的赋值操作

**解决方案**：已在 `Dockerfile.prod` 中添加删除测试文件的步骤：
```dockerfile
RUN rm -rf __tests__
```

### 3. nginx 配置文件冲突

**现象**：`error mounting "/root/anyreason/docker-deploy/nginx/default.conf" to rootfs at "/etc/nginx/conf.d/default.conf": cannot create subdirectories in ...: not a directory`

**原因**：压缩包解压后 `default.conf` 被错误地创建为目录而非文件

**解决方案**：
```bash
cd /root/anyreason/docker-deploy/nginx
rm -rf default.conf
cp anyreason-http.conf default.conf
```

### 4. WebSocket WSS 连接失败

**现象**：控制台显示 `WebSocket connection to 'wss://...' failed`

**原因**：前端尝试使用 WSS 连接，但服务器仅支持 HTTP

**解决方案**：配置 HTTPS 证书（见下方 HTTPS 部署章节）

---

## HTTPS 部署指南

### 生成自签名证书

```bash
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 << 'EOF'
  mkdir -p /root/anyreason/docker-deploy/nginx/ssl
  cd /root/anyreason/docker-deploy/nginx/ssl
  
  # 生成私钥
  openssl genrsa -out server.key 2048
  
  # 生成证书签名请求
  openssl req -new -key server.key -out server.csr -subj "/C=CN/ST=State/L=City/O=Organization/CN=101.34.74.166"
  
  # 生成自签名证书（有效期 365 天）
  openssl x509 -req -days 365 -in server.csr -signkey server.key -out server.crt
  
  echo "证书生成完成："
  ls -la /root/anyreason/docker-deploy/nginx/ssl/
EOF
```

### nginx HTTPS 配置

创建 `/root/anyreason/docker-deploy/nginx/default.conf`：

```nginx
server {
    listen 80;
    server_name _;
    
    # HTTP 强制跳转 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name _;
    
    # SSL 证书配置
    ssl_certificate /etc/nginx/ssl/server.crt;
    ssl_certificate_key /etc/nginx/ssl/server.key;
    
    # SSL 优化配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # 其他配置保持不变...
    # （参考 anyreason-https.conf 的 location 配置）
}
```

### 更新 docker-compose.yml

确保 nginx 服务挂载 SSL 证书：

```yaml
nginx:
  volumes:
    - ./nginx/default.conf:/etc/nginx/conf.d/default.conf
    - ./nginx/ssl:/etc/nginx/ssl:ro
  ports:
    - "80:80"
    - "443:443"
```

### 重启服务

```bash
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 << 'EOF'
  cd /root/anyreason/docker-deploy
  docker compose restart nginx
EOF
```

---

## 注意事项

1. **数据库迁移问题**：如果遇到迁移错误，建议使用数据库同步方式（方案三）替代 Alembic 迁移
2. **镜像清理**：定期清理旧镜像释放磁盘空间

   ```bash
   docker system prune -a
   ```
3. **数据备份**：重要操作前先备份数据库

   ```bash
   ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@101.34.74.166 "docker exec docker-deploy-postgres-1 pg_dump -U postgres anyreason > /tmp/backup_$(date +%Y%m%d).sql"
   ```
4. **代码同步**：确保本地代码已 push 后再在远程 pull
5. **首次部署检查清单**：
   - [ ] `.env` 文件中 `DEFAULT_ADMIN_PASSWORD` 已设置为强密码
   - [ ] nginx `default.conf` 是文件而非目录
   - [ ] SSL 证书已生成（HTTPS 部署）
   - [ ] cookie secure 设置与协议匹配（HTTP/HTTPS）

---

## 本次排障经验总结（2026-03）

### 1. Mixed Content 不一定是前端直接写死了 HTTP

本次现象：

- 页面是 `https://101.34.74.166/dashboard`
- 浏览器报错请求了 `http://101.34.74.166/api/v1/tasks/...`
- 但前端实际发起的是相对路径 `/api/tasks?...`

最终根因是 **服务端重定向链**，而不是浏览器端 fetch 代码直接写死了 HTTP。

### 2. nginx 不能把 `/api/*` 一律 rewrite 到后端 `/api/v1/*`

错误配置思路：

```nginx
location /api/ {
    rewrite ^/api/(?!v1/)(.*)$ /api/v1/$1 break;
    proxy_pass http://backend:8000;
}
```

这个配置会把 Next.js 自己的 API 路由（例如 `/api/tasks`、`/api/tasks/ws-ticket`）绕过前端，直接送去后端。

正确做法：

- `/api/v1/*`：直连 backend
- `/api/*`：转发给 frontend，让 Next.js route handler 处理

即：

```nginx
location /api/v1/ {
    proxy_pass http://backend:8000;
}

location /api/ {
    proxy_pass http://frontend:3000;
}
```

### 3. `/api/tasks` 的 307 是第二层问题

在修完 nginx 之前，线上 `https://.../api/tasks?...` 会返回：

```http
307 Temporary Redirect
Location: http://101.34.74.166/api/v1/tasks/?...
```

继续追查后发现：

- backend 的 `/api/v1/tasks` 会因为缺少末尾斜杠，先 307 到 `/api/v1/tasks/`
- 这个 307 Location 在当前部署链下变成了 `http://...`
- 浏览器因此触发 Mixed Content

因此本地和远端都应把代理路由写成：

```ts
new URL("/api/v1/tasks/", getApiBaseUrl())
```

而不是：

```ts
new URL("/api/v1/tasks", getApiBaseUrl())
```

### 4. 必须验证“运行中的 nginx 容器配置”，不能只看宿主机文件

本次还有一个坑：

- 宿主机 `/root/anyreason/docker-deploy/nginx/default.conf` 已经是新配置
- 但 `docker exec docker-deploy-nginx-1 cat /etc/nginx/conf.d/default.conf` 仍然是旧配置

说明：**不能只改宿主机文件并假设容器已经生效**。

必须执行以下验证：

```bash
docker exec docker-deploy-nginx-1 cat /etc/nginx/conf.d/default.conf
docker exec docker-deploy-nginx-1 nginx -T
curl -k -I "https://<host>/api/tasks?page=1&size=50&status=queued,running"
```

只有当 `/api/tasks` 不再返回：

```http
Location: http://<host>/api/v1/tasks/...
```

才算真正修复。

### 5. 浏览器端 WebSocket 正常，不代表任务 HTTP 链路也正常

本次排障中：

- `wss://101.34.74.166/ws/tasks?...` 已经能连通
- 但 `refreshTasks()` 仍然失败

所以要把两条链路分开验证：

- WebSocket：`/ws/tasks`
- 任务列表 HTTP：`/api/tasks`

不能因为 WebSocket 正常就认为任务中心也正常。

### 6. batch-video 提示词不显示时，先查数据，再怀疑展示逻辑

本次验证结果：

- 后端 schema 和 preview 组装逻辑已经包含 `prompt`
- 但数据库中 `tasks.input_json.prompt` 实际是空字符串 `""`

这说明“页面不显示提示词”不一定是前后端展示 bug，也可能是**创建任务时根本没有把 prompt 保存进去**。

排查顺序应为：

1. 查后端 schema 是否包含 `prompt`
2. 查 preview API 是否从 `task.input_json` 提取 `prompt`
3. 查数据库里 `tasks.input_json.prompt` 是否真的有值
4. 如果值为空，再继续追前端提交 / 后端入库链路

### 7. 容器重启不等于代码更新（镜像构建 vs 文件挂载）

**现象**：
- 本地修改了 `canvases.py` 或 `proxy.ts` 后，在宿主机上重启容器
- 远程服务仍然报旧错误，例如 `/studio` 仍然跳转到登录页，`/api/canvases` 仍然 500

**根因**：
Docker 镜像是一次性打包的。修改宿主机文件再重启容器，**不会更新容器内已经打包好的代码**。除非使用 volume 挂载（本地开发模式），否则必须重新 `docker compose build` 重建镜像。

**正确流程**：
```bash
# 必须重新构建镜像
cd /root/anyreason/docker-deploy
docker compose build backend
docker compose up -d backend
```

### 8. 紧急修复：向运行中的容器注入文件

**适用场景**：
- 远程 `docker build` 因网络问题（如 uv installer 下载 `unexpected EOF`）失败
- 需要临时恢复服务，不能等待构建修复

**操作步骤**（以修复 `canvases.py` 为例）：

```bash
# 1. 在本地准备好修复后的文件
# 2. 复制到容器内
docker cp canvases.py <container_name>:/app/app/routers/canvases.py

# 3. 重启容器让代码生效
docker compose restart backend
```

**验证修复**：
```bash
# 确认容器内文件已更新
docker exec <container_name> sed -n '20,30p' /app/app/routers/canvases.py
```

> [!WARNING]
> 这是临时应急手段，不等于正确部署。事后仍需修复构建问题并重新构建镜像。

### 9. `/studio` 认证失败的排查方法

**现象**：
- 登录成功后访问 `/studio` 被重定向到 `/login?next=%2Fstudio`
- 页面不报错，但用户被踢回登录页

**诊断工具：Playwright**

使用 Playwright 模拟完整登录流程：

```python
async def test_studio_access():
    await page.goto("http://101.34.74.166/login")
    await page.fill('input[name="email"]', "admin@example.com")
    await page.fill('input[name="password"]', "12345678")
    await page.click('button[type="submit"]')
    await page.wait_for_url("**/dashboard")
    
    # 进入 studio
    await page.goto("http://101.34.74.166/studio")
    
    # 检查是否留在 studio 或被踢回 login
    print(page.url)  # 如果是 /studio 则正常，如果是 /login 说明认证失败
```

**常见根因：middleware 中 SDK 调用在 Server Runtime 不稳定**

`nextjs-frontend/proxy.ts` 中若使用 SDK（如 `usersCurrentUser()`），在 Next.js Server Runtime 中可能表现不稳定。

**解决方案**：将 middleware 中的认证检查改为直接 `fetch` 后端 API：

```typescript
// 不推荐（SDK 在 server runtime 可能不稳定）
const session = await usersCurrentUser();

// 推荐（直接 fetch 更可靠）
const res = await fetch(`${process.env.BACKEND_URL}/api/v1/users/me`, {
    headers: { cookie: request.headers.get('cookie') ?? '' }
});
if (!res.ok) return NextResponse.redirect(new URL('/login', request.url));
```

### 10. Canvas 创建 500 根因：数据库 NOT NULL 约束冲突

**现象**：
- 前端点击"创建 Canvas"返回 500
- 后端日志显示：`null value in column "status" of relation "canvases" violates not-null constraint`

**根因**：
远程后端容器中的 `canvases.py` 代码版本较旧，创建 canvas 时没有设置 `status="draft"`，导致写入数据库时该字段为 NULL，触发 PostgreSQL 的 NOT NULL 约束。

**修复方法**：
1. 确认本地 `canvases.py` 中创建逻辑包含 `status="draft"`
2. 重新构建后端镜像并部署
3. 或使用前述文件注入方法临时修复

### 11. 验证容器代码与宿主机文件是否一致

**场景**：
- Dockerfile 构建因网络问题失败或下载了错误版本
- 容器可能运行的是旧镜像，但 `docker ps` 显示 "running"

**排查步骤**：

```bash
# 1. 检查宿主机文件（可能已更新）
cat /root/anyreason/fastapi_backend/app/routers/canvases.py | grep -A5 "def create_canvas"

# 2. 检查容器内文件（实际运行的代码）
docker exec docker-deploy-backend-1 sed -n '50,60p' /app/app/routers/canvases.py

# 3. 如果不一致，说明容器没有使用新镜像
docker images | grep anyreason
docker compose ps
```

### 12. 网络问题导致 Dockerfile 构建失败的连锁反应

**现象**：
- `docker compose build` 失败，错误信息包含 `unexpected EOF` 或 `curl: (56) Recv failure`
- 常见于下载 uv installer 或其他远程资源时网络中断

**后果**：
- 构建失败后，现有容器继续运行旧版本镜像
- `docker ps` 显示服务 "running"，但代码仍是旧的

**预防措施**：
- 提前准备好 uv 等工具的离线包
- 使用国内镜像源（如果适用）
- 构建前检查网络连通性
