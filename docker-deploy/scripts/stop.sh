#!/usr/bin/env bash
# ===================================================================
# AnyReason AI Studio - 停止服务脚本
# 用法: ./scripts/stop.sh
# ===================================================================
set -euo pipefail

# 脚本所在目录 → 项目根目录 (docker-deploy/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "=========================================="
echo "  AnyReason AI Studio 停止服务"
echo "=========================================="

echo "[*] 正在停止所有容器..."
docker compose down

echo ""
echo "[✓] 所有服务已停止"
