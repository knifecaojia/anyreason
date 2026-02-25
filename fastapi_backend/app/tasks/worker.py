from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone
from uuid import UUID

from app.config import settings
from app.log import setup_logging
from app.tasks.redis_client import get_redis, close_redis
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
    print("[task-worker] connecting to redis...", flush=True)
    
    # 尝试连接 Redis，带有重试逻辑
    while True:
        try:
            r = get_redis()
            await r.ping()
            print("[task-worker] connected to redis.", flush=True)
            break
        except Exception as e:
            print(f"[task-worker] failed to connect to redis: {e}. Retrying in 5s...", flush=True)
            await asyncio.sleep(5)

    while True:
        try:
            # print("[task-worker] waiting for task...", flush=True)
            item = await r.brpop(settings.TASK_QUEUE_KEY, timeout=5)
        except Exception as e:
            # 只有在非常严重的错误时才打印，避免刷屏
            # print(f"[task-worker] redis error: {e}", flush=True)
            await asyncio.sleep(0.5)
            continue
        if not item:
            # print("[task-worker] timeout, no task", flush=True)
            continue
        
        print(f"[task-worker] got item: {item}", flush=True)
        _queue, raw_id = item
        try:
            task_id = UUID(str(raw_id))
        except Exception:
            continue
        try:
            await process_task(task_id=task_id)
        except Exception as e:
            print(f"[task-worker] process_task failed: {e}", flush=True)
            import traceback
            traceback.print_exc()


def _run_worker() -> None:
    # 子进程（reload fork）也需要初始化日志
    setup_logging()
    try:
        asyncio.run(_worker_loop())
    finally:
        # 确保在退出时关闭连接池
        try:
            loop = asyncio.new_event_loop()
            loop.run_until_complete(close_redis())
            loop.close()
        except Exception:
            pass


def main() -> None:
    setup_logging()
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
                if "/logs/" in p or "/temp/" in p:
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
