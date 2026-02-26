from __future__ import annotations

import asyncio
import logging
import traceback
from uuid import UUID

from sqlalchemy import select

from app.ai_gateway.openai_compat_patch import ensure_openai_compat_patched
from app.database import async_session_maker
from app.models import Task
from app.tasks.handlers.registry import TASK_HANDLER_REGISTRY
from app.tasks.reporter import TaskReporter

# Ensure OpenAI compatibility patch is applied for tasks
ensure_openai_compat_patched()

logger = logging.getLogger(__name__)

# 按任务类型区分超时（秒）。视频生成等长任务给更多时间。
TASK_TIMEOUT_MAP: dict[str, int] = {
    "model_test_image_generate": 300,   # 5 分钟
    "asset_image_generate": 300,        # 5 分钟
    "model_test_video_generate": 1800,  # 30 分钟
    "asset_video_generate": 1800,       # 30 分钟
}
DEFAULT_TASK_TIMEOUT = 600  # 其他任务默认 10 分钟


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
            timeout = TASK_TIMEOUT_MAP.get(task_type, DEFAULT_TASK_TIMEOUT)
            result = await asyncio.wait_for(
                handler.run(db=db, task=reporter.task, reporter=reporter),
                timeout=timeout,
            )
            logger.info("[process-task] handler completed task=%s result_keys=%s", task_id, list((result or {}).keys()))
        except asyncio.TimeoutError:
            timeout = TASK_TIMEOUT_MAP.get(task_type, DEFAULT_TASK_TIMEOUT)
            logger.error("[process-task] handler timed out after %ds task=%s", timeout, task_id)
            await reporter.fail(
                error=f"任务执行超时（{timeout}秒）",
                details={"timeout_seconds": timeout},
            )
            return
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
