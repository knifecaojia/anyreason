import pytest


class _FakeObject:
    def __init__(self, payload: bytes):
        self._payload = payload

    def stream(self, _chunk_size: int):
        yield self._payload

    def read(self):
        return self._payload

    def close(self):
        return None

    def release_conn(self):
        return None


class _FakeMinio:
    def __init__(self):
        self._buckets: set[str] = set()
        self._objects: dict[tuple[str, str], bytes] = {}

    def bucket_exists(self, bucket: str) -> bool:
        return bucket in self._buckets

    def make_bucket(self, bucket: str):
        self._buckets.add(bucket)

    def put_object(self, *, bucket_name: str, object_name: str, data, length: int, content_type: str):
        self._buckets.add(bucket_name)
        self._objects[(bucket_name, object_name)] = data.read(length)

    def get_object(self, bucket: str | None = None, key: str | None = None, *, bucket_name: str | None = None, object_name: str | None = None):
        b = bucket_name or bucket
        k = object_name or key
        return _FakeObject(self._objects[(b, k)])

    def remove_object(self, *, bucket_name: str, object_name: str):
        self._objects.pop((bucket_name, object_name), None)


@pytest.mark.asyncio
async def test_scripts_create_list_download(test_client, authenticated_user, monkeypatch):
    fake = _FakeMinio()

    from app.storage import minio_client as minio_client_module

    monkeypatch.setattr(minio_client_module, "get_minio_client", lambda: fake)

    res = await test_client.post(
        "/api/v1/scripts",
        headers=authenticated_user["headers"],
        files={"title": (None, "测试剧本"), "text": (None, "第一幕：Hello")},
    )
    assert res.status_code == 200
    payload = res.json()
    assert payload["code"] == 200
    script_id = payload["data"]["id"]

    res = await test_client.get("/api/v1/scripts?page=1&size=10", headers=authenticated_user["headers"])
    assert res.status_code == 200
    items = res.json()["data"]["items"]
    assert any(it["id"] == script_id for it in items)

    res = await test_client.get(
        f"/api/v1/scripts/{script_id}/download", headers=authenticated_user["headers"]
    )
    assert res.status_code == 200
    assert res.content == "第一幕：Hello".encode("utf-8")
    assert "content-disposition" in res.headers


@pytest.mark.asyncio
async def test_scripts_soft_delete_hides_from_list_and_blocks_download(test_client, authenticated_user, monkeypatch):
    fake = _FakeMinio()

    from app.storage import minio_client as minio_client_module

    monkeypatch.setattr(minio_client_module, "get_minio_client", lambda: fake)

    res = await test_client.post(
        "/api/v1/scripts",
        headers=authenticated_user["headers"],
        files={"title": (None, "待删除剧本"), "text": (None, "内容")},
    )
    assert res.status_code == 200
    script_id = res.json()["data"]["id"]

    res = await test_client.delete(f"/api/v1/scripts/{script_id}", headers=authenticated_user["headers"])
    assert res.status_code == 200

    res = await test_client.get("/api/v1/scripts?page=1&size=10", headers=authenticated_user["headers"])
    assert res.status_code == 200
    items = res.json()["data"]["items"]
    assert all(it["id"] != script_id for it in items)

    res = await test_client.get(
        f"/api/v1/scripts/{script_id}/download", headers=authenticated_user["headers"]
    )
    assert res.status_code == 404
