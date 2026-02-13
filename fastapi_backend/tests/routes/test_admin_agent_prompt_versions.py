import pytest

from app.models import AIModelConfig


@pytest.mark.asyncio
async def test_admin_agent_prompt_versions_flow(test_client, authenticated_superuser, db_session):
    admin_headers = authenticated_superuser["headers"]

    cfg = AIModelConfig(
        category="text",
        manufacturer="mock",
        model="mock",
        base_url=None,
        encrypted_api_key=None,
        enabled=True,
        sort_order=0,
    )
    db_session.add(cfg)
    await db_session.commit()
    await db_session.refresh(cfg)

    create = await test_client.post(
        "/api/v1/agents/admin",
        headers=admin_headers,
        json={
            "name": "versioned-agent",
            "category": "text",
            "purpose": "general",
            "ai_model_config_id": str(cfg.id),
            "system_prompt": "sys-v0",
            "user_prompt_template": "{input}",
            "credits_per_call": 0,
            "enabled": True,
        },
    )
    assert create.status_code == 200
    agent_id = create.json()["data"]["id"]

    resp = await test_client.get(f"/api/v1/agents/admin/{agent_id}/prompt-versions", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["data"] == []

    resp = await test_client.post(
        f"/api/v1/agents/admin/{agent_id}/prompt-versions",
        headers=admin_headers,
        json={"system_prompt": "sys-v1", "user_prompt_template": "{input}", "description": "first", "meta": {}},
    )
    assert resp.status_code == 200
    v1 = resp.json()["data"]
    assert v1["version"] == 1
    assert v1["is_default"] is True

    resp = await test_client.post(
        f"/api/v1/agents/admin/{agent_id}/prompt-versions",
        headers=admin_headers,
        json={"system_prompt": "sys-v2", "user_prompt_template": "{input}", "description": "second", "meta": {"k": "v"}},
    )
    assert resp.status_code == 200
    v2 = resp.json()["data"]
    assert v2["version"] == 2
    assert v2["is_default"] is False

    resp = await test_client.put(
        f"/api/v1/agents/admin/{agent_id}/prompt-versions/2",
        headers=admin_headers,
        json={"system_prompt": "sys-v2-edit", "description": "second-edit"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["system_prompt"] == "sys-v2-edit"

    resp = await test_client.post(
        f"/api/v1/agents/admin/{agent_id}/prompt-versions/2/activate",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["is_default"] is True

    resp = await test_client.get(
        f"/api/v1/agents/admin/{agent_id}/prompt-versions/diff?from_version=1&to_version=2",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    diff = resp.json()["data"]["diff"]
    assert "system_prompt" in diff

    resp = await test_client.delete(f"/api/v1/agents/admin/{agent_id}/prompt-versions/2", headers=admin_headers)
    assert resp.status_code == 400

    resp = await test_client.delete(f"/api/v1/agents/admin/{agent_id}/prompt-versions/1", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["ok"] is True

