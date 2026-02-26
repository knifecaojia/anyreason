#!/usr/bin/env bash
# ===================================================================
# AnyReason AI Studio - 日志查看脚本
# 用法: ./scripts/logs.sh [服务名] [-f]
# 示例:
#   ./scripts/logs.sh              # 查看所有服务日志
#   ./scripts/logs.sh backend      # 查看 backend 服务日志
#   ./scripts/logs.sh -f           # 跟踪所有服务日志
#   ./scripts/logs.sh backend -f   # 跟踪 backend 服务日志
# ===================================================================
set -euo pipefail

# 脚本所在目录 → 项目根目录 (docker-deploy/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

# 解析参数：支持服务名和 -f 跟踪标志
SERVICE=""
FOLLOW=""

for arg in "$@"; do
    if [ "$arg" = "-f" ]; then
        FOLLOW="-f"
    else
        SERVICE="$arg"
    fi
done

if [ -n "$SERVICE" ]; then
    echo "[*] 查看服务 [$SERVICE] 的日志..."
else
    echo "[*] 查看所有服务日志..."
fi

# shellcheck disable=SC2086
docker compose logs $FOLLOW $SERVICE
