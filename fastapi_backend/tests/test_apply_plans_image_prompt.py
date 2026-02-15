from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select

from app.ai_tools.apply_plan import ApplyPlan
from app.models import Episode, ImagePrompt, Project, Storyboard


@pytest.mark.asyncio
async def test_apply_plan_image_prompt_upsert_writes_db(test_client, authenticated_user, db_session):
    user = authenticated_user["user"]
    project = Project(id=uuid4(), owner_id=user.id, name="P-image")
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)

    ep = Episode(project_id=project.id, episode_code="EP001", episode_number=1, script_full_text="剧本")
    db_session.add(ep)
    await db_session.commit()
    await db_session.refresh(ep)

    sb = Storyboard(
        episode_id=ep.id,
        shot_code="EP001_SC01_SH01",
        shot_number=1,
        scene_code="EP001_SC01",
        scene_number=1,
        description="镜头描述",
    )
    db_session.add(sb)
    await db_session.commit()
    await db_session.refresh(sb)

    plan = ApplyPlan(
        kind="image_prompt_upsert",
        tool_id="image_prompt_upsert",
        inputs={
            "project_id": str(project.id),
            "prompts": [
                {
                    "storyboard_id": str(sb.id),
                    "prompt_main": "a cinematic shot",
                    "negative_prompt": "low quality",
                    "style_model": "anime",
                    "aspect_ratio": "9:16",
                    "character_prompts": [{"character": "主角", "prompt": "hero"}],
                    "camera_settings": {"lens": "35mm"},
                }
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

    res = await db_session.execute(select(ImagePrompt).where(ImagePrompt.storyboard_id == sb.id))
    rows = list(res.scalars().all())
    assert len(rows) == 1
    assert (rows[0].prompt_main or "").startswith("a cinematic")

