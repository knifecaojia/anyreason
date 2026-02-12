from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models import Episode, FileNode, Project, User
from app.services.agent_service import agent_service
from app.tasks.handlers.episode_character_agent_apply import EpisodeCharacterAgentApplyHandler
from app.tasks.handlers.episode_prop_agent_apply import EpisodePropAgentApplyHandler
from app.tasks.handlers.episode_scene_agent_apply import EpisodeSceneAgentApplyHandler
from app.tasks.handlers.episode_vfx_agent_apply import EpisodeVfxAgentApplyHandler


class _DummyReporter:
    def __init__(self) -> None:
        self.progress_updates: list[int] = []

    async def progress(self, *, progress: int, payload=None) -> None:
        _ = payload
        self.progress_updates.append(int(progress))

    async def log(self, *, message: str, level: str = "info", payload=None) -> None:
        _ = (message, level, payload)


async def _seed_episode(db_session):
    user_id = uuid4()
    db_session.add(
        User(
            id=user_id,
            email=f"asset-split-{str(user_id)[:8]}@example.com",
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
    return user_id, ep


@pytest.mark.asyncio(loop_scope="function")
async def test_episode_scene_agent_apply_writes_scene_files(db_session, monkeypatch):
    user_id, ep = await _seed_episode(db_session)

    async def _fake_run_dialogue_agent(*, db, user_id, agent_id, input_text, variables=None):
        _ = (db, user_id, agent_id, input_text, variables)
        md = "\n".join(["# 场景A", "描述A", "---", "# 场景B", "描述B"])
        return md, {"raw": True}

    monkeypatch.setattr(agent_service, "run_dialogue_agent", _fake_run_dialogue_agent)

    handler = EpisodeSceneAgentApplyHandler()
    reporter = _DummyReporter()
    task = SimpleNamespace(user_id=user_id, input_json={"episode_id": str(ep.id), "agent_id": str(uuid4())})
    out = await handler.run(db=db_session, task=task, reporter=reporter)
    assert out["doc_count"] == 2

    await db_session.refresh(ep)
    assert ep.asset_root_node_id is not None

    res = await db_session.execute(select(FileNode).where(FileNode.parent_id == ep.asset_root_node_id, FileNode.is_folder.is_(True)))
    folders = {f.name: f for f in res.scalars().all()}
    assert "场景" in folders

    res = await db_session.execute(select(FileNode).where(FileNode.parent_id == folders["场景"].id, FileNode.is_folder.is_(False)))
    assert len(list(res.scalars().all())) == 2


@pytest.mark.asyncio(loop_scope="function")
async def test_episode_prop_agent_apply_writes_prop_files(db_session, monkeypatch):
    user_id, ep = await _seed_episode(db_session)

    async def _fake_run_dialogue_agent(*, db, user_id, agent_id, input_text, variables=None):
        _ = (db, user_id, agent_id, input_text, variables)
        md = "\n".join(["# 长剑", "描述A", "---", "# 盾牌", "描述B"])
        return md, {"raw": True}

    monkeypatch.setattr(agent_service, "run_dialogue_agent", _fake_run_dialogue_agent)

    handler = EpisodePropAgentApplyHandler()
    reporter = _DummyReporter()
    task = SimpleNamespace(user_id=user_id, input_json={"episode_id": str(ep.id), "agent_id": str(uuid4())})
    out = await handler.run(db=db_session, task=task, reporter=reporter)
    assert out["doc_count"] == 2

    await db_session.refresh(ep)
    res = await db_session.execute(select(FileNode).where(FileNode.parent_id == ep.asset_root_node_id, FileNode.is_folder.is_(True)))
    folders = {f.name: f for f in res.scalars().all()}
    assert "道具" in folders

    res = await db_session.execute(select(FileNode).where(FileNode.parent_id == folders["道具"].id, FileNode.is_folder.is_(False)))
    assert len(list(res.scalars().all())) == 2


@pytest.mark.asyncio(loop_scope="function")
async def test_episode_vfx_agent_apply_writes_vfx_files(db_session, monkeypatch):
    user_id, ep = await _seed_episode(db_session)

    async def _fake_run_dialogue_agent(*, db, user_id, agent_id, input_text, variables=None):
        _ = (db, user_id, agent_id, input_text, variables)
        md = "\n".join(["# 爆炸烟雾", "描述A", "---", "# 闪电击中", "描述B"])
        return md, {"raw": True}

    monkeypatch.setattr(agent_service, "run_dialogue_agent", _fake_run_dialogue_agent)

    handler = EpisodeVfxAgentApplyHandler()
    reporter = _DummyReporter()
    task = SimpleNamespace(user_id=user_id, input_json={"episode_id": str(ep.id), "agent_id": str(uuid4())})
    out = await handler.run(db=db_session, task=task, reporter=reporter)
    assert out["doc_count"] == 2

    await db_session.refresh(ep)
    res = await db_session.execute(select(FileNode).where(FileNode.parent_id == ep.asset_root_node_id, FileNode.is_folder.is_(True)))
    folders = {f.name: f for f in res.scalars().all()}
    assert "特效" in folders

    res = await db_session.execute(select(FileNode).where(FileNode.parent_id == folders["特效"].id, FileNode.is_folder.is_(False)))
    assert len(list(res.scalars().all())) == 2


@pytest.mark.asyncio(loop_scope="function")
async def test_episode_character_agent_apply_creates_character_folders(db_session, monkeypatch):
    user_id, ep = await _seed_episode(db_session)

    async def _fake_run_dialogue_agent(*, db, user_id, agent_id, input_text, variables=None):
        _ = (db, user_id, agent_id, input_text, variables)
        md = "\n".join(["# 主角A/默认", "描述A", "---", "# 主角A/战斗装", "描述B"])
        return md, {"raw": True}

    monkeypatch.setattr(agent_service, "run_dialogue_agent", _fake_run_dialogue_agent)

    handler = EpisodeCharacterAgentApplyHandler()
    reporter = _DummyReporter()
    task = SimpleNamespace(user_id=user_id, input_json={"episode_id": str(ep.id), "agent_id": str(uuid4())})
    out = await handler.run(db=db_session, task=task, reporter=reporter)
    assert out["doc_count"] == 2

    await db_session.refresh(ep)
    res = await db_session.execute(select(FileNode).where(FileNode.parent_id == ep.asset_root_node_id, FileNode.is_folder.is_(True)))
    folders = {f.name: f for f in res.scalars().all()}
    assert "角色" in folders

    res = await db_session.execute(select(FileNode).where(FileNode.parent_id == folders["角色"].id, FileNode.is_folder.is_(True)))
    role_folders = {f.name: f for f in res.scalars().all()}
    assert "主角A" in role_folders

    res = await db_session.execute(select(FileNode).where(FileNode.parent_id == role_folders["主角A"].id, FileNode.is_folder.is_(False)))
    assert len(list(res.scalars().all())) == 2

