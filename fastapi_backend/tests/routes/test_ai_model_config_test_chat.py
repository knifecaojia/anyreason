import pytest

from uuid import uuid4


@pytest.mark.asyncio
async def test_admin_model_config_test_chat_forbidden(test_client, authenticated_user):
    res = await test_client.post(
        f"/api/v1/ai/admin/model-configs/{uuid4()}/test-chat",
        headers=authenticated_user["headers"],
        json={"messages": [{"role": "user", "content": "ping"}]},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_model_config_test_chat_ok(test_client, authenticated_superuser, monkeypatch):
    class _DummyProvider:
        async def chat_completions(self, *, cfg, messages, timeout_seconds):
            _ = (cfg, messages, timeout_seconds)
            return {"choices": [{"message": {"content": "pong"}}]}

    from app.ai_gateway.factory import provider_factory

    monkeypatch.setattr(provider_factory, "get_text_provider", lambda *, manufacturer: _DummyProvider())

    res = await test_client.post(
        "/api/v1/ai/admin/model-configs",
        headers=authenticated_superuser["headers"],
        json={
            "category": "text",
            "manufacturer": "openai",
            "model": "gpt-4o-mini",
            "base_url": "https://api.openai.com/v1",
            "api_key": "sk-test",
            "enabled": True,
            "sort_order": 0,
        },
    )
    assert res.status_code == 200
    model_config_id = res.json()["data"]["id"]

    res = await test_client.post(
        f"/api/v1/ai/admin/model-configs/{model_config_id}/test-chat",
        headers=authenticated_superuser["headers"],
        json={"messages": [{"role": "user", "content": "ping"}]},
    )
    assert res.status_code == 200
    assert res.json()["data"]["output_text"] == "pong"


@pytest.mark.asyncio
async def test_admin_model_config_test_chat_stream_ok(test_client, authenticated_superuser, monkeypatch):
    class _DummyProvider:
        async def chat_completions_stream(self, *, cfg, messages, timeout_seconds):
            _ = (cfg, messages, timeout_seconds)
            yield "po"
            yield "ng"

    from app.ai_gateway.factory import provider_factory

    monkeypatch.setattr(provider_factory, "get_text_provider", lambda *, manufacturer: _DummyProvider())

    res = await test_client.post(
        "/api/v1/ai/admin/model-configs",
        headers=authenticated_superuser["headers"],
        json={
            "category": "text",
            "manufacturer": "openai",
            "model": "gpt-4o-mini",
            "base_url": "https://api.openai.com/v1",
            "api_key": "sk-test",
            "enabled": True,
            "sort_order": 0,
        },
    )
    assert res.status_code == 200
    model_config_id = res.json()["data"]["id"]

    res = await test_client.post(
        f"/api/v1/ai/admin/model-configs/{model_config_id}/test-chat/stream",
        headers=authenticated_superuser["headers"],
        json={"messages": [{"role": "user", "content": "ping"}]},
    )
    assert res.status_code == 200
    body = res.text
    assert '"type": "delta"' in body
    assert '"type": "done"' in body
    assert "po" in body
    assert "ng" in body


@pytest.mark.asyncio
async def test_admin_model_config_test_chat_missing_api_key(test_client, authenticated_superuser):
    res = await test_client.post(
        "/api/v1/ai/admin/model-configs",
        headers=authenticated_superuser["headers"],
        json={
            "category": "text",
            "manufacturer": "openai",
            "model": "gpt-4o-mini",
            "base_url": "https://api.openai.com/v1",
            "api_key": None,
            "enabled": True,
            "sort_order": 0,
        },
    )
    assert res.status_code == 200
    model_config_id = res.json()["data"]["id"]

    res = await test_client.post(
        f"/api/v1/ai/admin/model-configs/{model_config_id}/test-chat",
        headers=authenticated_superuser["headers"],
        json={"messages": [{"role": "user", "content": "ping"}]},
    )
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_admin_model_config_test_chat_qwen_uses_openai_compatible_provider(test_client, authenticated_superuser, monkeypatch):
    class _DummyProvider:
        async def chat_completions(self, *, cfg, messages, timeout_seconds):
            _ = (cfg, messages, timeout_seconds)
            return {"choices": [{"message": {"content": f"ok:{cfg.model}"}}]}

    from app.ai_gateway.factory import provider_factory

    monkeypatch.setattr(provider_factory, "get_text_provider", lambda *, manufacturer: _DummyProvider())

    res = await test_client.post(
        "/api/v1/ai/admin/model-configs",
        headers=authenticated_superuser["headers"],
        json={
            "category": "text",
            "manufacturer": "qwen",
            "model": "qwen-plus",
            "base_url": "https://example.com/v1",
            "api_key": "sk-test",
            "enabled": True,
            "sort_order": 0,
        },
    )
    assert res.status_code == 200
    model_config_id = res.json()["data"]["id"]

    res = await test_client.post(
        f"/api/v1/ai/admin/model-configs/{model_config_id}/test-chat",
        headers=authenticated_superuser["headers"],
        json={"messages": [{"role": "user", "content": "ping"}]},
    )
    assert res.status_code == 200
    assert res.json()["data"]["output_text"] == "ok:qwen-plus"


@pytest.mark.asyncio
async def test_admin_model_config_test_chat_qwen_requires_base_url(test_client, authenticated_superuser):
    res = await test_client.post(
        "/api/v1/ai/admin/model-configs",
        headers=authenticated_superuser["headers"],
        json={
            "category": "text",
            "manufacturer": "qwen",
            "model": "qwen-plus",
            "base_url": "",
            "api_key": "sk-test",
            "enabled": True,
            "sort_order": 0,
        },
    )
    assert res.status_code == 200
    model_config_id = res.json()["data"]["id"]

    res = await test_client.post(
        f"/api/v1/ai/admin/model-configs/{model_config_id}/test-chat",
        headers=authenticated_superuser["headers"],
        json={"messages": [{"role": "user", "content": "ping"}]},
    )
    assert res.status_code == 400
