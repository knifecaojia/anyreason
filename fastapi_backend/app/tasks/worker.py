from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone
from uuid import UUID

from app.config import settings
from app.tasks.redis_client import get_redis
from app.tasks.process_task import process_task


def _load_task_handler_registry():
    try:
        from app.tasks.handlers.registry import TASK_HANDLER_REGISTRY
    except ModuleNotFoundError as e:
        missing = getattr(e, "name", None) or "unknown"
        print(f"[task-worker] import failed: missing module {missing!r}", flush=True)
        print("[task-worker] fix:", flush=True)
        print("  1) cd fastapi_backend", flush=True)
        print("  2) uv sync", flush=True)
        print("  3) uv run python -m app.tasks.worker --reload", flush=True)
        raise
    return TASK_HANDLER_REGISTRY


async def _worker_loop() -> None:
    r = get_redis()
    while True:
        try:
            item = await r.brpop(settings.TASK_QUEUE_KEY, timeout=5)
        except Exception:
            await asyncio.sleep(0.5)
            continue
        if not item:
            continue
        _queue, raw_id = item
        try:
            task_id = UUID(str(raw_id))
        except Exception:
            continue
        await process_task(task_id=task_id)


def _run_worker() -> None:
    asyncio.run(_worker_loop())


def main() -> None:
    registry = _load_task_handler_registry()
    now = datetime.now(timezone.utc).isoformat()
    known = ", ".join(sorted(registry.keys()))
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
