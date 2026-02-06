#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_base="$repo_root/docker/docker-compose.yml"
compose_app="$repo_root/docker/compose.app.yml"

export ANYREASON_ENV_FILE="${ANYREASON_ENV_FILE:-$repo_root/docker/.env}"

docker compose -f "$compose_base" up -d postgres
docker compose -f "$compose_base" -f "$compose_app" --profile app build backend
docker compose -f "$compose_base" -f "$compose_app" --profile app run --rm db-init

