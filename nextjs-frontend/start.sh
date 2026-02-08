#!/usr/bin/env bash
set -euo pipefail

if [ ! -f /app/node_modules/next/dist/bin/next ]; then
  pnpm install --force
fi

exec pnpm dev --hostname 0.0.0.0 --port 3000
