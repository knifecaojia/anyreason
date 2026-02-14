from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models import Episode, FileNode, Project, User
from app.tasks.handlers.episode_doc_backfill import EpisodeDocBackfillHandler
from app.vfs_layout import EPISODES_FOLDER_NAME


class _DummyReporter:
    def __init__(self) -> None:
        self.progress_updates: list[int] = []

    async def progress(self, *, progress: int, payload=None) -> None:
        _ = payload
        self.progress_updates.append(int(progress))

    async def log(self, *, message: str, level: str = "info", payload=None) -> None:
        _ = (message, level, payload)


@pytest.mark.asyncio(loop_scope="function")
async def test_episode_doc_backfill_writes_docs(db_session):
    user_id = uuid4()
    db_session.add(
        User(
            id=user_id,
            email="epdoc@example.com",
            hashed_password="x",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
    )
    project_id = uuid4()
    db_session.add(Project(id=project_id, owner_id=user_id, name="p"))
    ep1 = Episode(project_id=project_id, episode_code="EP001", episode_number=1, title="开场", script_full_text="内容A")
    ep2 = Episode(project_id=project_id, episode_code="EP002", episode_number=2, title="继续", script_full_text="内容B")
    db_session.add_all([ep1, ep2])
    await db_session.commit()
    await db_session.refresh(ep1)
    await db_session.refresh(ep2)

    handler = EpisodeDocBackfillHandler()
    reporter = _DummyReporter()
    task = SimpleNamespace(user_id=user_id, input_json={"project_id": str(project_id)})
    out = await handler.run(db=db_session, task=task, reporter=reporter)
    assert out["created"] == 2
    assert out["failed"] == 0

    await db_session.refresh(ep1)
    await db_session.refresh(ep2)
    assert ep1.episode_doc_node_id is not None
    assert ep2.episode_doc_node_id is not None

    res = await db_session.execute(
        select(FileNode).where(
            FileNode.project_id == project_id,
            FileNode.parent_id.is_(None),
            FileNode.is_folder.is_(True),
            FileNode.name == EPISODES_FOLDER_NAME,
        )
    )
    root = res.scalars().first()
    assert root is not None

    res = await db_session.execute(select(FileNode).where(FileNode.parent_id == root.id, FileNode.is_folder.is_(False)))
    files = list(res.scalars().all())
    assert len(files) == 2
