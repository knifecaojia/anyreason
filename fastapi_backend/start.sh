#!/usr/bin/env bash

if [ -f /.dockerenv ]; then
    echo "Running in Docker"
    if [ ! -x /app/.venv/bin/python ]; then
        uv sync --frozen
    else
        /app/.venv/bin/python -c "import minio" >/dev/null 2>&1 || uv sync --frozen
    fi
    /app/.venv/bin/fastapi dev app/main.py --host 0.0.0.0 --port 8000 --reload &
    /app/.venv/bin/python watcher.py
else
    echo "Running locally with uv"
    uv run fastapi dev app/main.py --host 0.0.0.0 --port 8000 --reload &
    uv run python watcher.py
fi

wait
