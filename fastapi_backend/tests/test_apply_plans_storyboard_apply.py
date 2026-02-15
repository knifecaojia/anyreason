from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select

from app.ai_tools.apply_plan import ApplyPlan
from app.models import Episode, Project, Storyboard


@pytest.mark.asyncio
async def test_apply_plan_storyboard_apply_replaces_scene_group(test_client, authenticated_user, db_session):
    user = authenticated_user["user"]
    project = Project(id=uuid4(), owner_id=user.id, name="P-storyboard")
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)

    ep = Episode(project_id=project.id, episode_code="EP001", episode_number=1, script_full_text="剧本")
    db_session.add(ep)
    await db_session.commit()
    await db_session.refresh(ep)

    placeholder = Storyboard(
        episode_id=ep.id,
        shot_code="EP001_SC01_SH01",
        shot_number=1,
        scene_code="EP001_SC01",
        scene_number=1,
        description="第1场 内容",
    )
    db_session.add(placeholder)
    await db_session.commit()
    await db_session.refresh(placeholder)

    plan = ApplyPlan(
        kind="storyboard_apply",
        tool_id="storyboard_apply",
        inputs={
            "project_id": str(project.id),
            "storyboard_id": str(placeholder.id),
            "mode": "replace",
            "shots": [
                {"shot_type": "中景", "camera_move": "推", "description": "镜头A", "dialogue": "台词A", "active_assets": ["主角"]},
                {"shot_type": "特写", "camera_move": "静止", "description": "镜头B", "dialogue": None, "active_assets": []},
            ],
        },
        preview={"dry_run": True},
    )

    resp = await test_client.post(
        "/api/v1/apply-plans/execute",
        json={"plan": plan.model_dump(mode="json"), "confirm": True},
        headers=authenticated_user["headers"],
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert len(data["created"]) == 2

    res = await db_session.execute(select(Storyboard).where(Storyboard.episode_id == ep.id, Storyboard.scene_number == 1))
    rows = list(res.scalars().all())
    assert len(rows) == 2
    codes = sorted([r.shot_code for r in rows])
    assert codes == ["EP001_SC01_SH01", "EP001_SC01_SH02"]

