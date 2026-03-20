# Video Slot Queue Semantics

## Purpose

This document describes the internal design of the video slot queue for developers working on the concurrent-video-generation feature. For operational guidance, see [video-queue-runbook.md](./video-queue-runbook.md).

---

## Scope

The slot queue applies **only** to two-phase media/video generation tasks:

- `batch_video_asset_generate`
- `asset_video_generate`
- `shot_video_generate`
- `model_test_video_generate`

Text, chat, and non-two-phase tasks are unaffected. They retain the original fail-fast behavior (immediate 429 on key exhaustion).

---

## Capacity Model

### Total Capacity

```
total_capacity(config) = sum(concurrency_limit for each key where enabled = true)
```

Disabled keys contribute zero. Keys with no explicit `concurrency_limit` default to 5.

### Per-Key Limits

Each API key has its own `concurrency_limit`. The scheduler picks the first key with available capacity below its limit (not round-robin). When the selected key reaches its limit, the scheduler tries the next enabled key.

### Multi-Key Aggregation

A model config can have multiple API keys. Total concurrency equals the sum of all enabled key limits. This means a 2-key config with limits 3 and 4 has effective capacity of 7, not 3 or 4.

---

## State Machine

```
queued
  |
  v
[Try acquire slot]
  |                       (no slot available)
  |                              |
  v                              v
submitting ---> waiting_external ---> succeeded
                    |                    ^
                    |                    |
                    +---- failed --------+
                    |
                    +---- canceled (release slot if held)

queued_for_slot
  |              (slot available)
  v
submitting ...
```

### `queued`
Initial state when a task is created. The worker picks it up and attempts slot acquisition.

### `queued_for_slot`
The task entered the FIFO queue because no slot was available. The task:
- Does NOT hold any slot.
- Has an `owner_token` and `queue_position` (1-based).
- Will be retried by the worker when a slot frees up.

**Canceling while `queued_for_slot`**: The task is removed from the Redis queue. No slot is released. The next queued task advances.

### `submitting`
The task acquired a slot and is calling the provider API. The task:
- Holds a slot (`_slot_api_key` set in `external_meta`).
- Has `acquired_at` timestamp.
- Has a 5-minute timeout before transition to `failed`.

**Canceling during `submitting`**: The held slot is released via `release_key_with_owner`, then the task is marked `canceled`.

### `waiting_external`
The provider acknowledged the request and returned an `external_task_id`. The task:
- Holds a slot (same slot from `submitting`).
- Is polled by `ExternalPoller` for completion.
- Has an overall timeout (`EXTERNAL_TASK_MAX_WAIT_HOURS`).

**Canceling during `waiting_external`**: The held slot is released. The provider is NOT notified of cancellation (providers do not support cancel-by-task-id). The task is marked `canceled`.

### `succeeded`
External provider returned success. The poller releases the slot and marks the task succeeded.

### `failed`
An error occurred during `submitting`, `waiting_external`, or post-processing. The slot is released.

### `canceled`
User-initiated cancellation at any phase. Slots are released if held. Provider is not notified.

---

## Redis Key Layout

| Pattern | Type | Purpose |
|---------|------|---------|
| `ai_queue:{config_id}` | List | FIFO queue of `owner_token` values |
| `ai_owner:{config_id}:{token}` | Hash | Metadata for an owner: `owner_token`, `api_key`, `key_id`, `acquired_at`, `enqueued_at`, `task_id` |
| `ai_concurrency:{config_id}:{key_hash}` | String (int) | Per-key concurrency counter |

### Key Naming

- `config_id`: UUID of the model config (from DB).
- `token`: UUID hex generated per slot acquisition/queue entry.
- `key_hash`: SHA256 first 16 chars of the API key (not the key itself).

---

## Queue Operations

### Enqueue

When no slot is available, `enqueue_owner()`:
1. Appends `owner_token` to `ai_queue:{config_id}` (RPUSH).
2. Creates `ai_owner:{config_id}:{token}` with metadata.
3. Sets TTL on the owner hash (2 hours).
4. Returns 1-based queue position.

### Dequeue

When a slot frees up, `release_key_with_owner()`:
1. Decrements the concurrency counter (DECR).
2. Deletes the owner hash.
3. Pops the next `owner_token` from the queue (LPOP).
4. Calls `try_acquire_for_queued_owner()` to give that token a slot.

### Cancel

`remove_from_queue()`:
1. Reads the queue list.
2. Rebuilds it without the target token.
3. Deletes the owner hash.
4. Does NOT touch concurrency counters (no slot was held).

---

## Recovery

### Stale Owner Detection

`recover_stale_owners(max_age_seconds=3600)`:

1. **Phase 1 — Stale active owners**: Scans all `ai_owner:*` hashes with `acquired_at` older than threshold. Decrements their counters and deletes the hash.
2. **Phase 2 — Stale queue entries**: Reads queue, checks `enqueued_at` on each owner hash. Removes entries older than threshold.
3. **Phase 3 — Queue advancement**: For each recovered slot, dequeues the next owner and attempts acquisition.

### Zombie Slot Cleanup

`cleanup_zombie_slots()`:

Detects slots where `ai_concurrency:{config_id}:{key_hash}` > 0 but no matching owner metadata exists. This happens when:
- Worker died after `INCR` but before release.
- Owner metadata TTL expired (2 hours) but counter remained.

Action: Sets the counter to 0 and advances the queue if capacity allows.

### Idempotency

All cleanup methods are idempotent:
- Calling `recover_stale_owners` twice produces the same result as once.
- `release_key_with_owner` checks for owner existence before decrementing.
- Counters are clamped to 0 (never go negative).

---

## Owner Token Lifecycle

The `owner_token` is the primary identifier for a slot claim:

1. Generated at queue entry or slot acquisition (UUID hex).
2. Stored in the Redis owner hash.
3. Stored in `task.slot_owner_token` and `task.external_meta["_slot_owner_token"]`.
4. Used to release the slot: `release_key_with_owner(config_id, owner_token)`.
5. Deleted when the slot is released or when the task is canceled.

### Why Owner Tokens Matter

Without explicit ownership tracking, a crashed worker would leave dangling concurrency counters indefinitely. The token allows `release_key_with_owner` to verify the caller is the legitimate owner before decrementing. TTL alone cannot guarantee this.

---

## Integration Points

### `acquire_slot_with_queue()` in `process_task.py`

Called when a two-phase task starts. Returns either a slot result or a queue result.

### `release_slot_with_owner()` in `process_task.py`

Called on cancel, timeout, failure, or success. Uses the stored `owner_token` to release the slot safely.

### `ExternalPoller._release_task_slot()`

Checks for `_slot_api_key` in `external_meta` before releasing. Skips if the task was never past `queued_for_slot`.

---

## Testing Surface

Relevant test files:
- `tests/ai_gateway/test_video_slot_scheduler.py` — scheduler unit tests
- `tests/tasks/test_video_slot_queue.py` — state machine and queue behavior
- `tests/tasks/test_video_slot_crash_recovery.py` — stale and zombie recovery
- `tests/tasks/test_external_poller_slot_release.py` — poller release paths
- `tests/ai_gateway/test_media_cancel.py` — cancel while queued
- `tests/api/test_video_queue_observability.py` — diagnostics API contracts
