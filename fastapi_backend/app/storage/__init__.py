from __future__ import annotations

from typing import TYPE_CHECKING

__all__ = [
    "StorageProvider",
    "StorageError",
    "ObjectNotFoundError",
    "StorageConfigError",
    "get_storage_provider",
    "CosStorageProvider",
    "get_minio_client",
    "normalize_minio_endpoint",
]

if TYPE_CHECKING:
    from app.storage.cos_client import CosStorageProvider

from app.storage import minio_client as _minio_client
from app.storage.storage_provider import (
    ObjectNotFoundError,
    StorageConfigError,
    StorageError,
    StorageProvider,
    get_storage_provider,
)


def __getattr__(name: str):
    """Lazy import for COS adapter (avoids requiring cos-python-sdk-v5 at import time)."""
    if name == "CosStorageProvider":
        from app.storage.cos_client import CosStorageProvider

        return CosStorageProvider
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def get_minio_client():
    return _minio_client.get_minio_client()


def normalize_minio_endpoint(value: str) -> tuple[str, bool]:
    return _minio_client.normalize_minio_endpoint(value)
