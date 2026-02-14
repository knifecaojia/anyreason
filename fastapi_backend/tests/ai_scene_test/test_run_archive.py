from __future__ import annotations

from uuid import uuid4

import pytest

from app.models import Project, User
from app.services.ai_run_archive_service import archive_ai_run


@pytest.mark.asyncio(loop_scope="function")
async def test_archive_ai_run_writes_vfs_files(db_session):
    user_id = uuid4()
    db_session.add(User(id=user_id, email="arch@example.com", hashed_password="x", is_active=True, is_superuser=False, is_verified=True))
    project_id = uuid4()
    db_session.add(Project(id=project_id, owner_id=user_id, name="p"))
    await db_session.commit()

    archived = await archive_ai_run(
        db=db_session,
        user_id=user_id,
        project_id=project_id,
        run_label="unit",
        run_md="# Run\n\nok",
        run_context_md="# Context\n\nnone",
        plans=[{"kind": "episode_save", "tool_id": "episode_save"}],
        trace_events=[{"type": "x"}],
    )
    assert archived.project_id == project_id
    assert archived.ai_root_node_id
    assert archived.run_folder_node_id
    assert archived.run_md_node_id
    assert archived.run_context_md_node_id
    assert archived.plan_json_node_id
    assert archived.trace_json_node_id is not None
