#!/usr/bin/env bash
# ===================================================================
# AnyReason AI Studio - 一键部署脚本
# 用法: chmod +x scripts/deploy.sh && ./scripts/deploy.sh
# ===================================================================
set -euo pipefail

# 脚本所在目录 → 项目根目录 (docker-deploy/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "=========================================="
echo "  AnyReason AI Studio 部署脚本"
echo "=========================================="

# ------------------------------------------------------------------
# 1. 检查 .env 文件
# ------------------------------------------------------------------
if [ ! -f ".env" ]; then
    echo ""
    echo "[提示] 未检测到 .env 文件，正在从 .env.example 复制..."
    cp .env.example .env
    echo "[提示] 已创建 .env 文件，请先编辑其中标记为 <请修改> 的配置项，然后重新运行此脚本。"
    exit 1
fi

echo "[✓] .env 文件已就绪"

# 加载环境变量（用于读取 DOMAIN）
set -a
source .env
set +a

# ------------------------------------------------------------------
# 2. 根据 SSL 证书自动选择 Nginx 配置
# ------------------------------------------------------------------
SSL_CERT_DIR="/etc/letsencrypt/live/${DOMAIN:-localhost}"
NGINX_CONF_SRC=""

if [ -d "$SSL_CERT_DIR" ] && [ -f "$SSL_CERT_DIR/fullchain.pem" ] && [ -f "$SSL_CERT_DIR/privkey.pem" ]; then
    echo "[✓] 检测到 SSL 证书 ($SSL_CERT_DIR)，使用 HTTPS 配置"
    NGINX_CONF_SRC="nginx/anyreason-https.conf"
else
    echo "[!] 未检测到 SSL 证书，使用 HTTP 配置"
    NGINX_CONF_SRC="nginx/anyreason-http.conf"
fi

# 将选中的配置复制为 Nginx 挂载的默认配置
cp "$NGINX_CONF_SRC" nginx/default.conf
echo "[✓] Nginx 配置已设置: $NGINX_CONF_SRC → nginx/default.conf"

# ------------------------------------------------------------------
# 3. 启动所有服务
# ------------------------------------------------------------------
echo ""
echo "[*] 正在构建并启动所有服务..."
docker compose up -d --build

echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo "  查看日志: ./scripts/logs.sh"
echo "  停止服务: ./scripts/stop.sh"
echo "  重启服务: ./scripts/restart.sh"
echo "=========================================="
