from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models import Episode, FileNode, Project, User
from app.services.agent_service import agent_service
from app.tasks.handlers.episode_asset_agent_apply import EpisodeAssetAgentApplyHandler


class _DummyReporter:
    def __init__(self) -> None:
        self.progress_updates: list[int] = []

    async def progress(self, *, progress: int, payload=None) -> None:
        _ = payload
        self.progress_updates.append(int(progress))

    async def log(self, *, message: str, level: str = "info", payload=None) -> None:
        _ = (message, level, payload)


@pytest.mark.asyncio(loop_scope="function")
async def test_episode_asset_agent_apply_ok(db_session, monkeypatch):
    user_id = uuid4()
    db_session.add(
        User(
            id=user_id,
            email="asset@example.com",
            hashed_password="x",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
    )
    project_id = uuid4()
    db_session.add(Project(id=project_id, owner_id=user_id, name="p"))
    ep = Episode(project_id=project_id, episode_code="EP001", episode_number=1, script_full_text="剧本内容")
    db_session.add(ep)
    await db_session.commit()
    await db_session.refresh(ep)

    async def _fake_run_dialogue_agent(*, db, user_id, agent_id, input_text, variables=None):
        _ = (db, user_id, agent_id, input_text, variables)
        md = "\n".join(["# 角色/主角A", "描述A", "---", "# 道具/长剑", "描述B"])
        return md, {"raw": True}

    monkeypatch.setattr(agent_service, "run_dialogue_agent", _fake_run_dialogue_agent)

    handler = EpisodeAssetAgentApplyHandler()
    reporter = _DummyReporter()
    task = SimpleNamespace(user_id=user_id, input_json={"episode_id": str(ep.id), "agent_id": str(uuid4())})
    out = await handler.run(db=db_session, task=task, reporter=reporter)
    assert out["doc_count"] == 2

    await db_session.refresh(ep)
    assert ep.asset_root_node_id is not None

    res = await db_session.execute(select(FileNode).where(FileNode.parent_id == ep.asset_root_node_id, FileNode.is_folder.is_(True)))
    folders = {f.name: f for f in res.scalars().all()}
    assert set(folders.keys()) == {"角色", "道具"}

    res = await db_session.execute(select(FileNode).where(FileNode.parent_id == folders["角色"].id, FileNode.is_folder.is_(False)))
    assert len(list(res.scalars().all())) == 1


@pytest.mark.asyncio(loop_scope="function")
async def test_episode_asset_agent_apply_requires_category_heading(db_session, monkeypatch):
    user_id = uuid4()
    db_session.add(
        User(
            id=user_id,
            email="asset2@example.com",
            hashed_password="x",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
    )
    project_id = uuid4()
    db_session.add(Project(id=project_id, owner_id=user_id, name="p"))
    ep = Episode(project_id=project_id, episode_code="EP001", episode_number=1, script_full_text="剧本内容")
    db_session.add(ep)
    await db_session.commit()
    await db_session.refresh(ep)

    async def _fake_run_dialogue_agent(*, db, user_id, agent_id, input_text, variables=None):
        _ = (db, user_id, agent_id, input_text, variables)
        return "# 主角A\n描述", {"raw": True}

    monkeypatch.setattr(agent_service, "run_dialogue_agent", _fake_run_dialogue_agent)

    handler = EpisodeAssetAgentApplyHandler()
    reporter = _DummyReporter()
    task = SimpleNamespace(user_id=user_id, input_json={"episode_id": str(ep.id), "agent_id": str(uuid4())})
    with pytest.raises(ValueError):
        await handler.run(db=db_session, task=task, reporter=reporter)
