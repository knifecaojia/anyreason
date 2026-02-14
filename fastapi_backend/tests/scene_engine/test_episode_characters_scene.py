from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models import Episode, Project, User
from app.scene_engine.scenes.episode_characters import EpisodeCharacterExtractInput, run_episode_characters


@pytest.mark.asyncio(loop_scope="function")
async def test_episode_characters_scene_ok(db_session, monkeypatch):
    user_id = uuid4()
    db_session.add(
        User(
            id=user_id,
            email="scene@example.com",
            hashed_password="x",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
    )
    project_id = uuid4()
    db_session.add(Project(id=project_id, owner_id=user_id, name="p"))
    ep = Episode(project_id=project_id, episode_code="EP001", episode_number=1, script_full_text="角色A说话。角色B出现。")
    db_session.add(ep)
    await db_session.commit()
    await db_session.refresh(ep)

    async def _fake_resolve_builtin_agent(*, session, agent_code, user_id):
        _ = (session, agent_code, user_id)
        return SimpleNamespace(system_prompt="你是角色专家", ai_model_config_id=uuid4(), model_settings={}, tools=[])

    async def _fake_resolve_text_model_for_pydantic_ai(*, db, binding_key, ai_model_config_id):
        _ = (db, binding_key, ai_model_config_id)
        return SimpleNamespace(model_name="qwen-max", base_url="https://example.com/v1", api_key="sk-test")

    class _DummyResult:
        def __init__(self, output):
            self.output = output

    class _DummyAgent:
        def __init__(self, **kwargs):
            _ = kwargs

        async def run(self, text, deps=None):
            _ = (text, deps)
            output = SimpleNamespace(
                characters=[
                    {
                        "name": "角色A",
                        "description": None,
                        "keywords": [],
                        "first_appearance_episode": 1,
                        "meta": {},
                    }
                ]
            )
            return _DummyResult(output)

    import pydantic_ai
    import pydantic_ai.models.openai
    import pydantic_ai.providers.openai

    monkeypatch.setattr(pydantic_ai, "Agent", _DummyAgent)
    monkeypatch.setattr(pydantic_ai.providers.openai, "OpenAIProvider", lambda *args, **kwargs: object())
    monkeypatch.setattr(pydantic_ai.models.openai, "OpenAIChatModel", lambda *args, **kwargs: object())
    monkeypatch.setattr("app.scene_engine.scenes.episode_characters.resolve_builtin_agent", _fake_resolve_builtin_agent)
    monkeypatch.setattr("app.scene_engine.scenes.episode_characters.resolve_text_model_for_pydantic_ai", _fake_resolve_text_model_for_pydantic_ai)

    out = await run_episode_characters(
        db=db_session,
        user_id=user_id,
        payload=EpisodeCharacterExtractInput(episode_id=ep.id),
    )
    assert str(out.episode_id) == str(ep.id)
    assert len(out.characters) == 1
    assert out.characters[0].name == "角色A"
