"""Tencent COS adapter implementing the StorageProvider Protocol.

Uses cos-python-sdk-v5 (the official Tencent COS Python SDK).
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from loguru import logger
from minio.helpers import ObjectWriteResult
from urllib3 import HTTPHeaderDict

from app.config import settings
from app.storage.storage_provider import ObjectNotFoundError, StorageError

try:
    from qcloud_cos import CosConfig, CosS3Client, CosServiceError
except ImportError:
    CosConfig = None  # type: ignore[assignment, misc]
    CosS3Client = None  # type: ignore[assignment, misc]
    CosServiceError = None  # type: ignore[assignment, misc]


# ---------------------------------------------------------------------------
# Compatibility wrapper: make COS get_object response quack like MinIO's
# urllib3.HTTPResponse (supports .read(), .close(), .release_conn(), .headers)
# ---------------------------------------------------------------------------

class _CosStreamWrapper:
    """Wraps a COS SDK get_object response dict so consumers can treat it like
    a MinIO ``urllib3.HTTPResponse`` object.

    Consumers call ``response.read()``, ``response.close()``,
    ``response.release_conn()``, and ``response.headers``.
    """

    def __init__(self, cos_response: dict[str, Any]) -> None:
        body = cos_response.get("Body")
        if body is None:
            raise ValueError("COS get_object response missing 'Body'")
        # COS SDK Body is a ``CosReadStream`` (file-like), but some versions
        # expose it as ``StreamBody`` — both support .read() / .get_stream().
        self._stream = body
        # COS SDK returns response headers as top-level dict keys (e.g.
        # "Content-Type", "ETag", "Content-Length") alongside the "Body" key.
        # We extract every key except "Body" into a lowercase-keyed headers dict
        # so consumers can do response.headers.get("content-type").
        self._headers: dict[str, str] = {}
        for k, v in cos_response.items():
            if k == "Body":
                continue
            key = k.lower() if isinstance(k, str) else k
            if isinstance(v, (list, tuple)):
                self._headers[key] = v[0] if v else ""
            else:
                self._headers[key] = str(v)
        self._closed = False

    # -- file-like interface expected by consumers --------------------------

    def read(self, amt: int | None = None) -> bytes:
        if amt is None:
            # COS SDK StreamBody.read() without args returns only a single
            # internal buffer (~1024 bytes), unlike urllib3.HTTPResponse.read()
            # which returns the entire remaining body.  Work around this by
            # reading in chunks.
            chunks: list[bytes] = []
            while True:
                chunk = self._stream.read(65536)
                if not chunk:
                    break
                chunks.append(chunk)
            return b"".join(chunks)
        return self._stream.read(amt)

    def close(self) -> None:
        if not self._closed:
            try:
                self._stream.close()
            except Exception:
                pass
            self._closed = True

    def release_conn(self) -> None:
        """No-op kept for MinIO consumer compatibility."""
        self.close()

    @property
    def headers(self) -> dict[str, str]:
        return self._headers


# ---------------------------------------------------------------------------
# Compatibility wrapper: make COS put_object return value quack like
# minio.helpers.ObjectWriteResult (needs .object_name, .etag)
# ---------------------------------------------------------------------------

class _CosWriteResult(ObjectWriteResult):
    """Nominal subclass of ``ObjectWriteResult`` for COS put_object returns.

    This avoids Pyright protocol-compatibility issues — Pyright checks
    nominal subtyping for return types in Protocol methods.
    """

    def __init__(
        self,
        bucket_name: str,
        object_name: str,
        etag: str,
        location: str = "",
    ) -> None:
        super().__init__(
            bucket_name=bucket_name,
            object_name=object_name,
            version_id=None,
            etag=etag,
            http_headers=HTTPHeaderDict(),
            location=location,
        )


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------

class CosStorageProvider:
    """Tencent COS implementation of :class:`StorageProvider`."""

    def __init__(self) -> None:
        if CosConfig is None or CosS3Client is None:
            raise ImportError(
                "cos-python-sdk-v5 is required when OBJECT_STORAGE_PROVIDER='cos'. "
                "Install it with: pip install cos-python-sdk-v5"
            )
        self._bucket = settings.COS_BUCKET
        self._client = self._create_client()

    # -- internal helpers ---------------------------------------------------

    @classmethod
    def _create_client(cls) -> CosS3Client:  # type: ignore[valid-type]
        config = CosConfig(  # type: ignore[operator]
            Region=settings.COS_REGION,
            SecretId=settings.COS_SECRET_ID,
            SecretKey=settings.COS_SECRET_KEY,
        )
        return CosS3Client(config)  # type: ignore[operator]

    @classmethod
    def _build_base_url(cls) -> str:
        """Derive the base COS URL from config.

        If ``COS_DOMAIN`` is set, use it directly.
        Otherwise build ``https://{bucket}.cos.{region}.myqcloud.com``.
        """
        if settings.COS_DOMAIN:
            return settings.COS_DOMAIN.rstrip("/")
        bucket = settings.COS_BUCKET
        region = settings.COS_REGION
        return f"https://{bucket}.cos.{region}.myqcloud.com"

    @classmethod
    def parse_url(cls, url: str) -> tuple[str, str] | None:
        """Extract (bucket, key) from a COS-style URL.

        Only matches URLs whose hostname contains ``.cos.`` (the COS domain
        pattern). Returns ``None`` for non-COS URLs.
        """
        parsed = urlparse(url)
        host = parsed.hostname or ""
        if ".cos." not in host:
            return None
        # path starts with '/', strip it
        path = parsed.path.lstrip("/")
        if not path:
            return None
        # The bucket is already embedded in the host (bucket-appid.cos.region.myqcloud.com).
        # Extract bucket from host by splitting on ".cos."
        bucket_part = host.split(".cos.")[0]
        return bucket_part, path

    # -- StorageProvider interface ------------------------------------------

    def ensure_bucket(self, bucket: str) -> None:
        """Check that the bucket exists.  Does NOT auto-create — COS buckets
        must be created via the Tencent Cloud console.

        The ``bucket`` parameter from callers is ignored; ``self._bucket``
        (from ``settings.COS_BUCKET``) is always used instead, because COS
        follows a single-bucket-per-app model.
        """
        try:
            self._client.head_bucket(Bucket=self._bucket)  # type: ignore[union-attr]
        except Exception as exc:
            logger.warning(
                "COS bucket '{}' does not exist or is not accessible: {}",
                self._bucket,
                exc,
            )
            raise

    def put_bytes(
        self,
        bucket: str,
        object_name: str,
        data: bytes,
        content_type: str | None = None,
    ) -> ObjectWriteResult:
        kwargs: dict[str, Any] = {
            "Bucket": self._bucket,
            "Key": object_name,
            "Body": data,
        }
        if content_type is not None:
            kwargs["ContentType"] = content_type

        response = self._client.put_object(**kwargs)  # type: ignore[union-attr]

        # COS SDK returns response headers as top-level dict keys
        # (e.g. "ETag", "Content-Length", "Server").
        etag = ""
        if isinstance(response, dict):
            etag = response.get("ETag", "")
            if isinstance(etag, (list, tuple)):
                etag = etag[0] if etag else ""
        return _CosWriteResult(
            bucket_name=self._bucket,
            object_name=object_name,
            etag=etag,
            location=self._build_base_url(),
        )

    def get_object(self, bucket: str, object_name: str) -> Any:
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=object_name)  # type: ignore[union-attr]
        except CosServiceError as exc:  # type: ignore[misc]
            # CosServiceError stores (method, xml_body, status_code) in args.
            # The XML body contains <Code>NoSuchKey</Code> for missing objects.
            if "NoSuchKey" in str(exc):
                raise ObjectNotFoundError(
                    f"Object not found: bucket={self._bucket!r}, object_name={object_name!r}"
                ) from exc
            raise StorageError(
                f"COS error: bucket={self._bucket!r}, object_name={object_name!r}, {exc}"
            ) from exc
        return _CosStreamWrapper(response)

    def delete_object(self, bucket: str, object_name: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=object_name)  # type: ignore[union-attr]

    def build_url(self, bucket: str, object_name: str) -> str:
        base = self._build_base_url()
        return f"{base}/{object_name}"

    def download_by_url(self, url: str) -> tuple[bytes, str | None] | None:
        parsed = self.parse_url(url)
        if parsed is None:
            return None
        _bucket, key = parsed
        # Always use self._bucket regardless of what the URL hostname contains.
        response = self.get_object(bucket=self._bucket, object_name=key)
        try:
            data = response.read()
            content_type = response.headers.get("content-type")
            return data, content_type
        finally:
            response.close()
            response.release_conn()
