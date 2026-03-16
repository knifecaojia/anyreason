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
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 << 'EOF'
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
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 << 'EOF'
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
scp -i C:\Users\Administrator\.ssh\id_ed25519 F:\animate-serial\apps\anyreason\docker-deploy\init-db\db_dump.sql root@172.245.56.55:/tmp/db_dump.sql

# 3. 停止后端服务
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "cd /root/anyreason/docker-deploy && docker compose stop backend task-worker"

# 4. 恢复数据库
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "cat /tmp/db_dump.sql | docker exec -i docker-deploy-postgres-1 psql -U postgres -d anyreason"

# 5. 重启服务
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "cd /root/anyreason/docker-deploy && docker compose start backend task-worker"
```

## 常用命令速查

### 连接远程服务器

```bash
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55
```

### 查看容器状态

```bash
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
```

### 查看服务日志

```bash
# 后端日志
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "docker logs docker-deploy-backend-1 --tail 100"

# 任务工作器日志
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "docker logs docker-deploy-task-worker-1 --tail 100"

# 查看错误日志
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "docker logs docker-deploy-backend-1 --tail 200 2>&1 | grep -i 'error\|exception\|traceback'"
```

### 数据库操作

```bash
# 连接数据库
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "docker exec -it docker-deploy-postgres-1 psql -U postgres -d anyreason"

# 查看所有表
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "docker exec -i docker-deploy-postgres-1 psql -U postgres -d anyreason -c '\dt'"

# 执行 SQL 查询
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "docker exec -i docker-deploy-postgres-1 psql -U postgres -d anyreason -c 'SELECT * FROM users LIMIT 5;'"

### Alembic 数据库迁移

如果代码中有新的迁移文件，需要手动执行更新：

```bash
# 查看当前迁移版本
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "docker exec docker-deploy-backend-1 alembic current"

# 执行迁移到最新版本
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "docker exec docker-deploy-backend-1 alembic upgrade head"

# 查看迁移历史
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "docker exec docker-deploy-backend-1 alembic history"
```

```

### 重启服务

```bash
# 重启所有服务
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "cd /root/anyreason/docker-deploy && docker compose restart"

# 重启单个服务
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "cd /root/anyreason/docker-deploy && docker compose restart backend"
```

## 故障排查

### 1. API 返回 500 错误

**可能原因**：

- 数据库表不存在或结构不匹配
- 迁移文件有问题

**排查步骤**：

```bash
# 1. 查看后端日志
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "docker logs docker-deploy-backend-1 --tail 200 2>&1 | grep -i 'error'"

# 2. 检查数据库表结构
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "docker exec -i docker-deploy-postgres-1 psql -U postgres -d anyreason -c '\dt'"

# 3. 如需要，同步本地数据库到远程（参考方案三）
```

### 2. 任务执行失败

**可能原因**：

- 外部 API 超时
- 配置错误

**排查步骤**：

```bash
# 查看任务工作器日志
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "docker logs docker-deploy-task-worker-1 --tail 300 2>&1 | grep -i 'error\|exception'"
```

### 3. 容器无法启动

**排查步骤**：

```bash
# 查看容器日志
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "docker logs docker-deploy-backend-1"

# 检查容器状态
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "docker ps -a"

# 重新构建
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "cd /root/anyreason/docker-deploy && docker compose up -d --build"
```

### 4. 网络连接问题

```bash
# 测试服务器网络
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "curl -I https://api.openai.com"

# 测试容器内网络
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "docker exec docker-deploy-backend-1 curl -I https://api.openai.com"
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
- **密码**: `1235anyreason1235`

### 环境变量

环境变量配置在 `/root/anyreason/docker-deploy/.env` 文件中。

```bash
# 查看环境变量
ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "cat /root/anyreason/docker-deploy/.env | grep -i 'DEFAULT_ADMIN\|API_KEY'"
```

## 注意事项

1. **数据库迁移问题**：如果遇到迁移错误，建议使用数据库同步方式（方案三）替代 Alembic 迁移
2. **镜像清理**：定期清理旧镜像释放磁盘空间

   ```bash
   docker system prune -a
   ```
3. **数据备份**：重要操作前先备份数据库

   ```bash
   ssh -i C:\Users\Administrator\.ssh\id_ed25519 root@172.245.56.55 "docker exec docker-deploy-postgres-1 pg_dump -U postgres anyreason > /tmp/backup_$(date +%Y%m%d).sql"
   ```
4. **代码同步**：确保本地代码已 push 后再在远程 pull
