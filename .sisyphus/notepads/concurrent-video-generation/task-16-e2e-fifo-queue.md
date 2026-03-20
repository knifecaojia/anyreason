# Task 16: End-to-End FIFO and Queue-Position Integration Tests

## Status: COMPLETE

## Files Changed

1. `fastapi_backend/tests/ai_gateway/test_video_fifo_e2e_integration.py` — CREATED (19 tests)
2. `fastapi_backend/app/ai_gateway/concurrency.py` — MODIFIED (4 method changes from earlier session)
3. `fastapi_backend/app/tasks/redis_client.py` — MODIFIED (earlier session)
4. `fastapi_backend/app/services/task_service.py` — MODIFIED (earlier session, minor str→UUID fix)

## Test Results

```
19 passed, 0 failed in 1.42s
```

LSP: Clean (0 errors, 0 warnings on test file).

Regression check (scheduler + crash recovery + queue tests):
```
86 passed, 1 skipped, 0 failed
```

---

## What the Tests Cover

### Scenario 1: One-Slot FIFO Progression (2 tests)
- `test_fifo_progression_slot_frees_and_advances_next`: A holds → B,C queue at 1,2 → A releases → B advances → C compact to 1
- `test_fifo_four_tasks_through_one_slot`: D,E,F,G queue at 1-4 → A releases → D advances → E,F,G compact → D releases → E advances → F,G compact → depth=2

### Scenario 2: Queue Position Update After Cancellation (4 tests)
- `test_cancel_queued_updates_remaining_positions`: B,C,D queue; cancel D → depth=2; cancel C → B stays at 1
- `test_cancel_first_queued_advances_next`: Cancel B (pos 1) → C at 1, D at 2; B's metadata deleted
- `test_cancel_all_queued_tasks_leaves_active_unchanged`: Cancel all 3 queued; slot still held by A
- `test_cancel_then_new_enqueue_appends_to_end`: After cancel B, D enqueues at tail (pos 2) — FIFO append, not gap-fill

### Scenario 3: Queue Position Disappears After Dequeue (3 tests)
- `test_acquired_slot_has_no_queue_position`: After release_key advances B → B not in queue, acquired_at set, no queue_position key in metadata
- `test_canceled_task_not_in_queue`: After cancel → not in queue, no metadata
- `test_release_key_with_owner_cleans_metadata`: release_key_with_owner deletes owner metadata and advances queue

### Scenario 4: Full Submit→Queue→Advance Complete Flow (2 tests)
- `test_full_submit_queue_advance_complete_flow`: Full cycle A acquires → B queues → A releases → B advances → B releases → empty
- `test_queue_depth_tracked_at_each_step`: Depth = 0→0→1→2→1→0 as tasks flow

### Scenario 5: Multi-Key Sum-of-Limits (3 tests)
- `test_multi_key_two_keys_total_capacity_two`: 2 keys × limit 1 = capacity 2; C,D queue; A releases → C advances → D compact to 1
- `test_multi_key_fifo_order_preserved_across_keys`: A,B acquire; C,D,E queue; release A → C advances; release B → D advances; E still at 1
- `test_multi_key_capacity_released_on_completion`: After A+B complete, C gets slot on re-acquire

### Scenario 6: Rapid State Changes (1 test)
- `test_rapid_cancel_and_requeue_maintains_correct_positions`: Rapid cancel+requeue → D=1, E=2, F=3 final positions

### Scenario 7: Edge Cases (4 tests)
- `test_acquire_with_no_keys_returns_none`
- `test_acquire_with_all_disabled_keys_returns_none`
- `test_owner_token_reentrant_check_prevents_re_enqueue`: After queued owner advanced, acquire_key with token → slot returned, NOT re-enqueued
- `test_release_key_with_owner_unknown_token_returns_false`

---

## Key Findings from Development

### Bug 1: dequeue_owner prematurely deleted metadata
- **Location**: `concurrency.py::dequeue_owner`
- **Problem**: Metadata was deleted immediately when owner was dequeued, BEFORE `try_acquire_for_queued_owner` could set `acquired_at`
- **Fix**: Remove metadata deletion from `dequeue_owner`; cleanup deferred to `remove_from_queue` (for cancel) and `release_key_with_owner` (for completion)

### Bug 2: acquire_key re-entrant call generated new token and re-enqueued
- **Location**: `concurrency.py::acquire_key`
- **Problem**: When a queued owner was advanced (via release_key) but called `acquire_key` again, it generated a NEW owner token and re-enqueued the task at the back
- **Fix**: Added re-entrant check in `acquire_key`: if `owner_token` has `acquired_at` → return slot info; if `owner_token` has `enqueued_at` (but no `acquired_at`) → return queue info without re-enqueueing

### Bug 3: queue_position was stored as static value at enqueue time
- **Location**: `concurrency.py::enqueue_owner`, `try_acquire_for_queued_owner`
- **Problem**: `queue_position` was stored in owner metadata at enqueue. When earlier entries were dequeuing, remaining entries still had their original (stale) positions
- **Fix**: `queue_position` is NEVER stored in metadata. Always computed from live queue list order via `_get_queue_position()`

### Bug 4: FakeRedis hset call type mismatch
- **Location**: `redis_client.py` (from earlier session)
- **Problem**: `AIKeyConcurrencyManager.enqueue_owner` calls `redis.hset(key, mapping={...})` — but the Redis interface had `hset(key, field, value)`. Calls with `mapping=` kwarg would fail
- **Fix**: Updated FakeRedis `hset` to accept both field/value and mapping kwarg forms

### Bug 5: test fixture used wrong concurrency_limit
- **Location**: `test_video_fifo_e2e_integration.py::single_key_info`
- **Problem**: Original fixture used `concurrency_limit: 5` — but with limit 5, multiple tasks could acquire slots since `get_current_usage` returns value BEFORE new incr
- **Fix**: Changed to `concurrency_limit: 1` for proper single-slot testing

---

## Concurrency.py Methods Modified

1. **`dequeue_owner()`** — Removed metadata deletion; added docstring explaining cleanup responsibility
2. **`acquire_key()`** — Added re-entrant check (lines ~543-563): detect `acquired_at` → return slot; detect `enqueued_at` → return queue info
3. **`try_acquire_for_queued_owner()`** — Merged existing metadata; removed `queue_position` from stored metadata
4. **`enqueue_owner()`** — `queue_position` NOT stored in metadata; always computed live

---

## Test Architecture

- **FakeRedis**: Full in-memory Redis mock with `_data` (counters), `_queue` (lists), `_owner_meta` (hashes)
- **Pattern**: `patch("app.ai_gateway.concurrency.get_redis", return_value=fake_redis)` per test
- **Deterministic**: No sleeps — every step controlled by explicit `acquire_key`/`release_key`/`remove_from_queue` calls
- **Position verification**: `_get_position()` helper reads queue list order directly from FakeRedis
- **Metadata verification**: `fake_redis.hgetall()` to check `acquired_at`, `enqueued_at`, absence of `queue_position`

---

## Correct Behavior Summary

| Event | queue_position | acquired_at | in_queue | Notes |
|-------|---------------|-------------|----------|-------|
| acquire_key → slot | N/A | set | No | Slot assigned |
| acquire_key → queue | live value | not set | Yes | Position from list index |
| release_key advances queued | N/A | set | No | Queue compact happens |
| remove_from_queue cancels | N/A | — | No | Metadata deleted |
| release_key_with_owner completes | N/A | — | No | Metadata deleted |
