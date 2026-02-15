import pytest


@pytest.mark.asyncio
async def test_ai_scene_runner_requires_auth(test_client):
    res = await test_client.post("/api/v1/ai/scenes/any/chat/stream", json={})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_ai_scene_runner_scene_not_found(test_client, authenticated_user):
    res = await test_client.post(
        "/api/v1/ai/scenes/not_exists/chat/stream",
        json={"script_text": "x", "messages": [{"role": "user", "content": "hi"}]},
        headers=authenticated_user["headers"],
    )
    assert res.status_code == 404

