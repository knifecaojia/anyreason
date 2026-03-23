from __future__ import annotations

from io import BytesIO
from typing import Any, Protocol
from urllib.parse import urlparse

from minio import Minio
from minio.error import S3Error
from minio.helpers import ObjectWriteResult

from app.config import settings


# ---------------------------------------------------------------------------
# Shared exception hierarchy
# ---------------------------------------------------------------------------
# All storage providers MUST raise these (or subclasses) so that business
# modules never need to import provider-specific SDK error types.
# ---------------------------------------------------------------------------


class StorageError(Exception):
    """Base exception for storage provider errors."""

    pass


class ObjectNotFoundError(StorageError):
    """Raised when the requested object does not exist in storage."""

    pass


class StorageConfigError(StorageError):
    """Raised when storage provider configuration is invalid or incomplete."""

    pass


# ---------------------------------------------------------------------------
# Provider Protocol
# ---------------------------------------------------------------------------
# Exceptions callers should expect:
#   - ObjectNotFoundError  – get_object / download_by_url on missing keys
#   - StorageConfigError   – bad credentials, unreachable endpoint, etc.
#   - StorageError         – any other provider-level failure
#
# get_object() return contract:
#   The returned object MUST support:
#     - .read() -> bytes          (read entire body)
#     - .close()                  (release resources)
#     - .stream(chunk_size)       (optional; iterate over chunks)
#     - .headers (dict-like)      (optional; access Content-Type etc.)
# ---------------------------------------------------------------------------


class StorageProvider(Protocol):
    def ensure_bucket(self, bucket: str) -> None: ...

    def put_bytes(
        self,
        bucket: str,
        object_name: str,
        data: bytes,
        content_type: str | None = None,
    ) -> ObjectWriteResult: ...

    # Return type is Any because MinIO and COS return SDK-specific response
    # objects that satisfy the interface documented above.
    def get_object(self, bucket: str, object_name: str) -> Any: ...

    def delete_object(self, bucket: str, object_name: str) -> None: ...

    def build_url(self, bucket: str, object_name: str) -> str: ...

    def download_by_url(self, url: str) -> tuple[bytes, str | None] | None: ...


class MinioStorageProvider:
    def __init__(self):
        self._client = self._create_client()

    @staticmethod
    def normalize_endpoint(value: str) -> tuple[str, bool]:
        parsed = urlparse(value)
        if parsed.scheme in {"http", "https"}:
            endpoint = parsed.netloc or parsed.path
            return endpoint, parsed.scheme == "https"
        return value, settings.MINIO_SECURE

    @classmethod
    def _build_base_url(cls) -> str:
        endpoint, secure = cls.normalize_endpoint(settings.MINIO_ENDPOINT)
        scheme = "https" if secure else "http"
        return f"{scheme}://{endpoint}".rstrip("/")

    @classmethod
    def parse_url(cls, url: str) -> tuple[str, str] | None:
        base_url = cls._build_base_url()
        if not url.startswith(base_url + "/"):
            return None
        remainder = url[len(base_url) + 1 :]
        slash = remainder.find("/")
        if slash <= 0:
            return None
        return remainder[:slash], remainder[slash + 1 :]

    @classmethod
    def _create_client(cls) -> Minio:
        endpoint, secure = cls.normalize_endpoint(settings.MINIO_ENDPOINT)
        return Minio(
            endpoint=endpoint,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=secure,
        )

    def ensure_bucket(self, bucket: str) -> None:
        if not self._client.bucket_exists(bucket):
            self._client.make_bucket(bucket)

    def put_bytes(
        self,
        bucket: str,
        object_name: str,
        data: bytes,
        content_type: str | None = None,
    ) -> ObjectWriteResult:
        put_object_kwargs = {
            "bucket_name": bucket,
            "object_name": object_name,
            "data": BytesIO(data),
            "length": len(data),
        }
        if content_type is not None:
            put_object_kwargs["content_type"] = content_type
        return self._client.put_object(**put_object_kwargs)

    def _translate_s3_error(self, exc: S3Error, *, bucket: str, object_name: str | None = None) -> None:
        """Re-raise a MinIO S3Error as the appropriate shared exception."""
        if exc.code == "NoSuchKey":
            raise ObjectNotFoundError(
                f"Object not found: bucket={bucket!r}, object_name={object_name!r}"
            ) from exc
        raise StorageError(
            f"S3 error: code={exc.code!r}, message={exc.message!r}, "
            f"bucket={bucket!r}, object_name={object_name!r}"
        ) from exc

    def get_object(self, bucket: str, object_name: str) -> Any:
        try:
            return self._client.get_object(bucket_name=bucket, object_name=object_name)
        except S3Error as exc:
            self._translate_s3_error(exc, bucket=bucket, object_name=object_name)

    def delete_object(self, bucket: str, object_name: str) -> None:
        # MinIO remove_object is idempotent: deleting a non-existent key is a
        # no-op.  We still guard against unexpected S3Error codes so that
        # genuine failures (permissions, network) surface as StorageError.
        try:
            self._client.remove_object(bucket_name=bucket, object_name=object_name)
        except S3Error as exc:
            # NoSuchKey on remove is unusual but harmless — treat as success.
            if exc.code == "NoSuchKey":
                return
            raise StorageError(
                f"Failed to delete object: bucket={bucket!r}, object_name={object_name!r}, "
                f"code={exc.code!r}, message={exc.message!r}"
            ) from exc

    def build_url(self, bucket: str, object_name: str) -> str:
        return f"{self._build_base_url()}/{bucket}/{object_name}"

    def download_by_url(self, url: str) -> tuple[bytes, str | None] | None:
        parsed = self.parse_url(url)
        if parsed is None:
            return None
        bucket, key = parsed
        response = self.get_object(bucket=bucket, object_name=key)
        try:
            data = response.read()
            content_type = response.headers.get("Content-Type")
            return data, content_type
        finally:
            response.close()
            response.release_conn()


def get_storage_provider() -> StorageProvider:
    provider = settings.OBJECT_STORAGE_PROVIDER.lower()
    if provider == "cos":
        from app.storage.cos_client import CosStorageProvider

        # Validate required COS config
        required_fields = {
            "COS_SECRET_ID": settings.COS_SECRET_ID,
            "COS_SECRET_KEY": settings.COS_SECRET_KEY,
            "COS_REGION": settings.COS_REGION,
            "COS_BUCKET": settings.COS_BUCKET,
        }
        missing = [k for k, v in required_fields.items() if not v]
        if missing:
            raise StorageConfigError(
                f"OBJECT_STORAGE_PROVIDER='cos' requires non-empty values for: {', '.join(missing)}"
            )
        return CosStorageProvider()
    return MinioStorageProvider()
