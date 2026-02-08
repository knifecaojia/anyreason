import pytest


@pytest.mark.asyncio
async def test_ai_prompt_presets_crud(test_client, authenticated_user):
    res = await test_client.get(
        "/api/v1/ai/prompt-presets?tool_key=episode_scene_structure",
        headers=authenticated_user["headers"],
    )
    assert res.status_code == 200
    assert res.json()["data"] == []

    res = await test_client.post(
        "/api/v1/ai/prompt-presets",
        headers=authenticated_user["headers"],
        json={
            "tool_key": "episode_scene_structure",
            "name": "默认提示词",
            "provider": "deepseek",
            "model": "deepseek",
            "prompt_template": "test",
            "is_default": True,
        },
    )
    assert res.status_code == 200
    preset_id = res.json()["data"]["id"]

    res = await test_client.get(
        "/api/v1/ai/prompt-presets?tool_key=episode_scene_structure",
        headers=authenticated_user["headers"],
    )
    assert res.status_code == 200
    assert len(res.json()["data"]) == 1
    assert res.json()["data"][0]["is_default"] is True

    res = await test_client.put(
        f"/api/v1/ai/prompt-presets/{preset_id}",
        headers=authenticated_user["headers"],
        json={"prompt_template": "updated", "is_default": True},
    )
    assert res.status_code == 200
    assert res.json()["data"]["prompt_template"] == "updated"

    res = await test_client.delete(
        f"/api/v1/ai/prompt-presets/{preset_id}",
        headers=authenticated_user["headers"],
    )
    assert res.status_code == 200
