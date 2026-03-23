import pytest


@pytest.mark.asyncio
async def test_ai_scene_structure_preview_and_apply(test_client, authenticated_user, mock_minio, monkeypatch):

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
