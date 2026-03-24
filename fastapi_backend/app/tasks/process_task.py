from __future__ import annotations

import asyncio
import logging
import traceback
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select

from app.ai_gateway.openai_compat_patch import ensure_openai_compat_patched
from app.core.exceptions import AppError
from app.database import async_session_maker
from app.models import AIModelConfig, Task
from app.tasks.handlers.registry import TASK_HANDLER_REGISTRY
from app.tasks.reporter import TaskReporter

# Ensure OpenAI compatibility patch is applied for tasks
ensure_openai_compat_patched()

logger = logging.getLogger(__name__)

# 按任务类型区分超时（秒）。
# 对于支持两阶段的视频任务，此超时仅覆盖提交阶段（通常秒级）。
TASK_TIMEOUT_MAP: dict[str, int] = {
    "model_test_image_generate": 300,   # 5 分钟
    "asset_image_generate": 300,        # 5 分钟
    "model_test_video_generate": 300,   # 5 分钟（提交阶段）
    "asset_video_generate": 300,        # 5 分钟（提交阶段）
    "shot_video_generate": 300,         # 5 分钟（提交阶段）
}
# 走旧 run() 阻塞路径时的超时（兜底）
LEGACY_VIDEO_TIMEOUT: dict[str, int] = {
    "model_test_video_generate": 1800,
    "asset_video_generate": 1800,
    "shot_video_generate": 1800,
}
DEFAULT_TASK_TIMEOUT = 600  # 其他任务默认 10 分钟

# 第一次轮询间隔（秒），ExternalPoller 会在此时间后开始轮询
INITIAL_POLL_DELAY_SECONDS = 30


# =============================================================================
# Queue-aware slot acquisition helpers
# =============================================================================

async def acquire_slot_with_queue(
    *,
    task: Task,
    config_id: str | None,
    keys_info: list[dict] | None = None,
    default_key: str | None = None,
) -> dict:
    """
    Attempt to acquire a slot, queuing if no capacity available.
    
    Returns:
        - Slot acquired: {"api_key": "...", "owner_token": "...", "id": "...", "key_id": "...", "queued": False}
        - Queued: {"queue_position": N, "owner_token": "...", "queued": True}
    
    Raises:
        Exception: If slot acquisition fails for non-queueable reasons
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager

    if not config_id:
        logger.error(
            "[process-task] slot acquisition rejected task=%s type=%s config_id=%s keys_info=%s default_key=%s",
            task.id,
            task.type,
            config_id,
            keys_info,
            default_key,
        )
        raise ValueError("config_id is required for queueable tasks")
    
    manager = AIKeyConcurrencyManager()
    result = await manager.acquire_key(
        config_id=UUID(config_id),
        keys_info=keys_info,
        default_key=default_key,
        task_id=str(task.id),
    )
    
    if result.get("queued"):
        # Task was queued - return queue position
        logger.info(
            "[process-task] task=%s queued at position=%s",
            task.id,
            result.get("queue_position"),
        )
    else:
        # Slot acquired - return key info
        logger.info(
            "[process-task] task=%s acquired slot for key=%s owner_token=%s",
            task.id,
            result.get("api_key"),
            result.get("owner_token"),
        )
    
    return result


async def release_slot_with_owner(
    *,
    config_id: str,
    owner_token: str,
) -> None:
    """Release a slot using owner token verification."""
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager

    manager = AIKeyConcurrencyManager()
    await manager.release_key_with_owner(
        config_id=config_id,
        owner_token=owner_token,
    )
    logger.info("[process-task] released slot config=%s owner=%s", config_id, owner_token)


async def process_task(*, task_id: UUID) -> None:
    async with async_session_maker() as db:
        res = await db.execute(select(Task).where(Task.id == task_id))
        task = res.scalars().first()
        if task is None:
            logger.warning("[process-task] task not found id=%s", task_id)
            return
        if task.status not in {"queued", "queued_for_slot"}:
            logger.info("[process-task] task not queued id=%s status=%s, skipping", task_id, task.status)
            return

        reporter = TaskReporter(db=db, task=task)
        raw_type = str(task.type or "")
        task_type = raw_type.strip()
        logger.info("[process-task] starting task=%s type=%s status=%s", task_id, task_type, task.status)
        await reporter.log(message="任务开始执行", level="info", payload={"task_type": task_type, "status": task.status})

        handler = TASK_HANDLER_REGISTRY.get(task_type)
        if handler is None:
            known = ", ".join(sorted(TASK_HANDLER_REGISTRY.keys()))
            logger.error("[process-task] unknown task type=%r known=%s", raw_type, known)
            await reporter.fail(
                error=f"Unknown task type: {raw_type!r}. Known: {known}",
                details={"task_type": raw_type, "known": list(sorted(TASK_HANDLER_REGISTRY.keys()))},
            )
            return

        # ------------------------------------------------------------------
        # Two-phase path with queue-aware slot acquisition
        # ------------------------------------------------------------------
        if handler.supports_two_phase:
            await process_two_phase_task(db=db, task=task, task_type=task_type, handler=handler, reporter=reporter)
            return

        # ------------------------------------------------------------------
        # Legacy blocking path: handler.run() → succeed/fail
        # ------------------------------------------------------------------
        await reporter.set_running()
        await process_legacy_task(db=db, task=task, task_type=task_type, handler=handler, reporter=reporter)


async def process_two_phase_task(
    *,
    db,
    task: Task,
    task_type: str,
    handler,
    reporter: TaskReporter,
) -> None:
    """
    Process a two-phase task (media/video generation) with queue-aware slot management.
    
    State transitions:
    - queued → queued_for_slot (if no slot available)
    - queued_for_slot → submitting (when slot acquired)
    - submitting → waiting_external (after successful submit)
    - Any phase → failed/canceled (on error/cancel)
    """
    # Get slot config from handler contract for queueable tasks
    config_id = handler.get_slot_config_id(task)
    keys_info = handler.get_slot_keys_info(task)
    default_key = handler.get_slot_default_key(task)
    
    # If no default_key provided but we have config_id, try to get plaintext_api_key from AIModelConfig
    if default_key is None and config_id is not None:
        try:
            config_uuid = UUID(str(config_id))
            config_row = await db.execute(
                select(AIModelConfig.plaintext_api_key).where(AIModelConfig.id == config_uuid)
            )
            plaintext_key = config_row.scalar_one_or_none()
            logger.info(
                "[process-task] AIModelConfig lookup config_id=%s plaintext_key=%s",
                config_id,
                repr(plaintext_key),
            )
            if plaintext_key:
                default_key = plaintext_key
                logger.info(
                    "[process-task] resolved default_key from AIModelConfig config_id=%s",
                    config_id,
                )
        except Exception as e:
            logger.error(
                "[process-task] failed to resolve default_key from AIModelConfig config_id=%s error=%s",
                config_id,
                e,
            )

    logger.info(
        "[process-task] two-phase pre-slot task=%s type=%s status=%s config_id=%s keys_info=%s default_key=%s input_json=%s",
        task.id,
        task.type,
        task.status,
        config_id,
        keys_info,
        default_key,
        task.input_json,
    )

    if handler.supports_two_phase and config_id is None:
        logger.error(
            "[process-task] two-phase config resolution failed task=%s type=%s input_json=%s",
            task.id,
            task.type,
            task.input_json,
        )
        raise ValueError(
            f"Two-phase handler {handler.__class__.__name__} could not resolve model_config_id from task input_json"
        )

    # Normalize task column values to plain Python types
    task_id: UUID = task.id  # type: ignore[assignment]
    task_status: str = str(task.status)  # type: ignore[arg-type]
    task_slot_owner_token: str | None = str(task.slot_owner_token) if task.slot_owner_token is not None else None  # type: ignore[arg-type]
    task_slot_config_id: str | None = str(task.slot_config_id) if task.slot_config_id is not None else None  # type: ignore[arg-type]

    # Phase 1: Slot acquisition (queue-aware)
    # =============================================================================
    
    # Handle different task states for slot acquisition
    # - queued: New task, try to acquire slot (may queue if full)
    # - queued_for_slot: Task was previously queued, try to acquire slot again
    if task_status in ("queued", "queued_for_slot"):
        try:
            # Check if we can acquire a slot directly or need to queue
            slot_result = await acquire_slot_with_queue(
                task=task,
                config_id=config_id,
                keys_info=keys_info,
                default_key=default_key,
            )
            
            if slot_result.get("queued"):
                # No slot available - enter queue (or stay in queue)
                await reporter.set_queued_for_slot(
                    queue_position=slot_result["queue_position"],
                    slot_config_id=config_id,
                    slot_owner_token=slot_result["owner_token"],
                )
                # Task is now in queued_for_slot state
                # Will be picked up again when slot becomes available
                logger.info(
                    "[process-task] task=%s queued_for_slot position=%s",
                    task_id,
                    slot_result["queue_position"],
                )
                return  # Exit, wait for next worker cycle
            else:
                # Slot acquired - transition to submitting
                # Validate config_id is not None for set_submitting
                if config_id is None:
                    raise ValueError("config_id is required for set_submitting")
                await reporter.set_submitting(
                    slot_owner_token=slot_result["owner_token"],
                    slot_config_id=config_id,
                    slot_acquired_at=datetime.now(timezone.utc),
                )
                # Store key info in external_meta for handler.submit() to use
                task.external_meta = task.external_meta or {}  # type: ignore[assignment]
                task.external_meta["_slot_api_key"] = slot_result.get("api_key")  # type: ignore[index]
                task.external_meta["_slot_key_id"] = slot_result.get("key_id")  # type: ignore[index]
                task.external_meta["_slot_owner_token"] = slot_result.get("owner_token")  # type: ignore[index]
                await db.commit()
                logger.info(
                    "[process-task] task=%s acquired slot for key=%s owner_token=%s",
                    task_id,
                    slot_result.get("api_key"),
                    slot_result.get("owner_token"),
                )
                
        except Exception as e:
            tb = traceback.format_exc()
            logger.error("[process-task] slot acquisition failed task=%s error=%s\n%s", task_id, e, tb[-3000:])
            await reporter.fail(
                error=f"Slot acquisition failed: {e}",
                details={"exception_type": type(e).__name__, "traceback": tb[-20000:]},
            )
            return

    # Phase 2: Submit to external provider (if slot acquired)
    # =============================================================================
    
    # Check cancellation before proceeding
    status_now = (await db.execute(select(Task.status).where(Task.id == task_id))).scalar_one_or_none()
    if status_now == "canceled":
        logger.info("[process-task] task canceled before submit task=%s", task_id)
        # Release slot if we had one
        if task_slot_owner_token is not None and task_slot_config_id is not None:
            try:
                await release_slot_with_owner(
                    config_id=task_slot_config_id,
                    owner_token=task_slot_owner_token,
                )
            except Exception as e:
                logger.error("[process-task] failed to release slot on cancel task=%s error=%s", task_id, e)
        return

    # Transition to submitting if not already
    if task_status != "submitting":
        logger.info("[process-task] task=%s status=%s, transitioning to submitting", task_id, task_status)
        # Determine slot_config_id to use
        submitting_config_id = task_slot_config_id if task_slot_config_id is not None else config_id
        if submitting_config_id is None:
            raise ValueError("Cannot determine slot_config_id for submitting")
        await reporter.set_submitting(
            slot_owner_token=task_slot_owner_token if task_slot_owner_token is not None else "unknown",
            slot_config_id=submitting_config_id,
        )

    # Submit to external provider
    try:
        await reporter.log(
            message="进入两阶段提交模式",
            level="info",
            payload={"handler": handler.__class__.__name__, "task_type": task_type},
        )
        timeout = TASK_TIMEOUT_MAP.get(task_type, DEFAULT_TASK_TIMEOUT)
        submit_result = await asyncio.wait_for(
            handler.submit(db=db, task=reporter.task, reporter=reporter),
            timeout=timeout,
        )
        logger.info(
            "[process-task] submit ok task=%s external_task_id=%s provider=%s",
            task_id, submit_result.external_task_id, submit_result.provider,
        )

        # Persist external task info and transition to waiting_external
        now = datetime.now(timezone.utc)
        task.external_task_id = submit_result.external_task_id  # type: ignore[assignment]
        task.external_provider = submit_result.provider  # type: ignore[assignment]
        # Preserve slot info from Phase 1 while merging handler's meta
        existing_meta = dict(task.external_meta or {})  # type: ignore[arg-type]
        handler_meta = dict(submit_result.meta or {})
        # Merge: keep slot info, add handler's meta
        merged_meta = {**existing_meta, **handler_meta}
        task.external_meta = merged_meta  # type: ignore[assignment]
        task.next_poll_at = now + timedelta(seconds=INITIAL_POLL_DELAY_SECONDS)  # type: ignore[assignment]
        task.status = "waiting_external"  # type: ignore[assignment]
        task.updated_at = now  # type: ignore[assignment]
        await db.commit()

        await reporter.log(
            message="已提交至云端，等待生成完成",
            level="info",
            payload={
                "external_task_id": submit_result.external_task_id,
                "provider": submit_result.provider,
            },
        )
        await reporter.publish_event(event_type="waiting_external")
        logger.info("[process-task] task=%s now waiting_external", task_id)
        return

    except asyncio.TimeoutError:
        timeout = TASK_TIMEOUT_MAP.get(task_type, DEFAULT_TASK_TIMEOUT)
        logger.error("[process-task] submit timed out after %ds task=%s", timeout, task_id)
        await reporter.fail(
            error=f"任务提交超时（{timeout}秒）",
            details={"timeout_seconds": timeout, "phase": "submit"},
        )
        # Release slot on timeout
        if task_slot_owner_token is not None and task_slot_config_id is not None:
            try:
                await release_slot_with_owner(
                    config_id=task_slot_config_id,
                    owner_token=task_slot_owner_token,
                )
            except Exception as e:
                logger.error("[process-task] failed to release slot on timeout task=%s error=%s", task_id, e)
        return
    except Exception as e:
        status_now = (await db.execute(select(Task.status).where(Task.id == task_id))).scalar_one_or_none()
        if status_now == "canceled":
            logger.info("[process-task] task canceled during submit task=%s", task_id)
            # Release slot on cancel
            if task_slot_owner_token is not None and task_slot_config_id is not None:
                try:
                    await release_slot_with_owner(
                        config_id=task_slot_config_id,
                        owner_token=task_slot_owner_token,
                    )
                except Exception as release_err:
                    logger.error("[process-task] failed to release slot on cancel task=%s error=%s", task_id, release_err)
            return
        tb = traceback.format_exc()
        if isinstance(e, AppError):
            logger.error("[process-task] submit failed task=%s app_error=%s data=%s", task_id, e.msg, e.data)
            error_msg = e.msg
            error_details = {"exception_type": "AppError", "app_error_data": e.data, "traceback": tb[-20000:], "phase": "submit"}
        else:
            logger.error("[process-task] submit failed task=%s error=%s\n%s", task_id, e, tb[-3000:])
            error_msg = str(e)
            error_details = {"exception_type": type(e).__name__, "traceback": tb[-20000:], "phase": "submit"}
        # Call on_fail for cleanup
        try:
            await handler.on_fail(db=db, task=task, error=str(e))
        except Exception as cleanup_err:
            logger.error("[process-task] on_fail error during submit task=%s error=%s", task_id, cleanup_err)
        
        # Release slot on failure
        if task_slot_owner_token is not None and task_slot_config_id is not None:
            try:
                await release_slot_with_owner(
                    config_id=task_slot_config_id,
                    owner_token=task_slot_owner_token,
                )
            except Exception as release_err:
                logger.error("[process-task] failed to release slot on fail task=%s error=%s", task_id, release_err)
        
        await reporter.fail(error=error_msg, details=error_details)
        return


async def process_legacy_task(
    *,
    db,
    task: Task,
    task_type: str,
    handler,
    reporter: TaskReporter,
) -> None:
    """Process a legacy task using the blocking run() method."""
    try:
        await reporter.log(
            message="进入任务处理器",
            level="info",
            payload={"handler": handler.__class__.__name__, "task_type": task_type},
        )
        logger.info("[process-task] entering handler=%s task=%s", handler.__class__.__name__, task.id)
        timeout = LEGACY_VIDEO_TIMEOUT.get(task_type, TASK_TIMEOUT_MAP.get(task_type, DEFAULT_TASK_TIMEOUT))
        result = await asyncio.wait_for(
            handler.run(db=db, task=reporter.task, reporter=reporter),
            timeout=timeout,
        )
        logger.info("[process-task] handler completed task=%s result_keys=%s", task.id, list((result or {}).keys()))
    except asyncio.TimeoutError:
        timeout = LEGACY_VIDEO_TIMEOUT.get(task_type, TASK_TIMEOUT_MAP.get(task_type, DEFAULT_TASK_TIMEOUT))
        logger.error("[process-task] handler timed out after %ds task=%s", timeout, task.id)
        await reporter.fail(
            error=f"任务执行超时（{timeout}秒）",
            details={"timeout_seconds": timeout},
        )
        return
    except AppError as e:
        status_now = (await db.execute(select(Task.status).where(Task.id == task.id))).scalar_one_or_none()
        if status_now == "canceled":
            logger.info("[process-task] task canceled during execution task=%s", task.id)
            return
        tb = traceback.format_exc()
        logger.error("[process-task] handler failed task=%s app_error=%s data=%s", task.id, e.msg, e.data)
        try:
            await handler.on_fail(db=db, task=task, error=str(e))
        except Exception as cleanup_err:
            logger.error("[process-task] on_fail error during run task=%s error=%s", task.id, cleanup_err)
        await reporter.fail(
            error=e.msg,
            details={"exception_type": "AppError", "app_error_data": e.data, "traceback": tb[-20000:]},
        )
        return
    except Exception as e:
        status_now = (await db.execute(select(Task.status).where(Task.id == task.id))).scalar_one_or_none()
        if status_now == "canceled":
            logger.info("[process-task] task canceled during execution task=%s", task.id)
            return
        tb = traceback.format_exc()
        logger.error("[process-task] handler failed task=%s error=%s\n%s", task.id, e, tb[-3000:])
        # Call on_fail for cleanup
        try:
            await handler.on_fail(db=db, task=task, error=str(e))
        except Exception as cleanup_err:
            logger.error("[process-task] on_fail error during run task=%s error=%s", task.id, cleanup_err)
        await reporter.fail(error=str(e), details={"exception_type": type(e).__name__, "traceback": tb[-20000:]})
        return

    status_now = (await db.execute(select(Task.status).where(Task.id == task.id))).scalar_one_or_none()
    if status_now == "canceled":
        logger.info("[process-task] task canceled before succeed task=%s", task.id)
        return
    try:
        await reporter.succeed(result_json=result or {})
        logger.info("[process-task] task succeeded task=%s", task.id)
    except Exception as e:
        tb = traceback.format_exc()
        logger.error("[process-task] succeed call failed task=%s error=%s", task.id, e)
        await reporter.fail(error=str(e), details={"exception_type": type(e).__name__, "traceback": tb[-20000:]})
