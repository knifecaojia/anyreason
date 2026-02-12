#!/usr/bin/env bash

if [ -f /.dockerenv ]; then
    echo "Running db-init in Docker"
    if [ ! -x /app/.venv/bin/python ]; then
        uv sync --frozen
    else
        /app/.venv/bin/python -c "import alembic,asyncpg" >/dev/null 2>&1 || uv sync --frozen
    fi
    exec /app/.venv/bin/python db_init.py
else
    echo "Running db-init locally with uv"
    exec uv run python db_init.py
fi
