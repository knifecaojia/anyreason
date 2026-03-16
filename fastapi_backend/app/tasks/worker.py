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

# Worker identifier from config
WORKER_ID = settings.TASK_WORKER_ID
WORKER_CONCURRENCY = settings.TASK_WORKER_CONCURRENCY


def _log(msg: str) -> None:
    """Log with worker identifier prefix."""
    print(f"[task-worker:{WORKER_ID}] {msg}", flush=True)


def _load_task_handler_registry():
    try:
        from app.tasks.handlers.registry import TASK_HANDLER_REGISTRY
    except ModuleNotFoundError as e:
        missing = getattr(e, "name", None) or "unknown"
        _log(f"import failed: missing module {missing!r}")
        _log("fix:")
        _log("  1) cd fastapi_backend")
        _log("  2) uv sync")
        _log("  3) uv run python -m app.tasks.worker --reload")
        raise
    return TASK_HANDLER_REGISTRY


def _cleanup_completed_tasks(active_tasks: set[asyncio.Task]) -> set[asyncio.Task]:
    """Remove completed tasks from the active set. Returns remaining tasks."""
    done = {t for t in active_tasks if t.done()}
    for t in done:
        active_tasks.remove(t)
    return active_tasks


async def wait_for_execution_capacity(
    active_tasks: set[asyncio.Task],
    max_concurrent: int,
    timeout: float = 0.5,
) -> bool:
    """
    Wait until execution capacity is available before dequeuing more work.
    
    This ensures the worker doesn't drain Redis faster than it can execute tasks.
    When all slots are full, we wait for at least one task to complete before
    taking more work from the queue.
    
    Args:
        active_tasks: Set of currently executing tasks
        max_concurrent: Maximum concurrent executions allowed
        timeout: Maximum time to wait for capacity
        
    Returns:
        True if capacity is now available, False if timeout occurred
    """
    # Clean up any completed tasks first
    _cleanup_completed_tasks(active_tasks)
    
    # If we have capacity, proceed immediately
    if len(active_tasks) < max_concurrent:
        return True
    
    # At capacity - wait for at least one task to complete before dequeuing more
    if active_tasks:
        done, _ = await asyncio.wait(
            active_tasks,
            timeout=timeout,
            return_when=asyncio.FIRST_COMPLETED,
        )
        # Remove completed tasks from tracking
        for task in done:
            active_tasks.discard(task)
        
        # Return True if we made room
        return len(active_tasks) < max_concurrent
    
    return True


async def _worker_loop() -> None:
    _log("connecting to redis...")
    
    # 尝试连接 Redis，带有重试逻辑
    while True:
        try:
            r = get_redis()
            await r.ping()
            _log("connected to redis.")
            break
        except Exception as e:
            _log(f"failed to connect to redis: {e}. Retrying in 5s...")
            await asyncio.sleep(5)

    # Semaphore to enforce concurrency limit - THIS is what caps parallelism
    semaphore = asyncio.Semaphore(WORKER_CONCURRENCY)
    active_tasks: set[asyncio.Task] = set()

    async def process_single_task(item: tuple) -> None:
        """Process a single task with semaphore control."""
        _queue, raw_id = item
        try:
            task_id = UUID(str(raw_id))
        except Exception:
            _log(f"invalid task id: {raw_id}")
            return
        
        try:
            _log(f"processing task: {task_id}")
            await process_task(task_id=task_id)
            _log(f"completed task: {task_id}")
        except Exception as e:
            _log(f"process_task failed for {task_id}: {e}")
            import traceback
            traceback.print_exc()

    # Wrapper that acquires semaphore before running the task
    async def process_with_semaphore(item: tuple) -> None:
        async with semaphore:  # Blocks here until a slot is available
            await process_single_task(item)

    while True:
        # Wait for execution capacity before dequeuing more work.
        # This prevents draining Redis faster than we can process tasks.
        has_capacity = await wait_for_execution_capacity(
            active_tasks, WORKER_CONCURRENCY, timeout=1.0
        )
        
        if not has_capacity:
            # At capacity, loop will wait and retry
            continue
        
        try:
            # Use brpop with timeout
            item = await r.brpop(settings.TASK_QUEUE_KEY, timeout=5)
        except Exception:
            # 只有在非常严重的错误时才打印，避免刷屏
            await asyncio.sleep(0.5)
            continue
        if not item:
            # Clean up completed tasks to prevent memory growth
            _cleanup_completed_tasks(active_tasks)
            continue
        
        _log(f"dequeued item: {item}")
        
        # Create task with semaphore gating - task will wait before execution
        task = asyncio.create_task(process_with_semaphore(item))
        active_tasks.add(task)
        
        # Periodic cleanup to prevent unbounded memory growth
        if len(active_tasks) >= WORKER_CONCURRENCY * 2:
            _cleanup_completed_tasks(active_tasks)


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
    _log(f"starting at {now}")
    _log(f"known task types: {known}")
    _log(f"concurrency: {WORKER_CONCURRENCY}")
    reload_enabled = ("--reload" in sys.argv) or (os.getenv("TASK_WORKER_RELOAD", "").strip() == "1")
    if reload_enabled:
        _log("reload: enabled")
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
            _log("reload: falling back to polling")
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
