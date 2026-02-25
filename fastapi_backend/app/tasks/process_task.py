from __future__ import annotations

import logging
import traceback
from uuid import UUID

from sqlalchemy import select

from app.database import async_session_maker
from app.models import Task
from app.tasks.handlers.registry import TASK_HANDLER_REGISTRY
from app.tasks.reporter import TaskReporter

logger = logging.getLogger(__name__)


async def process_task(*, task_id: UUID) -> None:
    async with async_session_maker() as db:
        res = await db.execute(select(Task).where(Task.id == task_id))
        task = res.scalars().first()
        if task is None:
            logger.warning("[process-task] task not found id=%s", task_id)
            return
        if task.status != "queued":
            logger.info("[process-task] task not queued id=%s status=%s, skipping", task_id, task.status)
            return

        reporter = TaskReporter(db=db, task=task)
        raw_type = str(task.type or "")
        task_type = raw_type.strip()
        logger.info("[process-task] starting task=%s type=%s", task_id, task_type)
        await reporter.log(message="任务开始执行", level="info", payload={"task_type": task_type})
        await reporter.set_running()

        handler = TASK_HANDLER_REGISTRY.get(task_type)
        if handler is None:
            known = ", ".join(sorted(TASK_HANDLER_REGISTRY.keys()))
            logger.error("[process-task] unknown task type=%r known=%s", raw_type, known)
            await reporter.fail(
                error=f"Unknown task type: {raw_type!r}. Known: {known}",
                details={"task_type": raw_type, "known": list(sorted(TASK_HANDLER_REGISTRY.keys()))},
            )
            return

        try:
            await reporter.log(
                message="进入任务处理器",
                level="info",
                payload={"handler": handler.__class__.__name__, "task_type": task_type},
            )
            logger.info("[process-task] entering handler=%s task=%s", handler.__class__.__name__, task_id)
            result = await handler.run(db=db, task=reporter.task, reporter=reporter)
            logger.info("[process-task] handler completed task=%s result_keys=%s", task_id, list((result or {}).keys()))
        except Exception as e:
            status_now = (await db.execute(select(Task.status).where(Task.id == task_id))).scalar_one_or_none()
            if status_now == "canceled":
                logger.info("[process-task] task canceled during execution task=%s", task_id)
                return
            tb = traceback.format_exc()
            logger.error("[process-task] handler failed task=%s error=%s\n%s", task_id, e, tb[-3000:])
            await reporter.fail(error=str(e), details={"exception_type": type(e).__name__, "traceback": tb[-20000:]})
            return

        status_now = (await db.execute(select(Task.status).where(Task.id == task_id))).scalar_one_or_none()
        if status_now == "canceled":
            logger.info("[process-task] task canceled before succeed task=%s", task_id)
            return
        try:
            await reporter.succeed(result_json=result or {})
            logger.info("[process-task] task succeeded task=%s", task_id)
        except Exception as e:
            tb = traceback.format_exc()
            logger.error("[process-task] succeed call failed task=%s error=%s", task_id, e)
            await reporter.fail(error=str(e), details={"exception_type": type(e).__name__, "traceback": tb[-20000:]})
