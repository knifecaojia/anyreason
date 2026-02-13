from __future__ import annotations

import os


def get_celery_app():
    try:
        from celery import Celery
    except Exception as e:
        raise RuntimeError("celery_not_installed") from e

    broker_url = os.getenv("CELERY_BROKER_URL") or os.getenv("REDIS_URL") or "redis://localhost:6379/0"
    backend_url = os.getenv("CELERY_RESULT_BACKEND") or broker_url
    app = Celery("anyreason", broker=broker_url, backend=backend_url)
    app.conf.update(task_serializer="json", accept_content=["json"], result_serializer="json")
    return app

