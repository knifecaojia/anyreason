import pytest

from uuid import uuid4


@pytest.mark.asyncio
async def test_admin_model_config_test_image_forbidden(test_client, authenticated_user):
    res = await test_client.post(
        f"/api/v1/ai/admin/model-configs/{uuid4()}/test-image",
        headers=authenticated_user["headers"],
        json={"prompt": "a cat", "resolution": "2048x2048", "image_data_urls": []},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_model_config_test_image_ok(test_client, authenticated_superuser, monkeypatch):
    class _DummyProvider:
        async def generate_image(self, *, cfg, prompt, resolution, image_data_urls):
            _ = (cfg, prompt, resolution, image_data_urls)
            return "data:image/png;base64,AAAA"

    from app.ai_gateway.factory import provider_factory

    monkeypatch.setattr(provider_factory, "get_image_provider", lambda *, manufacturer: _DummyProvider())

    from app.services.storage.vfs_service import vfs_service
    from app.models import FileNode

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

    async def _fake_create_text_file(*, db, user_id, name, content, parent_id=None, workspace_id=None, project_id=None, content_type="text/plain; charset=utf-8"):
        raw = (content or "").encode("utf-8")
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
            size_bytes=len(raw),
        )
        db.add(node)
        await db.flush()
        return node

    monkeypatch.setattr(vfs_service, "create_bytes_file", _fake_create_bytes_file)
    monkeypatch.setattr(vfs_service, "create_text_file", _fake_create_text_file)

    res = await test_client.post(
        "/api/v1/ai/admin/model-configs",
        headers=authenticated_superuser["headers"],
        json={
            "category": "image",
            "manufacturer": "doubao",
            "model": "doubao-seedream-4.5",
            "base_url": "https://ark.cn-beijing.volces.com/api/v3",
            "api_key": "test-key",
            "enabled": True,
            "sort_order": 0,
        },
    )
    assert res.status_code == 200
    model_config_id = res.json()["data"]["id"]

    res = await test_client.post(
        f"/api/v1/ai/admin/model-configs/{model_config_id}/test-image",
        headers=authenticated_superuser["headers"],
        json={"prompt": "a cat", "resolution": "2048x2048", "image_data_urls": ["data:image/png;base64,AAAA"]},
    )
    assert res.status_code == 200
    assert res.json()["data"]["url"].startswith("data:image/")
    assert res.json()["data"]["session_id"]
    assert res.json()["data"]["run_id"]
    assert res.json()["data"]["output_file_node_id"]
    assert isinstance(res.json()["data"]["input_file_node_ids"], list)


@pytest.mark.asyncio
async def test_admin_model_config_test_image_use_session_attachment_ids(test_client, authenticated_superuser, monkeypatch):
    class _DummyProvider:
        async def generate_image(self, *, cfg, prompt, resolution, image_data_urls):
            _ = (cfg, prompt, resolution, image_data_urls)
            assert isinstance(image_data_urls, list)
            assert len(image_data_urls) == 1
            return "data:image/png;base64,AAAA"

    from app.ai_gateway.factory import provider_factory

    monkeypatch.setattr(provider_factory, "get_image_provider", lambda *, manufacturer: _DummyProvider())

    from app.services.storage.vfs_service import vfs_service
    from app.models import FileNode

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

    async def _fake_read_file_bytes(*, db, user_id, node_id):
        _ = user_id
        node = await db.get(FileNode, node_id)
        assert node is not None
        return node, b"\x89PNG\r\n\x1a\n"

    monkeypatch.setattr(vfs_service, "create_bytes_file", _fake_create_bytes_file)
    monkeypatch.setattr(vfs_service, "read_file_bytes", _fake_read_file_bytes)

    res = await test_client.post(
        "/api/v1/ai/admin/model-configs",
        headers=authenticated_superuser["headers"],
        json={
            "category": "image",
            "manufacturer": "doubao",
            "model": "doubao-seedream-4.5",
            "base_url": "https://ark.cn-beijing.volces.com/api/v3",
            "api_key": "test-key",
            "enabled": True,
            "sort_order": 0,
        },
    )
    assert res.status_code == 200
    model_config_id = res.json()["data"]["id"]

    session = await test_client.post(
        "/api/v1/ai/admin/model-test-sessions",
        headers=authenticated_superuser["headers"],
        json={"category": "image", "ai_model_config_id": model_config_id, "title": "图片测试"},
    )
    assert session.status_code == 200
    session_id = session.json()["data"]["id"]

    add = await test_client.post(
        f"/api/v1/ai/admin/model-test-sessions/{session_id}/image-attachments",
        headers=authenticated_superuser["headers"],
        json={"image_data_urls": ["data:image/png;base64,AAAA"]},
    )
    assert add.status_code == 200
    attachment_id = add.json()["data"][0]

    res = await test_client.post(
        f"/api/v1/ai/admin/model-configs/{model_config_id}/test-image",
        headers=authenticated_superuser["headers"],
        json={
            "prompt": "a cat @1",
            "resolution": "2048x2048",
            "session_id": session_id,
            "attachment_file_node_ids": [attachment_id],
        },
    )
    assert res.status_code == 200
    assert res.json()["data"]["run_id"]
    assert res.json()["data"]["output_file_node_id"]


@pytest.mark.asyncio
async def test_admin_model_config_test_image_missing_api_key(test_client, authenticated_superuser):
    res = await test_client.post(
        "/api/v1/ai/admin/model-configs",
        headers=authenticated_superuser["headers"],
        json={
            "category": "image",
            "manufacturer": "doubao",
            "model": "doubao-seedream-4.5",
            "base_url": "https://ark.cn-beijing.volces.com/api/v3",
            "api_key": None,
            "enabled": True,
            "sort_order": 0,
        },
    )
    assert res.status_code == 200
    model_config_id = res.json()["data"]["id"]

    res = await test_client.post(
        f"/api/v1/ai/admin/model-configs/{model_config_id}/test-image",
        headers=authenticated_superuser["headers"],
        json={"prompt": "a cat"},
    )
    assert res.status_code == 400
