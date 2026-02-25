"""Integration tests: Endpoint creates Task → Handler executes → Run record associated to correct Session.

Validates Requirements 6.1, 6.2, 6.3
- Run records created by async handlers are correctly linked to the session
- Session detail endpoint returns the async-generated run history
"""
from __future__ import annotations

import base64
from types import SimpleNamespace
from uuid import UUID

import pytest

from app.tasks.handlers.model_test_image_generate import ModelTestImageGenerateHandler
from app.tasks.handlers.model_test_video_generate import ModelTestVideoGenerateHandler
from app.schemas_media import MediaResponse


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _DummyReporter:
    def __init__(self):
        self.progress_calls: list[int] = []

    async def progress(self, *, progress: int, payload=None) -> None:
        self.progress_calls.append(progress)

    async def log(self, *, message: str, level: str = "info", payload=None) -> None:
        pass


def _make_task(user_id, input_json):
    return SimpleNamespace(user_id=user_id, input_json=input_json)


def _data_url_png() -> str:
    payload = base64.b64encode(b"\x89PNG fake image data").decode()
    return f"data:image/png;base64,{payload}"


def _data_url_mp4() -> str:
    payload = base64.b64encode(b"\x00\x00\x00 ftyp fake mp4").decode()
    return f"data:video/mp4;base64,{payload}"


# ---------------------------------------------------------------------------
# Image: Endpoint → Handler → Session detail shows run
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_image_full_flow_endpoint_handler_session_detail(
    test_client, authenticated_superuser, monkeypatch, db_session
):
    """Full integration: test-image endpoint creates Task, handler executes,
    Run record is linked to the session, session detail returns the run."""
    from app.ai_gateway import ai_gateway_service
    from app.services.task_service import task_service

    # 1. Create a model config
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

    # 2. Capture the task payload created by the endpoint
    captured_payloads: list = []
    _original_create = task_service.create_task

    async def _spy_create_task(*, db, user_id, payload):
        captured_payloads.append(payload)
        return await _original_create(db=db, user_id=user_id, payload=payload)

    monkeypatch.setattr(task_service, "create_task", _spy_create_task)

    # 3. Call the test-image endpoint
    res = await test_client.post(
        f"/api/v1/ai/admin/model-configs/{model_config_id}/test-image",
        headers=authenticated_superuser["headers"],
        json={"prompt": "integration test cat", "resolution": "1024x1024"},
    )
    assert res.status_code == 200
    data = res.json()["data"]
    task_id = data["task_id"]
    session_id = data["session_id"]
    assert task_id
    assert session_id

    # 4. Extract the input_json that was passed to create_task
    assert len(captured_payloads) == 1
    input_json = captured_payloads[0].input_json
    assert input_json["session_id"] == session_id
    assert input_json["model_config_id"] == model_config_id
    assert input_json["prompt"] == "integration test cat"

    # 5. Mock AI gateway and run the handler directly
    generated_url = _data_url_png()

    async def _fake_generate(*, db, user_id, binding_key, model_config_id, prompt, param_json, category, **kw):
        return MediaResponse(url=generated_url, usage_id="u1", meta={})

    monkeypatch.setattr(ai_gateway_service, "generate_media", _fake_generate)

    handler = ModelTestImageGenerateHandler()
    user_id = authenticated_superuser["user"].id
    task_obj = _make_task(user_id, input_json)
    reporter = _DummyReporter()

    result = await handler.run(db=db_session, task=task_obj, reporter=reporter)

    # 6. Verify result_json links to the correct session
    assert result["session_id"] == session_id
    assert result["run_id"]
    assert result["url"] == generated_url
    run_id = result["run_id"]

    # 7. Query session detail endpoint and verify the run appears
    res = await test_client.get(
        f"/api/v1/ai/admin/model-test-sessions/{session_id}",
        headers=authenticated_superuser["headers"],
    )
    assert res.status_code == 200
    session_data = res.json()["data"]
    assert session_data["id"] == session_id

    # The image run should appear in the session's image_runs list
    image_runs = session_data.get("image_runs", [])
    assert len(image_runs) >= 1
    matching_runs = [r for r in image_runs if r["id"] == run_id]
    assert len(matching_runs) == 1

    run_data = matching_runs[0]
    assert run_data["prompt"] == "integration test cat"
    assert run_data["resolution"] == "1024x1024"
    assert run_data["error_message"] is None
    assert run_data["output_url"] is not None


# ---------------------------------------------------------------------------
# Video: Endpoint → Handler → Session detail shows run
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_video_full_flow_endpoint_handler_session_detail(
    test_client, authenticated_superuser, monkeypatch, db_session
):
    """Full integration: test-video endpoint creates Task, handler executes,
    Run record is linked to the session, session detail returns the run."""
    from app.ai_gateway import ai_gateway_service
    from app.services.task_service import task_service

    # 1. Create a model config for video
    res = await test_client.post(
        "/api/v1/ai/admin/model-configs",
        headers=authenticated_superuser["headers"],
        json={
            "category": "video",
            "manufacturer": "kling",
            "model": "kling-v2",
            "base_url": "https://api.klingai.com",
            "api_key": "test-video-key",
            "enabled": True,
            "sort_order": 0,
        },
    )
    assert res.status_code == 200
    model_config_id = res.json()["data"]["id"]

    # 2. Capture the task payload
    captured_payloads: list = []
    _original_create = task_service.create_task

    async def _spy_create_task(*, db, user_id, payload):
        captured_payloads.append(payload)
        return await _original_create(db=db, user_id=user_id, payload=payload)

    monkeypatch.setattr(task_service, "create_task", _spy_create_task)

    # 3. Call the test-video endpoint
    res = await test_client.post(
        f"/api/v1/ai/admin/model-configs/{model_config_id}/test-video",
        headers=authenticated_superuser["headers"],
        json={"prompt": "integration test horse", "duration": 5, "aspect_ratio": "16:9"},
    )
    assert res.status_code == 200
    data = res.json()["data"]
    task_id = data["task_id"]
    session_id = data["session_id"]
    assert task_id
    assert session_id

    # 4. Extract the input_json
    assert len(captured_payloads) == 1
    input_json = captured_payloads[0].input_json
    assert input_json["session_id"] == session_id
    assert input_json["model_config_id"] == model_config_id
    assert input_json["prompt"] == "integration test horse"
    assert input_json["duration"] == 5
    assert input_json["aspect_ratio"] == "16:9"

    # 5. Mock AI gateway and run the handler directly
    generated_url = _data_url_mp4()

    async def _fake_generate(*, db, user_id, binding_key, model_config_id, prompt, param_json, category, **kw):
        return MediaResponse(url=generated_url, usage_id="u2", meta={})

    monkeypatch.setattr(ai_gateway_service, "generate_media", _fake_generate)

    handler = ModelTestVideoGenerateHandler()
    user_id = authenticated_superuser["user"].id
    task_obj = _make_task(user_id, input_json)
    reporter = _DummyReporter()

    result = await handler.run(db=db_session, task=task_obj, reporter=reporter)

    # 6. Verify result_json links to the correct session
    assert result["session_id"] == session_id
    assert result["run_id"]
    assert result["url"] == generated_url
    run_id = result["run_id"]

    # 7. Query session detail endpoint and verify the run appears
    res = await test_client.get(
        f"/api/v1/ai/admin/model-test-sessions/{session_id}",
        headers=authenticated_superuser["headers"],
    )
    assert res.status_code == 200
    session_data = res.json()["data"]
    assert session_data["id"] == session_id

    # The video run should appear in the session's video_runs list
    video_runs = session_data.get("video_runs", [])
    assert len(video_runs) >= 1
    matching_runs = [r for r in video_runs if r["id"] == run_id]
    assert len(matching_runs) == 1

    run_data = matching_runs[0]
    assert run_data["prompt"] == "integration test horse"
    assert run_data["duration"] == 5
    assert run_data["aspect_ratio"] == "16:9"
    assert run_data["error_message"] is None
    assert run_data["output_url"] is not None


# ---------------------------------------------------------------------------
# Error flow: Handler fails → error Run still linked to session
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_image_error_flow_run_linked_to_session(
    test_client, authenticated_superuser, monkeypatch, db_session
):
    """When the handler fails, the error Run record should still be linked
    to the correct session and visible in session detail."""
    from app.ai_gateway import ai_gateway_service
    from app.services.task_service import task_service

    # 1. Create model config
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

    # 2. Capture task payload
    captured_payloads: list = []
    _original_create = task_service.create_task

    async def _spy_create_task(*, db, user_id, payload):
        captured_payloads.append(payload)
        return await _original_create(db=db, user_id=user_id, payload=payload)

    monkeypatch.setattr(task_service, "create_task", _spy_create_task)

    # 3. Call endpoint
    res = await test_client.post(
        f"/api/v1/ai/admin/model-configs/{model_config_id}/test-image",
        headers=authenticated_superuser["headers"],
        json={"prompt": "error test prompt"},
    )
    assert res.status_code == 200
    session_id = res.json()["data"]["session_id"]
    input_json = captured_payloads[0].input_json

    # 4. Mock gateway to fail
    async def _failing_generate(*, db, user_id, binding_key, model_config_id, prompt, param_json, category, **kw):
        raise RuntimeError("gateway_timeout_integration")

    monkeypatch.setattr(ai_gateway_service, "generate_media", _failing_generate)

    handler = ModelTestImageGenerateHandler()
    user_id = authenticated_superuser["user"].id
    task_obj = _make_task(user_id, input_json)
    reporter = _DummyReporter()

    with pytest.raises(RuntimeError, match="gateway_timeout_integration"):
        await handler.run(db=db_session, task=task_obj, reporter=reporter)

    # 5. Query session detail — error run should be visible
    res = await test_client.get(
        f"/api/v1/ai/admin/model-test-sessions/{session_id}",
        headers=authenticated_superuser["headers"],
    )
    assert res.status_code == 200
    session_data = res.json()["data"]
    image_runs = session_data.get("image_runs", [])
    assert len(image_runs) >= 1

    # Find the error run
    error_runs = [r for r in image_runs if r["error_message"] is not None]
    assert len(error_runs) >= 1
    assert "gateway_timeout_integration" in error_runs[0]["error_message"]
    assert error_runs[0]["prompt"] == "error test prompt"
