#!/usr/bin/env bash

if [ -f /.dockerenv ]; then
    echo "Running worker in Docker"
    if [ ! -x /app/.venv/bin/python ]; then
        uv sync --frozen
    else
        /app/.venv/bin/python -c "import minio,redis,openai" >/dev/null 2>&1 || uv sync --frozen
    fi
    exec /app/.venv/bin/python -m app.tasks.worker --reload
else
    echo "Running worker locally with uv"
    exec uv run python -m app.tasks.worker --reload
fi
