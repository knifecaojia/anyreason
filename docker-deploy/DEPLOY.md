# AnyReason AI Studio 部署指南

## 前置条件

服务器需要安装：

- Git
- Docker Engine ≥ 24.0
- Docker Compose V2（`docker compose` 命令）

确认安装：

```bash
git --version
docker --version
docker compose version
```

---

## 第一步：本地推送代码到 GitHub

在本地开发机上：

```bash
git add -A
git commit -m "feat: docker-deploy production setup"
git push origin main
```

---

## 第二步：服务器拉取代码

SSH 登录到服务器后：

```bash
cd /opt  # 或你喜欢的部署目录
git clone git@github.com:<你的用户名>/<你的仓库名>.git anyreason
cd anyreason
```

> 如果是私有仓库，需要先在服务器上配置 SSH Key 或使用 HTTPS + Personal Access Token。

---

## 第三步：配置环境变量

```bash
cd docker-deploy
cp .env.example .env
```

编辑 `.env`，把所有 `<请修改>` 替换为实际值：

```bash
vi .env  # 或 nano .env
```

必须修改的项：

| 变量 | 说明 | 示例 |
|------|------|------|
| `POSTGRES_PASSWORD` | PostgreSQL 超级用户密码 | `MyPg@2026!` |
| `APP_DB_PASSWORD` | 应用数据库用户密码 | `AppDb@2026!` |
| `MINIO_ROOT_PASSWORD` | MinIO 管理员密码 | `Minio@2026!` |
| `REDIS_PASSWORD` | Redis 密码 | `Redis@2026!` |
| `ACCESS_SECRET_KEY` | JWT 访问令牌密钥 | 用 `openssl rand -hex 32` 生成 |
| `RESET_PASSWORD_SECRET_KEY` | 重置密码令牌密钥 | 用 `openssl rand -hex 32` 生成 |
| `VERIFICATION_SECRET_KEY` | 邮箱验证令牌密钥 | 用 `openssl rand -hex 32` 生成 |
| `DEFAULT_ADMIN_PASSWORD` | 管理员登录密码 | `Admin@2026!` |
| `DOMAIN` | 你的域名 | `ai.example.com` |
| `CORS_ORIGINS` | 允许的跨域来源 | `["https://ai.example.com"]` |
| `FRONTEND_URL` | 前端访问地址 | `https://ai.example.com` |
| `DEFAULT_ADMIN_EMAIL` | 管理员邮箱 | `admin@example.com` |

快速生成三个密钥：

```bash
echo "ACCESS_SECRET_KEY=$(openssl rand -hex 32)"
echo "RESET_PASSWORD_SECRET_KEY=$(openssl rand -hex 32)"
echo "VERIFICATION_SECRET_KEY=$(openssl rand -hex 32)"
```

---

## 第四步：（可选）配置 SSL 证书

如果需要 HTTPS，先安装 certbot 并申请证书：

```bash
# Ubuntu/Debian
sudo apt install -y certbot

# 申请证书（需要先将域名 DNS 解析到服务器 IP）
sudo certbot certonly --standalone -d ai.example.com
```

证书会保存在 `/etc/letsencrypt/live/ai.example.com/`。

部署脚本会自动检测证书是否存在：
- 有证书 → 使用 HTTPS 配置（含 HTTP→HTTPS 重定向）
- 无证书 → 使用 HTTP 配置

---

## 第五步：执行部署

```bash
chmod +x scripts/*.sh
./scripts/deploy.sh
```

首次部署会构建镜像，大约需要 5-10 分钟。部署脚本会自动完成：

1. 检查 `.env` 文件
2. 根据 SSL 证书选择 HTTP/HTTPS Nginx 配置
3. 构建后端和前端 Docker 镜像
4. 启动所有服务（PostgreSQL → Redis → MinIO → 数据库初始化 → 后端 → Worker → 前端 → Nginx）

---

## 第六步：验证部署

```bash
# 查看所有容器状态
docker compose ps

# 查看日志（确认无报错）
./scripts/logs.sh

# 单独查看某个服务的日志
./scripts/logs.sh backend
./scripts/logs.sh db-init
```

所有容器状态应为 `running`（db-init 和 minio-init 完成后会退出，状态为 `exited (0)`）。

访问：
- HTTP: `http://你的域名`
- HTTPS: `https://你的域名`（如果配置了 SSL）
- MinIO 控制台: `http://你的服务器IP:9001`

用 `.env` 中配置的管理员邮箱和密码登录。

---

## 日常运维

```bash
cd /opt/anyreason/docker-deploy

# 查看日志
./scripts/logs.sh              # 所有服务
./scripts/logs.sh backend -f   # 跟踪后端日志

# 重启服务
./scripts/restart.sh           # 重启全部
./scripts/restart.sh backend   # 重启单个服务

# 停止所有服务
./scripts/stop.sh

# 重新部署（拉取最新代码后）
cd /opt/anyreason
git pull origin main
cd docker-deploy
./scripts/deploy.sh
```

---

## 更新部署

当有代码更新时：

```bash
cd /opt/anyreason
git pull origin main
cd docker-deploy
./scripts/deploy.sh
```

`deploy.sh` 会自动重新构建有变更的镜像并重启服务。

---

## 故障排查

| 问题 | 排查方法 |
|------|----------|
| 容器启动失败 | `./scripts/logs.sh <服务名>` 查看日志 |
| 数据库连接失败 | `docker compose ps postgres` 确认健康状态 |
| 前端白屏 | `./scripts/logs.sh frontend` 检查构建是否成功 |
| 502 Bad Gateway | `./scripts/logs.sh nginx` + `./scripts/logs.sh backend` |
| MinIO 存储桶未创建 | `./scripts/logs.sh minio-init` 查看初始化日志 |
