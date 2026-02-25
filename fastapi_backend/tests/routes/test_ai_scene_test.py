from types import SimpleNamespace

import pytest


@pytest.mark.asyncio
async def test_admin_ai_scene_test_options_forbidden(test_client, authenticated_user):
    res = await test_client.get("/api/v1/ai/admin/scene-test/options", headers=authenticated_user["headers"])
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_ai_scene_test_options_names_non_empty(test_client, authenticated_superuser):
    res = await test_client.get("/api/v1/ai/admin/scene-test/options", headers=authenticated_superuser["headers"])
    assert res.status_code == 200
    agents = res.json()["data"]["agents"]
    assert isinstance(agents, list)
    for a in agents:
        assert isinstance(a.get("name"), str)
        assert a["name"].strip() != ""


@pytest.mark.asyncio
async def test_admin_ai_scene_test_chat_ok(test_client, authenticated_superuser, monkeypatch):
    async def _fake_resolve_builtin_agent_version(*, db, agent_code, version):
        _ = (db,)
        return SimpleNamespace(system_prompt="你是测试agent", ai_model_config_id=None, model_settings={}, agent_code=agent_code, version=version)

    async def _fake_resolve_text_model_for_pydantic_ai(*, db, binding_key, ai_model_config_id):
        assert binding_key == "chatbox"
        return SimpleNamespace(model_name="gpt-4o-mini", base_url="https://example.com/v1", api_key="sk-test")

    class _DummyResult:
        def __init__(self, output):
            self.output = output

    class _DummyAgent:
        def __init__(self, **kwargs):
            _ = kwargs

        async def run(self, text, deps=None):
            _ = (text, deps)
            if deps is not None and getattr(deps, "trace_queue", None) is not None:
                await deps.trace_queue.put({"type": "tool_start", "tool_id": "preview_script_split"})
            return _DummyResult("ok")

    import pydantic_ai
    import pydantic_ai.models.openai
    import pydantic_ai.providers.openai

    monkeypatch.setattr(pydantic_ai, "Agent", _DummyAgent)
    monkeypatch.setattr(pydantic_ai.providers.openai, "OpenAIProvider", lambda *args, **kwargs: object())
    monkeypatch.setattr(pydantic_ai.models.openai, "OpenAIChatModel", lambda *args, **kwargs: object())
    monkeypatch.setattr("app.ai_scene_test.runner.resolve_builtin_agent_version", _fake_resolve_builtin_agent_version)
    monkeypatch.setattr("app.ai_scene_test.runner.resolve_text_model_for_pydantic_ai", _fake_resolve_text_model_for_pydantic_ai)

    res = await test_client.post(
        "/api/v1/ai/admin/scene-test/chat",
        headers=authenticated_superuser["headers"],
        json={
            "main_agent": {"agent_code": "script_expert", "version": 1},
            "sub_agents": [],
            "tool_ids": [],
            "script_text": "文本",
            "messages": [{"role": "user", "content": "请测试"}],
        },
    )
    assert res.status_code == 200
    assert res.json()["data"]["output_text"] == "ok"


@pytest.mark.asyncio
async def test_admin_ai_scene_test_chat_stream_ok(test_client, authenticated_superuser, monkeypatch):
    async def _fake_resolve_builtin_agent_version(*, db, agent_code, version):
        _ = (db,)
        return SimpleNamespace(system_prompt="你是测试agent", ai_model_config_id=None, model_settings={}, agent_code=agent_code, version=version)

    async def _fake_resolve_text_model_for_pydantic_ai(*, db, binding_key, ai_model_config_id):
        assert binding_key == "chatbox"
        _ = ai_model_config_id
        return SimpleNamespace(model_name="gpt-4o-mini", base_url="https://example.com/v1", api_key="sk-test")

    class _DummyResult:
        def __init__(self, output):
            self.output = output

    class _DummyAgent:
        def __init__(self, **kwargs):
            _ = kwargs

        async def run(self, text, deps=None):
            _ = (text, deps)
            if deps is not None and getattr(deps, "trace_queue", None) is not None:
                await deps.trace_queue.put({"type": "tool_start", "tool_id": "preview_script_split"})
            return _DummyResult("ok")

    import pydantic_ai
    import pydantic_ai.models.openai
    import pydantic_ai.providers.openai

    monkeypatch.setattr(pydantic_ai, "Agent", _DummyAgent)
    monkeypatch.setattr(pydantic_ai.providers.openai, "OpenAIProvider", lambda *args, **kwargs: object())
    monkeypatch.setattr(pydantic_ai.models.openai, "OpenAIChatModel", lambda *args, **kwargs: object())
    monkeypatch.setattr("app.ai_scene_test.runner.resolve_builtin_agent_version", _fake_resolve_builtin_agent_version)
    monkeypatch.setattr("app.ai_scene_test.runner.resolve_text_model_for_pydantic_ai", _fake_resolve_text_model_for_pydantic_ai)

    res = await test_client.post(
        "/api/v1/ai/admin/scene-test/chat/stream",
        headers=authenticated_superuser["headers"],
        json={
            "main_agent": {"agent_code": "script_expert", "version": 1},
            "sub_agents": [],
            "tool_ids": [],
            "script_text": "文本",
            "messages": [{"role": "user", "content": "请测试"}],
        },
    )
    assert res.status_code == 200
    body = res.text
    assert "data:" in body
    assert "tool_start" in body
    assert '"type": "delta"' in body or '"type":"delta"' in body
    assert '"type": "done"' in body or '"type":"done"' in body
