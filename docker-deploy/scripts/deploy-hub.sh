#!/usr/bin/env bash
# ===================================================================
# AnyReason AI Studio - Docker Hub 拉取部署脚本
# 无需本地构建，直接从 Docker Hub 拉取预构建镜像
# 用法: chmod +x scripts/deploy-hub.sh && ./scripts/deploy-hub.sh
# ===================================================================
set -euo pipefail

# 脚本所在目录 → 项目根目录 (docker-deploy/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "=========================================="
echo "  AnyReason AI Studio 部署脚本（Hub 拉取模式）"
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
# 2. 根据 SSL 证书自动选择 Nginx 配置（CDN 模式强制 HTTP）
# ------------------------------------------------------------------
NGINX_CONF_SRC=""

if [ "${USE_CDN:-false}" = "true" ]; then
    # CDN 模式：检查是否有本地 SSL 证书（如 Cloudflare Origin Certificate）
    if [ -f "ssl/origin.pem" ] && [ -f "ssl/origin-key.pem" ]; then
        echo "[✓] CDN 模式 + Origin Certificate：使用 HTTPS 配置（Cloudflare Full Strict）"
        NGINX_CONF_SRC="nginx/anyreason-https.conf"
    else
        echo "[✓] CDN 模式（Flexible）：SSL 由 CDN 终止，nginx 使用 HTTP 配置"
        NGINX_CONF_SRC="nginx/anyreason-http.conf"
    fi
else
    SSL_CERT_DIR="/etc/letsencrypt/live/${DOMAIN:-localhost}"
    if [ -d "$SSL_CERT_DIR" ] && [ -f "$SSL_CERT_DIR/fullchain.pem" ] && [ -f "$SSL_CERT_DIR/privkey.pem" ]; then
        echo "[✓] 检测到 SSL 证书 ($SSL_CERT_DIR)，使用 HTTPS 配置"
        NGINX_CONF_SRC="nginx/anyreason-https.conf"
    else
        echo "[!] 未检测到 SSL 证书，使用 HTTP 配置"
        NGINX_CONF_SRC="nginx/anyreason-http.conf"
    fi
fi

cp "$NGINX_CONF_SRC" nginx/default.conf
# HTTPS 配置中包含 ${NGINX_DOMAIN} 占位符，需要替换为实际域名
if [ "$NGINX_CONF_SRC" = "nginx/anyreason-https.conf" ]; then
    export NGINX_DOMAIN="${DOMAIN:-localhost}"
    envsubst '${NGINX_DOMAIN}' < "$NGINX_CONF_SRC" > nginx/default.conf
fi
echo "[✓] Nginx 配置已设置: $NGINX_CONF_SRC → nginx/default.conf"

# ------------------------------------------------------------------
# 3. 拉取最新镜像并启动
# ------------------------------------------------------------------
echo ""
echo "[*] 正在拉取最新镜像..."
docker compose -f docker-compose.hub.yml pull

echo ""
echo "[*] 正在启动所有服务..."
docker compose -f docker-compose.hub.yml up -d

echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo "  查看日志: docker compose -f docker-compose.hub.yml logs"
echo "  停止服务: docker compose -f docker-compose.hub.yml down"
echo "  重启服务: docker compose -f docker-compose.hub.yml restart"
echo "=========================================="
