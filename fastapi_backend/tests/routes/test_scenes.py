import pytest


class _FakeObject:
    def __init__(self, payload: bytes):
        self._payload = payload

    def stream(self, _chunk_size: int):
        yield self._payload

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

    def get_object(self, bucket: str, key: str):
        return _FakeObject(self._objects[(bucket, key)])

    def remove_object(self, *, bucket_name: str, object_name: str):
        self._objects.pop((bucket_name, object_name), None)


@pytest.mark.asyncio
async def test_scene_crud_via_api(test_client, authenticated_user, monkeypatch):
    fake = _FakeMinio()

    from app.storage import minio_client as minio_client_module

    monkeypatch.setattr(minio_client_module, "get_minio_client", lambda: fake)

    script_text = "\n".join(["剧本正文", "EPISODE 1: 第一集", "内容A"])
    res = await test_client.post(
        "/api/v1/scripts",
        headers=authenticated_user["headers"],
        files={"title": (None, "测试剧本"), "text": (None, script_text)},
    )
    assert res.status_code == 200
    script_id = res.json()["data"]["id"]

    res = await test_client.post(f"/api/v1/scripts/{script_id}/structure", headers=authenticated_user["headers"])
    assert res.status_code == 200
    episode_id = res.json()["data"]["episodes"][0]["id"]

    res = await test_client.post(
        f"/api/v1/episodes/{episode_id}/scenes",
        headers=authenticated_user["headers"],
        json={"title": "EXT. 新场景 - DAY", "content": "Hello", "location": "新场景", "time_of_day": "DAY"},
    )
    assert res.status_code == 200
    scene_id = res.json()["data"]["id"]

    res = await test_client.patch(
        f"/api/v1/scenes/{scene_id}",
        headers=authenticated_user["headers"],
        json={"title": "EXT. 新场景 - NIGHT", "content": "World"},
    )
    assert res.status_code == 200
    assert res.json()["data"]["title"] == "EXT. 新场景 - NIGHT"

    res = await test_client.get(f"/api/v1/scripts/{script_id}/hierarchy", headers=authenticated_user["headers"])
    assert res.status_code == 200
    scenes = res.json()["data"]["episodes"][0]["scenes"]
    assert any(sc["id"] == scene_id for sc in scenes)

    res = await test_client.delete(f"/api/v1/scenes/{scene_id}", headers=authenticated_user["headers"])
    assert res.status_code == 200

    res = await test_client.get(f"/api/v1/scripts/{script_id}/hierarchy", headers=authenticated_user["headers"])
    assert res.status_code == 200
    scenes = res.json()["data"]["episodes"][0]["scenes"]
    assert all(sc["id"] != scene_id for sc in scenes)
