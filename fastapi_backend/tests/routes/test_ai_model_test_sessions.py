import pytest

from uuid import uuid4


@pytest.mark.asyncio
async def test_admin_model_test_sessions_forbidden(test_client, authenticated_user):
    res = await test_client.get(
        "/api/v1/ai/admin/model-test-sessions",
        headers=authenticated_user["headers"],
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_model_test_sessions_create_list_get_ok(test_client, authenticated_superuser):
    create = await test_client.post(
        "/api/v1/ai/admin/model-test-sessions",
        headers=authenticated_superuser["headers"],
        json={"category": "image", "ai_model_config_id": None, "title": "图片测试"},
    )
    assert create.status_code == 200
    session_id = create.json()["data"]["id"]

    lst = await test_client.get(
        "/api/v1/ai/admin/model-test-sessions",
        headers=authenticated_superuser["headers"],
        params={"category": "image", "page": 1, "page_size": 10},
    )
    assert lst.status_code == 200
    assert lst.json()["data"]["total"] >= 1

    get = await test_client.get(
        f"/api/v1/ai/admin/model-test-sessions/{session_id}",
        headers=authenticated_superuser["headers"],
    )
    assert get.status_code == 200
    assert get.json()["data"]["id"] == session_id


@pytest.mark.asyncio
async def test_admin_model_test_sessions_get_not_found(test_client, authenticated_superuser):
    res = await test_client.get(
        f"/api/v1/ai/admin/model-test-sessions/{uuid4()}",
        headers=authenticated_superuser["headers"],
    )
    assert res.status_code == 200
    assert res.json()["code"] == 404


@pytest.mark.asyncio
async def test_admin_model_test_session_image_attachments_ok(test_client, authenticated_superuser, monkeypatch):
    from app.models import FileNode
    from app.services.storage.vfs_service import vfs_service

    async def _fake_create_bytes_file(*, db, user_id, name, data, content_type, parent_id=None, workspace_id=None, project_id=None):
        node = FileNode(
            id=uuid4(),
            name=name,
            is_folder=False,
            parent_id=parent_id,
            workspace_id=workspace_id,
            project_id=project_id,
            created_by=user_id,
            minio_bucket="anyreason-vfs",
            minio_key=f"tests/{uuid4()}/{name}",
            content_type=content_type,
            size_bytes=len(data or b""),
        )
        db.add(node)
        await db.flush()
        return node

    async def _fake_delete_node(*, db, user_id, node_id, recursive=False):
        _ = (user_id, recursive)
        node = await db.get(FileNode, node_id)
        if node:
            await db.delete(node)
            await db.flush()

    monkeypatch.setattr(vfs_service, "create_bytes_file", _fake_create_bytes_file)
    monkeypatch.setattr(vfs_service, "delete_node", _fake_delete_node)

    create = await test_client.post(
        "/api/v1/ai/admin/model-test-sessions",
        headers=authenticated_superuser["headers"],
        json={"category": "image", "ai_model_config_id": None, "title": "图片测试"},
    )
    assert create.status_code == 200
    session_id = create.json()["data"]["id"]

    add = await test_client.post(
        f"/api/v1/ai/admin/model-test-sessions/{session_id}/image-attachments",
        headers=authenticated_superuser["headers"],
        json={"image_data_urls": ["data:image/png;base64,AAAA"]},
    )
    assert add.status_code == 200
    assert isinstance(add.json()["data"], list)
    assert len(add.json()["data"]) == 1
    node_id = add.json()["data"][0]

    get = await test_client.get(
        f"/api/v1/ai/admin/model-test-sessions/{session_id}",
        headers=authenticated_superuser["headers"],
    )
    assert get.status_code == 200
    assert node_id in get.json()["data"]["image_attachment_node_ids"]

    rm = await test_client.delete(
        f"/api/v1/ai/admin/model-test-sessions/{session_id}/image-attachments/{node_id}",
        headers=authenticated_superuser["headers"],
    )
    assert rm.status_code == 200
    assert rm.json()["data"] == []
