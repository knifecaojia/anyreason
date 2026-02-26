#!/usr/bin/env bash
# ===================================================================
# AnyReason AI Studio - 重启服务脚本
# 用法: ./scripts/restart.sh [服务名]
# 示例:
#   ./scripts/restart.sh           # 重启所有服务
#   ./scripts/restart.sh backend   # 仅重启 backend 服务
# ===================================================================
set -euo pipefail

# 脚本所在目录 → 项目根目录 (docker-deploy/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo "=========================================="
echo "  AnyReason AI Studio 重启服务"
echo "=========================================="

if [ $# -gt 0 ]; then
    echo "[*] 正在重启服务: $*"
    docker compose restart "$@"
    echo ""
    echo "[✓] 服务 [$*] 已重启"
else
    echo "[*] 正在重启所有服务..."
    docker compose restart
    echo ""
    echo "[✓] 所有服务已重启"
fi
