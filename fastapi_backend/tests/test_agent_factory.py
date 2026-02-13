import pytest

from app.models import BuiltinAgent, BuiltinAgentPromptVersion, BuiltinAgentUserOverride, User
from app.services.agent_factory import resolve_builtin_agent


@pytest.mark.asyncio
async def test_agent_factory_default_version(db_session, authenticated_user):
    user: User = authenticated_user["user"]

    agent = BuiltinAgent(agent_code="script_expert", name="剧本专家", category="script")
    db_session.add(agent)
    await db_session.flush()

    db_session.add(
        BuiltinAgentPromptVersion(
            builtin_agent_id=agent.id,
            version=1,
            system_prompt="v1",
            is_default=True,
            created_by=user.id,
            meta={},
        )
    )
    await db_session.commit()

    cfg = await resolve_builtin_agent(session=db_session, agent_code="script_expert", user_id=user.id)
    assert cfg.system_prompt == "v1"


@pytest.mark.asyncio
async def test_agent_factory_user_override(db_session, authenticated_user):
    user: User = authenticated_user["user"]

    agent = BuiltinAgent(agent_code="episode_expert", name="分集专家", category="episode")
    db_session.add(agent)
    await db_session.flush()

    db_session.add_all(
        [
            BuiltinAgentPromptVersion(
                builtin_agent_id=agent.id,
                version=1,
                system_prompt="v1",
                is_default=True,
                created_by=user.id,
                meta={},
            ),
            BuiltinAgentPromptVersion(
                builtin_agent_id=agent.id,
                version=2,
                system_prompt="v2",
                is_default=False,
                created_by=user.id,
                meta={},
            ),
        ]
    )
    await db_session.flush()
    db_session.add(BuiltinAgentUserOverride(builtin_agent_id=agent.id, user_id=user.id, version=2))
    await db_session.commit()

    cfg = await resolve_builtin_agent(session=db_session, agent_code="episode_expert", user_id=user.id)
    assert cfg.system_prompt == "v2"


@pytest.mark.asyncio
async def test_agent_factory_rollout_percentage(db_session, authenticated_user):
    user: User = authenticated_user["user"]

    agent = BuiltinAgent(agent_code="scene_expert", name="场景专家", category="scene")
    db_session.add(agent)
    await db_session.flush()

    db_session.add_all(
        [
            BuiltinAgentPromptVersion(
                builtin_agent_id=agent.id,
                version=1,
                system_prompt="v1",
                is_default=True,
                created_by=user.id,
                meta={},
            ),
            BuiltinAgentPromptVersion(
                builtin_agent_id=agent.id,
                version=2,
                system_prompt="v2",
                is_default=False,
                created_by=user.id,
                meta={"rollout": {"strategy": "percentage", "percent": 100, "salt": "x"}},
            ),
        ]
    )
    await db_session.commit()

    cfg = await resolve_builtin_agent(session=db_session, agent_code="scene_expert", user_id=user.id)
    assert cfg.system_prompt == "v2"

