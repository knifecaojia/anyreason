Set-Location $PSScriptRoot
# Production worker startup - NO --reload for stability
# Use start_worker_dev.ps1 for development with auto-reload
uv sync
uv run python -m app.tasks.worker

