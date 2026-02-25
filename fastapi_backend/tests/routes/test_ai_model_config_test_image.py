import pytest

from uuid import uuid4, UUID


@pytest.mark.asyncio
async def test_admin_model_config_test_image_forbidden(test_client, authenticated_user):
    res = await test_client.post(
        f"/api/v1/ai/admin/model-configs/{uuid4()}/test-image",
        headers=authenticated_user["headers"],
        json={"prompt": "a cat", "resolution": "2048x2048", "image_data_urls": []},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_model_config_test_image_returns_task_and_session(
    test_client, authenticated_superuser, monkeypatch
):
    """Endpoint should call task_service.create_task() and return {task_id, session_id}."""
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
        json={"prompt": "a cat", "resolution": "2048x2048"},
    )
    assert res.status_code == 200
    data = res.json()["data"]
    # Async response: task_id and session_id only
    assert "task_id" in data
    assert "session_id" in data
    assert data["task_id"]  # non-empty
    assert data["session_id"]  # non-empty
    # Should NOT contain sync generation result fields
    assert "url" not in data
    assert "run_id" not in data
    assert "output_file_node_id" not in data


@pytest.mark.asyncio
async def test_admin_model_config_test_image_input_json_fields(
    test_client, authenticated_superuser, monkeypatch, db_session
):
    """Verify input_json passed to create_task contains session_id, model_config_id, prompt, etc."""
    from app.services.task_service import task_service

    captured_payloads: list = []
    _original_create = task_service.create_task

    async def _spy_create_task(*, db, user_id, payload):
        captured_payloads.append(payload)
        return await _original_create(db=db, user_id=user_id, payload=payload)

    monkeypatch.setattr(task_service, "create_task", _spy_create_task)

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
        json={"prompt": "a beautiful sunset", "resolution": "1024x1024"},
    )
    assert res.status_code == 200

    assert len(captured_payloads) == 1
    payload = captured_payloads[0]
    assert payload.type == "model_test_image_generate"

    ij = payload.input_json
    assert ij["prompt"] == "a beautiful sunset"
    assert ij["resolution"] == "1024x1024"
    assert ij["model_config_id"] == model_config_id
    assert ij["session_id"]  # non-empty string
    # session_id should be a valid UUID string
    UUID(ij["session_id"])


@pytest.mark.asyncio
async def test_admin_model_config_test_image_with_data_url_attachments(
    test_client, authenticated_superuser, monkeypatch, db_session
):
    """When image_data_urls are provided inline, they should be stored in input_json."""
    from app.services.task_service import task_service
    from app.services.storage.vfs_service import vfs_service
    from app.models import FileNode

    captured_payloads: list = []
    _original_create = task_service.create_task

    async def _spy_create_task(*, db, user_id, payload):
        captured_payloads.append(payload)
        return await _original_create(db=db, user_id=user_id, payload=payload)

    monkeypatch.setattr(task_service, "create_task", _spy_create_task)

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

    monkeypatch.setattr(vfs_service, "create_bytes_file", _fake_create_bytes_file)

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
        json={
            "prompt": "a cat",
            "resolution": "2048x2048",
            "image_data_urls": ["data:image/png;base64,AAAA"],
        },
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["task_id"]
    assert data["session_id"]

    assert len(captured_payloads) == 1
    ij = captured_payloads[0].input_json
    assert ij["image_data_urls"] == ["data:image/png;base64,AAAA"]
    assert isinstance(ij["input_file_node_ids"], list)
    assert len(ij["input_file_node_ids"]) == 1


@pytest.mark.asyncio
async def test_admin_model_config_test_image_with_session_attachment_ids(
    test_client, authenticated_superuser, monkeypatch, db_session
):
    """When attachment_file_node_ids are provided, endpoint reads file_node → data URL and stores in input_json."""
    from app.services.task_service import task_service
    from app.services.storage.vfs_service import vfs_service
    from app.models import FileNode

    captured_payloads: list = []
    _original_create = task_service.create_task

    async def _spy_create_task(*, db, user_id, payload):
        captured_payloads.append(payload)
        return await _original_create(db=db, user_id=user_id, payload=payload)

    monkeypatch.setattr(task_service, "create_task", _spy_create_task)

    async def _fake_read_file_bytes(*, db, user_id, node_id):
        _ = user_id
        node = await db.get(FileNode, node_id)
        assert node is not None
        return node, b"\x89PNG\r\n\x1a\n"

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

    # Create a session and add an attachment
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
    data = res.json()["data"]
    assert data["task_id"]
    assert data["session_id"] == session_id

    assert len(captured_payloads) == 1
    ij = captured_payloads[0].input_json
    assert ij["session_id"] == session_id
    # Preprocessed attachment should produce data URLs
    assert isinstance(ij["image_data_urls"], list)
    assert len(ij["image_data_urls"]) == 1
    assert ij["image_data_urls"][0].startswith("data:")


@pytest.mark.asyncio
async def test_admin_model_config_test_image_missing_api_key_still_creates_task(test_client, authenticated_superuser):
    """With async refactoring, missing api_key is no longer validated at endpoint level.
    The endpoint creates a task regardless; the handler will fail later when it tries to call the gateway."""
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
    # Async endpoint accepts the request and creates a task
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["task_id"]
    assert data["session_id"]
