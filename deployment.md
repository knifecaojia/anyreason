# Anyreason AI Studio 部署文档 (172.245.56.55)

本文档记录了将 Anyreason AI Studio 部署到远程服务器（172.245.56.55）的详细步骤、遇到的问题及解决方案。

## 1. 部署环境信息

- **服务器 IP**: 172.245.56.55
- **部署路径**: `/root/anyreason`
- **端口规划**:
  - **Nginx (HTTP)**: 80
  - **Nginx (HTTPS)**: 443
  - **Postgres**: 5432 (仅内部访问，不暴露到宿主机，避免与其他服务冲突)
  - **Redis**: 6379 (仅内部访问，不暴露到宿主机)
  - **MinIO**: 9000/9001 (保留暴露)

## 2. 部署步骤

### 2.1 上传部署文件
确保本地 `docker/` 目录下的 `docker-compose.deploy.yml` 和根目录下的 `deploy.sh`, `check_ports.sh` 已上传到服务器。

### 2.2 环境变量配置 (.env)
**关键注意事项**:
1. **移除代理配置**: `.env.example` 中包含的 `HTTP_PROXY`/`HTTPS_PROXY` 会导致 Docker Build 在服务器上失败（连接超时），必须删除或注释掉。
2. **CORS 配置**: 设置 `CORS_ORIGINS=["*"]` 以允许跨域（开发/测试环境）。
3. **数据库密码**: 确保 `POSTGRES_PASSWORD` 与 `APP_DB_PASSWORD` 一致。

### 2.3 执行部署脚本
在服务器 `/root/anyreason` 目录下执行：
```bash
chmod +x deploy.sh
./deploy.sh
```
脚本会自动构建镜像并启动服务。

### 2.4 数据同步 (本地 -> 远程)
在本地 Windows 开发机上执行 PowerShell 脚本，将本地数据库同步到远程：
```powershell
./sync_db.ps1
```
此脚本会使用 `docker exec` 导出本地数据并通过 SSH 管道导入到远程容器。

## 3. 遇到的问题与解决方案 (实战经验)

### 3.1 Docker Build 代理超时
- **现象**: `failed to fetch anonymous token... proxyconnect tcp: dial tcp 10.18.12.24:10809: i/o timeout`
- **原因**: `.env` 文件中包含了不可用的代理配置 (`HTTP_PROXY`)，Docker Compose 会自动将其注入到构建环境。
- **解决**: 从 `.env` 文件中删除所有 `PROXY` 相关的环境变量。

### 3.2 端口冲突 (Dify 共存)
- **现象**: 服务器上已运行 Dify，占用了 80, 443, 5432, 6379 等端口。
- **解决**:
  - 修改 `docker-compose.deploy.yml` 中的 Nginx 端口映射为 `80:80` 和 `443:443`。
  - 移除 Postgres (5432) 和 Redis (6379) 的 `ports` 映射，仅保留 `expose` 或内部网络访问。
  - 这样既避免了冲突，又提高了数据库安全性（不暴露到公网）。

### 3.3 数据库认证失败 (InvalidPasswordError)
- **现象**: `db-init` 服务启动失败，报错 `asyncpg.exceptions.InvalidPasswordError: password authentication failed for user "postgres"`.
- **原因**: TCP 连接认证问题，或者是密码特殊字符处理问题。
- **解决**: 
  - 确保 `.env` 文件无 Windows 换行符 (`\r`)：`sed -i 's/\r$//' .env`。
  - 临时方案：在 `docker-compose.deploy.yml` 的 `postgres` 服务中添加 `POSTGRES_HOST_AUTH_METHOD: trust`（仅限内部网络安全的情况下）。

### 3.4 数据库迁移 SQL 错误
- **现象**: `db-init` 报错 `cannot insert multiple commands into a prepared statement`.
- **原因**: `83ccec4a37bd` 迁移脚本尝试一次性执行包含多条 `INSERT` 语句的 SQL 文件 (`vendor_model_init.sql`)，而 `asyncpg` 驱动在默认模式下不支持多条语句。
- **解决**: 修改迁移脚本 `83ccec4a37bd_add_media_provider_columns.py`，读取 SQL 文件后按分号 `;` 分割语句，并逐条执行。

### 3.5 CORS_ORIGINS 解析错误
- **现象**: Pydantic 报错 `JSONDecodeError`.
- **原因**: `.env` 中的 JSON 字符串在 Shell 传递或 Docker Compose 解析时被错误处理（如引号被剥离）。
- **解决**: 在 `.env` 中使用 `CORS_ORIGINS=["*"]`（无单引号包裹），或在 `docker-compose.deploy.yml` 中移除对该变量的 `environment` 覆盖，直接使用 `env_file` 加载。

## 4. 维护常用命令

- **查看日志**: `docker compose -f docker/docker-compose.deploy.yml logs -f`
- **重启服务**: `docker compose -f docker/docker-compose.deploy.yml restart`
- **更新代码并重新部署**:
  ```bash
  git pull
  ./deploy.sh
  ```
