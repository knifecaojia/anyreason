import pytest
from sqlalchemy.exc import IntegrityError

from app.models import (
    BuiltinAgent,
    BuiltinAgentPromptVersion,
    BuiltinAgentUserOverride,
    Scene,
    User,
)


@pytest.mark.asyncio
async def test_builtin_agent_prompt_version_unique_constraints(db_session, authenticated_user):
    user: User = authenticated_user["user"]
    user_id = user.id

    agent = BuiltinAgent(agent_code="script_expert", name="剧本专家", category="script")
    db_session.add(agent)
    await db_session.flush()
    agent_id = agent.id

    v1 = BuiltinAgentPromptVersion(
        builtin_agent_id=agent_id,
        version=1,
        system_prompt="v1",
        is_default=True,
        created_by=user_id,
    )
    db_session.add(v1)
    await db_session.commit()

    v1_dup = BuiltinAgentPromptVersion(
        builtin_agent_id=agent_id,
        version=1,
        system_prompt="v1 dup",
        is_default=False,
        created_by=user_id,
    )
    db_session.add(v1_dup)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()

    v2_default = BuiltinAgentPromptVersion(
        builtin_agent_id=agent_id,
        version=2,
        system_prompt="v2",
        is_default=True,
        created_by=user_id,
    )
    db_session.add(v2_default)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_builtin_agent_user_override_unique(db_session, authenticated_user):
    user: User = authenticated_user["user"]

    agent = BuiltinAgent(agent_code="episode_expert", name="分集专家", category="episode")
    db_session.add(agent)
    await db_session.flush()

    o1 = BuiltinAgentUserOverride(builtin_agent_id=agent.id, user_id=user.id, version=1)
    db_session.add(o1)
    await db_session.commit()

    o2 = BuiltinAgentUserOverride(builtin_agent_id=agent.id, user_id=user.id, version=2)
    db_session.add(o2)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_scene_code_unique(db_session):
    agent = BuiltinAgent(agent_code="scene_expert", name="场景专家", category="scene")
    db_session.add(agent)
    await db_session.flush()

    s1 = Scene(scene_code="script_split", name="剧本分集", type="process", builtin_agent_id=agent.id)
    db_session.add(s1)
    await db_session.commit()

    s2 = Scene(scene_code="script_split", name="剧本分集2", type="process", builtin_agent_id=agent.id)
    db_session.add(s2)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()
