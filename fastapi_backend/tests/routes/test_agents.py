from app.core.exceptions import AppError
from app.models import AIModelConfig
import app.services.agent_service as agent_service_module


async def test_agent_run_consumes_credits(test_client, authenticated_superuser, authenticated_user, db_session, monkeypatch):
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

    async def fake_chat_text(*, db, user_id, binding_key, model_config_id, messages, attachments, credits_cost):
        assert model_config_id == cfg.id
        assert messages and messages[-1]["role"] == "user"
        return {"choices": [{"message": {"content": "pong"}}]}

    monkeypatch.setattr(agent_service_module.ai_gateway_service, "chat_text", fake_chat_text)

    create = await test_client.post(
        "/api/v1/agents/admin",
        headers=authenticated_superuser["headers"],
        json={
            "name": "test-agent",
            "category": "text",
            "purpose": "general",
            "ai_model_config_id": str(cfg.id),
            "system_prompt": "sys",
            "user_prompt_template": "{input}",
            "credits_per_call": 3,
            "enabled": True,
        },
    )
    assert create.status_code == 200
    agent_id = create.json()["data"]["id"]

    before = await test_client.get("/api/v1/credits/my", headers=authenticated_user["headers"])
    assert before.status_code == 200
    bal_before = before.json()["data"]["balance"]

    run = await test_client.post(
        f"/api/v1/agents/{agent_id}/run",
        headers=authenticated_user["headers"],
        json={"input_text": "ping", "variables": {}},
    )
    assert run.status_code == 200
    assert run.json()["data"]["output_text"] == "pong"

    after = await test_client.get("/api/v1/credits/my", headers=authenticated_user["headers"])
    assert after.status_code == 200
    bal_after = after.json()["data"]["balance"]
    assert bal_after == bal_before - 3


async def test_agent_run_refunds_on_llm_error(test_client, authenticated_superuser, authenticated_user, db_session, monkeypatch):
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

    async def fake_chat_text_error(*, db, user_id, binding_key, model_config_id, messages, attachments, credits_cost):
        raise AppError(msg="rate limited", code=429, status_code=429, data={"retry_after": 2})

    monkeypatch.setattr(agent_service_module.ai_gateway_service, "chat_text", fake_chat_text_error)

    create = await test_client.post(
        "/api/v1/agents/admin",
        headers=authenticated_superuser["headers"],
        json={
            "name": "test-agent-2",
            "category": "text",
            "purpose": "general",
            "ai_model_config_id": str(cfg.id),
            "system_prompt": "sys",
            "user_prompt_template": "{input}",
            "credits_per_call": 2,
            "enabled": True,
        },
    )
    assert create.status_code == 200
    agent_id = create.json()["data"]["id"]

    before = await test_client.get("/api/v1/credits/my", headers=authenticated_user["headers"])
    assert before.status_code == 200
    bal_before = before.json()["data"]["balance"]

    run = await test_client.post(
        f"/api/v1/agents/{agent_id}/run",
        headers=authenticated_user["headers"],
        json={"input_text": "ping", "variables": {}},
    )
    assert run.status_code == 429

    after = await test_client.get("/api/v1/credits/my", headers=authenticated_user["headers"])
    assert after.status_code == 200
    bal_after = after.json()["data"]["balance"]
    assert bal_after == bal_before


async def test_list_agents_filters_by_capability(test_client, authenticated_superuser, authenticated_user, db_session):
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
    cfg_id = str(cfg.id)

    create_a = await test_client.post(
        "/api/v1/agents/admin",
        headers=authenticated_superuser["headers"],
        json={
            "name": "cap-a",
            "category": "text",
            "purpose": "storyboard_extraction",
            "ai_model_config_id": cfg_id,
            "capabilities": ["episode_storyboard"],
            "credits_per_call": 0,
            "enabled": True,
        },
    )
    assert create_a.status_code == 200
    create_b = await test_client.post(
        "/api/v1/agents/admin",
        headers=authenticated_superuser["headers"],
        json={
            "name": "cap-b",
            "category": "text",
            "purpose": "asset_extraction",
            "ai_model_config_id": cfg_id,
            "capabilities": ["episode_assets"],
            "credits_per_call": 0,
            "enabled": True,
        },
    )
    assert create_b.status_code == 200
    create_c = await test_client.post(
        "/api/v1/agents/admin",
        headers=authenticated_superuser["headers"],
        json={
            "name": "cap-c",
            "category": "text",
            "purpose": "storyboard_extraction",
            "ai_model_config_id": cfg_id,
            "capabilities": ["episode_storyboard"],
            "credits_per_call": 0,
            "enabled": False,
        },
    )
    assert create_c.status_code == 200

    res = await test_client.get("/api/v1/agents", headers=authenticated_user["headers"])
    assert res.status_code == 200
    names = [a["name"] for a in res.json()["data"]]
    assert "cap-a" in names and "cap-b" in names
    assert "cap-c" not in names

    res = await test_client.get("/api/v1/agents?capability=episode_storyboard", headers=authenticated_user["headers"])
    assert res.status_code == 200
    names = [a["name"] for a in res.json()["data"]]
    assert names == ["cap-a"]


async def test_list_agents_filters_by_purpose(test_client, authenticated_superuser, authenticated_user, db_session):
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
    cfg_id = str(cfg.id)

    create_a = await test_client.post(
        "/api/v1/agents/admin",
        headers=authenticated_superuser["headers"],
        json={
            "name": "purpose-a",
            "category": "text",
            "purpose": "storyboard_extraction",
            "ai_model_config_id": cfg_id,
            "credits_per_call": 0,
            "enabled": True,
        },
    )
    assert create_a.status_code == 200

    create_b = await test_client.post(
        "/api/v1/agents/admin",
        headers=authenticated_superuser["headers"],
        json={
            "name": "purpose-b",
            "category": "text",
            "purpose": "asset_extraction",
            "ai_model_config_id": cfg_id,
            "credits_per_call": 0,
            "enabled": True,
        },
    )
    assert create_b.status_code == 200

    res = await test_client.get("/api/v1/agents?purpose=storyboard_extraction", headers=authenticated_user["headers"])
    assert res.status_code == 200
    names = [a["name"] for a in res.json()["data"]]
    assert "purpose-a" in names
    assert "purpose-b" not in names
