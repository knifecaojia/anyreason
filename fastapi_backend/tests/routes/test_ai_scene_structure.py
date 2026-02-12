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
async def test_ai_scene_structure_preview_and_apply(test_client, authenticated_user, monkeypatch):
    fake = _FakeMinio()

    from app.storage import minio_client as minio_client_module

    monkeypatch.setattr(minio_client_module, "get_minio_client", lambda: fake)

    import app.services.ai_scene_structure_service as svc_module

    async def _fake_chat_completions(*, db, user_id, model, messages, temperature, max_tokens):
        _ = db
        _ = user_id
        _ = model
        _ = messages
        _ = temperature
        _ = max_tokens
        content = """```json
{"scenes":[
  {"scene_number":1,"title":"EXT. 斩仙台 - DAY","content":"内容A","location":"斩仙台","time_of_day":"DAY","location_type":"外"},
  {"scene_number":2,"title":"INT. 萧家大厅 - NIGHT","content":"内容B","location":"萧家大厅","time_of_day":"NIGHT","location_type":"内"}
]}
```"""
        return {"choices": [{"message": {"content": content}}]}

    monkeypatch.setattr(svc_module, "_chat_completions", _fake_chat_completions)

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

    res = await test_client.get("/api/v1/ai/models", headers=authenticated_user["headers"])
    assert res.status_code == 200

    res = await test_client.post(
        f"/api/v1/episodes/{episode_id}/ai/scene-structure/prompt-preview",
        headers=authenticated_user["headers"],
        json={"model": "deepseek", "prompt_template": "test"},
    )
    assert res.status_code == 200
    assert "EPISODE_SCRIPT" in res.json()["data"]["final_prompt"]

    res = await test_client.post(
        f"/api/v1/episodes/{episode_id}/ai/scene-structure/preview",
        headers=authenticated_user["headers"],
        json={"model": "deepseek", "prompt_template": "test"},
    )
    assert res.status_code == 200
    assert len(res.json()["data"]["scenes"]) == 2

    res = await test_client.post(
        f"/api/v1/episodes/{episode_id}/ai/scene-structure/apply",
        headers=authenticated_user["headers"],
        json={"mode": "replace", "scenes": res.json()["data"]["scenes"]},
    )
    assert res.status_code == 200
    assert res.json()["data"]["created_count"] == 2

    res = await test_client.get(f"/api/v1/scripts/{script_id}/hierarchy", headers=authenticated_user["headers"])
    assert res.status_code == 200
    storyboards = res.json()["data"]["episodes"][0]["storyboards"]
    assert [s["scene_number"] for s in storyboards] == [1, 2]
