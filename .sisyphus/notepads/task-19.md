# Task 19: Document Queue Operations and Recovery Runbook

## What was done

Created two documentation files:

1. **`docs/video-queue-runbook.md`** — Operator-facing recovery guide covering:
   - Queue states and key distinctions (`queued_for_slot` vs `submitting` vs `waiting_external`)
   - Cancel behavior at each phase
   - Total capacity formula: sum of enabled key limits
   - `debug_video_slot_queue.py` CLI commands (health, depth, utilization, stale, owners)
   - Internal API endpoints (`/api/v1/internal/queue/*`) and their redaction guarantees
   - Stale vs zombie slot definitions and the explicit ownership-based recovery model
   - Recovery priority checklist for operators
   - Common troubleshooting scenarios
   - What NOT to do (manual counter resets, TTL-only reliance, repeated worker restarts)
   - File reference table

2. **`docs/video-queue-semantics.md`** — Developer reference covering:
   - Scope (two-phase media tasks only; text/chat unchanged)
   - Multi-key capacity aggregation model
   - Complete state machine diagram
   - Redis key layout (`ai_queue`, `ai_owner`, `ai_concurrency`)
   - Queue operation semantics (enqueue, dequeue, cancel)
   - Recovery methods (`recover_stale_owners`, `cleanup_zombie_slots`) with idempotency guarantees
   - Owner token lifecycle and why it matters
   - Integration points in `process_task.py` and `external_poller.py`
   - Test file reference

## Verification against plan requirements

| Requirement | Status |
|-------------|--------|
| Queue states explained | `queued_for_slot`, `submitting`, `waiting_external`, `canceled`, transitions |
| Total capacity = sum enabled limits | Explicit formula documented |
| `queued_for_slot` vs `submitting` vs `waiting_external` | Distinctions in both docs |
| Queued cancel behavior | Cancel while queued removes from Redis queue, no slot release |
| Stale/zombie recovery explained | Both defined; explicit ownership tracking over TTL-only |
| Actual debug CLI referenced | `debug_video_slot_queue.py` commands documented with examples |
| Internal API referenced | `/api/v1/internal/queue/{health,depth,utilization,stale}` documented |
| No TTL-only cleanup as primary path | Explicitly noted: TTL is safety net, explicit ownership is primary |
| No invented commands | All commands verified against actual implementation |
| Accurate to current implementation | Verified against `concurrency.py`, `schemas.py`, `process_task.py`, `external_poller.py`, `internal_queue.py`, `debug_video_slot_queue.py` |

## Files changed

- `docs/video-queue-runbook.md` (new)
- `docs/video-queue-semantics.md` (new)

## Alignment notes

- Task states match `app/schemas.py` `TaskStatus` literal exactly.
- Capacity formula matches `AIKeyConcurrencyManager._get_total_capacity()`.
- Recovery methods match `concurrency.py` methods: `recover_stale_owners`, `cleanup_zombie_slots`.
- Stale thresholds match `internal_queue.py`: queue > 1h, active > 2h.
- CLI commands match `debug_video_slot_queue.py` exactly (health, depth, utilization, stale, owners).
- Internal API endpoints match `app/api/v1/internal_queue.py` exactly.
- Slot release behavior matches `external_poller._release_task_slot()` comments.
- `canceled` while queued does not call slot release (verified in `process_task.py` cancellation branch and `concurrency.remove_from_queue`).
