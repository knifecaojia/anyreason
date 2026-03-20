"""
Task 16: End-to-End FIFO and Queue-Position Integration Tests

Covers the three required integrated scenarios:
1. One-slot FIFO progression across multiple queued tasks
2. Queue position update after cancellation
3. Queue position disappearing after a task leaves queued state

Plus supporting scenarios for full coverage:
- Full submit→queue→advance complete flow
- Multi-key sum-of-limits behavior
- Rapid state changes
- Edge cases

These tests use deterministic control (no sleeps) and verify
the integrated behavior of acquire_key, release_key, release_key_with_owner,
remove_from_queue, and get_queue_depth across the concurrency manager.
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

import pytest


# ---------------------------------------------------------------------------
# FakeRedis — mimics redis.asyncio for slot+queue operations
# ---------------------------------------------------------------------------

class FakeRedis:
    """Minimal fake Redis for concurrency manager integration tests."""

    def __init__(self) -> None:
        self._data: dict[str, int] = {}
        self._queue: dict[str, list[str]] = {}  # queue_key -> [owner_token, ...]
        self._owner_meta: dict[str, dict[str, str]] = {}  # owner_key -> metadata

    async def incr(self, key: str) -> int:
        self._data[key] = self._data.get(key, 0) + 1
        return self._data[key]

    async def decr(self, key: str) -> int:
        self._data[key] = self._data.get(key, 0) - 1
        return self._data[key]

    async def set(self, key: str, value: int) -> None:
        self._data[key] = value

    async def get(self, key: str) -> str | None:
        val = self._data.get(key)
        return str(val) if val is not None else None

    async def expire(self, key: str, seconds: int) -> None:
        pass  # no-op in tests

    async def delete(self, *keys: str) -> None:
        for k in keys:
            self._data.pop(k, None)
            self._queue.pop(k, None)
            self._owner_meta.pop(k, None)

    async def rpush(self, key: str, *values: str) -> int:
        self._queue.setdefault(key, [])
        for v in values:
            self._queue[key].append(v)
        return len(self._queue[key])

    async def lpop(self, key: str) -> str | None:
        q = self._queue.get(key)
        if not q:
            return None
        return q.pop(0)

    async def lrange(self, key: str, start: int, end: int) -> list[str]:
        q = self._queue.get(key, [])
        if end == -1:
            return q[start:]
        return q[start : end + 1]

    async def llen(self, key: str) -> int:
        return len(self._queue.get(key, []))

    async def hset(self, key: str, mapping: dict[str, Any] | None = None, **kwargs: Any) -> None:
        if mapping:
            self._owner_meta[key] = dict(mapping)
        else:
            self._owner_meta[key] = dict(kwargs)

    async def hget(self, key: str, field: str) -> str | None:
        return self._owner_meta.get(key, {}).get(field)

    async def hgetall(self, key: str) -> dict[str, str]:
        return self._owner_meta.get(key, {})

    async def scan_iter(self, match: str | None = None):
        if match:
            prefix = match.replace("*", "")
            for k in list(self._owner_meta.keys()):
                if k.startswith(prefix):
                    yield k
        else:
            for k in self._owner_meta.keys():
                yield k


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def fake_redis() -> FakeRedis:
    return FakeRedis()


@pytest.fixture
def config_id() -> UUID:
    return uuid4()


@pytest.fixture
def single_key_info() -> list[dict[str, Any]]:
    """One enabled key with limit 1 (total capacity = 1)."""
    return [
        {"id": "key-1", "api_key": "sk-test-key-1", "enabled": True, "concurrency_limit": 1}
    ]


@pytest.fixture
def two_key_info() -> list[dict[str, Any]]:
    """Two enabled keys: limit 1 each (total capacity = 2)."""
    return [
        {"id": "key-a", "api_key": "sk-key-a", "enabled": True, "concurrency_limit": 1},
        {"id": "key-b", "api_key": "sk-key-b", "enabled": True, "concurrency_limit": 1},
    ]


# ---------------------------------------------------------------------------
# Helper: peek at queue position directly from FakeRedis
# ---------------------------------------------------------------------------

def _get_position(redis: FakeRedis, config_id: UUID, owner_token: str) -> int | None:
    """Return 1-based queue position from FakeRedis, or None if not queued."""
    queue_key = f"ai_queue:{config_id}"
    queue = redis._queue.get(queue_key, [])
    try:
        return queue.index(owner_token) + 1
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Scenario 1: FIFO Progression — one slot, multiple queued tasks
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fifo_progression_slot_frees_and_advances_next(
    fake_redis: FakeRedis, config_id: UUID, single_key_info: list[dict[str, Any]]
) -> None:
    """
    A acquires (slot 1), B queues, C queues.
    A releases → B advances → C compact to position 1.
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        # A acquires
        a_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert a_res is not None
        assert "api_key" in a_res
        assert "owner_token" in a_res

        # B queues
        b_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert b_res is not None
        assert b_res.get("queue_position") == 1
        b_token = b_res["owner_token"]

        # C queues
        c_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert c_res is not None
        assert c_res.get("queue_position") == 2
        c_token = c_res["owner_token"]

        # Verify depth
        assert await mgr.get_queue_depth(config_id) == 2

        # A releases → B advances → C compact to 1
        await mgr.release_key(config_id, a_res["api_key"], keys_info=single_key_info, default_key=None)

        # B's token now has acquired_at in metadata (advanced via release_key)
        b_meta = await fake_redis.hgetall(f"ai_owner:{config_id}:{b_token}")
        assert b_meta.get("acquired_at") is not None

        # C compact to position 1
        c_pos = _get_position(fake_redis, config_id, c_token)
        assert c_pos == 1


@pytest.mark.asyncio
async def test_fifo_four_tasks_through_one_slot(
    fake_redis: FakeRedis, config_id: UUID, single_key_info: list[dict[str, Any]]
) -> None:
    """
    A holds → D,E,F,G queue (positions 1-4) → A releases → D advances.
    E,F,G compact to 1,2,3. D completes → E advances, F,G compact to 1,2.
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        a_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert a_res is not None

        # Queue D, E, F, G
        d_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert d_res is not None
        d_token = d_res["owner_token"]
        assert d_res.get("queue_position") == 1

        e_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert e_res is not None
        e_token = e_res["owner_token"]
        assert e_res.get("queue_position") == 2

        f_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert f_res is not None
        f_token = f_res["owner_token"]
        assert f_res.get("queue_position") == 3

        g_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert g_res is not None
        g_token = g_res["owner_token"]
        assert g_res.get("queue_position") == 4

        # A releases → D advances → E,F,G compact to 1,2,3
        await mgr.release_key(config_id, a_res["api_key"], keys_info=single_key_info, default_key=None)

        e_pos = _get_position(fake_redis, config_id, e_token)
        f_pos = _get_position(fake_redis, config_id, f_token)
        g_pos = _get_position(fake_redis, config_id, g_token)
        assert e_pos == 1, f"E should be at 1, got {e_pos}"
        assert f_pos == 2, f"F should be at 2, got {f_pos}"
        assert g_pos == 3, f"G should be at 3, got {g_pos}"

        # D releases → E advances → F,G compact to 1,2
        d_meta = await fake_redis.hgetall(f"ai_owner:{config_id}:{d_token}")
        await mgr.release_key_with_owner(str(config_id), d_token, keys_info=single_key_info)

        f_pos2 = _get_position(fake_redis, config_id, f_token)
        g_pos2 = _get_position(fake_redis, config_id, g_token)
        assert f_pos2 == 1, f"F should be at 1 after D, got {f_pos2}"
        assert g_pos2 == 2, f"G should be at 2 after D, got {g_pos2}"

        # Depth check
        assert await mgr.get_queue_depth(config_id) == 2


# ---------------------------------------------------------------------------
# Scenario 2: Queue Position Update After Cancellation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cancel_queued_updates_remaining_positions(
    fake_redis: FakeRedis, config_id: UUID, single_key_info: list[dict[str, Any]]
) -> None:
    """
    A holds, B/C/D queue at 1/2/3. Cancel D → B/C stay, depth=2.
    Cancel C → B stays at 1, depth=1.
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        a_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert a_res is not None

        b_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert b_res is not None
        b_token = b_res["owner_token"]

        c_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert c_res is not None
        c_token = c_res["owner_token"]

        d_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert d_res is not None
        d_token = d_res["owner_token"]

        assert await mgr.get_queue_depth(config_id) == 3

        # Cancel D (last) → depth drops to 2
        removed = await mgr.remove_from_queue(config_id, d_token)
        assert removed is True
        assert await mgr.get_queue_depth(config_id) == 2

        # B and C positions unchanged
        assert _get_position(fake_redis, config_id, b_token) == 1
        assert _get_position(fake_redis, config_id, c_token) == 2

        # Cancel C (middle) → B stays at 1, depth=1
        removed2 = await mgr.remove_from_queue(config_id, c_token)
        assert removed2 is True
        assert await mgr.get_queue_depth(config_id) == 1
        assert _get_position(fake_redis, config_id, b_token) == 1


@pytest.mark.asyncio
async def test_cancel_first_queued_advances_next(
    fake_redis: FakeRedis, config_id: UUID, single_key_info: list[dict[str, Any]]
) -> None:
    """
    A holds, B/C/D queue. Cancel B (position 1) → D now at 3 (was 4).
    C stays at 2. B's metadata is deleted.
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        a_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert a_res is not None

        b_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert b_res is not None
        b_token = b_res["owner_token"]

        c_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert c_res is not None
        c_token = c_res["owner_token"]

        d_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert d_res is not None
        d_token = d_res["owner_token"]

        # Cancel B (first in queue)
        removed = await mgr.remove_from_queue(config_id, b_token)
        assert removed is True

        # C at 1, D at 2
        assert _get_position(fake_redis, config_id, c_token) == 1
        assert _get_position(fake_redis, config_id, d_token) == 2

        # B's metadata cleaned up
        b_meta = await fake_redis.hgetall(f"ai_owner:{config_id}:{b_token}")
        assert b_meta == {}

        assert await mgr.get_queue_depth(config_id) == 2


@pytest.mark.asyncio
async def test_cancel_all_queued_tasks_leaves_active_unchanged(
    fake_redis: FakeRedis, config_id: UUID, single_key_info: list[dict[str, Any]]
) -> None:
    """
    A holds, B/C/D queue. Cancel all three. Slot still held by A.
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        a_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert a_res is not None

        b_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert b_res is not None
        c_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert c_res is not None
        d_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert d_res is not None

        assert await mgr.get_queue_depth(config_id) == 3

        await mgr.remove_from_queue(config_id, b_res["owner_token"])
        await mgr.remove_from_queue(config_id, c_res["owner_token"])
        await mgr.remove_from_queue(config_id, d_res["owner_token"])

        assert await mgr.get_queue_depth(config_id) == 0

        # A still holds its slot (check via FakeRedis counter)
        queue_key = f"ai_concurrency:{config_id}:{mgr._get_key_hash('sk-test-key-1')}"
        assert await fake_redis.get(queue_key) == "1"


@pytest.mark.asyncio
async def test_cancel_then_new_enqueue_appends_to_end(
    fake_redis: FakeRedis, config_id: UUID, single_key_info: list[dict[str, Any]]
) -> None:
    """
    B, C queue at 1, 2. Cancel B. New D enqueues → appended to end (FIFO),
    so D gets position 2. C remains at 1.
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        a_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert a_res is not None

        b_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert b_res is not None
        b_token = b_res["owner_token"]

        c_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert c_res is not None
        c_token = c_res["owner_token"]

        # Cancel B → queue becomes [C]
        await mgr.remove_from_queue(config_id, b_token)
        assert _get_position(fake_redis, config_id, c_token) == 1
        assert await mgr.get_queue_depth(config_id) == 1

        # D enqueues → appended to end (FIFO)
        d_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert d_res is not None
        d_token = d_res["owner_token"]
        assert d_res.get("queue_position") == 2  # appended to tail
        assert _get_position(fake_redis, config_id, d_token) == 2

        # C still at 1
        assert _get_position(fake_redis, config_id, c_token) == 1


# ---------------------------------------------------------------------------
# Scenario 3: Queue Position Disappears After Dequeue (task leaves queued state)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_acquired_slot_has_no_queue_position(
    fake_redis: FakeRedis, config_id: UUID, single_key_info: list[dict[str, Any]]
) -> None:
    """
    After release_key advances a queued owner, that owner has acquired_at
    but is no longer in the queue list. No queue_position metadata exists.
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        a_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert a_res is not None

        b_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert b_res is not None
        b_token = b_res["owner_token"]

        # A releases → B advances
        await mgr.release_key(config_id, a_res["api_key"], keys_info=single_key_info, default_key=None)

        # B is NOT in queue (dequeued)
        assert _get_position(fake_redis, config_id, b_token) is None

        # B has acquired_at
        b_meta = await fake_redis.hgetall(f"ai_owner:{config_id}:{b_token}")
        assert b_meta.get("acquired_at") is not None

        # B's metadata has no queue_position key
        assert "queue_position" not in b_meta


@pytest.mark.asyncio
async def test_canceled_task_not_in_queue(
    fake_redis: FakeRedis, config_id: UUID, single_key_info: list[dict[str, Any]]
) -> None:
    """
    Canceled task is removed from queue and has no queue metadata.
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        a_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert a_res is not None

        b_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert b_res is not None
        b_token = b_res["owner_token"]

        assert _get_position(fake_redis, config_id, b_token) == 1

        await mgr.remove_from_queue(config_id, b_token)

        assert _get_position(fake_redis, config_id, b_token) is None

        b_meta = await fake_redis.hgetall(f"ai_owner:{config_id}:{b_token}")
        assert b_meta == {}


@pytest.mark.asyncio
async def test_release_key_with_owner_cleans_metadata(
    fake_redis: FakeRedis, config_id: UUID, single_key_info: list[dict[str, Any]]
) -> None:
    """
    release_key_with_owner deletes owner metadata and advances queue.
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        a_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert a_res is not None
        a_token = a_res["owner_token"]

        b_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert b_res is not None
        b_token = b_res["owner_token"]

        # release_key_with_owner for A
        released = await mgr.release_key_with_owner(str(config_id), a_token, keys_info=single_key_info)
        assert released is True

        # A's metadata deleted
        a_meta = await fake_redis.hgetall(f"ai_owner:{config_id}:{a_token}")
        assert a_meta == {}

        # B advanced (no longer in queue)
        assert _get_position(fake_redis, config_id, b_token) is None
        b_meta = await fake_redis.hgetall(f"ai_owner:{config_id}:{b_token}")
        assert b_meta.get("acquired_at") is not None


@pytest.mark.asyncio
async def test_release_skips_orphan_queue_entries_and_advances_real_owner(
    fake_redis: FakeRedis, config_id: UUID, single_key_info: list[dict[str, Any]]
) -> None:
    """
    If the queue contains an orphan owner token with no owner metadata, release should
    skip/clean that orphan and continue advancing the next real queued owner.
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis), \
         patch("app.ai_gateway.concurrency.enqueue_task", new=AsyncMock()):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        a_res = await mgr.acquire_key(config_id, single_key_info, None, task_id=str(uuid4()))
        assert a_res is not None

        # Insert orphan queue token with no owner metadata
        orphan = "orphan-owner-token"
        await fake_redis.rpush(f"ai_queue:{config_id}", orphan)

        # Real queued owner behind the orphan
        b_task_id = str(uuid4())
        b_res = await mgr.acquire_key(config_id, single_key_info, None, task_id=b_task_id)
        assert b_res is not None
        b_token = b_res["owner_token"]

        await mgr.release_key_with_owner(str(config_id), a_res["owner_token"], keys_info=single_key_info)

        # Orphan should not block B from advancing.
        b_meta = await fake_redis.hgetall(f"ai_owner:{config_id}:{b_token}")
        assert b_meta.get("acquired_at") is not None

        remaining_queue = await fake_redis.lrange(f"ai_queue:{config_id}", 0, -1)
        assert orphan not in remaining_queue


# ---------------------------------------------------------------------------
# Scenario 4: Full Submit → Queue → Advance Complete Flow
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_full_submit_queue_advance_complete_flow(
    fake_redis: FakeRedis, config_id: UUID, single_key_info: list[dict[str, Any]]
) -> None:
    """
    Simulate the full submit flow for two tasks through a single-slot queue:
    1. A submits → acquires slot
    2. B submits → queues at 1
    3. A completes → releases → B advances to slot
    4. B completes → releases → no queue
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        # Step 1: A acquires
        a_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert a_res is not None
        a_token = a_res["owner_token"]

        # Step 2: B queues
        b_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert b_res is not None
        b_token = b_res["owner_token"]
        assert b_res.get("queue_position") == 1
        assert await mgr.get_queue_depth(config_id) == 1

        # Step 3: A completes, B advances
        await mgr.release_key_with_owner(str(config_id), a_token, keys_info=single_key_info)
        assert _get_position(fake_redis, config_id, b_token) is None
        b_meta = await fake_redis.hgetall(f"ai_owner:{config_id}:{b_token}")
        assert b_meta.get("acquired_at") is not None

        # Step 4: B completes, queue empty
        await mgr.release_key_with_owner(str(config_id), b_token, keys_info=single_key_info)
        assert await mgr.get_queue_depth(config_id) == 0

        # All metadata cleaned
        a_meta = await fake_redis.hgetall(f"ai_owner:{config_id}:{a_token}")
        b_meta2 = await fake_redis.hgetall(f"ai_owner:{config_id}:{b_token}")
        assert a_meta == {}
        assert b_meta2 == {}


@pytest.mark.asyncio
async def test_queue_depth_tracked_at_each_step(
    fake_redis: FakeRedis, config_id: UUID, single_key_info: list[dict[str, Any]]
) -> None:
    """
    Track queue depth at each step of the flow.
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        assert await mgr.get_queue_depth(config_id) == 0

        a_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert a_res is not None
        assert await mgr.get_queue_depth(config_id) == 0

        b_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert b_res is not None
        assert await mgr.get_queue_depth(config_id) == 1

        c_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert c_res is not None
        assert await mgr.get_queue_depth(config_id) == 2

        await mgr.remove_from_queue(config_id, b_res["owner_token"])
        assert await mgr.get_queue_depth(config_id) == 1

        await mgr.remove_from_queue(config_id, c_res["owner_token"])
        assert await mgr.get_queue_depth(config_id) == 0


# ---------------------------------------------------------------------------
# Scenario 5: Multi-Key Sum-of-Limits
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_multi_key_two_keys_total_capacity_two(
    fake_redis: FakeRedis, config_id: UUID, two_key_info: list[dict[str, Any]]
) -> None:
    """
    Two keys with limit 1 each = total capacity 2.
    A,B acquire, C queues, D queues at 2.
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        a_res = await mgr.acquire_key(config_id, two_key_info, None)
        assert a_res is not None
        b_res = await mgr.acquire_key(config_id, two_key_info, None)
        assert b_res is not None

        c_res = await mgr.acquire_key(config_id, two_key_info, None)
        assert c_res is not None
        assert c_res.get("queue_position") == 1

        d_res = await mgr.acquire_key(config_id, two_key_info, None)
        assert d_res is not None
        assert d_res.get("queue_position") == 2

        # A releases → C advances → D compact to 1
        await mgr.release_key(config_id, a_res["api_key"], keys_info=two_key_info, default_key=None)

        assert _get_position(fake_redis, config_id, d_res["owner_token"]) == 1
        assert _get_position(fake_redis, config_id, c_res["owner_token"]) is None


@pytest.mark.asyncio
async def test_multi_key_fifo_order_preserved_across_keys(
    fake_redis: FakeRedis, config_id: UUID, two_key_info: list[dict[str, Any]]
) -> None:
    """
    A,B acquire (fill capacity). C,D,E queue. A releases → C advances.
    B releases → D advances. E still at 1. FIFO order preserved.
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        a_res = await mgr.acquire_key(config_id, two_key_info, None)
        assert a_res is not None
        a_token = a_res["owner_token"]

        b_res = await mgr.acquire_key(config_id, two_key_info, None)
        assert b_res is not None
        b_token = b_res["owner_token"]

        c_res = await mgr.acquire_key(config_id, two_key_info, None)
        assert c_res is not None
        c_token = c_res["owner_token"]

        d_res = await mgr.acquire_key(config_id, two_key_info, None)
        assert d_res is not None
        d_token = d_res["owner_token"]

        e_res = await mgr.acquire_key(config_id, two_key_info, None)
        assert e_res is not None
        e_token = e_res["owner_token"]

        # A releases → C advances
        await mgr.release_key_with_owner(str(config_id), a_token, keys_info=two_key_info)
        assert _get_position(fake_redis, config_id, c_token) is None

        # B releases → D advances
        await mgr.release_key_with_owner(str(config_id), b_token, keys_info=two_key_info)
        assert _get_position(fake_redis, config_id, d_token) is None

        # E still queued at 1
        assert _get_position(fake_redis, config_id, e_token) == 1


@pytest.mark.asyncio
async def test_multi_key_capacity_released_on_completion(
    fake_redis: FakeRedis, config_id: UUID, two_key_info: list[dict[str, Any]]
) -> None:
    """
    A,B acquire, C queues. After A+B complete, C gets slot immediately on next acquire.
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        a_res = await mgr.acquire_key(config_id, two_key_info, None)
        assert a_res is not None
        b_res = await mgr.acquire_key(config_id, two_key_info, None)
        assert b_res is not None

        c_res = await mgr.acquire_key(config_id, two_key_info, None)
        assert c_res is not None
        c_token = c_res["owner_token"]
        assert c_res.get("queue_position") == 1

        # Both release
        await mgr.release_key_with_owner(str(config_id), a_res["owner_token"], keys_info=two_key_info)
        await mgr.release_key_with_owner(str(config_id), b_res["owner_token"], keys_info=two_key_info)

        # C calls acquire_key with its token → re-entrant check → gets slot
        c_reacquire = await mgr.acquire_key(
            config_id, two_key_info, None, owner_token=c_token
        )
        assert c_reacquire is not None
        assert "api_key" in c_reacquire
        assert _get_position(fake_redis, config_id, c_token) is None


# ---------------------------------------------------------------------------
# Scenario 6: Rapid State Changes
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_rapid_cancel_and_requeue_maintains_correct_positions(
    fake_redis: FakeRedis, config_id: UUID, single_key_info: list[dict[str, Any]]
) -> None:
    """
    Rapidly cancel and re-add tasks. Positions always reflect live queue state.
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        a_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert a_res is not None

        # B, C, D queue
        b_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert b_res is not None
        b_token = b_res["owner_token"]

        c_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert c_res is not None
        c_token = c_res["owner_token"]

        d_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert d_res is not None
        d_token = d_res["owner_token"]

        # Rapid: cancel C, re-add E, cancel B, re-add F
        await mgr.remove_from_queue(config_id, c_token)

        e_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert e_res is not None
        e_token = e_res["owner_token"]

        await mgr.remove_from_queue(config_id, b_token)

        f_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert f_res is not None
        f_token = f_res["owner_token"]

        # Final state: D=1, E=2, F=3
        assert _get_position(fake_redis, config_id, d_token) == 1
        assert _get_position(fake_redis, config_id, e_token) == 2
        assert _get_position(fake_redis, config_id, f_token) == 3
        assert await mgr.get_queue_depth(config_id) == 3


# ---------------------------------------------------------------------------
# Scenario 7: Edge Cases
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_acquire_with_no_keys_returns_none(
    fake_redis: FakeRedis, config_id: UUID
) -> None:
    """
    acquire_key with no keys configured returns None.
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        result = await mgr.acquire_key(config_id, None, None)
        assert result is None


@pytest.mark.asyncio
async def test_acquire_with_all_disabled_keys_returns_none(
    fake_redis: FakeRedis, config_id: UUID
) -> None:
    """
    All keys disabled → returns None (not queued).
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        disabled_keys = [
            {"id": "k1", "api_key": "sk-1", "enabled": False, "concurrency_limit": 5},
            {"id": "k2", "api_key": "sk-2", "enabled": False, "concurrency_limit": 3},
        ]

        result = await mgr.acquire_key(config_id, disabled_keys, None)
        assert result is None


@pytest.mark.asyncio
async def test_owner_token_reentrant_check_prevents_re_enqueue(
    fake_redis: FakeRedis, config_id: UUID, single_key_info: list[dict[str, Any]]
) -> None:
    """
    After a queued owner is advanced via release_key (has acquired_at in metadata),
    calling acquire_key with their owner_token returns slot info without re-enqueueing.
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        a_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert a_res is not None
        a_token = a_res["owner_token"]

        b_res = await mgr.acquire_key(config_id, single_key_info, None)
        assert b_res is not None
        b_token = b_res["owner_token"]

        # A releases → B advanced (acquired_at set)
        await mgr.release_key(config_id, a_res["api_key"], keys_info=single_key_info, default_key=None)

        # B calls acquire_key with token → re-entrant check → slot returned
        b_reacquire = await mgr.acquire_key(config_id, single_key_info, None, owner_token=b_token)
        assert b_reacquire is not None
        assert "api_key" in b_reacquire
        assert b_reacquire.get("queue_position") is None

        # B NOT re-enqueued
        assert _get_position(fake_redis, config_id, b_token) is None
        assert await mgr.get_queue_depth(config_id) == 0


@pytest.mark.asyncio
async def test_release_key_with_owner_unknown_token_returns_false(
    fake_redis: FakeRedis, config_id: UUID, single_key_info: list[dict[str, Any]]
) -> None:
    """
    release_key_with_owner with an unknown token returns False (no-op).
    """
    with patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis):
        from app.ai_gateway.concurrency import AIKeyConcurrencyManager
        mgr = AIKeyConcurrencyManager()

        result = await mgr.release_key_with_owner(str(config_id), "unknown-token", keys_info=single_key_info)
        assert result is False
