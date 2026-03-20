#!/usr/bin/env bash

# Production worker startup script - NO --reload for stability
# Use start_worker_dev.sh for development with auto-reload

if [ -f /.dockerenv ]; then
    echo "Running worker in Docker (production)"
    if [ ! -x /app/.venv/bin/python ]; then
        uv sync --frozen
    else
        /app/.venv/bin/python -c "import minio,redis,openai" >/dev/null 2>&1 || uv sync --frozen
    fi
    exec /app/.venv/bin/python -m app.tasks.worker
else
    echo "Running worker locally (production mode)"
    exec uv run python -m app.tasks.worker
fi
