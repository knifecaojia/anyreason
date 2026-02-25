import pytest
from sqlalchemy import func, select

from app.models import BuiltinAgent, BuiltinAgentPromptVersion, Scene
from app.services.agent_platform_seed_service import seed_agent_platform_assets


@pytest.mark.asyncio
async def test_seed_agent_platform_assets(db_session):
    await seed_agent_platform_assets(session=db_session)
    await db_session.commit()

    builtin_agents_count = (
        await db_session.execute(select(func.count()).select_from(BuiltinAgent))
    ).scalar_one()
    prompt_versions_count = (
        await db_session.execute(select(func.count()).select_from(BuiltinAgentPromptVersion))
    ).scalar_one()
    scenes_count = (
        await db_session.execute(select(func.count()).select_from(Scene))
    ).scalar_one()

    assert builtin_agents_count == 9
    assert prompt_versions_count == 9
    assert scenes_count == 6

