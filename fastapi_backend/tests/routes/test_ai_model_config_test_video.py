import pytest

from uuid import uuid4, UUID


@pytest.mark.asyncio
async def test_admin_model_config_test_video_forbidden(test_client, authenticated_user):
    res = await test_client.post(
        f"/api/v1/ai/admin/model-configs/{uuid4()}/test-video",
        headers=authenticated_user["headers"],
        json={"prompt": "a running cat"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_model_config_test_video_returns_task_and_session(
    test_client, authenticated_superuser
):
    """Endpoint should call task_service.create_task() and return {task_id, session_id}."""
    res = await test_client.post(
        "/api/v1/ai/admin/model-configs",
        headers=authenticated_superuser["headers"],
        json={
            "category": "video",
            "manufacturer": "dashscope",
            "model": "wanx2.1-t2v-turbo",
            "api_key": "test-key",
            "enabled": True,
            "sort_order": 0,
        },
    )
    assert res.status_code == 200
    model_config_id = res.json()["data"]["id"]

    res = await test_client.post(
        f"/api/v1/ai/admin/model-configs/{model_config_id}/test-video",
        headers=authenticated_superuser["headers"],
        json={"prompt": "a running cat", "duration": 5, "aspect_ratio": "16:9"},
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
async def test_admin_model_config_test_video_input_json_fields(
    test_client, authenticated_superuser, monkeypatch, db_session
):
    """Verify input_json passed to create_task contains session_id, model_config_id, prompt, duration, aspect_ratio."""
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
            "category": "video",
            "manufacturer": "dashscope",
            "model": "wanx2.1-t2v-turbo",
            "api_key": "test-key",
            "enabled": True,
            "sort_order": 0,
        },
    )
    assert res.status_code == 200
    model_config_id = res.json()["data"]["id"]

    res = await test_client.post(
        f"/api/v1/ai/admin/model-configs/{model_config_id}/test-video",
        headers=authenticated_superuser["headers"],
        json={"prompt": "ocean waves", "duration": 10, "aspect_ratio": "16:9"},
    )
    assert res.status_code == 200

    assert len(captured_payloads) == 1
    payload = captured_payloads[0]
    assert payload.type == "model_test_video_generate"

    ij = payload.input_json
    assert ij["prompt"] == "ocean waves"
    assert ij["duration"] == 10
    assert ij["aspect_ratio"] == "16:9"
    assert ij["model_config_id"] == model_config_id
    assert ij["session_id"]  # non-empty string
    UUID(ij["session_id"])  # valid UUID


@pytest.mark.asyncio
async def test_admin_model_config_test_video_with_session_attachment_ids(
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
            "category": "video",
            "manufacturer": "dashscope",
            "model": "wanx2.1-t2v-turbo",
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
        json={"category": "video", "ai_model_config_id": model_config_id, "title": "视频测试"},
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
        f"/api/v1/ai/admin/model-configs/{model_config_id}/test-video",
        headers=authenticated_superuser["headers"],
        json={
            "prompt": "a cat running @1",
            "duration": 5,
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
async def test_admin_model_config_test_video_missing_api_key_still_creates_task(test_client, authenticated_superuser):
    """With async refactoring, missing api_key is no longer validated at endpoint level.
    The endpoint creates a task regardless; the handler will fail later."""
    res = await test_client.post(
        "/api/v1/ai/admin/model-configs",
        headers=authenticated_superuser["headers"],
        json={
            "category": "video",
            "manufacturer": "dashscope",
            "model": "wanx2.1-t2v-turbo",
            "api_key": None,
            "enabled": True,
            "sort_order": 0,
        },
    )
    assert res.status_code == 200
    model_config_id = res.json()["data"]["id"]

    res = await test_client.post(
        f"/api/v1/ai/admin/model-configs/{model_config_id}/test-video",
        headers=authenticated_superuser["headers"],
        json={"prompt": "a cat"},
    )
    # Async endpoint accepts the request and creates a task
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["task_id"]
    assert data["session_id"]
