# Video Slot Queue Recovery Runbook

## Overview

This runbook covers the video/media generation slot queue introduced in the concurrent-video-generation feature (Tasks 6-18).

The queue manages concurrent access to AI provider API keys for media generation tasks. When all slots are occupied, new tasks enter a FIFO queue instead of returning a 429 error.

**Scope**: Only applies to two-phase media/video generation tasks (`batch_video_asset_generate`, `asset_video_generate`, `shot_video_generate`, `model_test_video_generate`). Text, chat, and single-phase tasks are unaffected.

---

## Queue States

| Status | Meaning |
|--------|---------|
| `queued` | Task created, waiting for worker to pick it up |
| `queued_for_slot` | In the FIFO slot queue, waiting for an API key slot to open |
| `submitting` | Slot acquired, actively submitting to the external AI provider |
| `waiting_external` | Provider is generating; worker polls for completion |
| `succeeded` | Provider finished successfully |
| `failed` | Provider or internal error |
| `canceled` | User canceled the task |

### Key Distinctions

**`queued_for_slot` vs `submitting`**:
- `queued_for_slot`: Task is in the Redis FIFO queue but does not hold any slot. No API key is in use by this task yet.
- `submitting`: Task has acquired a slot and is actively calling the provider API. An API key slot is now consumed.

**`submitting` vs `waiting_external`**:
- `submitting`: The request has been sent to the AI provider but the provider has not yet returned a result. This phase has a 5-minute timeout.
- `waiting_external`: The provider has acknowledged the request and returned a `task_id`. The system polls the provider until completion.

**Canceling while `queued_for_slot`**:
- The task is removed from the Redis FIFO queue and marked `canceled`.
- No slot release occurs (the task never held one).
- Subsequent tasks in queue shift forward one position.

**Canceling after `submitting` or `waiting_external`**:
- The task's held slot is released via `release_key_with_owner`.
- If `waiting_external`, the external provider is NOT notified (provider cancellation is not supported). The slot is reclaimed and the task transitions to `canceled`.

---

## Capacity Model

**Total concurrency for a model config = sum of `concurrency_limit` across all enabled API keys.**

Example: A config has three enabled keys with limits 2, 3, and 1. Total capacity is **6**. The seventh concurrent request enters the queue.

Disabled keys contribute **zero** capacity.

Unspecified keys fall back to the default limit of **5**.

### Identifying a Saturation Issue

Symptoms:
- New media tasks immediately enter `queued_for_slot` state.
- `queue_depth` grows but `available` stays at 0.
- No tasks are making progress.

**First diagnostic**:
```
python fastapi_backend/debug_video_slot_queue.py health
```

Expected output shows per-config:
- `queue_depth`: number of tasks waiting
- `active/total (available)`: slot utilization — if `available = 0`, capacity is exhausted

If `total = 0`, no API keys are configured for that model config.

---

## Diagnostics Commands

### CLI (no authentication needed, safe for operators)

Run from the `fastapi_backend` directory:

```bash
# Combined health summary (recommended first step)
python debug_video_slot_queue.py health

# Queue depth only
python debug_video_slot_queue.py depth

# Slot utilization only
python debug_video_slot_queue.py utilization

# Stale slot candidates
python debug_video_slot_queue.py stale

# Active slot owners
python debug_video_slot_queue.py owners

# JSON output for scripting
python debug_video_slot_queue.py health --json
```

### Internal API (requires superuser)

```
GET /api/v1/internal/queue/health
GET /api/v1/internal/queue/depth
GET /api/v1/internal/queue/utilization
GET /api/v1/internal/queue/stale
```

All internal endpoints redact API keys — only key IDs/hashes, task IDs, counts, and timestamps are exposed.

### Reading Task State via API

```
GET /api/v1/tasks/{task_id}
```

Response includes:
- `status`: current queue state
- `queue_position`: 1-based position (only present when `status = queued_for_slot`)
- `slot_owner_token`: ownership token for the held slot (present after `submitting`)

---

## Stale and Zombie Recovery

### What is a "Stale" Slot?

**Stale queue entry**: a task in `queued_for_slot` for more than 1 hour (3600 seconds). The `enqueued_at` timestamp is older than the threshold.

**Stale active owner**: a task holding a slot (`submitting` or `waiting_external`) for more than 2 hours (7200 seconds). The `acquired_at` timestamp is older than the threshold.

### What is a "Zombie" Slot?

A zombie slot is a concurrency counter that shows positive usage but has no corresponding owner metadata in Redis. This happens when:

1. A worker acquires a slot (counter increments).
2. The worker dies or crashes before releasing the slot.
3. The owner metadata TTL expires (2 hours).
4. The counter remains at 1 — but no owner token can be found.

Zombies are detected by comparing active concurrency counters against known owner metadata keys.

### Recovery Mechanism

The system uses **explicit ownership tracking** (Redis hashes with `owner_token`), not TTL alone. Recovery runs on two paths:

1. **Active recovery**: When a slot is released normally (`release_key_with_owner`), the system automatically advances the next queued owner into the freed slot.
2. **Stale recovery**: The `recover_stale_owners()` method scans for stale entries by timestamp, releases their slots, and advances queued owners. It is idempotent and never drives a counter negative.
3. **Zombie cleanup**: The `cleanup_zombie_slots()` method detects orphaned counters with no owner metadata, resets them to 0, and rebuilds the queue without orphaned entries.

### TTL as a Safety Net

Owner metadata has a 2-hour TTL (`OWNER_METADATA_TTL = 7200`). This prevents unbounded Redis memory growth from abandoned metadata entries. It is a safety net, not the primary recovery path.

### When to Take Manual Action

**Inspect first** before intervening:
```bash
python debug_video_slot_queue.py stale
```

If stale entries exist:
- Check if the worker is still running. A healthy worker should be processing those tasks.
- Check if the external provider is down (e.g., Aliyun Wanxiang polling not returning).
- Check task logs for errors during `submitting` or `waiting_external`.

**Manual recovery** (rare, only if automatic recovery is not running or failed):

The `recover_stale_owners()` and `cleanup_zombie_slots()` methods are available on `AIKeyConcurrencyManager` in `app/ai_gateway/concurrency.py`. They can be called programmatically or added to an operator script.

Typical automatic triggers:
- `release_key_with_owner` triggers queue advancement when a slot frees up.
- The worker loop calls `recover_stale_owners` periodically (if configured).
- The external poller calls slot release on task completion, timeout, or failure.

### Recovery Priority Checklist for Operators

When capacity appears stuck:

1. Run `python debug_video_slot_queue.py health` — note which configs have `queue_depth > 0` and `available = 0`.
2. Run `python debug_video_slot_queue.py stale` — check for stale queue entries or stale active owners.
3. Run `python debug_video_slot_queue.py owners` — see which slots are currently held, their age, and associated task IDs.
4. Cross-reference stale/active entries with actual task IDs via the task API.
5. If workers are alive but slots are stuck: check worker logs for the relevant task IDs.
6. If workers died: restart the worker. On restart, stale owners from the dead worker will be reclaimed when the recovery path runs.
7. If zombies are suspected (counters show usage but no owners appear): run `cleanup_zombie_slots()` programmatically.

---

## Common Troubleshooting Scenarios

### Scenario: Queue depth is growing, no tasks advancing

Possible causes:
- All workers are busy or dead.
- External provider is returning errors silently.
- A zombie slot is holding capacity.

Diagnostic steps:
1. `debug_video_slot_queue.py owners` — are there active owners? If yes, check their age.
2. `debug_video_slot_queue.py stale` — any stale active owners older than 2 hours?
3. Check worker logs for the active task IDs.
4. Check if the external provider API is responding.

### Scenario: Slot utilization shows `available = 0` but queue is empty

Possible causes:
- Capacity is consumed by active tasks that are legitimately slow.
- Tasks are stuck in `submitting` or `waiting_external` without advancing.

Diagnostic steps:
1. `debug_video_slot_queue.py owners` — see active owners and their age.
2. Fetch task details for those owner task IDs to see their current status.
3. If all active owners are old but not stale yet, the provider may be slow. Wait.
4. If they exceed 2 hours, they will be marked stale and recovered.

### Scenario: `total = 0` for a config

Possible causes:
- No API keys configured for that model config.
- All keys are disabled.

Action: Add or enable API keys in the admin UI for that model config.

### Scenario: Task stuck in `queued_for_slot` indefinitely

Possible causes:
- No slots ever freed because active tasks never completed.
- Workers are not running.

Diagnostic steps:
1. Check worker is running.
2. `debug_video_slot_queue.py owners` — see active owners.
3. If workers are healthy, the queue should advance as slots free up.

---

## What NOT to Do

- **Do not manually reset Redis counters** without understanding the full picture. `cleanup_zombie_slots()` is safer because it checks owner metadata first.
- **Do not rely on TTL expiry alone** to recover stuck slots. TTL only cleans metadata; it does not reset concurrency counters.
- **Do not restart workers repeatedly** without checking stale entries first. Each restart loses in-progress state. If workers keep dying, investigate the root cause.
- **Do not disable keys** while tasks are actively using them. This reduces total capacity to zero, freezing all in-progress and queued tasks.

---

## File Reference

| File | Purpose |
|------|---------|
| `fastapi_backend/app/ai_gateway/concurrency.py` | Slot scheduler, queue management, recovery logic |
| `fastapi_backend/app/tasks/process_task.py` | Task state machine, slot acquire/release integration |
| `fastapi_backend/app/tasks/external_poller.py` | External completion polling and slot release |
| `fastapi_backend/debug_video_slot_queue.py` | Operator CLI diagnostics |
| `fastapi_backend/app/api/v1/internal_queue.py` | Internal API diagnostics endpoints |
| `fastapi_backend/app/schemas.py` | Task status enum and queue metadata schemas |
