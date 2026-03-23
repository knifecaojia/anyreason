"""
Real integration tests for CosStorageProvider against live Tencent COS.

These tests perform actual file I/O operations against a running Tencent COS bucket
using the CosStorageProvider abstraction layer.

IMPORTANT: These tests are NOT mocked. They use real CosStorageProvider directly.

Run with:
    cd fastapi_backend && python -m pytest tests/integration/test_real_cos_io.py -v -s
"""

import os
import pytest
import time
from app.storage.cos_client import CosStorageProvider
from app.storage.storage_provider import ObjectNotFoundError


# Test configuration - these should be overridden by fixtures
TEST_BUCKET = "anyreason-1411329984"
TEST_OBJECT_PREFIX = f"cos-integration-test-{int(time.time())}/"
TEST_OBJECT = f"{TEST_OBJECT_PREFIX}file.txt"
TEST_CONTENT = b"Hello, COS integration test!"
TEST_CONTENT_TYPE = "text/plain"


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        pytest.skip(f"Missing required integration env var: {name}")
    return value


@pytest.fixture(scope="function")
def provider(monkeypatch):
    """
    Create a real CosStorageProvider with overridden settings for integration testing.
    
    This fixture uses monkeypatch to ensure the settings point to the real Tencent COS
    instance, bypassing any environment-based configuration.
    """
    from app import config as config_module
    
    # Override settings from environment for live Tencent COS integration testing.
    monkeypatch.setattr(config_module.settings, "COS_SECRET_ID", _require_env("TEST_COS_SECRET_ID"))
    monkeypatch.setattr(config_module.settings, "COS_SECRET_KEY", _require_env("TEST_COS_SECRET_KEY"))
    monkeypatch.setattr(
        config_module.settings,
        "COS_REGION",
        os.getenv("TEST_COS_REGION", "ap-shanghai"),
    )
    monkeypatch.setattr(
        config_module.settings,
        "COS_BUCKET",
        os.getenv("TEST_COS_BUCKET", TEST_BUCKET),
    )
    monkeypatch.setattr(
        config_module.settings,
        "COS_DOMAIN",
        os.getenv("TEST_COS_DOMAIN", "https://anyreason-1411329984.cos.ap-shanghai.myqcloud.com"),
    )
    
    # Create provider instance directly (not via factory)
    return CosStorageProvider()


@pytest.fixture(scope="function")
def cleanup_objects(provider):
    """Track all objects created during tests for cleanup."""
    created_objects = []
    
    yield created_objects
    
    # Cleanup all created objects
    print(f"\n[FIXTURE] Cleaning up {len(created_objects)} test objects...")
    for obj in created_objects:
        try:
            provider.delete_object(bucket=TEST_BUCKET, object_name=obj)
            print(f"       Deleted: {obj}")
        except Exception as e:
            print(f"       Warning: Failed to delete {obj}: {e}")
    print(f"[FIXTURE] Cleanup complete")


def add_to_cleanup(cleanup_objects, object_name):
    """Helper to track objects for cleanup."""
    if object_name not in cleanup_objects:
        cleanup_objects.append(object_name)


@pytest.mark.integration
def test_ensure_bucket(provider, cleanup_objects):
    """Test 1: Verify ensure_bucket() checks the bucket exists."""
    print(f"\n{'='*60}")
    print("TEST 1: ensure_bucket() verifies bucket exists")
    print(f"{'='*60}")
    
    # Should not raise an exception if bucket exists and is accessible
    provider.ensure_bucket(TEST_BUCKET)
    print(f"PASS: Bucket '{TEST_BUCKET}' is accessible")


@pytest.mark.integration
def test_put_bytes_with_content_type(provider, cleanup_objects):
    """Test 2: Upload a file with content_type specified."""
    print(f"\n{'='*60}")
    print("TEST 2: put_bytes() with content_type")
    print(f"{'='*60}")
    
    test_obj = f"{TEST_OBJECT_PREFIX}with-content-type.txt"
    add_to_cleanup(cleanup_objects, test_obj)
    
    result = provider.put_bytes(
        bucket=TEST_BUCKET,
        object_name=test_obj,
        data=TEST_CONTENT,
        content_type=TEST_CONTENT_TYPE,
    )
    
    # Verify result is not None and has expected attributes
    assert result is not None, "put_bytes should return ObjectWriteResult"
    assert result.bucket_name == TEST_BUCKET
    assert result.object_name == test_obj
    assert result.etag, f"ETag should be non-empty, got: {result.etag!r}"
    print(f"PASS: put_bytes() uploaded '{test_obj}' successfully")
    print(f"       ETag: {result.etag}")


@pytest.mark.integration
def test_put_bytes_without_content_type(provider, cleanup_objects):
    """Test 3: Upload a file without specifying content_type."""
    print(f"\n{'='*60}")
    print("TEST 3: put_bytes() without content_type")
    print(f"{'='*60}")
    
    test_obj = f"{TEST_OBJECT_PREFIX}without-content-type.bin"
    add_to_cleanup(cleanup_objects, test_obj)
    
    binary_content = b"\x00\x01\x02\x03\x04\x05Binary content without content type"
    
    result = provider.put_bytes(
        bucket=TEST_BUCKET,
        object_name=test_obj,
        data=binary_content,
        # content_type omitted (defaults to None)
    )
    
    assert result is not None
    assert result.object_name == test_obj
    print(f"PASS: put_bytes() without content_type succeeded")
    print(f"       Object: {test_obj}")
    print(f"       ETag: {result.etag}")


@pytest.mark.integration
def test_get_object_reads_content(provider, cleanup_objects):
    """Test 4: Read back the uploaded file and verify content matches."""
    print(f"\n{'='*60}")
    print("TEST 4: get_object() reads content correctly")
    print(f"{'='*60}")
    
    test_obj = f"{TEST_OBJECT_PREFIX}read-test.txt"
    add_to_cleanup(cleanup_objects, test_obj)
    
    # First upload the file
    provider.put_bytes(
        bucket=TEST_BUCKET,
        object_name=test_obj,
        data=TEST_CONTENT,
        content_type=TEST_CONTENT_TYPE,
    )
    
    response = provider.get_object(bucket=TEST_BUCKET, object_name=test_obj)
    
    try:
        # Read content
        content = response.read()
        assert content == TEST_CONTENT, (
            f"Content mismatch!\n"
            f"Expected: {TEST_CONTENT}\n"
            f"Got:      {content}"
        )
        print(f"PASS: get_object() returned correct content")
        print(f"       Content length: {len(content)} bytes")
        
        # Verify content type from headers
        content_type = response.headers.get("content-type", "")
        assert "text/plain" in content_type, f"Expected text/plain in content-type, got: {content_type!r}"
        print(f"       Content-Type: {content_type}")
    finally:
        response.close()
        response.release_conn()


@pytest.mark.integration
def test_build_url(provider, cleanup_objects):
    """Test 5: Verify build_url() generates the expected URL."""
    print(f"\n{'='*60}")
    print("TEST 5: build_url() generates correct URL")
    print(f"{'='*60}")
    
    test_obj = f"{TEST_OBJECT_PREFIX}url-test.txt"
    
    # When COS_DOMAIN is set, build_url returns {COS_DOMAIN}/{object_name}
    # The bucket parameter is ignored because COS_DOMAIN already contains the bucket
    url = provider.build_url(bucket=TEST_BUCKET, object_name=test_obj)
    
    expected_url = f"https://anyreason-1411329984.cos.ap-shanghai.myqcloud.com/{test_obj}"
    assert url == expected_url, f"Expected URL: {expected_url}, got: {url}"
    print(f"PASS: build_url() returned: {url}")


@pytest.mark.integration
def test_download_by_url(provider, cleanup_objects):
    """Test 6: Verify URL-based download works correctly."""
    print(f"\n{'='*60}")
    print("TEST 6: download_by_url() works correctly")
    print(f"{'='*60}")
    
    test_obj = f"{TEST_OBJECT_PREFIX}download-test.txt"
    add_to_cleanup(cleanup_objects, test_obj)
    
    # First upload the file
    provider.put_bytes(
        bucket=TEST_BUCKET,
        object_name=test_obj,
        data=TEST_CONTENT,
        content_type=TEST_CONTENT_TYPE,
    )
    
    # Build the URL
    url = provider.build_url(bucket=TEST_BUCKET, object_name=test_obj)
    print(f"       Built URL: {url}")
    
    # Download using URL
    result = provider.download_by_url(url)
    
    assert result is not None, "download_by_url should return a result for valid URL"
    data, content_type = result
    
    assert data == TEST_CONTENT, (
        f"Content mismatch via URL download!\n"
        f"Expected: {TEST_CONTENT}\n"
        f"Got:      {data}"
    )
    print(f"PASS: download_by_url() returned correct content")
    print(f"       Content-Type: {content_type}")


@pytest.mark.integration
def test_delete_object(provider, cleanup_objects):
    """Test 7: Delete a test object and verify it's gone."""
    print(f"\n{'='*60}")
    print("TEST 7: delete_object() removes file")
    print(f"{'='*60}")
    
    test_obj = f"{TEST_OBJECT_PREFIX}delete-test.txt"
    
    # First upload the file
    provider.put_bytes(
        bucket=TEST_BUCKET,
        object_name=test_obj,
        data=TEST_CONTENT,
        content_type=TEST_CONTENT_TYPE,
    )
    print(f"       Uploaded: {test_obj}")
    
    # Delete the file
    provider.delete_object(bucket=TEST_BUCKET, object_name=test_obj)
    print(f"       Deleted: {test_obj}")
    
    # Verify deletion by attempting to read it (should raise ObjectNotFoundError)
    with pytest.raises(ObjectNotFoundError):
        provider.get_object(bucket=TEST_BUCKET, object_name=test_obj)


@pytest.mark.integration
def test_error_path_object_not_found(provider, cleanup_objects):
    """Test 8: Verify exception raised for non-existent key."""
    print(f"\n{'='*60}")
    print("TEST 8: Exception for non-existent key")
    print(f"{'='*60}")
    
    non_existent_key = f"{TEST_OBJECT_PREFIX}this-does-not-exist-12345.txt"
    
    # CosStorageProvider.get_object() now translates NoSuchKey to ObjectNotFoundError
    with pytest.raises(ObjectNotFoundError) as exc_info:
        provider.get_object(bucket=TEST_BUCKET, object_name=non_existent_key)
    
    print(f"PASS: ObjectNotFoundError raised for missing object")
    print(f"       Error message: {exc_info.value}")


@pytest.mark.integration
def test_all_methods_integration(provider, cleanup_objects):
    """Test 9: End-to-end test of all methods together."""
    print(f"\n{'='*60}")
    print("TEST 9: End-to-end integration test")
    print(f"{'='*60}")
    
    test_obj = f"{TEST_OBJECT_PREFIX}e2e-test.txt"
    add_to_cleanup(cleanup_objects, test_obj)
    
    # 1. ensure_bucket (should not raise)
    provider.ensure_bucket(TEST_BUCKET)
    print(f"       1. ensure_bucket() - OK")
    
    # 2. put_bytes with content_type
    result = provider.put_bytes(
        bucket=TEST_BUCKET,
        object_name=test_obj,
        data=TEST_CONTENT,
        content_type=TEST_CONTENT_TYPE,
    )
    assert result.etag, "ETag should be non-empty"
    print(f"       2. put_bytes() - OK (ETag: {result.etag})")
    
    # 3. get_object and verify content
    response = provider.get_object(bucket=TEST_BUCKET, object_name=test_obj)
    try:
        content = response.read()
        assert content == TEST_CONTENT
        print(f"       3. get_object() - OK")
    finally:
        response.close()
        response.release_conn()
    
    # 4. build_url
    url = provider.build_url(bucket=TEST_BUCKET, object_name=test_obj)
    print(f"       4. build_url() - OK ({url})")
    
    # 5. download_by_url
    data, content_type = provider.download_by_url(url)
    assert data == TEST_CONTENT
    print(f"       5. download_by_url() - OK")
    
    # 6. delete_object
    provider.delete_object(bucket=TEST_BUCKET, object_name=test_obj)
    print(f"       6. delete_object() - OK")
    
    # 7. Verify deletion raises ObjectNotFoundError
    with pytest.raises(ObjectNotFoundError):
        provider.get_object(bucket=TEST_BUCKET, object_name=test_obj)
    print(f"       7. Verify deletion - OK")
    
    print(f"PASS: End-to-end integration test completed!")
    print(f"{'='*60}")
