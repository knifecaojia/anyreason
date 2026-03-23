from __future__ import annotations

from app.storage.storage_provider import MinioStorageProvider


def normalize_minio_endpoint(value: str) -> tuple[str, bool]:
    return MinioStorageProvider.normalize_endpoint(value)


def get_minio_client():
    return MinioStorageProvider._create_client()

def build_minio_url(bucket: str, object_name: str) -> str:
    """构建 MinIO 对象的可访问 URL，正确处理 MINIO_ENDPOINT 含 scheme 的情况。"""
    return MinioStorageProvider().build_url(bucket=bucket, object_name=object_name)


def parse_minio_url(url: str) -> tuple[str, str] | None:
    """如果 url 指向本地 MinIO，返回 (bucket, object_name)，否则返回 None。"""
    return MinioStorageProvider.parse_url(url)


def download_minio_bytes(url: str) -> tuple[bytes, str | None] | None:
    """如果 url 指向本地 MinIO，用认证客户端下载并返回 (bytes, content_type)；否则返回 None。"""
    return MinioStorageProvider().download_by_url(url)

