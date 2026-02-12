import pytest


@pytest.mark.asyncio
async def test_ai_storyboard_preview_apply_and_delete(test_client, authenticated_user, monkeypatch):
    import app.services.ai_storyboard_service as svc_module

    async def _fake_chat_completions(*, db, user_id, model, messages, temperature, max_tokens):
        _ = db
        _ = user_id
        _ = model
        _ = messages
        _ = temperature
        _ = max_tokens
        content = """```json
{"shots":[
  {"shot_type":"全景","camera_angle":"平视","camera_move":"静止","description":"画面A","dialogue":"你好","dialogue_speaker":"甲","sound_effect":"风声","duration_estimate":3.5,"active_assets":["甲","斩仙台"]},
  {"shot_type":"特写","camera_angle":"俯视","camera_move":"推","description":"画面B","dialogue":"再见","dialogue_speaker":"乙","sound_effect":null,"duration_estimate":2.0,"active_assets":["乙"]}
]}
```"""
        return {"choices": [{"message": {"content": content}}]}

    monkeypatch.setattr(svc_module, "_chat_completions", _fake_chat_completions)

    script_text = "\n".join(["剧本正文", "EPISODE 1: 第一集", "SCENE 1: 场景一", "内容A"])
    res = await test_client.post(
        "/api/v1/scripts",
        headers=authenticated_user["headers"],
        files={"title": (None, "测试剧本"), "text": (None, script_text)},
    )
    assert res.status_code == 200
    script_id = res.json()["data"]["id"]

    res = await test_client.post(f"/api/v1/scripts/{script_id}/structure", headers=authenticated_user["headers"])
    assert res.status_code == 200
    res = await test_client.get(f"/api/v1/scripts/{script_id}/hierarchy", headers=authenticated_user["headers"])
    assert res.status_code == 200
    storyboard_id = res.json()["data"]["episodes"][0]["storyboards"][0]["id"]

    res = await test_client.post(
        f"/api/v1/storyboards/{storyboard_id}/ai/storyboard/prompt-preview",
        headers=authenticated_user["headers"],
        json={"model": "deepseek", "prompt_template": "test"},
    )
    assert res.status_code == 200
    assert "SCENE_SCRIPT" in res.json()["data"]["final_prompt"]

    res = await test_client.post(
        f"/api/v1/storyboards/{storyboard_id}/ai/storyboard/preview",
        headers=authenticated_user["headers"],
        json={"model": "deepseek", "prompt_template": "test"},
    )
    assert res.status_code == 200
    shots = res.json()["data"]["shots"]
    assert len(shots) == 2

    res = await test_client.post(
        f"/api/v1/storyboards/{storyboard_id}/ai/storyboard/apply",
        headers=authenticated_user["headers"],
        json={"mode": "replace", "shots": shots},
    )
    assert res.status_code == 200
    assert res.json()["data"]["created_count"] == 2
