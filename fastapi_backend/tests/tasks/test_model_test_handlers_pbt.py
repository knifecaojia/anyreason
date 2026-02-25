"""Property-based tests for ModelTestImageGenerateHandler and ModelTestVideoGenerateHandler.

Uses Hypothesis library for property-based testing.
Each property test runs at least 100 iterations.
"""
from __future__ import annotations

import base64
from types import SimpleNamespace
from uuid import uuid4

import hypothesis.strategies as st
import pytest
from hypothesis import given, settings, HealthCheck

from app.schemas_media import MediaResponse
from app.tasks.handlers.model_test_image_generate import ModelTestImageGenerateHandler
from app.tasks.handlers.model_test_video_generate import ModelTestVideoGenerateHandler


# ---------------------------------------------------------------------------
# Helpers (same patterns as test_model_test_handlers.py)
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


def _make_data_url(mime: str, payload_bytes: bytes) -> str:
    encoded = base64.b64encode(payload_bytes).decode()
    return f"data:{mime};base64,{encoded}"


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

# Non-empty text for prompts (printable, reasonable length)
prompt_st = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "Z")),
    min_size=1,
    max_size=200,
).filter(lambda s: s.strip())

# Resolution strings like "1024x1024", "512x768", etc.
resolution_st = st.one_of(
    st.none(),
    st.builds(
        lambda w, h: f"{w}x{h}",
        st.sampled_from([256, 512, 768, 1024, 2048]),
        st.sampled_from([256, 512, 768, 1024, 2048]),
    ),
)

# Duration for video (seconds)
duration_st = st.one_of(st.none(), st.integers(min_value=1, max_value=60))

# Aspect ratio strings
aspect_ratio_st = st.one_of(
    st.none(),
    st.sampled_from(["16:9", "9:16", "4:3", "3:4", "1:1"]),
)

# Random URL that the mocked gateway will return
gateway_url_st = st.one_of(
    # data URL (image)
    st.builds(
        lambda b: _make_data_url("image/png", b),
        st.binary(min_size=4, max_size=64),
    ),
    # data URL (video)
    st.builds(
        lambda b: _make_data_url("video/mp4", b),
        st.binary(min_size=4, max_size=64),
    ),
)


# Feature: model-test-async-tasks, Property 2: 成功任务创建 Run 记录并返回完整 result_json
# **Validates: Requirements 1.4, 2.4, 6.1**
class TestSuccessfulTaskCreatesRunAndReturnsCompleteResultJson:
    """For any successful model test task (image or video), the Handler's
    result_json should contain:
      - url (non-empty string)
      - session_id (matching input_json)
      - run_id (non-empty string)
    And the corresponding Run record should have been created via
    add_image_run / add_video_run with the correct session_id."""

    @given(
        prompt=prompt_st,
        resolution=resolution_st,
        gateway_url=gateway_url_st,
    )
    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @pytest.mark.asyncio(loop_scope="function")
    async def test_image_handler_success_creates_run_with_complete_result(
        self,
        prompt: str,
        resolution: str | None,
        gateway_url: str,
        db_session,
        monkeypatch,
    ):
        from app.ai_gateway import ai_gateway_service
        from app.services.ai_model_test_service import ai_model_test_service
        from app.models import User, AIModelTestSession

        user_id = uuid4()
        session_id = uuid4()
        model_config_id = uuid4()

        # Create user + session in DB
        db_session.add(User(
            id=user_id, email=f"pbt-img-{user_id.hex[:8]}@test.com",
            hashed_password="x", is_active=True, is_superuser=False, is_verified=True,
        ))
        await db_session.flush()
        db_session.add(AIModelTestSession(
            id=session_id, user_id=user_id, category="image",
        ))
        await db_session.commit()

        # Mock AI gateway to return the generated URL
        async def _fake_generate(*, db, user_id, binding_key, model_config_id, prompt, param_json, category, **kw):
            return MediaResponse(url=gateway_url, usage_id="u1", meta={})

        monkeypatch.setattr(ai_gateway_service, "generate_media", _fake_generate)

        # Track add_image_run calls
        original_add_image_run = ai_model_test_service.add_image_run
        add_image_run_calls: list[dict] = []

        async def _tracked_add_image_run(**kwargs):
            add_image_run_calls.append(kwargs)
            return await original_add_image_run(**kwargs)

        monkeypatch.setattr(ai_model_test_service, "add_image_run", _tracked_add_image_run)

        handler = ModelTestImageGenerateHandler()
        input_json = {
            "prompt": prompt,
            "model_config_id": str(model_config_id),
            "session_id": str(session_id),
        }
        if resolution is not None:
            input_json["resolution"] = resolution

        task = _make_task(user_id, input_json)
        reporter = _DummyReporter()

        result = await handler.run(db=db_session, task=task, reporter=reporter)

        # Property assertions: result_json contains required fields
        assert isinstance(result, dict)
        assert "url" in result and isinstance(result["url"], str) and result["url"]
        assert result["session_id"] == str(session_id)
        assert "run_id" in result and isinstance(result["run_id"], str) and result["run_id"]

        # Run record was created with correct session_id
        assert len(add_image_run_calls) == 1
        call = add_image_run_calls[0]
        assert call["session_id"] == session_id
        assert call["error_message"] is None

    @given(
        prompt=prompt_st,
        duration=duration_st,
        aspect_ratio=aspect_ratio_st,
        gateway_url=gateway_url_st,
    )
    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @pytest.mark.asyncio(loop_scope="function")
    async def test_video_handler_success_creates_run_with_complete_result(
        self,
        prompt: str,
        duration: int | None,
        aspect_ratio: str | None,
        gateway_url: str,
        db_session,
        monkeypatch,
    ):
        from app.ai_gateway import ai_gateway_service
        from app.services.ai_model_test_service import ai_model_test_service
        from app.models import User, AIModelTestSession

        user_id = uuid4()
        session_id = uuid4()
        model_config_id = uuid4()

        # Create user + session in DB
        db_session.add(User(
            id=user_id, email=f"pbt-vid-{user_id.hex[:8]}@test.com",
            hashed_password="x", is_active=True, is_superuser=False, is_verified=True,
        ))
        await db_session.flush()
        db_session.add(AIModelTestSession(
            id=session_id, user_id=user_id, category="video",
        ))
        await db_session.commit()

        # Mock AI gateway to return the generated URL
        async def _fake_generate(*, db, user_id, binding_key, model_config_id, prompt, param_json, category, **kw):
            return MediaResponse(url=gateway_url, usage_id="u1", meta={})

        monkeypatch.setattr(ai_gateway_service, "generate_media", _fake_generate)

        # Track add_video_run calls
        original_add_video_run = ai_model_test_service.add_video_run
        add_video_run_calls: list[dict] = []

        async def _tracked_add_video_run(**kwargs):
            add_video_run_calls.append(kwargs)
            return await original_add_video_run(**kwargs)

        monkeypatch.setattr(ai_model_test_service, "add_video_run", _tracked_add_video_run)

        handler = ModelTestVideoGenerateHandler()
        input_json = {
            "prompt": prompt,
            "model_config_id": str(model_config_id),
            "session_id": str(session_id),
        }
        if duration is not None:
            input_json["duration"] = duration
        if aspect_ratio is not None:
            input_json["aspect_ratio"] = aspect_ratio

        task = _make_task(user_id, input_json)
        reporter = _DummyReporter()

        result = await handler.run(db=db_session, task=task, reporter=reporter)

        # Property assertions: result_json contains required fields
        assert isinstance(result, dict)
        assert "url" in result and isinstance(result["url"], str) and result["url"]
        assert result["session_id"] == str(session_id)
        assert "run_id" in result and isinstance(result["run_id"], str) and result["run_id"]

        # Run record was created with correct session_id
        assert len(add_video_run_calls) == 1
        call = add_video_run_calls[0]
        assert call["session_id"] == session_id
        assert call["error_message"] is None


# ---------------------------------------------------------------------------
# Hypothesis strategies for error messages
# ---------------------------------------------------------------------------

# Non-empty error messages for random exceptions
error_message_st = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P", "Z")),
    min_size=1,
    max_size=200,
).filter(lambda s: s.strip())


# Feature: model-test-async-tasks, Property 3: 失败任务创建包含错误信息的 Run 记录
# **Validates: Requirements 1.5, 2.5**
class TestFailedTaskCreatesRunWithErrorMessage:
    """For any model test task (image or video) where the AI gateway raises an
    exception, the Handler should:
      - create a Run record via add_image_run / add_video_run with a non-empty error_message
      - the Run record should be associated with the correct session_id from input_json
      - re-raise the original exception
    """

    @given(
        prompt=prompt_st,
        resolution=resolution_st,
        error_msg=error_message_st,
    )
    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @pytest.mark.asyncio(loop_scope="function")
    async def test_image_handler_error_creates_run_with_error_message(
        self,
        prompt: str,
        resolution: str | None,
        error_msg: str,
        db_session,
        monkeypatch,
    ):
        from app.ai_gateway import ai_gateway_service
        from app.services.ai_model_test_service import ai_model_test_service
        from app.models import User, AIModelTestSession

        user_id = uuid4()
        session_id = uuid4()
        model_config_id = uuid4()

        # Create user + session in DB
        db_session.add(User(
            id=user_id, email=f"pbt-ierr-{user_id.hex[:8]}@test.com",
            hashed_password="x", is_active=True, is_superuser=False, is_verified=True,
        ))
        await db_session.flush()
        db_session.add(AIModelTestSession(
            id=session_id, user_id=user_id, category="image",
        ))
        await db_session.commit()

        # Mock AI gateway to raise a random exception
        async def _failing_generate(*, db, user_id, binding_key, model_config_id, prompt, param_json, category, **kw):
            raise RuntimeError(error_msg)

        monkeypatch.setattr(ai_gateway_service, "generate_media", _failing_generate)

        # Track add_image_run calls
        original_add_image_run = ai_model_test_service.add_image_run
        add_image_run_calls: list[dict] = []

        async def _tracked_add_image_run(**kwargs):
            add_image_run_calls.append(kwargs)
            return await original_add_image_run(**kwargs)

        monkeypatch.setattr(ai_model_test_service, "add_image_run", _tracked_add_image_run)

        handler = ModelTestImageGenerateHandler()
        input_json = {
            "prompt": prompt,
            "model_config_id": str(model_config_id),
            "session_id": str(session_id),
        }
        if resolution is not None:
            input_json["resolution"] = resolution

        task = _make_task(user_id, input_json)
        reporter = _DummyReporter()

        # Handler should re-raise the exception
        with pytest.raises(RuntimeError):
            await handler.run(db=db_session, task=task, reporter=reporter)

        # Property assertions: add_image_run was called with non-empty error_message
        assert len(add_image_run_calls) == 1
        call = add_image_run_calls[0]
        assert call["session_id"] == session_id
        assert call["error_message"] is not None
        assert isinstance(call["error_message"], str)
        assert len(call["error_message"].strip()) > 0

    @given(
        prompt=prompt_st,
        duration=duration_st,
        aspect_ratio=aspect_ratio_st,
        error_msg=error_message_st,
    )
    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @pytest.mark.asyncio(loop_scope="function")
    async def test_video_handler_error_creates_run_with_error_message(
        self,
        prompt: str,
        duration: int | None,
        aspect_ratio: str | None,
        error_msg: str,
        db_session,
        monkeypatch,
    ):
        from app.ai_gateway import ai_gateway_service
        from app.services.ai_model_test_service import ai_model_test_service
        from app.models import User, AIModelTestSession

        user_id = uuid4()
        session_id = uuid4()
        model_config_id = uuid4()

        # Create user + session in DB
        db_session.add(User(
            id=user_id, email=f"pbt-verr-{user_id.hex[:8]}@test.com",
            hashed_password="x", is_active=True, is_superuser=False, is_verified=True,
        ))
        await db_session.flush()
        db_session.add(AIModelTestSession(
            id=session_id, user_id=user_id, category="video",
        ))
        await db_session.commit()

        # Mock AI gateway to raise a random exception
        async def _failing_generate(*, db, user_id, binding_key, model_config_id, prompt, param_json, category, **kw):
            raise RuntimeError(error_msg)

        monkeypatch.setattr(ai_gateway_service, "generate_media", _failing_generate)

        # Track add_video_run calls
        original_add_video_run = ai_model_test_service.add_video_run
        add_video_run_calls: list[dict] = []

        async def _tracked_add_video_run(**kwargs):
            add_video_run_calls.append(kwargs)
            return await original_add_video_run(**kwargs)

        monkeypatch.setattr(ai_model_test_service, "add_video_run", _tracked_add_video_run)

        handler = ModelTestVideoGenerateHandler()
        input_json = {
            "prompt": prompt,
            "model_config_id": str(model_config_id),
            "session_id": str(session_id),
        }
        if duration is not None:
            input_json["duration"] = duration
        if aspect_ratio is not None:
            input_json["aspect_ratio"] = aspect_ratio

        task = _make_task(user_id, input_json)
        reporter = _DummyReporter()

        # Handler should re-raise the exception
        with pytest.raises(RuntimeError):
            await handler.run(db=db_session, task=task, reporter=reporter)

        # Property assertions: add_video_run was called with non-empty error_message
        assert len(add_video_run_calls) == 1
        call = add_video_run_calls[0]
        assert call["session_id"] == session_id
        assert call["error_message"] is not None
        assert isinstance(call["error_message"], str)
        assert len(call["error_message"].strip()) > 0


# Feature: model-test-async-tasks, Property 4: 任务执行过程中上报进度
# **Validates: Requirements 1.6, 2.6**
class TestTaskReportsProgressDuringExecution:
    """For any model test task execution, the Handler should report progress
    via TaskReporter.progress():
      - Image tasks: at least 2 progress calls
      - Video tasks: at least 3 progress calls
      - Progress values are monotonically increasing
    """

    @given(
        prompt=prompt_st,
        resolution=resolution_st,
        gateway_url=gateway_url_st,
    )
    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @pytest.mark.asyncio(loop_scope="function")
    async def test_image_handler_reports_monotonically_increasing_progress(
        self,
        prompt: str,
        resolution: str | None,
        gateway_url: str,
        db_session,
        monkeypatch,
    ):
        from app.ai_gateway import ai_gateway_service
        from app.services.ai_model_test_service import ai_model_test_service
        from app.models import User, AIModelTestSession

        user_id = uuid4()
        session_id = uuid4()
        model_config_id = uuid4()

        db_session.add(User(
            id=user_id, email=f"pbt-iprog-{user_id.hex[:8]}@test.com",
            hashed_password="x", is_active=True, is_superuser=False, is_verified=True,
        ))
        await db_session.flush()
        db_session.add(AIModelTestSession(
            id=session_id, user_id=user_id, category="image",
        ))
        await db_session.commit()

        async def _fake_generate(*, db, user_id, binding_key, model_config_id, prompt, param_json, category, **kw):
            return MediaResponse(url=gateway_url, usage_id="u1", meta={})

        monkeypatch.setattr(ai_gateway_service, "generate_media", _fake_generate)

        handler = ModelTestImageGenerateHandler()
        input_json = {
            "prompt": prompt,
            "model_config_id": str(model_config_id),
            "session_id": str(session_id),
        }
        if resolution is not None:
            input_json["resolution"] = resolution

        task = _make_task(user_id, input_json)
        reporter = _DummyReporter()

        await handler.run(db=db_session, task=task, reporter=reporter)

        # Image handler must report progress at least 2 times
        assert len(reporter.progress_calls) >= 2, (
            f"Expected at least 2 progress calls for image handler, got {len(reporter.progress_calls)}"
        )

        # Progress values must be monotonically increasing
        for i in range(1, len(reporter.progress_calls)):
            assert reporter.progress_calls[i] > reporter.progress_calls[i - 1], (
                f"Progress not monotonically increasing: {reporter.progress_calls}"
            )

    @given(
        prompt=prompt_st,
        duration=duration_st,
        aspect_ratio=aspect_ratio_st,
        gateway_url=gateway_url_st,
    )
    @settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
    @pytest.mark.asyncio(loop_scope="function")
    async def test_video_handler_reports_monotonically_increasing_progress(
        self,
        prompt: str,
        duration: int | None,
        aspect_ratio: str | None,
        gateway_url: str,
        db_session,
        monkeypatch,
    ):
        from app.ai_gateway import ai_gateway_service
        from app.services.ai_model_test_service import ai_model_test_service
        from app.models import User, AIModelTestSession

        user_id = uuid4()
        session_id = uuid4()
        model_config_id = uuid4()

        db_session.add(User(
            id=user_id, email=f"pbt-vprog-{user_id.hex[:8]}@test.com",
            hashed_password="x", is_active=True, is_superuser=False, is_verified=True,
        ))
        await db_session.flush()
        db_session.add(AIModelTestSession(
            id=session_id, user_id=user_id, category="video",
        ))
        await db_session.commit()

        async def _fake_generate(*, db, user_id, binding_key, model_config_id, prompt, param_json, category, **kw):
            return MediaResponse(url=gateway_url, usage_id="u1", meta={})

        monkeypatch.setattr(ai_gateway_service, "generate_media", _fake_generate)

        handler = ModelTestVideoGenerateHandler()
        input_json = {
            "prompt": prompt,
            "model_config_id": str(model_config_id),
            "session_id": str(session_id),
        }
        if duration is not None:
            input_json["duration"] = duration
        if aspect_ratio is not None:
            input_json["aspect_ratio"] = aspect_ratio

        task = _make_task(user_id, input_json)
        reporter = _DummyReporter()

        await handler.run(db=db_session, task=task, reporter=reporter)

        # Video handler must report progress at least 3 times
        assert len(reporter.progress_calls) >= 3, (
            f"Expected at least 3 progress calls for video handler, got {len(reporter.progress_calls)}"
        )

        # Progress values must be monotonically increasing
        for i in range(1, len(reporter.progress_calls)):
            assert reporter.progress_calls[i] > reporter.progress_calls[i - 1], (
                f"Progress not monotonically increasing: {reporter.progress_calls}"
            )
