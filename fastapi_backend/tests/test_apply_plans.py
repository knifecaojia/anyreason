from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select

from app.ai_tools.apply_plan import ApplyPlan
from app.models import FileNode, Project


@pytest.mark.asyncio
async def test_apply_plan_episode_save_writes_vfs(test_client, authenticated_user, db_session):
    user = authenticated_user["user"]

    project = Project(id=uuid4(), owner_id=user.id, name="P1")
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)

    plan = ApplyPlan(
        kind="episode_save",
        tool_id="episode_save",
        inputs={
            "project_id": str(project.id),
            "episodes": [
                {"episode_number": 1, "title": "第一集", "content_md": "# 第一集\\n\\nhello"},
                {"episode_number": 2, "title": "第二集", "content_md": "# 第二集\\n\\nworld"},
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

    nodes = (await db_session.execute(select(FileNode))).scalars().all()
    names = {n.name for n in nodes}
    assert any(n == "分集" for n in names)
    assert any(n.startswith("EP001") for n in names)
    assert any(n.startswith("EP002") for n in names)


@pytest.mark.asyncio
async def test_apply_plan_preview_script_split_is_normalized_and_executed(test_client, authenticated_user, db_session):
    user = authenticated_user["user"]

    project = Project(id=uuid4(), owner_id=user.id, name="P1-preview")
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)

    plan = ApplyPlan(
        kind="episode_save",
        tool_id="preview_script_split",
        inputs={
            "project_id": str(project.id),
            "episodes": [
                {"episode_number": 1, "title": "第一集", "content_md": "# 第一集\\n\\nhello"},
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
    assert data.get("provenance", {}).get("source_tool_id") == "preview_script_split"
    assert len(data["created"]) == 1


@pytest.mark.asyncio
async def test_apply_plan_asset_create_writes_vfs(test_client, authenticated_user, db_session):
    user = authenticated_user["user"]

    project = Project(id=uuid4(), owner_id=user.id, name="P2")
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)

    plan = ApplyPlan(
        kind="asset_create",
        tool_id="asset_create",
        inputs={
            "project_id": str(project.id),
            "assets": [
                {"version": 1, "type": "character", "name": "张三", "description": "主角", "keywords": [], "first_appearance_episode": 1, "meta": {}},
                {"version": 1, "type": "prop", "name": "手枪", "description": None, "keywords": [], "first_appearance_episode": 1, "meta": {}},
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

    nodes = (await db_session.execute(select(FileNode))).scalars().all()
    names = {n.name for n in nodes}
    assert "资产" in names
    assert "角色" in names
    assert "道具" in names
    assert any(n.endswith(".md") for n in names)
    assert any(n.endswith(".json") for n in names)


@pytest.mark.asyncio
async def test_apply_plan_asset_bind_writes_vfs(test_client, authenticated_user, db_session):
    user = authenticated_user["user"]

    project = Project(id=uuid4(), owner_id=user.id, name="P3")
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)

    plan = ApplyPlan(
        kind="asset_bind",
        tool_id="asset_bind",
        inputs={
            "project_id": str(project.id),
            "episode_number": 1,
            "bindings_doc": {"version": 1, "episode_number": 1, "bindings": [{"episode_number": 1, "asset_type": "character", "asset_name": "张三", "asset_node_id": None, "relation": "appears"}]},
        },
        preview={"dry_run": True},
    )

    resp = await test_client.post(
        "/api/v1/apply-plans/execute",
        json={"plan": plan.model_dump(mode="json"), "confirm": True},
        headers=authenticated_user["headers"],
    )
    assert resp.status_code == 200, resp.text

    nodes = (await db_session.execute(select(FileNode))).scalars().all()
    names = {n.name for n in nodes}
    assert "绑定" in names
    assert any(n.endswith("_bindings.json") for n in names)


@pytest.mark.asyncio
async def test_apply_plan_asset_doc_upsert_writes_markdown(test_client, authenticated_user, db_session):
    user = authenticated_user["user"]

    project = Project(id=uuid4(), owner_id=user.id, name="P4")
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)

    plan = ApplyPlan(
        kind="asset_doc_upsert",
        tool_id="asset_doc_upsert",
        inputs={
            "project_id": str(project.id),
            "asset_type": "character",
            "asset_name": "张三",
            "content_md": "# 张三\\n\\nvariant",
            "match_type": "same_asset_new_variant",
            "confidence": 0.9,
            "reason_md": "ok",
            "diff_md": "- old\\n+ new",
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
    assert data["decision"]["match_type"] == "same_asset_new_variant"

    nodes = (await db_session.execute(select(FileNode))).scalars().all()
    names = {n.name for n in nodes}
    assert "资产" in names
    assert "角色" in names
    assert any((n or "").endswith(".md") for n in names)
