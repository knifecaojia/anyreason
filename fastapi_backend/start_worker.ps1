Set-Location $PSScriptRoot
uv sync
uv run python -m app.tasks.worker --reload

