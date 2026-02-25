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

def build_minio_url(bucket: str, object_name: str) -> str:
    """构建 MinIO 对象的可访问 URL，正确处理 MINIO_ENDPOINT 含 scheme 的情况。"""
    endpoint = settings.MINIO_ENDPOINT
    if endpoint.startswith("http://") or endpoint.startswith("https://"):
        return f"{endpoint}/{bucket}/{object_name}"
    scheme = "https" if settings.MINIO_SECURE else "http"
    return f"{scheme}://{endpoint}/{bucket}/{object_name}"


def parse_minio_url(url: str) -> tuple[str, str] | None:
    """如果 url 指向本地 MinIO，返回 (bucket, object_name)，否则返回 None。"""
    endpoint = settings.MINIO_ENDPOINT.rstrip("/")
    # 标准化：确保 endpoint 有 scheme
    if not endpoint.startswith("http://") and not endpoint.startswith("https://"):
        scheme = "https" if settings.MINIO_SECURE else "http"
        endpoint = f"{scheme}://{endpoint}"
    if not url.startswith(endpoint + "/"):
        return None
    remainder = url[len(endpoint) + 1:]  # "bucket/path/to/object"
    slash = remainder.find("/")
    if slash <= 0:
        return None
    return remainder[:slash], remainder[slash + 1:]


def download_minio_bytes(url: str) -> tuple[bytes, str | None] | None:
    """如果 url 指向本地 MinIO，用认证客户端下载并返回 (bytes, content_type)；否则返回 None。"""
    parsed = parse_minio_url(url)
    if parsed is None:
        return None
    bucket, key = parsed
    client = get_minio_client()
    resp = client.get_object(bucket_name=bucket, object_name=key)
    try:
        data = resp.read()
        ct = resp.headers.get("Content-Type")
        return data, ct
    finally:
        resp.close()
        resp.release_conn()


