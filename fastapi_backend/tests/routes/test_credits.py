from sqlalchemy import select

from app.config import settings
from app.core.exceptions import AppError
from app.models import AIModelConfig, UserCreditAccount
import app.services.agent_service as agent_service_module


async def _create_text_agent(test_client, authenticated_superuser, cfg_id: str, *, name: str, credits_per_call: int) -> str:
    create = await test_client.post(
        "/api/v1/agents/admin",
        headers=authenticated_superuser["headers"],
        json={
            "name": name,
            "category": "text",
            "purpose": "general",
            "ai_model_config_id": cfg_id,
            "system_prompt": "sys",
            "user_prompt_template": "{input}",
            "credits_per_call": credits_per_call,
            "enabled": True,
        },
    )
    assert create.status_code == 200
    return create.json()["data"]["id"]


async def _create_model_config(db_session) -> AIModelConfig:
    cfg = AIModelConfig(
        category="text",
        manufacturer="mock-manufacturer",
        model="mock-model",
        base_url=None,
        encrypted_api_key=None,
        enabled=True,
        sort_order=0,
    )
    db_session.add(cfg)
    await db_session.commit()
    await db_session.refresh(cfg)
    return cfg


async def test_my_credits_returns_balance(test_client, authenticated_user, db_session):
    user_id = authenticated_user["user"].id
    acc = (await db_session.execute(select(UserCreditAccount).where(UserCreditAccount.user_id == user_id))).scalars().first()
    assert acc is not None
    resp = await test_client.get("/api/v1/credits/my", headers=authenticated_user["headers"])
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["balance"] == settings.DEFAULT_INITIAL_CREDITS


async def test_admin_adjust_user_credits(test_client, authenticated_superuser, authenticated_user):
    user_id = str(authenticated_user["user"].id)
    resp = await test_client.post(
        f"/api/v1/credits/admin/users/{user_id}/adjust",
        headers=authenticated_superuser["headers"],
        json={"delta": 25, "reason": "admin.adjust"},
    )
    assert resp.status_code == 200
    acc = resp.json()["data"]
    assert acc["balance"] == settings.DEFAULT_INITIAL_CREDITS + 25

    resp2 = await test_client.get(
        f"/api/v1/credits/admin/users/{user_id}?limit=5",
        headers=authenticated_superuser["headers"],
    )
    assert resp2.status_code == 200
    payload = resp2.json()["data"]
    assert payload["account"]["balance"] == settings.DEFAULT_INITIAL_CREDITS + 25
    assert len(payload["transactions"]) >= 2


async def test_my_transactions_returns_enriched_agent_trace_fields(
    test_client,
    authenticated_superuser,
    authenticated_user,
    db_session,
    monkeypatch,
):
    cfg = await _create_model_config(db_session)

    async def fake_chat_text(*, db, user_id, binding_key, model_config_id, messages, attachments, credits_cost):
        assert model_config_id == cfg.id
        return {"choices": [{"message": {"content": "pong"}}]}

    monkeypatch.setattr(agent_service_module.ai_gateway_service, "chat_text", fake_chat_text)
    agent_id = await _create_text_agent(
        test_client,
        authenticated_superuser,
        str(cfg.id),
        name="traceable-agent",
        credits_per_call=3,
    )

    run = await test_client.post(
        f"/api/v1/agents/{agent_id}/run",
        headers=authenticated_user["headers"],
        json={"input_text": "ping", "variables": {}},
    )
    assert run.status_code == 200

    resp = await test_client.get("/api/v1/credits/my/transactions?limit=5", headers=authenticated_user["headers"])
    assert resp.status_code == 200
    transactions = resp.json()["data"]
    consume = next(tx for tx in transactions if tx["reason"] == "agent.consume")

    assert consume["trace_type"] == "agent"
    assert consume["operation_display"] == "智能体: traceable-agent"
    assert consume["is_refund"] is False
    assert consume["linked_event_id"] is not None
    assert consume["category"] is None
    assert consume["model_display"] is None
    assert consume["meta"]["agent_name"] == "traceable-agent"
    assert consume["meta"]["refunded"] is False


async def test_admin_user_history_exposes_refund_traceability_and_linkage(
    test_client,
    authenticated_superuser,
    authenticated_user,
    db_session,
    monkeypatch,
):
    cfg = await _create_model_config(db_session)

    async def fake_chat_text_error(*, db, user_id, binding_key, model_config_id, messages, attachments, credits_cost):
        raise AppError(msg="rate limited", code=429, status_code=429, data={"retry_after": 2})

    monkeypatch.setattr(agent_service_module.ai_gateway_service, "chat_text", fake_chat_text_error)
    agent_id = await _create_text_agent(
        test_client,
        authenticated_superuser,
        str(cfg.id),
        name="refund-agent",
        credits_per_call=2,
    )

    run = await test_client.post(
        f"/api/v1/agents/{agent_id}/run",
        headers=authenticated_user["headers"],
        json={"input_text": "ping", "variables": {}},
    )
    assert run.status_code == 429

    user_id = str(authenticated_user["user"].id)
    resp = await test_client.get(
        f"/api/v1/credits/admin/users/{user_id}?limit=10",
        headers=authenticated_superuser["headers"],
    )
    assert resp.status_code == 200
    transactions = resp.json()["data"]["transactions"]

    refund = next(tx for tx in transactions if tx["reason"] == "agent.refund")
    consume = next(tx for tx in transactions if tx["reason"] == "agent.consume")

    assert refund["trace_type"] == "agent"
    assert refund["operation_display"] == "智能体: refund-agent"
    assert refund["is_refund"] is True
    assert refund["linked_event_id"] is not None
    assert refund["linked_event_id"] == consume["linked_event_id"]
    assert refund["meta"]["refunded"] is True
    assert refund["meta"]["original_transaction_id"] == str(consume["id"])
    assert refund["meta"]["original_delta"] == -2
    assert refund["meta"]["error_code"] == "app_error"
    assert refund["meta"]["agent_name"] == "refund-agent"

    assert consume["is_refund"] is False
    assert consume["meta"]["refunded"] is False


async def test_admin_user_history_returns_admin_enriched_fields(
    test_client,
    authenticated_superuser,
    authenticated_user,
):
    user_id = str(authenticated_user["user"].id)
    adjust = await test_client.post(
        f"/api/v1/credits/admin/users/{user_id}/adjust",
        headers=authenticated_superuser["headers"],
        json={"delta": 7, "reason": "admin.adjust", "notes": "manual correction"},
    )
    assert adjust.status_code == 200

    resp = await test_client.get(
        f"/api/v1/credits/admin/users/{user_id}?limit=5",
        headers=authenticated_superuser["headers"],
    )
    assert resp.status_code == 200
    transactions = resp.json()["data"]["transactions"]
    admin_tx = next(tx for tx in transactions if tx["reason"] == "admin.adjust")

    assert admin_tx["trace_type"] == "admin"
    assert admin_tx["operation_display"] == "管理员调整"
    assert admin_tx["is_refund"] is False
    assert admin_tx["linked_event_id"] is None
    assert admin_tx["category"] is None
    assert admin_tx["model_display"] is None
    assert admin_tx["meta"]["trace_type"] == "admin"
    assert admin_tx["meta"]["notes"] == "manual correction"
