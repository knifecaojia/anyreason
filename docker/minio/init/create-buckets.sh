#!/bin/sh
set -eu

until mc alias set local "$MINIO_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  sleep 2
done

mc mb --ignore-existing "local/$MINIO_BUCKET_ASSETS"
mc mb --ignore-existing "local/$MINIO_BUCKET_EXPORTS"
mc mb --ignore-existing "local/$MINIO_BUCKET_SCRIPTS"
