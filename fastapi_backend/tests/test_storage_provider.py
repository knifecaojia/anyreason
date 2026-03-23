"""Tests for the storage provider factory, adapters, and configuration validation.

Covers:
- Factory / config validation (provider selection)
- MinIO adapter protocol contract (mocked)
- Exception hierarchy
- COS adapter unit tests (mocked SDK)
"""

from __future__ import annotations

import sys
import types
from unittest.mock import MagicMock, patch

import pytest

from app.storage.storage_provider import (
    MinioStorageProvider,
    ObjectNotFoundError,
    StorageConfigError,
    StorageError,
    get_storage_provider,
)


# ---------------------------------------------------------------------------
# A. Factory / Config Validation Tests
# ---------------------------------------------------------------------------


class TestFactoryConfigValidation:
    """Tests for get_storage_provider() factory and COS config validation."""

    def test_default_provider_is_minio(self, monkeypatch):
        """get_storage_provider() returns MinioStorageProvider when provider=minio."""
        monkeypatch.setattr("app.storage.storage_provider.settings.OBJECT_STORAGE_PROVIDER", "minio")
        with patch.object(MinioStorageProvider, "_create_client") as mock_create:
            mock_create.return_value = MagicMock()
            provider = get_storage_provider()
        assert isinstance(provider, MinioStorageProvider)

    def test_cos_provider_requires_config(self, monkeypatch):
        """OBJECT_STORAGE_PROVIDER='cos' with empty COS fields raises StorageConfigError."""
        monkeypatch.setattr("app.storage.storage_provider.settings.OBJECT_STORAGE_PROVIDER", "cos")
        monkeypatch.setattr("app.storage.storage_provider.settings.COS_SECRET_ID", "")
        monkeypatch.setattr("app.storage.storage_provider.settings.COS_SECRET_KEY", "")
        monkeypatch.setattr("app.storage.storage_provider.settings.COS_REGION", "")
        monkeypatch.setattr("app.storage.storage_provider.settings.COS_BUCKET", "")

        with pytest.raises(StorageConfigError, match="COS_SECRET_ID"):
            get_storage_provider()

    def test_cos_provider_requires_all_fields(self, monkeypatch):
        """OBJECT_STORAGE_PROVIDER='cos' with only some COS fields raises StorageConfigError."""
        monkeypatch.setattr("app.storage.storage_provider.settings.OBJECT_STORAGE_PROVIDER", "cos")
        monkeypatch.setattr("app.storage.storage_provider.settings.COS_SECRET_ID", "id")
        monkeypatch.setattr("app.storage.storage_provider.settings.COS_SECRET_KEY", "key")
        monkeypatch.setattr("app.storage.storage_provider.settings.COS_REGION", "")  # missing
        monkeypatch.setattr("app.storage.storage_provider.settings.COS_BUCKET", "bucket")

        with pytest.raises(StorageConfigError, match="COS_REGION"):
            get_storage_provider()

    def test_cos_import_error_when_sdk_missing(self, monkeypatch):
        """If cos-python-sdk-v5 is not installed, CosStorageProvider() raises ImportError."""
        # Create a mock qcloud_cos that sets CosConfig/CosS3Client to None (simulating ImportError)
        mock_cos_module = types.ModuleType("qcloud_cos")
        mock_cos_module.CosConfig = None
        mock_cos_module.CosS3Client = None

        with patch.dict("sys.modules", {"qcloud_cos": mock_cos_module}):
            # Reimport cos_client so the try/except runs with our mocked module
            if "app.storage.cos_client" in sys.modules:
                del sys.modules["app.storage.cos_client"]
            from app.storage.cos_client import CosStorageProvider

            with pytest.raises(ImportError, match="cos-python-sdk-v5"):
                CosStorageProvider()

        # Clean up so other tests get normal import behavior
        if "app.storage.cos_client" in sys.modules:
            del sys.modules["app.storage.cos_client"]


# ---------------------------------------------------------------------------
# B. Protocol Contract Tests (using MinIO — no COS SDK needed)
# ---------------------------------------------------------------------------


class TestMinioProviderContract:
    """Tests for MinioStorageProvider protocol compliance (all mocks)."""

    def _make_provider(self) -> MinioStorageProvider:
        """Create a MinioStorageProvider with a mocked MinIO client."""
        with patch.object(MinioStorageProvider, "_create_client") as mock_create:
            mock_client = MagicMock()
            mock_create.return_value = mock_client
            provider = MinioStorageProvider()
        provider._client = mock_client
        return provider

    def test_minio_provider_ensure_bucket(self):
        """ensure_bucket calls bucket_exists then make_bucket when bucket doesn't exist."""
        provider = self._make_provider()
        provider._client.bucket_exists.return_value = False

        provider.ensure_bucket("my-bucket")

        provider._client.bucket_exists.assert_called_once_with("my-bucket")
        provider._client.make_bucket.assert_called_once_with("my-bucket")

    def test_minio_provider_ensure_bucket_exists(self):
        """ensure_bucket does not call make_bucket when bucket already exists."""
        provider = self._make_provider()
        provider._client.bucket_exists.return_value = True

        provider.ensure_bucket("my-bucket")

        provider._client.bucket_exists.assert_called_once_with("my-bucket")
        provider._client.make_bucket.assert_not_called()

    def test_minio_provider_put_bytes(self):
        """put_bytes calls client.put_object with correct arguments."""
        provider = self._make_provider()
        fake_result = MagicMock()
        provider._client.put_object.return_value = fake_result

        data = b"hello world"
        result = provider.put_bytes("b", "k", data, content_type="text/plain")

        provider._client.put_object.assert_called_once()
        call_kwargs = provider._client.put_object.call_args.kwargs
        assert call_kwargs["bucket_name"] == "b"
        assert call_kwargs["object_name"] == "k"
        assert call_kwargs["length"] == len(data)
        assert call_kwargs["content_type"] == "text/plain"
        assert result is fake_result

    def test_minio_provider_put_bytes_no_content_type(self):
        """put_bytes omits content_type when None is passed."""
        provider = self._make_provider()

        provider.put_bytes("b", "k", b"data")

        call_kwargs = provider._client.put_object.call_args.kwargs
        assert "content_type" not in call_kwargs

    def test_minio_provider_get_object(self):
        """get_object returns the client's response object."""
        provider = self._make_provider()
        fake_response = MagicMock()
        provider._client.get_object.return_value = fake_response

        result = provider.get_object("b", "k")

        provider._client.get_object.assert_called_once_with(bucket_name="b", object_name="k")
        assert result is fake_response

    def test_minio_provider_get_object_not_found(self):
        """get_object raises ObjectNotFoundError when S3Error code is NoSuchKey."""
        from minio.error import S3Error

        provider = self._make_provider()

        # Build a real S3Error instance (MinIO's exception requires a response arg).
        # We pass a MagicMock for the HTTPResponse — only .code and .message matter.
        fake_response = MagicMock()
        fake_response.status = 404
        fake_s3_error = S3Error(
            response=fake_response,
            code="NoSuchKey",
            message="The specified key does not exist.",
            resource="/b/missing-key",
            request_id="test-req-id",
            host_id="test-host-id",
        )
        provider._client.get_object.side_effect = fake_s3_error

        with pytest.raises(ObjectNotFoundError, match="Object not found"):
            provider.get_object("b", "missing-key")

    def test_minio_provider_delete_object(self):
        """delete_object calls client.remove_object with correct arguments."""
        provider = self._make_provider()

        provider.delete_object("b", "k")

        provider._client.remove_object.assert_called_once_with(bucket_name="b", object_name="k")

    def test_minio_provider_build_url(self, monkeypatch):
        """build_url returns a URL with scheme://endpoint/bucket/object_name format."""
        monkeypatch.setattr("app.storage.storage_provider.settings.MINIO_ENDPOINT", "localhost:9000")
        monkeypatch.setattr("app.storage.storage_provider.settings.MINIO_SECURE", False)

        provider = self._make_provider()
        url = provider.build_url("my-bucket", "path/to/file.txt")

        assert url == "http://localhost:9000/my-bucket/path/to/file.txt"

    def test_minio_provider_download_by_url_valid(self, monkeypatch):
        """download_by_url returns (data, content_type) for a valid MinIO URL."""
        monkeypatch.setattr("app.storage.storage_provider.settings.MINIO_ENDPOINT", "localhost:9000")
        monkeypatch.setattr("app.storage.storage_provider.settings.MINIO_SECURE", False)

        provider = self._make_provider()
        fake_response = MagicMock()
        fake_response.read.return_value = b"file-content"
        fake_response.headers = {"Content-Type": "image/png"}
        provider._client.get_object.return_value = fake_response

        url = "http://localhost:9000/my-bucket/path/to/file.txt"
        result = provider.download_by_url(url)

        assert result is not None
        data, content_type = result
        assert data == b"file-content"
        assert content_type == "image/png"
        provider._client.get_object.assert_called_once_with(bucket_name="my-bucket", object_name="path/to/file.txt")

    def test_minio_provider_download_by_url_invalid(self, monkeypatch):
        """download_by_url returns None for a non-MinIO URL."""
        monkeypatch.setattr("app.storage.storage_provider.settings.MINIO_ENDPOINT", "localhost:9000")
        monkeypatch.setattr("app.storage.storage_provider.settings.MINIO_SECURE", False)

        provider = self._make_provider()

        url = "https://example.com/some/other/file.txt"
        result = provider.download_by_url(url)

        assert result is None
        provider._client.get_object.assert_not_called()

    def test_minio_provider_build_url_secure(self, monkeypatch):
        """build_url uses https when MINIO_ENDPOINT includes https scheme."""
        monkeypatch.setattr(
            "app.storage.storage_provider.settings.MINIO_ENDPOINT", "https://s3.amazonaws.com"
        )

        provider = self._make_provider()
        url = provider.build_url("b", "k")

        assert url.startswith("https://")


# ---------------------------------------------------------------------------
# C. Exception Hierarchy Tests
# ---------------------------------------------------------------------------


class TestExceptionHierarchy:
    """Tests for the shared storage exception hierarchy."""

    def test_object_not_found_is_storage_error(self):
        """ObjectNotFoundError is a subclass of StorageError."""
        assert issubclass(ObjectNotFoundError, StorageError)

    def test_config_error_is_storage_error(self):
        """StorageConfigError is a subclass of StorageError."""
        assert issubclass(StorageConfigError, StorageError)


# ---------------------------------------------------------------------------
# D. COS Adapter Unit Tests (mock COS SDK since it's not installed)
# ---------------------------------------------------------------------------


class TestCosAdapter:
    """Unit tests for CosStorageProvider with fully mocked COS SDK."""

    @staticmethod
    def _mock_cos_sdk():
        """Return a mock qcloud_cos module with CosConfig and CosS3Client."""
        mock_module = types.ModuleType("qcloud_cos")
        mock_module.CosConfig = MagicMock()
        mock_module.CosS3Client = MagicMock()
        return mock_module

    def test_cos_adapter_build_url_with_domain(self):
        """_build_base_url uses COS_DOMAIN when it's set."""
        mock_cos = self._mock_cos_sdk()
        with (
            patch.dict("sys.modules", {"qcloud_cos": mock_cos}),
            patch("app.storage.cos_client.settings.COS_DOMAIN", "https://cdn.example.com"),
            patch("app.storage.cos_client.settings.COS_BUCKET", "my-bucket"),
            patch("app.storage.cos_client.settings.COS_REGION", "ap-shanghai"),
        ):
            if "app.storage.cos_client" in sys.modules:
                del sys.modules["app.storage.cos_client"]
            from app.storage.cos_client import CosStorageProvider

            url = CosStorageProvider._build_base_url()
            assert url == "https://cdn.example.com"

        if "app.storage.cos_client" in sys.modules:
            del sys.modules["app.storage.cos_client"]

    def test_cos_adapter_build_url_without_domain(self):
        """_build_base_url derives URL from bucket + region when COS_DOMAIN is empty."""
        mock_cos = self._mock_cos_sdk()
        with (
            patch.dict("sys.modules", {"qcloud_cos": mock_cos}),
            patch("app.storage.cos_client.settings.COS_DOMAIN", ""),
            patch("app.storage.cos_client.settings.COS_BUCKET", "test-1234567890"),
            patch("app.storage.cos_client.settings.COS_REGION", "ap-guangzhou"),
        ):
            if "app.storage.cos_client" in sys.modules:
                del sys.modules["app.storage.cos_client"]
            from app.storage.cos_client import CosStorageProvider

            url = CosStorageProvider._build_base_url()
            assert url == "https://test-1234567890.cos.ap-guangzhou.myqcloud.com"

        if "app.storage.cos_client" in sys.modules:
            del sys.modules["app.storage.cos_client"]

    def test_cos_adapter_parse_url_cos_pattern(self):
        """parse_url extracts (bucket, key) from a COS-style URL containing .cos.."""
        mock_cos = self._mock_cos_sdk()
        with (
            patch.dict("sys.modules", {"qcloud_cos": mock_cos}),
        ):
            if "app.storage.cos_client" in sys.modules:
                del sys.modules["app.storage.cos_client"]
            from app.storage.cos_client import CosStorageProvider

            url = "https://test-1234567890.cos.ap-shanghai.myqcloud.com/scripts/page1.txt"
            result = CosStorageProvider.parse_url(url)

            assert result is not None
            bucket, key = result
            assert bucket == "test-1234567890"
            assert key == "scripts/page1.txt"

        if "app.storage.cos_client" in sys.modules:
            del sys.modules["app.storage.cos_client"]

    def test_cos_adapter_parse_url_non_cos(self):
        """parse_url returns None for a URL without .cos. in hostname."""
        mock_cos = self._mock_cos_sdk()
        with (
            patch.dict("sys.modules", {"qcloud_cos": mock_cos}),
        ):
            if "app.storage.cos_client" in sys.modules:
                del sys.modules["app.storage.cos_client"]
            from app.storage.cos_client import CosStorageProvider

            url = "https://example.com/some/path/file.txt"
            result = CosStorageProvider.parse_url(url)

            assert result is None

        if "app.storage.cos_client" in sys.modules:
            del sys.modules["app.storage.cos_client"]
