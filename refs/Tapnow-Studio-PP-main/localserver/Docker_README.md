# Tapnow Local Server Docker 部署说明

## 适用范围
- 本文档覆盖当前仓库的 Docker 双容器部署：
  - `tapnow`：本地接收器服务（`9527`）
  - `web`：前端静态页面（`8080`）
- `tapnow` 提供 `/ping`、`/status`、`/proxy`、`/file/*` 等接口。
- `web` 容器由 Nginx 托管 `dist` 构建产物。

## 前置条件
- 已安装 Docker / Docker Compose（Compose V2）。

## 快速启动（推荐）
在仓库根目录执行：

```bash
docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f
```

停止服务：

```bash
docker compose down
```

启动后访问：
- 前端页面：`http://127.0.0.1:8080`
- 本地接收器：`http://127.0.0.1:9527`

## 健康检查
- `tapnow` 容器健康检查使用 `http://localhost:9527/ping`。
- `web` 容器健康检查使用 `http://localhost/`。
- 手动检查：

```bash
curl http://127.0.0.1:8080/
curl http://127.0.0.1:9527/ping
curl http://127.0.0.1:9527/status
```

## 数据持久化
- Compose 默认挂载命名卷：`tapnow_data:/app/data`
- 容器启动参数已固定为：

```text
python tapnow-server-full.py -d /app/data
```

因此资源会写入卷中并持久化。

## 可选配置（自定义白名单/代理域名）
若需要自定义 `allowed_roots`、`proxy_allowed_hosts` 等，可挂载配置文件：

```yaml
services:
  tapnow:
    volumes:
      - tapnow_data:/app/data
      - ./localserver/tapnow-local-config.json:/app/localserver/tapnow-local-config.json:ro
```

修改后执行：

```bash
docker compose up -d --build
```

## 常见问题
1. 健康检查失败  
原因：服务未启动完成或端口占用。  
处理：检查 `docker compose logs -f`，确认 `9527` 是否可监听。

2. 宿主机无法访问  
原因：端口映射冲突。  
处理：修改 `docker-compose.yml` 端口映射，例如：
- 本地接收器改为 `19527:9527`
- 前端改为 `18080:80`

3. 文件未持久化  
原因：服务保存目录不在卷路径。  
处理：确保启动参数包含 `-d /app/data`，且卷挂载存在。
