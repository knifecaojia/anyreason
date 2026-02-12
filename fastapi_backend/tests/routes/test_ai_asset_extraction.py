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
async def test_ai_asset_extraction_preview_apply_and_dedupe(test_client, authenticated_user, monkeypatch):
    fake = _FakeMinio()

    from app.storage import minio_client as minio_client_module

    monkeypatch.setattr(minio_client_module, "get_minio_client", lambda: fake)

    import app.services.ai_asset_extraction_service as svc_module

    async def _fake_chat_completions(*, db, user_id, model, messages, temperature, max_tokens):
        _ = db
        _ = user_id
        _ = model
        _ = messages
        _ = temperature
        _ = max_tokens
        content = """```json
{
  "world_unity": {
    "era_setting": "架空修仙",
    "art_style": "二次元厚涂",
    "color_system": "冷色主调，金色点缀"
  },
  "assets": [
    {
      "type": "character",
      "name": "萧炎",
      "importance": "main",
      "category_path": ["角色", "主角团"],
      "tags": ["主角", "男性"],
      "concept": "战损少年主角，目光坚毅",
      "visual_details": {"D1": "主角", "D3": "金琥珀色瞳"},
      "prompt_en": "Anime style, ... A-pose, neutral expression",
      "variants": [{"variant_code": "V1", "prompt_en": "Anime style, ... A-pose, neutral expression"}]
    },
    {
      "type": "PROP",
      "name": "玄重尺",
      "importance": "support",
      "category_path": null,
      "tags": null,
      "concept": "沉重古朴的巨尺武器",
      "prompt_en": "Prop design, ...",
      "variants": null,
      "children": null
    }
  ]
}
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

    res = await test_client.post(
        f"/api/v1/episodes/{episode_id}/ai/asset-extraction/prompt-preview",
        headers=authenticated_user["headers"],
        json={"model": "deepseek", "prompt_template": "test"},
    )
    assert res.status_code == 200
    assert "EPISODE_SCRIPT" in res.json()["data"]["final_prompt"]

    res = await test_client.post(
        f"/api/v1/episodes/{episode_id}/ai/asset-extraction/preview",
        headers=authenticated_user["headers"],
        json={"model": "deepseek", "prompt_template": "test"},
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["world_unity"]["era_setting"] == "架空修仙"
    assert len(data["assets"]) == 2

    res = await test_client.post(
        f"/api/v1/episodes/{episode_id}/ai/asset-extraction/apply",
        headers=authenticated_user["headers"],
        json={"mode": "replace", "world_unity": data["world_unity"], "assets": data["assets"]},
    )
    assert res.status_code == 200
    stats = res.json()["data"]
    assert stats["assets_created"] == 2
    assert stats["bindings_created"] == 2

    res = await test_client.get(f"/api/v1/scripts/{script_id}/hierarchy", headers=authenticated_user["headers"])
    assert res.status_code == 200
    assets = res.json()["data"]["episodes"][0]["assets"]
    assert len(assets) == 2
    assert {a["name"] for a in assets} == {"萧炎", "玄重尺"}

    res = await test_client.post(
        f"/api/v1/episodes/{episode_id}/ai/asset-extraction/apply",
        headers=authenticated_user["headers"],
        json={"mode": "append", "world_unity": data["world_unity"], "assets": data["assets"]},
    )
    assert res.status_code == 200
    stats2 = res.json()["data"]
    assert stats2["assets_created"] == 0
    assert stats2["assets_reused"] >= 2


def test_parse_sse_lines_to_text_concatenates_deltas():
    import json

    from app.services.ai_asset_extraction_service import _parse_sse_lines_to_text

    lines = [
        "data: " + json.dumps({"id": "x", "choices": [{"delta": {"role": "assistant"}}]}),
        "data: " + json.dumps({"id": "x", "choices": [{"delta": {"content": "```json\n"}}]}),
        "data: " + json.dumps({"id": "x", "choices": [{"delta": {"content": '{"assets":[]}'}}]}),
        "data: " + json.dumps({"id": "x", "choices": [{"delta": {"content": "\n```"}}]}),
        "data: [DONE]",
    ]
    assert _parse_sse_lines_to_text(lines) == "```json\n{\"assets\":[]}\n```"
