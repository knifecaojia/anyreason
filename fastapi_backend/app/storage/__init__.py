__all__ = ["get_minio_client", "normalize_minio_endpoint"]

from app.storage import minio_client as _minio_client


def get_minio_client():
    return _minio_client.get_minio_client()


def normalize_minio_endpoint(value: str) -> tuple[str, bool]:
    return _minio_client.normalize_minio_endpoint(value)
