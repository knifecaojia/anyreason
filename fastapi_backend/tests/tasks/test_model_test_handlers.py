"""Unit tests for ModelTestImageGenerateHandler and ModelTestVideoGenerateHandler.

Requirements: 1.1, 1.4, 1.5, 2.1, 2.4, 2.5
"""
from __future__ import annotations

import base64
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.schemas_media import MediaResponse
from app.tasks.handlers.model_test_image_generate import ModelTestImageGenerateHandler
from app.tasks.handlers.model_test_video_generate import ModelTestVideoGenerateHandler
from app.tasks.handlers.registry import TASK_HANDLER_REGISTRY


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _DummyReporter:
    """Lightweight reporter that records progress calls."""

    def __init__(self):
        self.progress_calls: list[int] = []

    async def progress(self, *, progress: int, payload=None) -> None:
        self.progress_calls.append(progress)

    async def log(self, *, message: str, level: str = "info", payload=None) -> None:
        pass


def _make_task(user_id, input_json):
    return SimpleNamespace(user_id=user_id, input_json=input_json)


def _fake_media_response(url: str = "https://example.com/generated.png") -> MediaResponse:
    return MediaResponse(url=url, usage_id="u1", meta={})


def _data_url_png() -> str:
    payload = base64.b64encode(b"\x89PNG fake").decode()
    return f"data:image/png;base64,{payload}"


# ---------------------------------------------------------------------------
# Registry tests
# ---------------------------------------------------------------------------

def test_registry_contains_image_handler():
    assert "model_test_image_generate" in TASK_HANDLER_REGISTRY
    assert isinstance(TASK_HANDLER_REGISTRY["model_test_image_generate"], ModelTestImageGenerateHandler)


def test_registry_contains_video_handler():
    assert "model_test_video_generate" in TASK_HANDLER_REGISTRY
    assert isinstance(TASK_HANDLER_REGISTRY["model_test_video_generate"], ModelTestVideoGenerateHandler)


# ---------------------------------------------------------------------------
# ImageHandler – success path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio(loop_scope="function")
async def test_image_handler_success(db_session, monkeypatch):
    """Mock gateway + vfs, verify result_json structure and add_image_run call."""
    from app.ai_gateway import ai_gateway_service
    from app.services.ai_model_test_service import ai_model_test_service
    from app.models import User, AIModelTestSession

    user_id = uuid4()
    session_id = uuid4()
    model_config_id = uuid4()

    # Create user + session in DB
    db_session.add(User(
        id=user_id, email="img-ok@test.com",
        hashed_password="x", is_active=True, is_superuser=False, is_verified=True,
    ))
    await db_session.flush()
    db_session.add(AIModelTestSession(
        id=session_id, user_id=user_id, category="image",
    ))
    await db_session.commit()

    # Mock AI gateway
    async def _fake_generate(*, db, user_id, binding_key, model_config_id, prompt, param_json, category, **kw):
        return _fake_media_response(_data_url_png())

    monkeypatch.setattr(ai_gateway_service, "generate_media", _fake_generate)

    # Track add_image_run calls
    original_add_image_run = ai_model_test_service.add_image_run
    add_image_run_calls: list[dict] = []

    async def _tracked_add_image_run(**kwargs):
        add_image_run_calls.append(kwargs)
        return await original_add_image_run(**kwargs)

    monkeypatch.setattr(ai_model_test_service, "add_image_run", _tracked_add_image_run)

    handler = ModelTestImageGenerateHandler()
    task = _make_task(user_id, {
        "prompt": "a cat",
        "resolution": "1024x1024",
        "model_config_id": str(model_config_id),
        "session_id": str(session_id),
    })
    reporter = _DummyReporter()

    result = await handler.run(db=db_session, task=task, reporter=reporter)

    # Verify result_json structure
    assert isinstance(result, dict)
    assert "url" in result and result["url"]
    assert result["session_id"] == str(session_id)
    assert "run_id" in result and result["run_id"]
    assert "output_file_node_id" in result
    assert "output_content_type" in result

    # Verify add_image_run was called with correct params
    assert len(add_image_run_calls) == 1
    call = add_image_run_calls[0]
    assert call["session_id"] == session_id
    assert call["prompt"] == "a cat"
    assert call["error_message"] is None


# ---------------------------------------------------------------------------
# VideoHandler – success path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio(loop_scope="function")
async def test_video_handler_success(db_session, monkeypatch):
    """Mock gateway + vfs, verify result_json structure and add_video_run call."""
    from app.ai_gateway import ai_gateway_service
    from app.services.ai_model_test_service import ai_model_test_service
    from app.models import User, AIModelTestSession

    user_id = uuid4()
    session_id = uuid4()
    model_config_id = uuid4()

    # Create user + session in DB
    db_session.add(User(
        id=user_id, email="vid-ok@test.com",
        hashed_password="x", is_active=True, is_superuser=False, is_verified=True,
    ))
    await db_session.flush()
    db_session.add(AIModelTestSession(
        id=session_id, user_id=user_id, category="video",
    ))
    await db_session.commit()

    # Mock AI gateway – return a data URL for video
    video_b64 = base64.b64encode(b"\x00\x00\x00 ftyp fake mp4").decode()
    video_data_url = f"data:video/mp4;base64,{video_b64}"

    async def _fake_generate(*, db, user_id, binding_key, model_config_id, prompt, param_json, category, **kw):
        return _fake_media_response(video_data_url)

    monkeypatch.setattr(ai_gateway_service, "generate_media", _fake_generate)

    # Track add_video_run calls
    original_add_video_run = ai_model_test_service.add_video_run
    add_video_run_calls: list[dict] = []

    async def _tracked_add_video_run(**kwargs):
        add_video_run_calls.append(kwargs)
        return await original_add_video_run(**kwargs)

    monkeypatch.setattr(ai_model_test_service, "add_video_run", _tracked_add_video_run)

    handler = ModelTestVideoGenerateHandler()
    task = _make_task(user_id, {
        "prompt": "a running horse",
        "duration": 5,
        "aspect_ratio": "16:9",
        "model_config_id": str(model_config_id),
        "session_id": str(session_id),
    })
    reporter = _DummyReporter()

    result = await handler.run(db=db_session, task=task, reporter=reporter)

    # Verify result_json structure
    assert isinstance(result, dict)
    assert "url" in result and result["url"]
    assert result["session_id"] == str(session_id)
    assert "run_id" in result and result["run_id"]
    assert "output_file_node_id" in result
    assert "output_content_type" in result

    # Verify add_video_run was called with correct params
    assert len(add_video_run_calls) == 1
    call = add_video_run_calls[0]
    assert call["session_id"] == session_id
    assert call["prompt"] == "a running horse"
    assert call["duration"] == 5
    assert call["aspect_ratio"] == "16:9"
    assert call["error_message"] is None


# ---------------------------------------------------------------------------
# ImageHandler – error path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio(loop_scope="function")
async def test_image_handler_error_creates_run_with_error(db_session, monkeypatch):
    """When gateway raises, add_image_run should be called with error_message."""
    from app.ai_gateway import ai_gateway_service
    from app.services.ai_model_test_service import ai_model_test_service
    from app.models import User, AIModelTestSession

    user_id = uuid4()
    session_id = uuid4()

    db_session.add(User(
        id=user_id, email="img-err@test.com",
        hashed_password="x", is_active=True, is_superuser=False, is_verified=True,
    ))
    await db_session.flush()
    db_session.add(AIModelTestSession(
        id=session_id, user_id=user_id, category="image",
    ))
    await db_session.commit()

    async def _failing_generate(*, db, user_id, binding_key, model_config_id, prompt, param_json, category, **kw):
        raise RuntimeError("gateway_timeout")

    monkeypatch.setattr(ai_gateway_service, "generate_media", _failing_generate)

    # Track add_image_run calls
    original_add_image_run = ai_model_test_service.add_image_run
    add_image_run_calls: list[dict] = []

    async def _tracked_add_image_run(**kwargs):
        add_image_run_calls.append(kwargs)
        return await original_add_image_run(**kwargs)

    monkeypatch.setattr(ai_model_test_service, "add_image_run", _tracked_add_image_run)

    handler = ModelTestImageGenerateHandler()
    task = _make_task(user_id, {
        "prompt": "fail test",
        "model_config_id": str(uuid4()),
        "session_id": str(session_id),
    })
    reporter = _DummyReporter()

    with pytest.raises(RuntimeError, match="gateway_timeout"):
        await handler.run(db=db_session, task=task, reporter=reporter)

    # Verify add_image_run was called with error_message
    assert len(add_image_run_calls) == 1
    call = add_image_run_calls[0]
    assert call["session_id"] == session_id
    assert call["error_message"] is not None
    assert "gateway_timeout" in call["error_message"]


# ---------------------------------------------------------------------------
# VideoHandler – error path
# ---------------------------------------------------------------------------

@pytest.mark.asyncio(loop_scope="function")
async def test_video_handler_error_creates_run_with_error(db_session, monkeypatch):
    """When gateway raises, add_video_run should be called with error_message."""
    from app.ai_gateway import ai_gateway_service
    from app.services.ai_model_test_service import ai_model_test_service
    from app.models import User, AIModelTestSession

    user_id = uuid4()
    session_id = uuid4()

    db_session.add(User(
        id=user_id, email="vid-err@test.com",
        hashed_password="x", is_active=True, is_superuser=False, is_verified=True,
    ))
    await db_session.flush()
    db_session.add(AIModelTestSession(
        id=session_id, user_id=user_id, category="video",
    ))
    await db_session.commit()

    async def _failing_generate(*, db, user_id, binding_key, model_config_id, prompt, param_json, category, **kw):
        raise RuntimeError("provider_error")

    monkeypatch.setattr(ai_gateway_service, "generate_media", _failing_generate)

    # Track add_video_run calls
    original_add_video_run = ai_model_test_service.add_video_run
    add_video_run_calls: list[dict] = []

    async def _tracked_add_video_run(**kwargs):
        add_video_run_calls.append(kwargs)
        return await original_add_video_run(**kwargs)

    monkeypatch.setattr(ai_model_test_service, "add_video_run", _tracked_add_video_run)

    handler = ModelTestVideoGenerateHandler()
    task = _make_task(user_id, {
        "prompt": "fail video",
        "model_config_id": str(uuid4()),
        "session_id": str(session_id),
    })
    reporter = _DummyReporter()

    with pytest.raises(RuntimeError, match="provider_error"):
        await handler.run(db=db_session, task=task, reporter=reporter)

    # Verify add_video_run was called with error_message
    assert len(add_video_run_calls) == 1
    call = add_video_run_calls[0]
    assert call["session_id"] == session_id
    assert call["error_message"] is not None
    assert "provider_error" in call["error_message"]
