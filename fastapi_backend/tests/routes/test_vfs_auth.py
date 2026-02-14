import uuid

import pytest
from fastapi_users.password import PasswordHelper

from app.models import User
from app.users import get_jwt_strategy
from app.services.storage.vfs_service import vfs_service


@pytest.mark.asyncio
async def test_vfs_denies_access_by_other_user(test_client, authenticated_user, db_session):
    res = await test_client.post(
        "/api/v1/vfs/folders",
        headers=authenticated_user["headers"],
        json={"name": "root", "project_id": None, "workspace_id": None, "parent_id": None},
    )
    assert res.status_code == 200
    root_id = res.json()["data"]["id"]

    res = await test_client.post(
        "/api/v1/vfs/files",
        headers=authenticated_user["headers"],
        json={"name": "a.md", "content": "# Hello", "parent_id": root_id},
    )
    assert res.status_code == 200
    file_id = res.json()["data"]["id"]

    user2 = User(
        id=uuid.uuid4(),
        email="test2@example.com",
        hashed_password=PasswordHelper().hash("TestPassword123#"),
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db_session.add(user2)
    await db_session.commit()
    await db_session.refresh(user2)
    access_token = await get_jwt_strategy().write_token(user2)
    headers2 = {"Authorization": f"Bearer {access_token}"}

    res = await test_client.get(
        "/api/v1/vfs/nodes",
        headers=headers2,
        params={"parent_id": root_id},
    )
    assert res.status_code == 404

    res = await test_client.get(
        f"/api/v1/vfs/nodes/{file_id}/download",
        headers=headers2,
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_vfs_upsert_text_file_is_idempotent(db_session, authenticated_user):
    user_id = authenticated_user["user"].id
    folder = await vfs_service.create_folder(db=db_session, user_id=user_id, name="root", parent_id=None, workspace_id=None, project_id=None)

    node1 = await vfs_service.upsert_text_file(
        db=db_session,
        user_id=user_id,
        name="note.md",
        content="v1",
        parent_id=folder.id,
        workspace_id=None,
        project_id=None,
        content_type="text/markdown; charset=utf-8",
    )
    node2 = await vfs_service.upsert_text_file(
        db=db_session,
        user_id=user_id,
        name="note.md",
        content="v2",
        parent_id=folder.id,
        workspace_id=None,
        project_id=None,
        content_type="text/markdown; charset=utf-8",
    )
    assert node1.id == node2.id

    _, payload = await vfs_service.read_file_bytes(db=db_session, user_id=user_id, node_id=node2.id)
    assert payload == b"v2"
