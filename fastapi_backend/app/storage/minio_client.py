from __future__ import annotations

from urllib.parse import urlparse

from minio import Minio

from app.config import settings


def normalize_minio_endpoint(value: str) -> tuple[str, bool]:
    parsed = urlparse(value)
    if parsed.scheme in {"http", "https"}:
        endpoint = parsed.netloc or parsed.path
        return endpoint, parsed.scheme == "https"
    return value, settings.MINIO_SECURE


def get_minio_client() -> Minio:
    endpoint, secure = normalize_minio_endpoint(settings.MINIO_ENDPOINT)
    return Minio(
        endpoint=endpoint,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=secure,
    )

