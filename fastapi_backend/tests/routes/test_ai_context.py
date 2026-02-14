from __future__ import annotations

from uuid import uuid4

import pytest

from app.models import Project


@pytest.mark.asyncio
async def test_project_context_preview_counts_assets(test_client, authenticated_user, db_session):
    user = authenticated_user["user"]
    project = Project(id=uuid4(), owner_id=user.id, name="ctx")
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)

    res = await test_client.post(
        "/api/v1/vfs/folders",
        headers=authenticated_user["headers"],
        json={"name": "资产", "project_id": str(project.id), "workspace_id": None, "parent_id": None},
    )
    assert res.status_code == 200
    assets_root_id = res.json()["data"]["id"]

    res = await test_client.post(
        "/api/v1/vfs/folders",
        headers=authenticated_user["headers"],
        json={"name": "角色", "project_id": None, "workspace_id": None, "parent_id": assets_root_id},
    )
    assert res.status_code == 200
    char_folder_id = res.json()["data"]["id"]

    res = await test_client.post(
        "/api/v1/vfs/files",
        headers=authenticated_user["headers"],
        json={"name": "character_张三.md", "content": "# 张三\n\n描述", "parent_id": char_folder_id},
    )
    assert res.status_code == 200

    res = await test_client.get(
        f"/api/v1/projects/{project.id}/context/preview",
        headers=authenticated_user["headers"],
    )
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert data["assets_root_node_id"] == assets_root_id
    assert data["counts"]["character"] == 1
    assert len(data["samples"]["character"]) == 1
