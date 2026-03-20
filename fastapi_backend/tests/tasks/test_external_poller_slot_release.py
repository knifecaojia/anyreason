"""Tests for Task 12: External poller slot release hardening."""
import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.models import Task
from app.schemas_media import ExternalTaskStatus, MediaResponse


def _make_waiting_task(task_id=None, slot_api_key="test-api-key", slot_owner_token="test-owner-token", slot_config_id=None):
    tid = task_id or uuid4()
    cfg_id = slot_config_id or uuid4()
    t = MagicMock(spec=Task)
    t.id = tid
    t.status = "waiting_external"
    t.type = "batch_video_asset_generate"
    t.external_task_id = "ext-123"
    t.external_provider = "vidu"
    t.external_meta = {
        "_slot_api_key": slot_api_key,
        "_slot_owner_token": slot_owner_token,
        "_slot_config_id": str(cfg_id),
    }
    t.slot_owner_token = slot_owner_token
    t.slot_config_id = cfg_id
    t.started_at = datetime.now(timezone.utc) - timedelta(hours=1)
    t.next_poll_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    t.user_id = uuid4()
    return t


def _make_queued_only_task(task_id=None):
    tid = task_id or uuid4()
    cfg_id = uuid4()
    t = MagicMock(spec=Task)
    t.id = tid
    t.status = "queued_for_slot"
    t.type = "batch_video_asset_generate"
    t.external_meta = {}
    t.slot_owner_token = "queued-token"
    t.slot_config_id = cfg_id
    t.started_at = datetime.now(timezone.utc)
    t.next_poll_at = datetime.now(timezone.utc)
    t.user_id = uuid4()
    return t


def _mock_db(task):
    mock_db = AsyncMock()
    mock_db.__aenter__ = AsyncMock(return_value=mock_db)
    mock_db.__aexit__ = AsyncMock(return_value=None)
    mock_db.execute = AsyncMock(return_value=MagicMock(
        scalars=MagicMock(return_value=MagicMock(first=MagicMock(return_value=task)))
    ))
    mock_db.commit = AsyncMock()
    return mock_db


class TestReleaseTaskSlotHelper:
    """Unit tests for the _release_task_slot helper."""

    @pytest.mark.asyncio
    async def test_releases_slot_when_api_key_is_set(self):
        from app.tasks.external_poller import _release_task_slot
        task = _make_waiting_task()
        cfg_id = uuid4()
        task.external_meta = {
            "_slot_api_key": "test-key",
            "_slot_owner_token": "test-token",
            "_slot_config_id": str(cfg_id),
        }
        with patch("app.ai_gateway.concurrency.concurrency_manager") as mock_mgr:
            mock_mgr.release_key_with_owner = AsyncMock()
            await _release_task_slot(task)
            mock_mgr.release_key_with_owner.assert_called_once()
            assert mock_mgr.release_key_with_owner.call_args.kwargs.get("owner_token") == "test-token"

    @pytest.mark.asyncio
    async def test_skips_release_when_no_slot_api_key(self):
        from app.tasks.external_poller import _release_task_slot
        task = _make_queued_only_task()
        with patch("app.ai_gateway.concurrency.concurrency_manager") as mock_mgr:
            mock_mgr.release_key_with_owner = AsyncMock()
            await _release_task_slot(task)
            mock_mgr.release_key_with_owner.assert_not_called()

    @pytest.mark.asyncio
    async def test_uses_fallback_config_id_from_task_slot_config_id(self):
        from app.tasks.external_poller import _release_task_slot
        task = _make_waiting_task()
        task.external_meta = {
            "_slot_api_key": "test-key",
            "_slot_owner_token": "test-token",
        }
        cfg_id = uuid4()
        task.slot_config_id = cfg_id
        with patch("app.ai_gateway.concurrency.concurrency_manager") as mock_mgr:
            mock_mgr.release_key_with_owner = AsyncMock()
            await _release_task_slot(task)
            mock_mgr.release_key_with_owner.assert_called_once()
            assert mock_mgr.release_key_with_owner.call_args.kwargs.get("config_id") == str(cfg_id)

    @pytest.mark.asyncio
    async def test_does_not_release_when_no_config_id_at_all(self):
        from app.tasks.external_poller import _release_task_slot
        task = _make_waiting_task()
        task.external_meta = {
            "_slot_api_key": "test-key",
            "_slot_owner_token": "test-token",
        }
        task.slot_config_id = None
        with patch("app.ai_gateway.concurrency.concurrency_manager") as mock_mgr:
            mock_mgr.release_key_with_owner = AsyncMock()
            await _release_task_slot(task)
            mock_mgr.release_key_with_owner.assert_not_called()

    @pytest.mark.asyncio
    async def test_idempotent_second_call_still_calls_release(self):
        from app.tasks.external_poller import _release_task_slot
        task = _make_waiting_task()
        cfg_id = uuid4()
        task.external_meta = {
            "_slot_api_key": "test-key",
            "_slot_owner_token": "test-token",
            "_slot_config_id": str(cfg_id),
        }
        with patch("app.ai_gateway.concurrency.concurrency_manager") as mock_mgr:
            mock_mgr.release_key_with_owner = AsyncMock()
            await _release_task_slot(task)
            await _release_task_slot(task)
            assert mock_mgr.release_key_with_owner.call_count == 2


class TestPollSingleTaskSlotRelease:
    """Tests for slot release in _poll_single_task terminal paths."""

    @pytest.mark.asyncio
    async def test_external_success_releases_slot_once(self):
        from app.tasks.external_poller import _poll_single_task
        task = _make_waiting_task()
        task_id = task.id
        ext_status = ExternalTaskStatus(  # type: ignore[call-arg]
            state="succeeded",
            result=MediaResponse(url="https://cdn.example.com/video.mp4", usage_id="u1"),  # type: ignore[call-arg]
        )
        release_count = 0

        async def mock_release(t):
            nonlocal release_count
            release_count += 1

        mock_handler = MagicMock()
        mock_handler.supports_two_phase = True
        mock_handler.on_external_complete = AsyncMock(
            return_value={"url": "https://cdn.example.com/video.mp4"}
        )
        with patch("app.tasks.external_poller._release_task_slot", new=mock_release):
            with patch("app.tasks.external_poller.async_session_maker") as msm:
                db = _mock_db(task)
                db.execute = AsyncMock(
                    side_effect=[
                        MagicMock(
                            scalars=MagicMock(
                                return_value=MagicMock(first=MagicMock(return_value=task))
                            )
                        ),
                        MagicMock(
                            scalars=MagicMock(
                                return_value=MagicMock(first=MagicMock(return_value="succeeded"))
                            )
                        ),
                    ]
                )
                msm.return_value = db
                with patch(
                    "app.tasks.handlers.registry.TASK_HANDLER_REGISTRY",
                    {"batch_video_asset_generate": mock_handler},
                ):
                    with patch("app.ai_gateway.ai_gateway_service") as svc:
                        svc.query_media_status = AsyncMock(return_value=ext_status)
                        await _poll_single_task(task_id)
        assert release_count == 1, f"Expected 1, got {release_count}"

    @pytest.mark.asyncio
    async def test_external_failure_releases_slot_once(self):
        from app.tasks.external_poller import _poll_single_task
        task = _make_waiting_task()
        task_id = task.id
        ext_status = ExternalTaskStatus(state="failed", error="provider_error")  # type: ignore[call-arg]
        release_count = 0

        async def mock_release(t):
            nonlocal release_count
            release_count += 1

        with patch("app.tasks.external_poller._release_task_slot", new=mock_release):
            with patch("app.tasks.external_poller.async_session_maker") as msm:
                msm.return_value = _mock_db(task)
                with patch("app.ai_gateway.ai_gateway_service") as svc:
                    svc.query_media_status = AsyncMock(return_value=ext_status)
                    await _poll_single_task(task_id)
        assert release_count == 1, f"Expected 1, got {release_count}"

    @pytest.mark.asyncio
    async def test_post_processing_timeout_releases_slot(self):
        from app.tasks.external_poller import _poll_single_task
        task = _make_waiting_task()
        task_id = task.id
        ext_status = ExternalTaskStatus(  # type: ignore[call-arg]
            state="succeeded",
            result=MediaResponse(url="https://cdn.example.com/video.mp4", usage_id="u1"),  # type: ignore[call-arg]
        )
        release_count = 0

        async def mock_release(t):
            nonlocal release_count
            release_count += 1

        mock_handler = MagicMock()
        mock_handler.supports_two_phase = True
        mock_handler.on_external_complete = AsyncMock(side_effect=asyncio.TimeoutError)
        with patch("app.tasks.external_poller._release_task_slot", new=mock_release):
            with patch("app.tasks.external_poller.async_session_maker") as msm:
                msm.return_value = _mock_db(task)
                with patch(
                    "app.tasks.handlers.registry.TASK_HANDLER_REGISTRY",
                    {"batch_video_asset_generate": mock_handler},
                ):
                    with patch("app.ai_gateway.ai_gateway_service") as svc:
                        svc.query_media_status = AsyncMock(return_value=ext_status)
                        await _poll_single_task(task_id)
        assert release_count == 1, f"Expected 1, got {release_count}"

    @pytest.mark.asyncio
    async def test_post_processing_exception_releases_slot(self):
        from app.tasks.external_poller import _poll_single_task
        task = _make_waiting_task()
        task_id = task.id
        ext_status = ExternalTaskStatus(  # type: ignore[call-arg]
            state="succeeded",
            result=MediaResponse(url="https://cdn.example.com/video.mp4", usage_id="u1"),  # type: ignore[call-arg]
        )
        release_count = 0

        async def mock_release(t):
            nonlocal release_count
            release_count += 1

        mock_handler = MagicMock()
        mock_handler.supports_two_phase = True
        mock_handler.on_external_complete = AsyncMock(
            side_effect=RuntimeError("download failed")
        )
        with patch("app.tasks.external_poller._release_task_slot", new=mock_release):
            with patch("app.tasks.external_poller.async_session_maker") as msm:
                msm.return_value = _mock_db(task)
                with patch(
                    "app.tasks.handlers.registry.TASK_HANDLER_REGISTRY",
                    {"batch_video_asset_generate": mock_handler},
                ):
                    with patch("app.ai_gateway.ai_gateway_service") as svc:
                        svc.query_media_status = AsyncMock(return_value=ext_status)
                        await _poll_single_task(task_id)
        assert release_count == 1, f"Expected 1, got {release_count}"

    @pytest.mark.asyncio
    async def test_queued_only_task_not_processed(self):
        from app.tasks.external_poller import _poll_single_task
        task = _make_queued_only_task()
        task_id = task.id
        release_count = 0

        async def mock_release(t):
            nonlocal release_count
            release_count += 1

        with patch("app.tasks.external_poller._release_task_slot", new=mock_release):
            with patch("app.tasks.external_poller.async_session_maker") as msm:
                msm.return_value = _mock_db(task)
                await _poll_single_task(task_id)
        assert release_count == 0

    @pytest.mark.asyncio
    async def test_max_wait_timeout_releases_slot(self):
        from app.tasks.external_poller import _poll_single_task, get_max_task_wait_hours
        task = _make_waiting_task()
        task_id = task.id
        task.started_at = datetime.now(timezone.utc) - timedelta(
            hours=get_max_task_wait_hours() + 1
        )
        release_count = 0

        async def mock_release(t):
            nonlocal release_count
            release_count += 1

        with patch("app.tasks.external_poller._release_task_slot", new=mock_release):
            with patch("app.tasks.external_poller.async_session_maker") as msm:
                msm.return_value = _mock_db(task)
                await _poll_single_task(task_id)
        assert release_count == 1, f"Expected 1, got {release_count}"

    @pytest.mark.asyncio
    async def test_cancel_before_succeed_releases_slot(self):
        from app.tasks.external_poller import _poll_single_task
        task = _make_waiting_task()
        task_id = task.id
        ext_status = ExternalTaskStatus(  # type: ignore[call-arg]
            state="succeeded",
            result=MediaResponse(url="https://cdn.example.com/video.mp4", usage_id="u1"),  # type: ignore[call-arg]
        )
        release_count = 0

        async def mock_release(t):
            nonlocal release_count
            release_count += 1

        mock_handler = MagicMock()
        mock_handler.supports_two_phase = True
        mock_handler.on_external_complete = AsyncMock(return_value={"url": "x"})
        with patch("app.tasks.external_poller._release_task_slot", new=mock_release):
            with patch("app.tasks.external_poller.async_session_maker") as msm:
                db = _mock_db(task)
                db.execute = AsyncMock(
                    side_effect=[
                        MagicMock(
                            scalars=MagicMock(
                                return_value=MagicMock(first=MagicMock(return_value=task))
                            )
                        ),
                        MagicMock(
                            scalars=MagicMock(
                                return_value=MagicMock(first=MagicMock(return_value="canceled"))
                            )
                        ),
                    ]
                )
                msm.return_value = db
                with patch(
                    "app.tasks.handlers.registry.TASK_HANDLER_REGISTRY",
                    {"batch_video_asset_generate": mock_handler},
                ):
                    with patch("app.ai_gateway.ai_gateway_service") as svc:
                        svc.query_media_status = AsyncMock(return_value=ext_status)
                        await _poll_single_task(task_id)
        assert release_count == 1, (
            f"Cancel before succeed must release slot. Got {release_count}"
        )

    @pytest.mark.asyncio
    async def test_duplicate_callback_is_idempotent(self):
        from app.tasks.external_poller import _poll_single_task
        task = _make_waiting_task()
        task_id = task.id
        ext_status = ExternalTaskStatus(  # type: ignore[call-arg]
            state="succeeded",
            result=MediaResponse(url="https://cdn.example.com/video.mp4", usage_id="u1"),  # type: ignore[call-arg]
        )
        release_count = 0

        async def mock_release(t):
            nonlocal release_count
            release_count += 1
            t.external_meta.pop("_slot_api_key", None)

        mock_handler = MagicMock()
        mock_handler.supports_two_phase = True
        mock_handler.on_external_complete = AsyncMock(return_value={"url": "x"})
        with patch("app.tasks.external_poller._release_task_slot", new=mock_release):
            with patch("app.tasks.external_poller.async_session_maker") as msm:
                db = _mock_db(task)
                db.execute = AsyncMock(
                    side_effect=[
                        MagicMock(
                            scalars=MagicMock(
                                return_value=MagicMock(first=MagicMock(return_value=task))
                            )
                        ),
                        MagicMock(
                            scalars=MagicMock(
                                return_value=MagicMock(first=MagicMock(return_value="succeeded"))
                            )
                        ),
                    ]
                )
                msm.return_value = db
                with patch(
                    "app.tasks.handlers.registry.TASK_HANDLER_REGISTRY",
                    {"batch_video_asset_generate": mock_handler},
                ):
                    with patch("app.ai_gateway.ai_gateway_service") as svc:
                        svc.query_media_status = AsyncMock(return_value=ext_status)
                        await _poll_single_task(task_id)
        assert release_count == 1


class TestZombieSweepSlotRelease:
    """Tests for slot release in _zombie_sweep (max-wait expiration)."""

    @pytest.mark.asyncio
    async def test_zombie_sweep_expired_task_releases_slot(self):
        from app.tasks.external_poller import _zombie_sweep, get_max_task_wait_hours
        task = _make_waiting_task()
        task.status = "waiting_external"
        task.next_poll_at = None
        task.started_at = datetime.now(timezone.utc) - timedelta(
            hours=get_max_task_wait_hours() + 1
        )
        release_count = 0

        async def mock_release(t):
            nonlocal release_count
            release_count += 1

        with patch("app.tasks.external_poller._release_task_slot", new=mock_release):
            with patch("app.tasks.external_poller.async_session_maker") as msm:
                mock_db = AsyncMock()
                mock_db.__aenter__ = AsyncMock(return_value=mock_db)
                mock_db.__aexit__ = AsyncMock(return_value=None)
                mock_db.execute = AsyncMock(
                    side_effect=[
                        MagicMock(
                            scalars=MagicMock(
                                return_value=MagicMock(all=MagicMock(return_value=[task]))
                            )
                        ),
                        MagicMock(
                            scalars=MagicMock(
                                return_value=MagicMock(all=MagicMock(return_value=[task]))
                            )
                        ),
                    ]
                )
                mock_db.commit = AsyncMock()
                msm.return_value = mock_db
                await _zombie_sweep()
        assert release_count == 1, f"Expected 1, got {release_count}"


class TestReleaseKeyIdempotence:
    """Tests for concurrency manager idempotence guarantees."""

    @pytest.mark.asyncio
    async def test_release_key_with_owner_skips_unknown_owner(self):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()
        with patch("app.tasks.redis_client.get_redis") as mr:
            mock_r = AsyncMock()
            mock_r.hgetall = AsyncMock(return_value={})
            mr.return_value = mock_r
            result = await mgr.release_key_with_owner(
                config_id=str(uuid4()), owner_token="nonexistent"
            )
        assert result is False

    @pytest.mark.asyncio
    async def test_release_key_caps_at_zero(self):
        with patch("app.ai_gateway.concurrency.get_redis") as mr:
            mock_r = AsyncMock()
            mock_r.decr = AsyncMock(return_value=-1)
            mock_r.set = AsyncMock()
            mr.return_value = mock_r
            # Import AFTER patching get_redis so __init__ uses the mock
            from app.ai_gateway.concurrency import AIKeyConcurrencyManager
            mgr = AIKeyConcurrencyManager()
            with patch.object(mgr, "_get_current_usage", AsyncMock(return_value=1)):
                with patch.object(mgr, "dequeue_owner", AsyncMock(return_value=None)):
                    cfg_id = uuid4()
                    await mgr.release_key(cfg_id, "test-key")
            mock_r.set.assert_called_once()


class TestBatchHandlerLogger:
    """Verify batch_video_asset_generate handler logger is properly imported."""

    def test_logger_imported(self):
        from app.tasks.handlers.batch_video_asset_generate import logger
        assert logger is not None

    @pytest.mark.asyncio
    async def test_on_fail_does_not_raise_NameError(self):
        from app.tasks.handlers.batch_video_asset_generate import BatchVideoAssetGenerateHandler
        handler = BatchVideoAssetGenerateHandler()
        mock_task = MagicMock()
        mock_task.id = uuid4()
        mock_task.input_json = {"asset_id": str(uuid4())}
        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=None)
        mock_db.execute = AsyncMock(
            return_value=MagicMock(
                scalars=MagicMock(
                    return_value=MagicMock(first=MagicMock(return_value=None))
                )
            )
        )
        mock_db.commit = AsyncMock()
        await handler.on_fail(db=mock_db, task=mock_task, error="test error")
