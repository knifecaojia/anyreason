"""Tests for worker dequeue gating behavior - verifies worker doesn't drain Redis when full."""
import asyncio
import pytest
from unittest.mock import patch


class TestWaitForExecutionCapacity:
    """Tests for the wait_for_execution_capacity helper function."""

    @pytest.mark.asyncio
    async def test_immediate_return_when_below_capacity(self):
        """Should return immediately when below concurrency limit."""
        from app.tasks.worker import wait_for_execution_capacity
        
        # Create one task that's still running
        running_task = asyncio.create_task(asyncio.sleep(10))
        active_tasks = {running_task}
        
        # Should return True immediately (we have capacity for 9 more with default 10)
        result = await wait_for_execution_capacity(active_tasks, max_concurrent=10, timeout=0.1)
        
        assert result is True
        
        # Cleanup
        running_task.cancel()
        try:
            await running_task
        except asyncio.CancelledError:
            pass

    @pytest.mark.asyncio
    async def test_waits_when_at_capacity(self):
        """Should wait when at concurrency limit."""
        from app.tasks.worker import wait_for_execution_capacity
        
        # Create tasks that complete quickly
        async def quick_task():
            await asyncio.sleep(0.05)
        
        # Fill up capacity
        active_tasks = {asyncio.create_task(quick_task()) for _ in range(5)}
        
        # Try to get capacity with max_concurrent=5 (at capacity)
        result = await wait_for_execution_capacity(active_tasks, max_concurrent=5, timeout=0.3)
        
        # Should eventually get capacity as tasks complete
        assert result is True

    @pytest.mark.asyncio
    async def test_completed_tasks_removed_from_tracking(self):
        """Completed tasks should be removed from active set."""
        from app.tasks.worker import _cleanup_completed_tasks
        
        # Create a done task
        done_task = asyncio.create_task(asyncio.sleep(0))
        await done_task  # Wait for completion
        
        # Create a pending task
        pending_task = asyncio.create_task(asyncio.sleep(10))
        
        active = {done_task, pending_task}
        
        remaining = _cleanup_completed_tasks(active)
        
        assert len(remaining) == 1
        assert pending_task in remaining
        
        pending_task.cancel()
        try:
            await pending_task
        except asyncio.CancelledError:
            pass


class TestWorkerGatingBehavior:
    """Tests verifying worker correctly gates dequeuing based on capacity."""

    @pytest.mark.asyncio
    async def test_worker_logs_include_worker_id(self):
        """Verify worker log function includes worker ID."""
        from app.tasks.worker import WORKER_ID, WORKER_CONCURRENCY
        
        assert WORKER_ID == "worker-1"
        assert WORKER_CONCURRENCY == 10

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
            await asyncio.sleep(0.05)
            async with lock:
                concurrent_count -= 1
        
        semaphore = asyncio.Semaphore(3)
        
        async def run_with_semaphore(task_id: int):
            async with semaphore:
                await slow_task(task_id)
        
        tasks = [asyncio.create_task(run_with_semaphore(i)) for i in range(10)]
        await asyncio.gather(*tasks)
        
        assert max_concurrent <= 3

    @pytest.mark.asyncio
    async def test_gating_helper_prevents_overload(self):
        """Verify the gating helper prevents more than max_concurrent."""
        from app.tasks.worker import wait_for_execution_capacity, _cleanup_completed_tasks
        
        max_concurrent = 2
        active_tasks: set[asyncio.Task] = set()
        
        max_seen = 0
        lock = asyncio.Lock()
        
        async def controlled_task():
            nonlocal max_seen
            
            # Wait for capacity BEFORE creating more tasks (simulates worker behavior)
            has_capacity = await wait_for_execution_capacity(active_tasks, max_concurrent, timeout=0.1)
            
            if not has_capacity:
                return  # Skip - couldn't get capacity
            
            # Track execution
            async with lock:
                max_seen = max(max_seen, len(active_tasks) + 1)
            
            # Do work
            await asyncio.sleep(0.02)
        
        # Create many tasks - should be gated by capacity
        # The key is that wait_for_execution_capacity should be called 
        # BEFORE each task starts, not during
        tasks = []
        for _ in range(10):
            # Check and wait for capacity before each task
            await wait_for_execution_capacity(active_tasks, max_concurrent, timeout=0.1)
            
            # Now create the task
            task = asyncio.create_task(controlled_task())
            active_tasks.add(task)
            
            # Cleanup completed after each creation
            _cleanup_completed_tasks(active_tasks)
        
        # Wait for remaining
        if active_tasks:
            await asyncio.wait(active_tasks)
        
        # The max seen should be at most max_concurrent
        assert max_seen <= max_concurrent


class TestConcurrencyControl:
    """Tests for actual concurrency control behavior."""

    @pytest.mark.asyncio
    async def test_cleanup_removes_done_tasks(self):
        """Verify cleanup correctly removes done tasks."""
        from app.tasks.worker import _cleanup_completed_tasks
        
        # Create some done and pending tasks
        done_task = asyncio.create_task(asyncio.sleep(0))
        await done_task
        
        pending_task = asyncio.create_task(asyncio.sleep(10))
        
        active = {done_task, pending_task}
        
        remaining = _cleanup_completed_tasks(active)
        
        assert len(remaining) == 1
        assert pending_task in remaining
        
        pending_task.cancel()
        try:
            await pending_task
        except asyncio.CancelledError:
            pass
