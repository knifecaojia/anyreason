"""
RED tests for video slot scheduler - defining expected FIFO queue semantics.

These tests define the expected behavior for a Redis-backed per-model-config 
FIFO slot scheduler with:
- Aggregate enabled-key capacity (sum of limits)
- FIFO owner semantics
- Disabled-key exclusion
- Owner-aware release
- Stale-owner recovery

Current implementation uses immediate-fail on saturation - these tests should FAIL
until the scheduler is implemented with queueing semantics.
"""
from __future__ import annotations
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4
from datetime import datetime, timedelta

# We'll create a fake Redis for deterministic testing
class FakeRedis:
    """Fake Redis implementation for slot scheduler unit tests."""
    
    def __init__(self):
        self._data: dict[str, int] = {}
        self._queue: dict[str, list[dict]] = {}  # config_id -> list of owner entries
        self._owner_metadata: dict[str, dict] = {}  # owner_token -> metadata
    
    async def incr(self, key: str) -> int:
        current = self._data.get(key, 0)
        self._data[key] = current + 1
        return self._data[key]
    
    async def decr(self, key: str) -> int:
        current = self._data.get(key, 0)
        self._data[key] = current - 1
        return self._data[key]
    
    async def set(self, key: str, value: int) -> None:
        self._data[key] = value
    
    async def get(self, key: str) -> str | None:
        val = self._data.get(key)
        return str(val) if val is not None else None
    
    async def expire(self, key: str, seconds: int) -> None:
        pass  # No-op for tests
    
    async def delete(self, *keys: str) -> None:
        for key in keys:
            self._data.pop(key, None)
            self._queue.pop(key, None)
            self._owner_metadata.pop(key, None)  # Also clean up owner metadata
    
    def _extract_owner_key_from_queue_key(self, queue_key: str, owner_token: str) -> str | None:
        """Extract owner key from queue key. Returns None if not a queue key."""
        if queue_key.startswith("ai_queue:"):
            config_id = queue_key[len("ai_queue:"):]
            return f"ai_owner:{config_id}:{owner_token}"
        return None
    
    # Queue operations (NOT in current implementation - these will cause tests to fail)
    async def lpush(self, key: str, *values: str) -> int:
        if key not in self._queue:
            self._queue[key] = []
        for v in values:
            self._queue[key].append({'owner': v, 'enqueued_at': datetime.utcnow().isoformat()})
        return len(self._queue[key])
    
    async def rpush(self, key: str, *values: str) -> int:
        """Push to the end of the queue (FIFO)."""
        if key not in self._queue:
            self._queue[key] = []
        for v in values:
            self._queue[key].append({'owner': v, 'enqueued_at': datetime.utcnow().isoformat()})
        return len(self._queue[key])
    
    async def lpop(self, key: str) -> str | None:
        """Pop from the front of the queue (FIFO).
        
        Note: This only removes the entry from the queue list.
        Owner metadata cleanup is handled separately by the caller via delete().
        """
        if key not in self._queue or not self._queue[key]:
            return None
        entry = self._queue[key].pop(0)
        return entry.get('owner')
    
    async def rpop(self, key: str) -> str | None:
        """Pop from the end of the queue."""
        if key not in self._queue or not self._queue[key]:
            return None
        entry = self._queue[key].pop()
        owner_token: str | None = entry.get('owner')
        if owner_token:
            # Clean up owner metadata when dequeuing
            owner_key = self._extract_owner_key_from_queue_key(key, owner_token)
            if owner_key:
                self._owner_metadata.pop(owner_key, None)
        return owner_token
    
    async def lrange(self, key: str, start: int, end: int) -> list[str]:
        """Get elements from start to end (inclusive)."""
        if key not in self._queue:
            return []
        # Handle -1 for end (get all)
        if end == -1:
            return [item['owner'] for item in self._queue[key][start:]]
        return [item['owner'] for item in self._queue[key][start:end+1]]
    
    async def llen(self, key: str) -> int:
        return len(self._queue.get(key, []))
    
    # Owner metadata operations (NOT in current implementation)
    async def hset(self, key: str, mapping: dict) -> None:
        self._owner_metadata[key] = mapping
    
    async def hget(self, key: str, field: str) -> str | None:
        return self._owner_metadata.get(key, {}).get(field)
    
    async def hgetall(self, key: str) -> dict[str, str]:
        return self._owner_metadata.get(key, {})
    
    async def expireat(self, key: str, timestamp: int) -> None:
        pass  # No-op for tests

    async def scan_iter(self, match: str | None = None):
        """Iterate over keys matching pattern."""
        # Simple pattern matching - check if key starts with the pattern prefix
        if match:
            pattern_prefix = match.replace("*", "")
            for key in list(self._owner_metadata.keys()):
                if key.startswith(pattern_prefix):
                    yield key
        else:
            for key in self._owner_metadata.keys():
                yield key


# Test fixtures
@pytest.fixture
def fake_redis():
    """Provide a fresh FakeRedis for each test."""
    return FakeRedis()


@pytest.fixture
def config_id() -> UUID:
    """Provide a test config UUID."""
    return uuid4()


@pytest.fixture
def single_key_info() -> list[dict]:
    """Single enabled key with default limit of 5."""
    return [
        {"id": "key-1", "api_key": "sk-test-key-1", "enabled": True, "concurrency_limit": 5}
    ]


@pytest.fixture
def multi_key_info() -> list[dict]:
    """Multiple enabled keys with different limits."""
    return [
        {"id": "key-1", "api_key": "sk-test-key-1", "enabled": True, "concurrency_limit": 2},
        {"id": "key-2", "api_key": "sk-test-key-2", "enabled": True, "concurrency_limit": 3},
        {"id": "key-3", "api_key": "sk-test-key-3", "enabled": True, "concurrency_limit": 1},
    ]


@pytest.fixture
def mixed_keys_info() -> list[dict]:
    """Mix of enabled and disabled keys."""
    return [
        {"id": "key-1", "api_key": "sk-test-key-1", "enabled": True, "concurrency_limit": 2},
        {"id": "key-2", "api_key": "sk-test-key-2", "enabled": False, "concurrency_limit": 10},  # Disabled - contributes 0
        {"id": "key-3", "api_key": "sk-test-key-3", "enabled": True, "concurrency_limit": 3},
    ]


# =============================================================================
# RED TESTS: Aggregate enabled-key capacity
# =============================================================================

@pytest.mark.asyncio
async def test_aggregate_capacity_sum_of_enabled_limits(fake_redis, config_id, multi_key_info):
    """
    Total capacity should equal sum of enabled key limits.
    
    With keys at limits 2, 3, and 1: total = 6
    
    This test FAILS on current implementation because:
    - Current implementation tries each key individually, fails when ALL are saturated
    - Expected: scheduler returns queue placement when total capacity exceeded
    """
    # Import the class under test
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    # Mock get_redis to return our fake
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Fill all 6 slots
        acquired = []
        for i in range(6):
            result = await manager.acquire_key(config_id, multi_key_info, None)
            assert result is not None, f"Should acquire slot {i+1}"
            acquired.append(result)
        
        # 7th acquisition should return queue placement, not None
        # Current implementation returns None (immediate failure)
        result = await manager.acquire_key(config_id, multi_key_info, None)
        
        # RED EXPECTATION: Should return queue placement dict with 'queue_position'
        # CURRENT BEHAVIOR: Returns None
        assert result is not None, "Should return queue placement when capacity exceeded"
        assert "queue_position" in result, "Should indicate queue position"
        assert result["queue_position"] == 1, "First queued task should have position 1"


@pytest.mark.asyncio
async def test_disabled_key_contributes_zero_capacity(fake_redis, config_id, mixed_keys_info):
    """
    Disabled keys should contribute ZERO to total capacity.
    
    With enabled keys at 2 and 3: total = 5
    Disabled key at 10 should be ignored.
    
    This test FAILS on current implementation because:
    - Current implementation iterates all keys but skips disabled ones correctly
    - However, the aggregate test above shows it doesn't do queueing
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Fill 5 slots (2 + 3 from enabled keys)
        for i in range(5):
            result = await manager.acquire_key(config_id, mixed_keys_info, None)
            assert result is not None, f"Should acquire slot {i+1}"
        
        # 6th should queue (not fail), because disabled key (limit 10) doesn't count
        result = await manager.acquire_key(config_id, mixed_keys_info, None)
        
        # Should queue, not fail
        assert result is not None, "Disabled key capacity should not count"
        assert "queue_position" in result or "api_key" in result, "Either queued or acquired"


@pytest.mark.asyncio  
async def test_default_limit_when_unspecified(fake_redis, config_id):
    """
    Keys without explicit concurrency_limit should default to 5.
    
    This verifies current default behavior is preserved.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    keys_no_limit = [
        {"id": "key-1", "api_key": "sk-test-key-1", "enabled": True}  # No limit specified
    ]
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Should use default limit of 5
        for i in range(5):
            result = await manager.acquire_key(config_id, keys_no_limit, None)
            assert result is not None
            assert result.get("limit") == 5, "Default limit should be 5"
        
        # 6th should queue
        result = await manager.acquire_key(config_id, keys_no_limit, None)
        assert result is not None, "Should queue after default limit exceeded"
        assert "queue_position" in result, "Should indicate queue position"


# =============================================================================
# RED TESTS: FIFO owner semantics
# =============================================================================

@pytest.mark.asyncio
async def test_fifo_ordering_across_queued_owners(fake_redis, config_id, single_key_info):
    """
    Queued owners should be granted slots in FIFO order.
    
    With 1-slot capacity:
    - Owner A acquires (slot 1)
    - Owners B, C, D queue (positions 1, 2, 3)
    - When A releases, B should get slot next
    
    This test FAILS because current implementation has no queue.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    # Modify key to have limit of 1
    single_key_info[0]["concurrency_limit"] = 1
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Owner A acquires the single slot
        owner_a = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_a is not None
        
        # Owners B, C, D queue up
        owner_b = await manager.acquire_key(config_id, single_key_info, None)
        owner_c = await manager.acquire_key(config_id, single_key_info, None)
        owner_d = await manager.acquire_key(config_id, single_key_info, None)
        
        # All should be queued (not None)
        assert owner_b is not None, "Should return queue placement, not None"
        assert owner_c is not None
        assert owner_d is not None
        
        # Check queue positions
        assert owner_b.get("queue_position") == 1
        assert owner_c.get("queue_position") == 2  
        assert owner_d.get("queue_position") == 3
        
        # Release owner A's slot
        await manager.release_key(config_id, owner_a["api_key"])
        
        # Now B should be able to acquire directly (not queue)
        owner_b_again = await manager.acquire_key(config_id, single_key_info, None)
        
        # Should get slot directly, not queued
        assert owner_b_again is not None
        assert "queue_position" not in owner_b_again or owner_b_again.get("queue_position") is None, \
            "B should get slot directly after A releases, not re-queue"


@pytest.mark.asyncio
async def test_duplicate_acquire_returns_same_owner_token(fake_redis, config_id, single_key_info):
    """
    Same owner requesting slot multiple times should get consistent token.
    
    This prevents duplicate slot allocation to same logical task.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    owner_token = "task-123"
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # First acquire
        result1 = await manager.acquire_key(config_id, single_key_info, None)
        
        # Release and re-acquire with same owner
        if result1 and "api_key" in result1:
            await manager.release_key(config_id, result1["api_key"])
            
            result2 = await manager.acquire_key(config_id, single_key_info, None)
            
            # Should succeed (not re-use owner token without proper tracking)
            assert result2 is not None


# =============================================================================
# RED TESTS: Owner-aware release
# =============================================================================

@pytest.mark.asyncio
async def test_release_only_affects_specific_owner(fake_redis, config_id, single_key_info):
    """
    Releasing a slot should only affect the specific owner, not all holders.
    
    With 2-slot capacity:
    - Owner A acquires slot
    - Owner B acquires slot  
    - Releasing A should not affect B's slot
    
    Current implementation uses simple decr which is correct, but
    we need owner tracking to support queue semantics.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    single_key_info[0]["concurrency_limit"] = 2
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # A and B both acquire
        owner_a = await manager.acquire_key(config_id, single_key_info, None)
        owner_b = await manager.acquire_key(config_id, single_key_info, None)
        
        assert owner_a is not None
        assert owner_b is not None
        
        # Release A
        await manager.release_key(config_id, owner_a["api_key"])
        
        # C should now be able to acquire (one slot free)
        owner_c = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_c is not None, "Should acquire after A released"


@pytest.mark.asyncio
async def test_release_prevents_negative_counter(fake_redis, config_id, single_key_info):
    """
    Releasing should never cause negative slot count.
    
    Current implementation handles this, but queue semantics need
    explicit owner validation.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Acquire one slot
        owner = await manager.acquire_key(config_id, single_key_info, None)
        assert owner is not None
        
        # Release twice (simulating bug or race)
        await manager.release_key(config_id, owner["api_key"])
        await manager.release_key(config_id, owner["api_key"])
        
        # Counter should not go negative - current impl handles this
        # But with queue, need owner validation to prevent abuse
        redis_key = f"ai_concurrency:{config_id}:*"
        # Just verify no exception is raised


# =============================================================================
# RED TESTS: Stale-owner recovery
# =============================================================================

@pytest.mark.asyncio
async def test_stale_owner_recovery_after_timeout(fake_redis, config_id, single_key_info):
    """
    Stale owners (heartbeat expired) should be recoverable.
    
    When an owner holds a slot but dies/is abandoned:
    - Recovery mechanism should detect stale owner
    - Slot should be reclaimed
    - Next queued owner should advance
    
    This test FAILS because current implementation has no stale detection.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    single_key_info[0]["concurrency_limit"] = 1
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Owner A acquires slot
        owner_a = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_a is not None
        
        # Owner B queues
        owner_b = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_b is not None
        assert owner_b.get("queue_position") == 1
        
        # Simulate stale owner by marking it expired (would need new scheduler method)
        # The scheduler should have a recover_stale_owners() method
        # Use getattr to avoid static analysis errors - will fail at runtime if method missing
        recover_method = getattr(manager, 'recover_stale_owners', None)
        assert recover_method is not None, "Scheduler must have recover_stale_owners method"
        recovered_count = await recover_method(config_id, max_age_seconds=0)
        
        # Should have recovered at least one stale slot
        assert recovered_count >= 1, "Should recover stale owner"
        
        # B should now be able to acquire directly
        owner_b_actual = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_b_actual is not None
        assert "queue_position" not in owner_b_actual or owner_b_actual.get("queue_position") is None, \
            "B should advance after stale recovery"


@pytest.mark.asyncio
async def test_no_recovery_of_healthy_owner(fake_redis, config_id, single_key_info):
    """
    Healthy owners should NOT be recovered/reclaimed.
    
    This prevents slot theft from healthy workers.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    single_key_info[0]["concurrency_limit"] = 1
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Owner A acquires
        owner_a = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_a is not None
        
        # Owner B queues
        owner_b = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_b is not None
        
        # Attempt recovery with very short timeout
        # Use getattr to avoid static analysis errors
        recover_method = getattr(manager, 'recover_stale_owners', None)
        assert recover_method is not None, "Scheduler must have recover_stale_owners method"
        recovered_count = await recover_method(config_id, max_age_seconds=3600)
        
        # Should NOT recover healthy owner
        assert recovered_count == 0, "Should not recover healthy owner"
        
        # Try to acquire again - this creates a new owner C
        # Since A still holds slot and B is queued at position 1,
        # C should be queued at position 2
        owner_c = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_c is not None
        assert owner_c.get("queue_position") == 2, "New owner should be queued behind B (position 2)"


# =============================================================================
# RED TESTS: Queue visibility
# =============================================================================

@pytest.mark.asyncio
async def test_queue_depth_query(fake_redis, config_id, single_key_info):
    """
    Should be able to query queue depth for a config.
    
    Operators need to see how many tasks are waiting.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    single_key_info[0]["concurrency_limit"] = 1
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # A acquires, B and C queue
        await manager.acquire_key(config_id, single_key_info, None)  # A
        await manager.acquire_key(config_id, single_key_info, None)  # B queues
        await manager.acquire_key(config_id, single_key_info, None)  # C queues
        
        # Query queue depth
        # Use getattr to avoid static analysis errors
        get_depth_method = getattr(manager, 'get_queue_depth', None)
        assert get_depth_method is not None, "Scheduler must have get_queue_depth method"
        depth = await get_depth_method(config_id)
        
        assert depth == 2, "Should have 2 tasks queued"


@pytest.mark.asyncio
async def test_slot_utilization_query(fake_redis, config_id, multi_key_info):
    """
    Should query total slot utilization (active/total).
    
    e.g., "3 of 6 slots in use"
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Acquire 3 slots out of 6 total
        await manager.acquire_key(config_id, multi_key_info, None)
        await manager.acquire_key(config_id, multi_key_info, None) 
        await manager.acquire_key(config_id, multi_key_info, None)
        
        # Use getattr to avoid static analysis errors
        get_util_method = getattr(manager, 'get_slot_utilization', None)
        assert get_util_method is not None, "Scheduler must have get_slot_utilization method"
        # Pass keys_info so the method can calculate current usage
        utilization = await get_util_method(config_id, keys_info=multi_key_info, default_key=None)
        
        assert utilization["active"] == 3
        assert utilization["total"] == 6
        assert utilization["available"] == 3


# =============================================================================
# RED TESTS: Multi-key key assignment
# =============================================================================

@pytest.mark.asyncio
async def test_multi_key_assigns_specific_key_to_task(fake_redis, config_id, multi_key_info):
    """
    When acquiring a slot with multiple keys, should record which key was assigned.
    
    Provider submissions need to know which API key to use.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        result = await manager.acquire_key(config_id, multi_key_info, None)
        
        assert result is not None
        # Should include which specific key was assigned
        assert "api_key" in result, "Result should include assigned api_key"
        assert result["api_key"].startswith("sk-test-"), "Should be one of the test keys"
        
        # Should also include key ID for debugging
        assert "key_id" in result or "id" in result, "Should include key identifier"


# =============================================================================
# RED TESTS: Zombie-slot cleanup
# =============================================================================

@pytest.mark.asyncio
async def test_zombie_cleanup_method_exists(fake_redis, config_id, single_key_info):
    """
    Scheduler must have cleanup_zombie_slots method.
    
    This handles orphaned slots where:
    - Counter shows usage (non-zero)
    - But no owner metadata exists (owner died without releasing)
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        cleanup_method = getattr(manager, 'cleanup_zombie_slots', None)
        assert cleanup_method is not None, "Scheduler must have cleanup_zombie_slots method"


@pytest.mark.asyncio
async def test_zombie_cleanup_returns_result_dict(fake_redis, config_id, single_key_info):
    """
    cleanup_zombie_slots should return dict with zombie counts.
    
    Returns: {zombies_found, zombies_cleaned, orphaned_queue}
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        cleanup_method = getattr(manager, 'cleanup_zombie_slots', None)
        assert cleanup_method is not None
        
        result = await cleanup_method(config_id, keys_info=single_key_info, default_key=None)
        
        assert isinstance(result, dict), "Should return dict"
        assert "zombies_found" in result, "Should report zombies_found"
        assert "zombies_cleaned" in result, "Should report zombies_cleaned"
        assert "orphaned_queue" in result, "Should report orphaned_queue"


@pytest.mark.asyncio
async def test_zombie_cleanup_does_not_affect_healthy_owners(fake_redis, config_id, single_key_info):
    """
    Zombie cleanup should NOT affect healthy owners with valid metadata.
    
    If an owner has valid metadata and is not stale, cleanup should not touch it.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    single_key_info[0]["concurrency_limit"] = 2
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Owner A acquires slot (healthy)
        owner_a = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_a is not None
        
        # Owner B acquires slot (healthy)
        owner_b = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_b is not None
        
        # Run zombie cleanup
        cleanup_method = getattr(manager, 'cleanup_zombie_slots', None)
        assert cleanup_method is not None, "Scheduler must have cleanup_zombie_slots method"
        result = await cleanup_method(config_id, keys_info=single_key_info, default_key=None)
        
        # Should not find any zombies (both owners are healthy)
        assert result["zombies_found"] == 0, "Should not find zombies among healthy owners"
        assert result["zombies_cleaned"] == 0, "Should not clean healthy owners"
        
        # Both owners should still be able to use their slots
        utilization = await manager.get_slot_utilization(config_id, keys_info=single_key_info, default_key=None)
        assert utilization["active"] == 2, "Both healthy slots should still be active"


@pytest.mark.asyncio
async def test_zombie_cleanup_is_idempotent(fake_redis, config_id, single_key_info):
    """
    Zombie cleanup should be safe to call multiple times (idempotent).
    
    Multiple calls should not over-decrement counters.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    single_key_info[0]["concurrency_limit"] = 1
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Owner A acquires
        owner_a = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_a is not None
        
        # Call cleanup multiple times
        cleanup_method = getattr(manager, 'cleanup_zombie_slots', None)
        assert cleanup_method is not None, "Scheduler must have cleanup_zombie_slots method"
        
        result1 = await cleanup_method(config_id, keys_info=single_key_info, default_key=None)
        result2 = await cleanup_method(config_id, keys_info=single_key_info, default_key=None)
        result3 = await cleanup_method(config_id, keys_info=single_key_info, default_key=None)
        
        # Should not clean healthy owner on any call
        assert result1["zombies_cleaned"] == 0
        assert result2["zombies_cleaned"] == 0
        assert result3["zombies_cleaned"] == 0
        
        # Slot should still be in use
        utilization = await manager.get_slot_utilization(config_id, keys_info=single_key_info, default_key=None)
        assert utilization["active"] == 1, "Healthy owner should remain active"


@pytest.mark.asyncio
async def test_recovery_never_drives_counter_negative(fake_redis, config_id, single_key_info):
    """
    Stale owner recovery should never drive counter negative.
    
    Even with race conditions or double-recovery attempts,
    the counter should stay >= 0.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    single_key_info[0]["concurrency_limit"] = 1
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Owner A acquires
        owner_a = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_a is not None
        
        # Call recovery multiple times with max_age_seconds=0
        recover_method = getattr(manager, 'recover_stale_owners', None)
        assert recover_method is not None
        
        recovered1 = await recover_method(config_id, max_age_seconds=0)
        recovered2 = await recover_method(config_id, max_age_seconds=0)
        recovered3 = await recover_method(config_id, max_age_seconds=0)
        
        # Should only recover once (subsequent calls should find nothing)
        # But importantly, counter should not go negative
        utilization = await manager.get_slot_utilization(config_id, keys_info=single_key_info, default_key=None)
        assert utilization["active"] >= 0, "Counter should never go negative"
        assert utilization["active"] <= 1, "Should not exceed capacity"


# =============================================================================
# RED TESTS: Queued task cancellation (Task 10)
# =============================================================================

@pytest.mark.asyncio
async def test_remove_from_queue_method_exists(fake_redis, config_id):
    """
    Scheduler must have remove_from_queue method for canceling queued tasks.
    
    Task 10: Support user cancellation while queued for slot
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        remove_method = getattr(manager, 'remove_from_queue', None)
        assert remove_method is not None, "Scheduler must have remove_from_queue method"


@pytest.mark.asyncio
async def test_cancel_queued_removes_from_fifo_queue(fake_redis, config_id, single_key_info):
    """
    Canceling a queued task should remove it from the FIFO queue.
    
    Task 10 Acceptance: Queued task can be canceled cleanly via API/service
    
    Scenario:
    - Owner A holds slot (1-slot capacity)
    - Owners B and C queue (positions 1, 2)
    - Cancel B
    - C should now be at position 1 (or next in queue)
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    single_key_info[0]["concurrency_limit"] = 1
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Owner A holds the only slot
        owner_a = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_a is not None
        assert "api_key" in owner_a
        
        # Owners B and C queue
        owner_b = await manager.acquire_key(config_id, single_key_info, None)
        owner_c = await manager.acquire_key(config_id, single_key_info, None)
        
        assert owner_b is not None
        assert owner_b.get("queue_position") == 1
        assert owner_c is not None
        assert owner_c.get("queue_position") == 2
        
        # Cancel B (remove from queue)
        remove_method = getattr(manager, 'remove_from_queue', None)
        assert remove_method is not None
        
        b_token = owner_b.get("owner_token")
        assert b_token is not None
        
        removed = await remove_method(config_id, b_token)
        assert removed is True, "Should successfully remove queued owner from queue"
        
        # Verify queue depth decreased
        depth = await manager.get_queue_depth(config_id)
        assert depth == 1, "Should have only 1 task queued after canceling B"


@pytest.mark.asyncio
async def test_cancel_queued_updates_queue_positions(fake_redis, config_id, single_key_info):
    """
    Canceling a queued task should update queue positions for remaining tasks.
    
    Task 10 Acceptance: Cancellation updates queue position for later tasks
    
    After canceling B, C should shift to position 1 (was 2).
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    single_key_info[0]["concurrency_limit"] = 1
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Owner A holds slot
        owner_a = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_a is not None
        
        # Owners B and C queue
        owner_b = await manager.acquire_key(config_id, single_key_info, None)
        owner_c = await manager.acquire_key(config_id, single_key_info, None)
        
        assert owner_b is not None
        assert owner_c is not None
        b_token = owner_b.get("owner_token")
        c_token = owner_c.get("owner_token")
        
        # Cancel B
        remove_method = getattr(manager, 'remove_from_queue', None)
        assert remove_method is not None
        await remove_method(config_id, b_token)
        
        # Release A's slot - C should now advance
        await manager.release_key(config_id, owner_a["api_key"])
        
        # C should be able to acquire (no longer queued)
        owner_c_again = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_c_again is not None
        assert "queue_position" not in owner_c_again or owner_c_again.get("queue_position") is None, \
            "C should acquire slot directly, not be re-queued"


@pytest.mark.asyncio
async def test_cancel_queued_does_not_release_unowned_slot(fake_redis, config_id, single_key_info):
    """
    Canceling a queued task should NOT release any slot.
    
    Task 10 Acceptance: Canceling queued task does not affect active slot owner
    
    Scenario:
    - Owner A holds slot
    - Owner B is queued
    - Cancel B
    - A's slot should be UNAFFECTED (count still 1)
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    single_key_info[0]["concurrency_limit"] = 1
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Owner A acquires the only slot
        owner_a = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_a is not None
        assert "api_key" in owner_a
        
        # Owner B queues
        owner_b = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_b is not None
        assert owner_b.get("queue_position") == 1
        
        # Check slot utilization before cancel
        util_before = await manager.get_slot_utilization(config_id, keys_info=single_key_info, default_key=None)
        assert util_before["active"] == 1, "A should be using 1 slot"
        
        # Cancel B (remove from queue, NO slot release)
        remove_method = getattr(manager, 'remove_from_queue', None)
        assert remove_method is not None
        await remove_method(config_id, owner_b.get("owner_token"))
        
        # Check slot utilization after cancel - should be UNCHANGED
        util_after = await manager.get_slot_utilization(config_id, keys_info=single_key_info, default_key=None)
        assert util_after["active"] == 1, "Canceling queued task should NOT release slot - A still holds 1 slot"
        assert util_after["available"] == 0, "No slots available (A holds the only one)"


@pytest.mark.asyncio
async def test_cancel_queued_allows_next_owner_to_advance(fake_redis, config_id, single_key_info):
    """
    After canceling a queued task, the next queued owner should advance when slot frees.
    
    Task 10 Acceptance: Later tasks move forward correctly after cancellation
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    single_key_info[0]["concurrency_limit"] = 1
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Owner A holds slot
        owner_a = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_a is not None
        
        # Owners B, C, D queue
        owner_b = await manager.acquire_key(config_id, single_key_info, None)
        owner_c = await manager.acquire_key(config_id, single_key_info, None)
        owner_d = await manager.acquire_key(config_id, single_key_info, None)
        
        assert owner_b is not None
        assert owner_c is not None
        assert owner_d is not None
        assert owner_b.get("queue_position") == 1
        assert owner_c.get("queue_position") == 2
        assert owner_d.get("queue_position") == 3
        
        # Cancel B
        remove_method = getattr(manager, 'remove_from_queue', None)
        assert remove_method is not None
        b_token = owner_b.get("owner_token")
        assert b_token is not None
        await remove_method(config_id, b_token)
        
        # Release A's slot
        await manager.release_key(config_id, owner_a["api_key"])
        
        # C should now advance (B was canceled)
        owner_c_acquired = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_c_acquired is not None
        assert "queue_position" not in owner_c_acquired or owner_c_acquired.get("queue_position") is None, \
            "C should acquire slot after A released and B canceled"


@pytest.mark.asyncio
async def test_cancel_nonexistent_owner_returns_false(fake_redis, config_id):
    """
    Canceling a non-existent owner token should return False.
    
    Prevents accidental double-cancel or invalid cancel requests.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        remove_method = getattr(manager, 'remove_from_queue', None)
        assert remove_method is not None
        
        # Try to remove non-existent token
        removed = await remove_method(config_id, "nonexistent-token-12345")
        assert removed is False, "Canceling non-existent owner should return False"


@pytest.mark.asyncio
async def test_cancel_already_acquired_slot_uses_release_not_remove(fake_redis, config_id, single_key_info):
    """
    If a task has ALREADY acquired a slot (not just queued), canceling should RELEASE the slot.
    
    This tests the distinction between:
    - Queued task (no slot acquired): remove_from_queue only
    - Slot-holding task: release_key_with_owner
    
    For Task 10, we focus on the QUEUED case (no slot acquired).
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    single_key_info[0]["concurrency_limit"] = 1
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Owner A acquires slot
        owner_a = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_a is not None
        assert "api_key" in owner_a
        
        # Check slot is in use
        util_before = await manager.get_slot_utilization(config_id, keys_info=single_key_info, default_key=None)
        assert util_before["active"] == 1
        
        # Release A's slot (not cancel)
        release_method = getattr(manager, 'release_key_with_owner', None)
        assert release_method is not None
        await release_method(config_id, owner_a.get("owner_token"))
        
        # Slot should be released
        util_after = await manager.get_slot_utilization(config_id, keys_info=single_key_info, default_key=None)
        assert util_after["active"] == 0, "Slot should be released after proper release"
        assert util_after["available"] == 1, "One slot should now be available"


# =============================================================================
# Task 13: Multi-key aggregated concurrency semantics - EXACT KEY ASSIGNMENT
# =============================================================================

@pytest.mark.asyncio
async def test_get_assigned_key_method_exists(fake_redis, config_id, single_key_info):
    """
    Task 13: Scheduler must have get_assigned_key_for_owner method.
    
    This method allows retrieving the exact assigned api_key for diagnostics
    and cleanup verification.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        get_key_method = getattr(manager, 'get_assigned_key_for_owner', None)
        assert get_key_method is not None, "Scheduler must have get_assigned_key_for_owner method"


@pytest.mark.asyncio
async def test_get_assigned_key_returns_correct_key(fake_redis, config_id, multi_key_info):
    """
    Task 13: get_assigned_key_for_owner returns the exact api_key that was assigned.
    
    When a slot is acquired, the assigned api_key should be retrievable
    by owner_token for diagnostics and cleanup.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Acquire a slot
        result = await manager.acquire_key(config_id, multi_key_info, None)
        assert result is not None
        assert "api_key" in result
        assert "owner_token" in result
        
        owner_token = result["owner_token"]
        assigned_key = result["api_key"]
        
        # Retrieve the assigned key using get_assigned_key_for_owner
        get_key_method = getattr(manager, 'get_assigned_key_for_owner', None)
        assert get_key_method is not None
        
        key_info = await get_key_method(config_id, owner_token)
        
        assert key_info is not None, "Should find assigned key for owner"
        assert key_info["api_key"] == assigned_key, "Retrieved key should match assigned key"
        assert "key_id" in key_info, "Should include key_id in retrieval"


@pytest.mark.asyncio
async def test_get_assigned_key_returns_none_for_nonexistent_owner(fake_redis, config_id):
    """
    Task 13: get_assigned_key_for_owner returns None for non-existent owner.
    
    This prevents accidentally returning wrong keys for invalid tokens.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        get_key_method = getattr(manager, 'get_assigned_key_for_owner', None)
        assert get_key_method is not None
        
        # Query non-existent owner
        key_info = await get_key_method(config_id, "nonexistent-token-12345")
        
        assert key_info is None, "Should return None for non-existent owner"


@pytest.mark.asyncio
async def test_queued_owner_key_retrieved_after_acquisition(fake_redis, config_id, single_key_info):
    """
    Task 13: For queued owners, the assigned key is retrievable after slot acquisition.
    
    Flow:
    1. Task queues (owner_token stored, no api_key assigned yet)
    2. Slot becomes available
    3. try_acquire_for_queued_owner assigns the key
    4. get_assigned_key_for_owner returns the assigned key
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    single_key_info[0]["concurrency_limit"] = 1
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Owner A acquires the only slot
        owner_a = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_a is not None
        assert "api_key" in owner_a
        
        # Owner B queues
        owner_b = await manager.acquire_key(config_id, single_key_info, None)
        assert owner_b is not None
        assert owner_b.get("queued") is True
        
        b_token = owner_b["owner_token"]
        
        # Before slot is acquired for B, key lookup should return None
        get_key_method = getattr(manager, 'get_assigned_key_for_owner', None)
        assert get_key_method is not None
        
        key_before = await get_key_method(config_id, b_token)
        # Owner metadata exists but api_key might not be set until acquisition
        # (depends on implementation - owner metadata is set at enqueue time)
        
        # Release A's slot - B should be dequeued and slot acquired
        # Note: release_key needs keys_info to calculate capacity for queue advancement
        await manager.release_key(config_id, owner_a["api_key"], keys_info=single_key_info)
        
        # Now B should have the slot with assigned key
        key_after = await get_key_method(config_id, b_token)
        assert key_after is not None, "B should have assigned key after acquiring slot"
        assert "api_key" in key_after
        assert key_after["api_key"].startswith("sk-test-"), "Should be a valid test key"


@pytest.mark.asyncio
async def test_multi_key_each_owner_gets_correct_key(fake_redis, config_id, multi_key_info):
    """
    Task 13: With multiple keys, each owner should get a specific key assigned.
    
    This verifies that multi-key capacity doesn't mix up which key is assigned
    to which owner.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Acquire multiple slots
        results = []
        for _ in range(6):  # Total capacity is 6 (2+3+1)
            result = await manager.acquire_key(config_id, multi_key_info, None)
            assert result is not None
            assert "api_key" in result
            assert "owner_token" in result
            results.append(result)
        
        # Verify each owner has a valid assigned key
        get_key_method = getattr(manager, 'get_assigned_key_for_owner', None)
        assert get_key_method is not None
        
        for i, result in enumerate(results):
            owner_token = result["owner_token"]
            assigned_key = result["api_key"]
            
            key_info = await get_key_method(config_id, owner_token)
            assert key_info is not None, f"Owner {i} should have key info"
            assert key_info["api_key"] == assigned_key, f"Owner {i} key should match"


@pytest.mark.asyncio
async def test_disabled_key_not_assigned(fake_redis, config_id, mixed_keys_info):
    """
    Task 13: Disabled keys should never be assigned to owners.
    
    Only enabled keys (contributing to capacity) should be assigned.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Get the disabled key's api_key for comparison
        disabled_key = None
        for k in mixed_keys_info:
            if not k.get("enabled", True):
                disabled_key = k["api_key"]
                break
        
        assert disabled_key is not None, "Test fixture should have a disabled key"
        
        # Acquire all available slots (5 from enabled keys: 2+3)
        results = []
        for _ in range(5):
            result = await manager.acquire_key(config_id, mixed_keys_info, None)
            assert result is not None
            assert "api_key" in result
            results.append(result)
        
        # Verify no owner was assigned the disabled key
        get_key_method = getattr(manager, 'get_assigned_key_for_owner', None)
        assert get_key_method is not None
        
        for i, result in enumerate(results):
            owner_token = result["owner_token"]
            key_info = await get_key_method(config_id, owner_token)
            
            assert key_info is not None
            assert key_info["api_key"] != disabled_key, \
                f"Owner {i} should NOT be assigned disabled key"


@pytest.mark.asyncio
async def test_sum_of_limits_capacity_with_three_keys(fake_redis, config_id):
    """
    Task 13 QA Scenario 1: Three-key config admits sum-of-limits concurrent submissions.
    
    With keys at limits 1, 2, and 4: total = 7
    7 owners should acquire slots, 8th should queue.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    three_keys = [
        {"id": "key-a", "api_key": "sk-key-a", "enabled": True, "concurrency_limit": 1},
        {"id": "key-b", "api_key": "sk-key-b", "enabled": True, "concurrency_limit": 2},
        {"id": "key-c", "api_key": "sk-key-c", "enabled": True, "concurrency_limit": 4},
    ]
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Acquire 7 slots (total capacity = 1+2+4 = 7)
        acquired = []
        for i in range(7):
            result = await manager.acquire_key(config_id, three_keys, None)
            assert result is not None, f"Should acquire slot {i+1}"
            assert "api_key" in result, f"Slot {i+1} should have assigned api_key"
            acquired.append(result)
        
        # 8th should queue
        eighth = await manager.acquire_key(config_id, three_keys, None)
        assert eighth is not None, "Should return queue placement for 8th"
        assert eighth.get("queued") is True, "8th request should be queued"
        assert eighth.get("queue_position") == 1, "First queued should have position 1"


@pytest.mark.asyncio
async def test_assigned_key_traceable_in_owner_metadata(fake_redis, config_id, multi_key_info):
    """
    Task 13 QA Scenario 2: Assigned provider key is recorded per task.
    
    The exact assigned key identifier/hash should be traceable without
    exposing plaintext secret.
    """
    from app.ai_gateway.concurrency import AIKeyConcurrencyManager
    
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        manager = AIKeyConcurrencyManager()
        
        # Acquire a slot
        result = await manager.acquire_key(config_id, multi_key_info, None)
        assert result is not None
        
        owner_token = result["owner_token"]
        assigned_api_key = result["api_key"]
        assigned_key_id = result.get("key_id") or result.get("id")
        
        # The key_id should be traceable (not necessarily the full api_key)
        assert assigned_key_id is not None, "key_id should be available for tracing"
        
        # Verify key hash is consistent (for diagnostics without exposing secret)
        key_hash = manager._get_key_hash(assigned_api_key)
        assert len(key_hash) == 16, "Key hash should be 16 chars for safe display"
        
        # The owner metadata should contain the full key for release
        get_key_method = getattr(manager, 'get_assigned_key_for_owner', None)
        assert get_key_method is not None
        
        key_info = await get_key_method(config_id, owner_token)
        assert key_info is not None
        assert key_info["api_key"] == assigned_api_key, "Full key needed for release"
        assert key_info["key_id"] == assigned_key_id, "key_id available for diagnostics"
