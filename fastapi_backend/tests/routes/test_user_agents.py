import pytest


@pytest.mark.asyncio
async def test_user_agents_crud(test_client, authenticated_user):
    headers = authenticated_user["headers"]

    resp = await test_client.get("/api/v1/user-agents", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["data"] == []

    resp = await test_client.post(
        "/api/v1/user-agents",
        headers=headers,
        json={
            "name": "A1",
            "description": "D",
            "base_builtin_agent_id": None,
            "system_prompt": "P",
            "ai_model_config_id": None,
            "temperature": 0.3,
            "tools": ["t1"],
            "is_public": False,
        },
    )
    assert resp.status_code == 200
    created = resp.json()["data"]
    assert created["name"] == "A1"
    agent_id = created["id"]

    resp = await test_client.get(f"/api/v1/user-agents/{agent_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["id"] == agent_id

    resp = await test_client.put(
        f"/api/v1/user-agents/{agent_id}",
        headers=headers,
        json={"name": "A2", "tools": ["t1", "t2"]},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["name"] == "A2"
    assert resp.json()["data"]["tools"] == ["t1", "t2"]

    resp = await test_client.delete(f"/api/v1/user-agents/{agent_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["ok"] is True

