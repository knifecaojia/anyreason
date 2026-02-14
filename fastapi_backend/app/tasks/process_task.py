from __future__ import annotations

import traceback
from uuid import UUID

from sqlalchemy import select

from app.database import async_session_maker
from app.models import Task
from app.tasks.handlers.registry import TASK_HANDLER_REGISTRY
from app.tasks.reporter import TaskReporter


async def process_task(*, task_id: UUID) -> None:
    async with async_session_maker() as db:
        res = await db.execute(select(Task).where(Task.id == task_id))
        task = res.scalars().first()
        if task is None:
            return
        if task.status != "queued":
            return

        reporter = TaskReporter(db=db, task=task)
        await reporter.log(message="任务开始执行", level="info", payload={"task_type": str(task.type or "").strip()})
        await reporter.set_running()

        raw_type = str(task.type or "")
        task_type = raw_type.strip()
        handler = TASK_HANDLER_REGISTRY.get(task_type)
        if handler is None:
            known = ", ".join(sorted(TASK_HANDLER_REGISTRY.keys()))
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
            result = await handler.run(db=db, task=reporter.task, reporter=reporter)
        except Exception as e:
            status_now = (await db.execute(select(Task.status).where(Task.id == task_id))).scalar_one_or_none()
            if status_now == "canceled":
                return
            tb = traceback.format_exc()
            await reporter.fail(error=str(e), details={"exception_type": type(e).__name__, "traceback": tb[-20000:]})
            return

        status_now = (await db.execute(select(Task.status).where(Task.id == task_id))).scalar_one_or_none()
        if status_now == "canceled":
            return
        try:
            await reporter.succeed(result_json=result or {})
        except Exception as e:
            tb = traceback.format_exc()
            await reporter.fail(error=str(e), details={"exception_type": type(e).__name__, "traceback": tb[-20000:]})
