from __future__ import annotations

import asyncio
import os
import sys
import traceback
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select

from app.config import settings
from app.database import async_session_maker
from app.models import Task
from app.tasks.handlers.registry import TASK_HANDLER_REGISTRY
from app.tasks.redis_client import get_redis
from app.tasks.reporter import TaskReporter


async def _process_task(*, task_id: UUID) -> None:
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
            await reporter.log(message="进入任务处理器", level="info", payload={"handler": handler.__class__.__name__, "task_type": task_type})
            result = await handler.run(db=db, task=reporter.task, reporter=reporter)
        except Exception as e:
            tb = traceback.format_exc()
            await reporter.fail(error=str(e), details={"exception_type": type(e).__name__, "traceback": tb[-20000:]})
            return

        await reporter.succeed(result_json=result or {})


async def _worker_loop() -> None:
    r = get_redis()
    while True:
        item = await r.brpop(settings.TASK_QUEUE_KEY, timeout=5)
        if not item:
            continue
        _queue, raw_id = item
        try:
            task_id = UUID(str(raw_id))
        except Exception:
            continue
        await _process_task(task_id=task_id)


def _run_worker() -> None:
    asyncio.run(_worker_loop())


def main() -> None:
    now = datetime.now(timezone.utc).isoformat()
    known = ", ".join(sorted(TASK_HANDLER_REGISTRY.keys()))
    print(f"[task-worker] starting at {now}", flush=True)
    print(f"[task-worker] known task types: {known}", flush=True)
    reload_enabled = ("--reload" in sys.argv) or (os.getenv("TASK_WORKER_RELOAD", "").strip() == "1")
    if reload_enabled:
        print("[task-worker] reload: enabled", flush=True)
        from watchfiles import run_process
        from watchfiles.filters import BaseFilter

        class _WorkerReloadFilter(BaseFilter):
            def __call__(self, change, path: str) -> bool:
                p = path.replace("\\", "/")
                if "/.venv/" in p:
                    return False
                return p.endswith(".py")

        try:
            run_process([os.getcwd()], target=_run_worker, watch_filter=_WorkerReloadFilter())
        except FileNotFoundError:
            print("[task-worker] reload: falling back to polling", flush=True)
            from multiprocessing import Process

            from watchfiles import watch

            def _start() -> Process:
                p = Process(target=_run_worker, daemon=True)
                p.start()
                return p

            def _stop(p: Process) -> None:
                try:
                    if p.is_alive():
                        p.terminate()
                        p.join(timeout=3)
                    if p.is_alive():
                        p.kill()
                        p.join(timeout=3)
                except Exception:
                    return

            proc = _start()
            try:
                for _changes in watch(
                    os.getcwd(),
                    watch_filter=_WorkerReloadFilter(),
                    force_polling=True,
                    poll_delay_ms=400,
                ):
                    _stop(proc)
                    proc = _start()
            finally:
                _stop(proc)
        return
    _run_worker()


if __name__ == "__main__":
    main()
