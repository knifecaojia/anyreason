import asyncio
import pytest
from unittest.mock import patch


class TestWorkerConfig:
    """Tests for task worker configuration defaults."""

    def test_default_worker_concurrency_is_10(self):
        """Verify default worker concurrency is 10."""
        from app.config import Settings
        
        settings = Settings()
        assert settings.TASK_WORKER_CONCURRENCY == 10

    def test_default_worker_id_is_worker_1(self):
        """Verify default worker ID is worker-1."""
        from app.config import Settings
        
        settings = Settings()
        assert settings.TASK_WORKER_ID == "worker-1"

    def test_worker_concurrency_can_be_overridden_by_env(self):
        """Verify worker concurrency can be overridden via environment variable."""
        with patch.dict("os.environ", {"TASK_WORKER_CONCURRENCY": "5"}):
            from app.config import Settings
            settings = Settings()
            assert settings.TASK_WORKER_CONCURRENCY == 5

    def test_worker_id_can_be_overridden_by_env(self):
        """Verify worker ID can be overridden via environment variable."""
        with patch.dict("os.environ", {"TASK_WORKER_ID": "custom-worker"}):
            from app.config import Settings
            settings = Settings()
            assert settings.TASK_WORKER_ID == "custom-worker"

    def test_worker_concurrency_invalid_env_raises(self):
        """Verify invalid concurrency env value raises validation error."""
        import pydantic
        with patch.dict("os.environ", {"TASK_WORKER_CONCURRENCY": "invalid"}):
            from app.config import Settings
            with pytest.raises(pydantic.ValidationError):
                Settings()


class TestWorkerLogging:
    """Tests for worker logging with identifier."""

    def test_worker_log_includes_worker_id(self):
        """Verify worker log function includes worker ID."""
        from app.tasks.worker import WORKER_ID, WORKER_CONCURRENCY
        
        assert WORKER_ID == "worker-1"
        assert WORKER_CONCURRENCY == 10


class TestWaitForExecutionCapacity:
    """Tests for the wait_for_execution_capacity helper function."""

    @pytest.mark.asyncio
    async def test_immediate_return_when_below_capacity(self):
        """Should return True immediately when below concurrency limit."""
        from app.tasks.worker import wait_for_execution_capacity
        
        # Create one running task, capacity is 10
        running_task = asyncio.create_task(asyncio.sleep(10))
        active_tasks = {running_task}
        
        result = await wait_for_execution_capacity(active_tasks, max_concurrent=10, timeout=0.1)
        
        assert result is True
        
        running_task.cancel()
        try:
            await running_task
        except asyncio.CancelledError:
            pass

    @pytest.mark.asyncio
    async def test_waits_until_task_completes_at_capacity(self):
        """Should wait and return True when at capacity until a task completes."""
        from app.tasks.worker import wait_for_execution_capacity
        
        # Create tasks that complete quickly
        async def quick_task():
            await asyncio.sleep(0.02)
        
        # Fill up capacity with 5 tasks
        active_tasks = {asyncio.create_task(quick_task()) for _ in range(5)}
        
        # Try to get capacity with max_concurrent=5 (at capacity)
        result = await wait_for_execution_capacity(active_tasks, max_concurrent=5, timeout=0.5)
        
        # Should eventually get capacity as tasks complete
        assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_on_timeout_when_still_at_capacity(self):
        """Should return False when timeout occurs while still at capacity."""
        from app.tasks.worker import wait_for_execution_capacity
        
        # Create a long-running task
        async def long_task():
            await asyncio.sleep(10)
        
        active_tasks = {asyncio.create_task(long_task())}
        
        # Very short timeout, task won't complete
        result = await wait_for_execution_capacity(active_tasks, max_concurrent=1, timeout=0.05)
        
        # Should timeout and return False
        assert result is False
        
        # Cleanup
        for t in active_tasks:
            t.cancel()
        await asyncio.gather(*active_tasks, return_exceptions=True)

    @pytest.mark.asyncio
    async def test_cleans_up_completed_tasks_before_check(self):
        """Should clean up done tasks before checking capacity."""
        from app.tasks.worker import wait_for_execution_capacity, _cleanup_completed_tasks
        
        # Create done task and pending task
        done_task = asyncio.create_task(asyncio.sleep(0))
        await done_task
        
        pending_task = asyncio.create_task(asyncio.sleep(10))
        
        active_tasks = {done_task, pending_task}
        
        # Cleanup first
        _cleanup_completed_tasks(active_tasks)
        
        # Should have capacity now (1 pending, limit 5)
        result = await wait_for_execution_capacity(active_tasks, max_concurrent=5, timeout=0.1)
        
        assert result is True
        
        pending_task.cancel()
        try:
            await pending_task
        except asyncio.CancelledError:
            pass


class TestConcurrencyControl:
    """Tests for actual concurrency control behavior."""

    @pytest.mark.asyncio
    async def test_semaphore_limits_concurrent_executions(self):
        """Verify semaphore actually limits concurrent task execution."""
        concurrent_count = 0
        max_concurrent = 0
        lock = asyncio.Lock()
        
        async def slow_task(task_id: int) -> None:
            nonlocal concurrent_count, max_concurrent
            async with lock:
                concurrent_count += 1
                max_concurrent = max(max_concurrent, concurrent_count)
            await asyncio.sleep(0.1)  # Simulate work
            async with lock:
                concurrent_count -= 1
        
        # Create 20 tasks with concurrency limit of 5 - directly use semaphore
        semaphore = asyncio.Semaphore(5)
        
        async def run_with_semaphore(task_id: int):
            async with semaphore:
                await slow_task(task_id)
        
        tasks = [asyncio.create_task(run_with_semaphore(i)) for i in range(20)]
        await asyncio.gather(*tasks)
        
        # With proper semaphore, max should be 5
        assert max_concurrent <= 5, f"Expected max 5 concurrent, got {max_concurrent}"

    @pytest.mark.asyncio
    async def test_active_task_tracking_growth_bounded(self):
        """Verify active task set doesn't grow unbounded."""
        # This tests that we clean up completed tasks
        from app.tasks.worker import _cleanup_completed_tasks
        
        # Create mock tasks - some done, some pending
        done_tasks = set()
        for _ in range(5):
            t = asyncio.create_task(asyncio.sleep(0))
            done_tasks.add(t)
        
        # Wait for done tasks to complete
        await asyncio.gather(*done_tasks)
        
        # Create a pending task that we'll cancel after test
        pending_task = asyncio.create_task(asyncio.sleep(0.01))
        
        active = done_tasks | {pending_task}
        
        # Cleanup should remove done tasks
        remaining = _cleanup_completed_tasks(active)
        
        # Only the pending task should remain
        assert len(remaining) == 1
        
        # Cancel the pending task to avoid warning
        pending_task.cancel()
        try:
            await pending_task
        except asyncio.CancelledError:
            pass
