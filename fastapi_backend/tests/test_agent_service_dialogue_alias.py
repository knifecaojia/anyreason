import pytest

from app.ai_gateway import ai_gateway_service
from app.models import Agent, AIModelConfig, User
from app.services.agent_service import agent_service


@pytest.mark.asyncio
async def test_run_dialogue_agent_delegates_to_run_text_agent(db_session, authenticated_user, monkeypatch):
    user: User = authenticated_user["user"]

    cfg = AIModelConfig(
        category="text",
        manufacturer="openai",
        model="gpt-test",
        encrypted_api_key=b"x",
    )
    db_session.add(cfg)
    await db_session.flush()

    agent = Agent(
        name="a",
        category="text",
        purpose="general",
        system_prompt="s",
        user_prompt_template="{{input}}",
        ai_model_config_id=cfg.id,
        credits_per_call=0,
        enabled=True,
    )
    db_session.add(agent)
    await db_session.commit()

    async def fake_chat_text(**_kwargs):
        return {"choices": [{"message": {"content": "ok"}}]}

    monkeypatch.setattr(ai_gateway_service, "chat_text", fake_chat_text)

    out, raw = await agent_service.run_dialogue_agent(
        db=db_session,
        user_id=user.id,
        agent_id=agent.id,
        input_text="hi",
        variables={},
    )
    assert out == "ok"
    assert raw["choices"][0]["message"]["content"] == "ok"
