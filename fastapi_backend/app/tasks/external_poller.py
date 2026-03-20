"""ExternalPoller — periodically polls external AI providers for waiting_external tasks.

Runs as an independent asyncio loop (similar to worker.py).
Can run in the same process as the FastAPI app or as a standalone script.

Slot release strategy:
  - Slots are released ONLY for tasks that have acquired one (task.external_meta["_slot_api_key"] is set).
  - Queued-only tasks (queued_for_slot, never acquired) have no slot to release.
  - Release is idempotent via release_key_with_owner — safe to call multiple times.
  - The helper checks task.status to avoid releasing before submission completes.
"""
from __future__ import annotations

import asyncio
import logging
import traceback
from datetime import datetime, timedelta, timezone
from typing import cast
from uuid import UUID

from sqlalchemy import select, and_

from app.database import async_session_maker
from app.models import Task
from app.schemas_media import ExternalTaskRef
from app.tasks.reporter import TaskReporter
from app.config import settings

logger = logging.getLogger(__name__)


# Polling configuration
POLL_CYCLE_INTERVAL = 10          # seconds between each scan cycle
POLL_BACKOFF_MIN = 30             # minimum seconds between polls for a single task
POLL_BACKOFF_MAX = 300            # maximum seconds between polls (5 minutes)
POLL_BACKOFF_FACTOR = 1.5         # multiplicative backoff factor
BATCH_SIZE = 20                   # max tasks to process per cycle
COMPLETE_PHASE_TIMEOUT = 300      # timeout for on_external_complete (download/save)


def get_max_task_wait_hours() -> int:
    """Get the max wait hours for external tasks from config."""
    return settings.EXTERNAL_TASK_MAX_WAIT_HOURS


async def _release_task_slot(task: Task) -> None:
    """Release the concurrency slot held by a task, if one was acquired.

    Idempotent: safe to call even if slot was already released.
    Only releases for tasks that have actually acquired a slot (have _slot_api_key in external_meta).
    Skips queued-only tasks that never acquired a slot.
    """
    _raw_meta = task.external_meta
    external_meta: dict[str, object] = _raw_meta if _raw_meta is not None else {}  # type: ignore[assignment]
    api_key: str | None = str(external_meta.get("_slot_api_key")) if external_meta.get("_slot_api_key") is not None else None  # type: ignore[arg-type]

    # Queued-only tasks (never acquired) have no slot to release.
    # Guard: _slot_api_key is only set after slot acquisition + submit succeeds.
    if not api_key:
        logger.debug(
            "[ext-poller] no slot acquired for task=%s (queued-only or already released), skipping release",
            task.id,
        )
        return

    owner_token: str | None = str(external_meta.get("_slot_owner_token")) if external_meta.get("_slot_owner_token") is not None else None  # type: ignore[arg-type]
    _raw_config_id = external_meta.get("_slot_config_id")
    _task_config_id: UUID | None = task.slot_config_id  # type: ignore[assignment]
    config_id_str: str | None = None
    if _raw_config_id is not None:
        config_id_str = str(_raw_config_id)
    elif _task_config_id is not None:
        config_id_str = str(_task_config_id)

    if config_id_str is None:
        logger.warning(
            "[ext-poller] task=%s has _slot_api_key but no config_id, cannot release slot",
            task.id,
        )
        return

    from app.ai_gateway.concurrency import concurrency_manager

    # Resolve default_key for queue advancement (needed to advance queued tasks)
    default_key: str | None = None
    try:
        from app.models import AIModelConfig
        async with async_session_maker() as tmp_db:
            config_uuid = UUID(config_id_str)
            config_row = await tmp_db.execute(
                select(AIModelConfig.plaintext_api_key).where(AIModelConfig.id == config_uuid)
            )
            default_key = config_row.scalar_one_or_none()
    except Exception:
        pass  # Best-effort; if we can't resolve, queue won't auto-advance

    try:
        await concurrency_manager.release_key_with_owner(
            config_id=config_id_str,
            owner_token=owner_token or "",
            keys_info=None,
            default_key=default_key,
        )
        logger.info("[ext-poller] released slot for task=%s", task.id)
    except Exception as e:
        # Release is best-effort; log and continue so task state transition is not blocked.
        logger.error("[ext-poller] failed to release slot for task=%s: %s", task.id, e)


async def _poll_single_task(task_id: UUID) -> None:
    """Poll a single waiting_external task and handle state transitions."""
    async with async_session_maker() as db:
        task = (await db.execute(select(Task).where(Task.id == task_id))).scalars().first()
        task_status: str | None = str(task.status) if task.status is not None else None  # type: ignore
        if task is None or task_status != "waiting_external":
            return

        now = datetime.now(timezone.utc)

        # Check max wait time
        started_at: datetime | None = task.started_at  # type: ignore
        if started_at is not None and (now - started_at) > timedelta(hours=get_max_task_wait_hours()):
            reporter = TaskReporter(db=db, task=task)
            logger.warning("[ext-poller] task=%s exceeded max wait (%dh), failing", task_id, get_max_task_wait_hours())
            await reporter.fail(
                error=f"外部任务等待超时（超过{get_max_task_wait_hours()}小时）",
                details={"max_wait_hours": get_max_task_wait_hours()},
            )
            # Release slot — task timed out while holding slot.
            await _release_task_slot(task)
            return

        # Build ExternalTaskRef from stored data (extract ORM columns to plain Python types)
        _raw_ext_id = task.external_task_id
        ext_task_id: str = str(_raw_ext_id) if _raw_ext_id is not None else ""
        _raw_ext_provider = task.external_provider
        ext_provider: str = str(_raw_ext_provider) if _raw_ext_provider is not None else ""
        _raw_ext_meta = task.external_meta
        ext_meta: dict[str, object] = _raw_ext_meta if _raw_ext_meta is not None else {}  # type: ignore[assignment]
        ref = ExternalTaskRef(
            external_task_id=ext_task_id,
            provider=ext_provider,
            meta=ext_meta,
        )

        # Query external provider
        from app.ai_gateway import ai_gateway_service
        try:
            ext_status = await ai_gateway_service.query_media_status(ref=ref)
        except Exception as e:
            logger.warning("[ext-poller] query failed task=%s provider=%s error=%s", task_id, ref.provider, e)
            # On transient error, schedule retry with backoff
            _schedule_next_poll(task, now)
            await db.commit()
            return

        logger.info(
            "[ext-poller] task=%s provider=%s state=%s progress=%s",
            task_id, ref.provider, ext_status.state, ext_status.progress,
        )

        reporter = TaskReporter(db=db, task=task)

        if ext_status.state == "succeeded" and ext_status.result is not None:
            # External task completed — run on_external_complete
            # Lazy import to avoid triggering heavy handler registry imports for config-only tests
            from app.tasks.handlers.registry import TASK_HANDLER_REGISTRY  # noqa: E402
            handler = TASK_HANDLER_REGISTRY.get(str(task.type or "").strip())
            if handler is None or not handler.supports_two_phase:
                logger.error("[ext-poller] no two-phase handler for task=%s type=%s", task_id, task.type)
                await reporter.fail(error="No handler for external completion")
                return

            try:
                task.status = "running"  # type: ignore
                task.updated_at = now  # type: ignore
                await db.commit()
                await reporter.publish_event(event_type="running")

                result = await asyncio.wait_for(
                    handler.on_external_complete(
                        db=db, task=task, reporter=reporter,
                        media_response=ext_status.result,
                    ),
                    timeout=COMPLETE_PHASE_TIMEOUT,
                )
                # Check for cancellation
                status_now = (await db.execute(select(Task.status).where(Task.id == task_id))).scalar_one_or_none()
                if status_now == "canceled":
                    logger.info("[ext-poller] task canceled before succeed task=%s", task_id)
                    # Release slot — task was canceled while holding slot.
                    await _release_task_slot(task)
                    return
                await reporter.succeed(result_json=result or {})
                logger.info("[ext-poller] task=%s succeeded", task_id)
                # Release the concurrency slot now that task has succeeded.
                # This is idempotent — safe even if the slot was already released elsewhere.
                await _release_task_slot(task)

            except asyncio.TimeoutError:
                logger.error("[ext-poller] on_external_complete timed out task=%s", task_id)
                await reporter.fail(
                    error=f"后处理超时（{COMPLETE_PHASE_TIMEOUT}秒）",
                    details={"timeout_seconds": COMPLETE_PHASE_TIMEOUT, "phase": "on_external_complete"},
                )
                # Release slot — post-processing failed so slot must be freed.
                await _release_task_slot(task)
            except Exception as e:
                tb = traceback.format_exc()
                logger.error("[ext-poller] on_external_complete failed task=%s error=%s\n%s", task_id, e, tb[-3000:])
                await reporter.fail(
                    error=str(e),
                    details={"exception_type": type(e).__name__, "traceback": tb[-20000:], "phase": "on_external_complete"},
                )
                # Release slot — post-processing failed so slot must be freed.
                await _release_task_slot(task)

        elif ext_status.state == "failed":
            error_msg = ext_status.error or "External task failed"
            logger.warning("[ext-poller] external task failed task=%s error=%s", task_id, error_msg)
            await reporter.fail(error=error_msg, details={"phase": "external"})
            # Release slot — provider reported failure, slot must be freed.
            await _release_task_slot(task)

        else:
            # Still running/pending — update progress and schedule next poll
            if ext_status.progress is not None:
                # Map external progress (0-100) to our range (10-50) for waiting phase
                mapped_progress = 10 + int(ext_status.progress * 0.4)
                await reporter.progress(progress=mapped_progress)
            _schedule_next_poll(task, now)
            await db.commit()


def _schedule_next_poll(task: Task, now: datetime) -> None:
    """Calculate next poll time with exponential backoff."""
    _next_poll_at = cast(datetime | None, task.next_poll_at)
    if _next_poll_at and _next_poll_at < now:
        elapsed_since_last = (now - _next_poll_at).total_seconds()
        current_interval = max(POLL_BACKOFF_MIN, elapsed_since_last)
        next_interval = min(current_interval * POLL_BACKOFF_FACTOR, POLL_BACKOFF_MAX)
    else:
        next_interval = POLL_BACKOFF_MIN
    task.next_poll_at = now + timedelta(seconds=next_interval)  # type: ignore
    task.updated_at = now  # type: ignore


ZOMBIE_SWEEP_EVERY_N_CYCLES = 30   # run zombie sweep every N poll cycles


async def run_external_poller(*, stop_event: asyncio.Event) -> None:
    """Main poller loop. Call this from app startup or as a standalone process."""
    logger.info("[ext-poller] starting external task poller (cycle=%ds)", POLL_CYCLE_INTERVAL)
    cycle_count = 0

    while not stop_event.is_set():
        cycle_count += 1
        try:
            await _poll_cycle()
        except Exception:
            logger.exception("[ext-poller] unexpected error in poll cycle")

        # Periodic zombie sweep
        if cycle_count % ZOMBIE_SWEEP_EVERY_N_CYCLES == 0:
            try:
                await _zombie_sweep()
            except Exception:
                logger.exception("[ext-poller] unexpected error in zombie sweep")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=POLL_CYCLE_INTERVAL)
            break  # stop_event was set
        except asyncio.TimeoutError:
            pass  # normal: timeout means it's time for next cycle


async def _poll_cycle() -> None:
    """Single scan: find all tasks due for polling and process them."""
    now = datetime.now(timezone.utc)

    async with async_session_maker() as db:
        result = await db.execute(
            select(Task.id).where(
                and_(
                    Task.status == "waiting_external",
                    Task.next_poll_at <= now,
                )
            ).order_by(Task.next_poll_at).limit(BATCH_SIZE)
        )
        task_ids = [row[0] for row in result.fetchall()]

    if not task_ids:
        return

    logger.info("[ext-poller] polling %d tasks", len(task_ids))

    for tid in task_ids:
        try:
            await _poll_single_task(tid)
        except Exception:
            logger.exception("[ext-poller] error polling task=%s", tid)


async def _zombie_sweep() -> None:
    """Detect and fix zombie tasks stuck in waiting_external.

    Handles two cases:
    1. Tasks with null next_poll_at — schedule them for immediate polling.
    2. Tasks that exceeded get_max_task_wait_hours() — fail them.
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=get_max_task_wait_hours())

    async with async_session_maker() as db:
        # Case 1: null next_poll_at — fix scheduling
        orphans = await db.execute(
            select(Task).where(
                and_(
                    Task.status == "waiting_external",
                    Task.next_poll_at.is_(None),
                )
            ).limit(BATCH_SIZE)
        )
        orphan_tasks = orphans.scalars().all()
        for t in orphan_tasks:
            logger.warning("[ext-poller] zombie: task=%s has null next_poll_at, scheduling now", t.id)
            t.next_poll_at = now  # type: ignore
            t.updated_at = now  # type: ignore
        if orphan_tasks:
            await db.commit()

        # Case 2: exceeded max wait time
        expired = await db.execute(
            select(Task).where(
                and_(
                    Task.status == "waiting_external",
                    Task.started_at < cutoff,
                )
            ).limit(BATCH_SIZE)
        )
        expired_tasks = expired.scalars().all()
        for t in expired_tasks:
            logger.warning("[ext-poller] zombie: task=%s exceeded max wait %dh, failing", t.id, get_max_task_wait_hours())
            reporter = TaskReporter(db=db, task=t)
            await reporter.fail(
                error=f"外部任务等待超时（超过{get_max_task_wait_hours()}小时）",
                details={"max_wait_hours": get_max_task_wait_hours(), "phase": "zombie_sweep"},
            )
            # Release slot — task timed out while holding slot.
            await _release_task_slot(t)
