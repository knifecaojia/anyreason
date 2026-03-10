from __future__ import annotations

import asyncio
import logging
import traceback
from datetime import datetime, timedelta, timezone
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

# 按任务类型区分超时（秒）。
# 对于支持两阶段的视频任务，此超时仅覆盖提交阶段（通常秒级）。
TASK_TIMEOUT_MAP: dict[str, int] = {
    "model_test_image_generate": 300,   # 5 分钟
    "asset_image_generate": 300,        # 5 分钟
    "model_test_video_generate": 120,   # 2 分钟（仅提交阶段）
    "asset_video_generate": 120,        # 2 分钟（仅提交阶段）
    "shot_video_generate": 120,         # 2 分钟（仅提交阶段）
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

        # ------------------------------------------------------------------
        # Two-phase path: handler.submit() → waiting_external → ExternalPoller
        # ------------------------------------------------------------------
        if handler.supports_two_phase:
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
                task.external_task_id = submit_result.external_task_id
                task.external_provider = submit_result.provider
                task.external_meta = submit_result.meta
                task.next_poll_at = now + timedelta(seconds=INITIAL_POLL_DELAY_SECONDS)
                task.status = "waiting_external"
                task.updated_at = now
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
                return
            except Exception as e:
                status_now = (await db.execute(select(Task.status).where(Task.id == task_id))).scalar_one_or_none()
                if status_now == "canceled":
                    logger.info("[process-task] task canceled during submit task=%s", task_id)
                    return
                tb = traceback.format_exc()
                logger.error("[process-task] submit failed task=%s error=%s\n%s", task_id, e, tb[-3000:])
                await reporter.fail(error=str(e), details={"exception_type": type(e).__name__, "traceback": tb[-20000:], "phase": "submit"})
                return

        # ------------------------------------------------------------------
        # Legacy blocking path: handler.run() → succeed/fail
        # ------------------------------------------------------------------
        try:
            await reporter.log(
                message="进入任务处理器",
                level="info",
                payload={"handler": handler.__class__.__name__, "task_type": task_type},
            )
            logger.info("[process-task] entering handler=%s task=%s", handler.__class__.__name__, task_id)
            timeout = LEGACY_VIDEO_TIMEOUT.get(task_type, TASK_TIMEOUT_MAP.get(task_type, DEFAULT_TASK_TIMEOUT))
            result = await asyncio.wait_for(
                handler.run(db=db, task=reporter.task, reporter=reporter),
                timeout=timeout,
            )
            logger.info("[process-task] handler completed task=%s result_keys=%s", task_id, list((result or {}).keys()))
        except asyncio.TimeoutError:
            timeout = LEGACY_VIDEO_TIMEOUT.get(task_type, TASK_TIMEOUT_MAP.get(task_type, DEFAULT_TASK_TIMEOUT))
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
