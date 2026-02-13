import pytest

from app.models import AIModelConfig, BuiltinAgent, BuiltinAgentPromptVersion


@pytest.mark.asyncio
async def test_admin_builtin_agent_versions_flow(test_client, db_session, authenticated_superuser):
    admin_headers = authenticated_superuser["headers"]
    admin_user = authenticated_superuser["user"]

    agent = BuiltinAgent(agent_code="script_expert", name="剧本专家", category="script")
    db_session.add(agent)
    await db_session.flush()
    db_session.add(
        BuiltinAgentPromptVersion(
            builtin_agent_id=agent.id,
            version=1,
            system_prompt="v1",
            is_default=True,
            created_by=admin_user.id,
            meta={},
        )
    )
    await db_session.commit()

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

    resp = await test_client.get("/api/v1/admin/builtin-agents", headers=admin_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert any(a["agent_code"] == "script_expert" for a in body["data"])

    resp = await test_client.put(
        "/api/v1/admin/builtin-agents/script_expert",
        headers=admin_headers,
        json={"default_ai_model_config_id": str(cfg.id)},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["default_ai_model_config_id"] == str(cfg.id)

    resp = await test_client.post(
        "/api/v1/admin/builtin-agents/script_expert/versions",
        headers=admin_headers,
        json={"system_prompt": "v2", "ai_model_config_id": str(cfg.id), "description": "x", "meta": {}},
    )
    assert resp.status_code == 200
    created = resp.json()["data"]
    assert created["version"] == 2
    assert created["ai_model_config_id"] == str(cfg.id)

    resp = await test_client.put(
        "/api/v1/admin/builtin-agents/script_expert/versions/2",
        headers=admin_headers,
        json={"system_prompt": "v2-edit", "ai_model_config_id": None, "description": "y", "meta": {"k": "v"}},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["system_prompt"] == "v2-edit"
    assert resp.json()["data"]["ai_model_config_id"] is None

    resp = await test_client.post(
        "/api/v1/admin/builtin-agents/script_expert/versions/2/activate",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["is_default"] is True

    resp = await test_client.get(
        "/api/v1/admin/builtin-agents/script_expert/versions/diff?from_version=1&to_version=2",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    diff = resp.json()["data"]["diff"]
    assert "v1" in diff or "v2-edit" in diff

    resp = await test_client.post(
        "/api/v1/admin/builtin-agents/script_expert/versions",
        headers=admin_headers,
        json={"system_prompt": "v3", "description": "z", "meta": {}},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["version"] == 3

    resp = await test_client.delete(
        "/api/v1/admin/builtin-agents/script_expert/versions/3",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["ok"] is True

    resp = await test_client.delete(
        "/api/v1/admin/builtin-agents/script_expert/versions/2",
        headers=admin_headers,
    )
    assert resp.status_code == 400

    resp = await test_client.delete(
        "/api/v1/admin/builtin-agents/script_expert/versions/1",
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["ok"] is True
