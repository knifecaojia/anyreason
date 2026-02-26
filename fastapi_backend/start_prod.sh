#!/usr/bin/env bash
# 生产环境启动脚本 — 不使用 --reload，不需要 watchdog
# --proxy-headers: 信任 nginx 传递的 X-Forwarded-Proto/X-Forwarded-For
exec /app/.venv/bin/fastapi run app/main.py --host 0.0.0.0 --port 8000 --proxy-headers
