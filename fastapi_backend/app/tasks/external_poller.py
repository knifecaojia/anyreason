"""ExternalPoller — periodically polls external AI providers for waiting_external tasks.

Runs as an independent asyncio loop (similar to worker.py).
Can run in the same process as the FastAPI app or as a standalone script.
"""
from __future__ import annotations

import asyncio
import logging
import traceback
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select, and_

from app.database import async_session_maker
from app.models import Task
from app.schemas_media import ExternalTaskRef
from app.tasks.handlers.registry import TASK_HANDLER_REGISTRY
from app.tasks.reporter import TaskReporter

logger = logging.getLogger(__name__)

# Polling configuration
POLL_CYCLE_INTERVAL = 10          # seconds between each scan cycle
POLL_BACKOFF_MIN = 30             # minimum seconds between polls for a single task
POLL_BACKOFF_MAX = 300            # maximum seconds between polls (5 minutes)
POLL_BACKOFF_FACTOR = 1.5         # multiplicative backoff factor
MAX_TASK_WAIT_HOURS = 24          # fail tasks waiting longer than this
BATCH_SIZE = 20                   # max tasks to process per cycle
COMPLETE_PHASE_TIMEOUT = 300      # timeout for on_external_complete (download/save)


async def _poll_single_task(task_id: UUID) -> None:
    """Poll a single waiting_external task and handle state transitions."""
    async with async_session_maker() as db:
        task = (await db.execute(select(Task).where(Task.id == task_id))).scalars().first()
        if task is None or task.status != "waiting_external":
            return

        now = datetime.now(timezone.utc)

        # Check max wait time
        if task.started_at and (now - task.started_at) > timedelta(hours=MAX_TASK_WAIT_HOURS):
            reporter = TaskReporter(db=db, task=task)
            logger.warning("[ext-poller] task=%s exceeded max wait (%dh), failing", task_id, MAX_TASK_WAIT_HOURS)
            await reporter.fail(
                error=f"外部任务等待超时（超过{MAX_TASK_WAIT_HOURS}小时）",
                details={"max_wait_hours": MAX_TASK_WAIT_HOURS},
            )
            return

        # Build ExternalTaskRef from stored data
        ref = ExternalTaskRef(
            external_task_id=task.external_task_id or "",
            provider=task.external_provider or "",
            meta=task.external_meta or {},
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
            handler = TASK_HANDLER_REGISTRY.get(str(task.type or "").strip())
            if handler is None or not handler.supports_two_phase:
                logger.error("[ext-poller] no two-phase handler for task=%s type=%s", task_id, task.type)
                await reporter.fail(error="No handler for external completion")
                return

            try:
                task.status = "running"
                task.updated_at = now
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
                    return
                await reporter.succeed(result_json=result or {})
                logger.info("[ext-poller] task=%s succeeded", task_id)

            except asyncio.TimeoutError:
                logger.error("[ext-poller] on_external_complete timed out task=%s", task_id)
                await reporter.fail(
                    error=f"后处理超时（{COMPLETE_PHASE_TIMEOUT}秒）",
                    details={"timeout_seconds": COMPLETE_PHASE_TIMEOUT, "phase": "on_external_complete"},
                )
            except Exception as e:
                tb = traceback.format_exc()
                logger.error("[ext-poller] on_external_complete failed task=%s error=%s\n%s", task_id, e, tb[-3000:])
                await reporter.fail(
                    error=str(e),
                    details={"exception_type": type(e).__name__, "traceback": tb[-20000:], "phase": "on_external_complete"},
                )

        elif ext_status.state == "failed":
            error_msg = ext_status.error or "External task failed"
            logger.warning("[ext-poller] external task failed task=%s error=%s", task_id, error_msg)
            await reporter.fail(error=error_msg, details={"phase": "external"})

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
    if task.next_poll_at and task.next_poll_at < now:
        elapsed_since_last = (now - task.next_poll_at).total_seconds()
        current_interval = max(POLL_BACKOFF_MIN, elapsed_since_last)
        next_interval = min(current_interval * POLL_BACKOFF_FACTOR, POLL_BACKOFF_MAX)
    else:
        next_interval = POLL_BACKOFF_MIN
    task.next_poll_at = now + timedelta(seconds=next_interval)
    task.updated_at = now


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
    2. Tasks that exceeded MAX_TASK_WAIT_HOURS — fail them.
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=MAX_TASK_WAIT_HOURS)

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
            t.next_poll_at = now
            t.updated_at = now
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
            logger.warning("[ext-poller] zombie: task=%s exceeded max wait %dh, failing", t.id, MAX_TASK_WAIT_HOURS)
            reporter = TaskReporter(db=db, task=t)
            await reporter.fail(
                error=f"外部任务等待超时（超过{MAX_TASK_WAIT_HOURS}小时）",
                details={"max_wait_hours": MAX_TASK_WAIT_HOURS, "phase": "zombie_sweep"},
            )
        if expired_tasks:
            logger.info("[ext-poller] zombie sweep: failed %d expired tasks", len(expired_tasks))
