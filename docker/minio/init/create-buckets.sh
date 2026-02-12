#!/bin/sh
set -eu

MAX_WAIT_SECONDS="${MINIO_INIT_MAX_WAIT_SECONDS:-60}"
SLEEP_SECONDS="${MINIO_INIT_RETRY_SLEEP_SECONDS:-2}"
START_TS="$(date +%s)"

echo "minio-init: waiting for MinIO at $MINIO_ENDPOINT"
while true; do
  if mc alias set local "$MINIO_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; then
    break
  fi

  NOW_TS="$(date +%s)"
  ELAPSED="$((NOW_TS - START_TS))"

  if [ "$ELAPSED" -ge "$MAX_WAIT_SECONDS" ]; then
    echo "minio-init: timed out after ${MAX_WAIT_SECONDS}s waiting for MinIO at $MINIO_ENDPOINT" >&2
    exit 1
  fi

  echo "minio-init: still waiting (${ELAPSED}s)"
  sleep "$SLEEP_SECONDS"
done

echo "minio-init: creating buckets"

mc mb --ignore-existing "local/$MINIO_BUCKET_ASSETS"
mc mb --ignore-existing "local/$MINIO_BUCKET_EXPORTS"
mc mb --ignore-existing "local/$MINIO_BUCKET_SCRIPTS"

echo "minio-init: done"
