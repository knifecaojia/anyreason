#!/usr/bin/env bash
set -euo pipefail

export TASK_EXECUTOR=celery

exec celery -A app.tasks.celery_tasks.celery_app worker --loglevel=info

