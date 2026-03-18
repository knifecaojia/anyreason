## Decisions

### Task 3: Task State/Schema Model Decisions (2026-03-18)

**Decision: Add explicit `queued_for_slot` and `submitting` states**
- Rationale: Users must distinguish slot waiting from external processing in API/UI
- NOT overloading `running` to mean both "waiting for slot" and "actively submitting"
- Retry semantics differ between pre-slot and post-submit failures

**Decision: Queue metadata fields (DB-persisted)**
- `queue_position: int | None` - 1-based FIFO position
- `queued_at: datetime | None` - When task entered the queue
- Rationale: Queue position visible to users; survives worker restart

**Decision: Slot owner metadata fields (DB-persisted)**
- `slot_owner_token: str | None` - Unique token proving slot ownership
- `slot_config_id: UUID | None` - The model config this slot belongs to  
- `slot_acquired_at: datetime | None` - When slot was acquired
- Rationale: Enables crash-safe recovery, prevents duplicate slot grants

**Decision: All new fields are nullable/optional**
- Backward compatibility: Existing task rows without new fields parse correctly
- New fields default to None in TaskRead schema
- Non-media tasks unaffected (no queue fields required)

**Decision: DB constraint includes new states**
- `ck_tasks_status` updated to include `queued_for_slot` and `submitting`
- Added composite index `idx_tasks_queued_for_slot` for efficient queue queries

**Decision: Separation of DB vs Redis state**
- DB persists: status, queue metadata, slot owner metadata
- Redis (transient): current queue depth, active slot owners, per-config capacity
- Rationale: DB for durability and API visibility; Redis for high-frequency operations

### Task 2: Slot Scheduler Test Design Decisions (2026-03-18)

**Decision: Use FakeRedis instead of mocking Redis methods**
- Rationale: Enables deterministic testing without relying on actual Redis
- Trade-off: Tests define interface, not exact Redis command sequences

**Decision: Test both queue and non-queue outcomes**
- Tests check for `queue_position` field when queued
- Tests check for direct `api_key` when slot acquired
- Rationale: Scheduler must distinguish queue placement from slot acquisition

**Decision: Include stale-owner recovery tests**
- `recover_stale_owners(config_id, max_age_seconds)` method expected
- Rationale: Production evidence showed stale Redis keys can persist
- Tests verify: recovery advances queue, healthy owners protected

**Decision: Test methods that don't exist yet**
- `get_queue_depth(config_id)` - operator visibility
- `get_slot_utilization(config_id)` - active/total/available
- `recover_stale_owners(config_id, max_age_seconds)` - cleanup
- Rationale: TDD - tests define the contract before implementation

**Decision: Default limit of 5 is preserved**
- Keys without `concurrency_limit` default to 5 (from concurrency.py line 38)
- Tests verify this behavior is maintained

---

### Task 5: Queue Observability Test Design Decisions (2026-03-18)

**Decision: Use existing API test patterns**
- Tests placed in `tests/api/` directory following existing route test patterns
- Uses `test_client`, `authenticated_user`, `authenticated_superuser` fixtures
- Tests verify both positive cases (field exists) and negative cases (field absent when not applicable)

**Decision: Define operator/debug surface via internal endpoints**
- Internal endpoints under `/api/v1/internal/queue/` namespace
- Only accessible to superusers (admin-only)
- Provides diagnostic info without exposing to regular users

**Decision: Explicitly test for secret redaction**
- Tests check for patterns like `sk-`, `Bearer `, `password`, `secret`
- Verifies that key IDs/hashes are safe but plaintext keys are forbidden
- Applies to all debug/operator surfaces

**Decision: Queue position is 1-based**
- First task in queue has position 1
- This matches typical queue semantics and is consistent with schemas.py

**Decision: Test both schema presence and runtime behavior**
- Some tests check that fields exist in schema (passes now)
- Other tests check that fields are populated at runtime (fails now - RED tests)

---

### Task 1: Queue-State Contracts Test Design Decisions - IMPROVED (2026-03-18)

**Decision: Use real schema contracts, not local hardcoded lists**
- OLD: `assert "queued_for_slot" in ["queued", "running", ...]`
- NEW: `assert "queued_for_slot" in get_args(TaskStatus)`
- Rationale: Tests actual schema definition, not a local variable that could be stale

**Decision: Test actual model columns via SQLAlchemy inspection**
- OLD: `hasattr(task, "queue_position")` 
- NEW: `assert "queue_position" in [c.key for c in inspect(Task).columns]`
- Rationale: Tests actual database schema, not Python attribute that might exist but not be mapped

**Decision: Test actual Pydantic schema fields**
- OLD: `assert hasattr(TaskRead, "model_fields")`
- NEW: `assert "queue_position" in TaskRead.model_fields`
- Rationale: Tests actual schema contract

**Decision: Test actual service methods**
- Import and call `TaskService.cancel_task()` directly
- Rationale: Tests real contract, not mocked behavior

**Decision: Keep failing tests that test runtime behavior**
- Schema presence tests pass (fields exist)
- Runtime behavior tests fail (not populated/used correctly)
- This is the correct RED state
- Tests document this scope guardrail explicitly

**Decision: Queue position is 1-based**
- First queued task = position 1
- This matches typical queue semantics
- Tests verify position shifts after dequeue/cancellation

**Decision: Define expected state transitions**
- `queued -> queued_for_slot` (when no slot available)
- `queued_for_slot -> submitting` (when slot acquired)
- `submitting -> waiting_external` (after successful submit)
- `waiting_external -> succeeded/failed` (completion)
- `queued_for_slot -> canceled` (cancel while queued)

**Decision: Cancellation while queued doesn't release slots**
- Only tasks that have acquired a slot should release it on cancel
- Tasks in `queued_for_slot` should simply be removed from queue
- This prevents accidentally freeing slots that were never owned

---

### Task 6: Redis FIFO Slot Scheduler Core Implementation Decisions (2026-03-18)

**Decision: Aggregate capacity across enabled keys**
- Total capacity = sum of all enabled key limits
- Disabled keys contribute 0 capacity
- Default limit of 5 when no explicit `concurrency_limit` specified
- Implementation: `_get_total_capacity()` calculates sum before attempting acquisition

**Decision: Queue is per-model-config, not global**
- Queue key pattern: `ai_queue:{config_id}`
- Owner metadata key pattern: `ai_owner:{config_id}:{owner_token}`
- Concurrency counter key: `ai_concurrency:{config_id}:{key_hash}`
- Rationale: Prevents cross-config interference

**Decision: FIFO queue using Redis LIST**
- `rpush` to add to queue (end of list = newest)
- `lpop` to remove from queue (front of list = oldest)
- `llen` for queue depth
- `lrange` for queue inspection
- Rationale: Standard Redis FIFO pattern

**Decision: Owner token for slot tracking**
- UUID-based owner token generated for each acquisition
- Stored in Redis hash with metadata: `acquired_at`, `api_key`, `key_id`, `task_id`
- Token used for: release verification, stale detection, queue position
- TTL of 2 hours on owner metadata (same as previous TTL safety net)

**Decision: acquire_key returns queue placement instead of None**
- OLD: Returns None when capacity exhausted (immediate fail)
- NEW: Returns dict with `queue_position` when exhausted
- Response shape: `{"queue_position": N, "owner_token": "...", "queued": True}`
- Backward compat: When slot available, returns `{"api_key": "...", "owner_token": "...", ...}`

**Decision: release_key advances queue when capacity available**
- After decrementing counter, check if capacity available
- If available, `dequeue_owner()` pops next FIFO owner
- `try_acquire_for_queued_owner()` assigns slot to dequeued owner
- If acquire fails, owner re-queued (edge case handling)

**Decision: Stale owner recovery handles both queue and active slots**
- Queue staleness: Remove owners in queue too long (based on `enqueued_at`)
- Active slot staleness: Release slots held by abandoned owners (based on `acquired_at`)
- Use Redis SCAN (not KEYS) for production safety
- Recovery advances queue after freeing stale slots
- Fallback for FakeRedis in tests (scan_iter helper)

**Decision: Methods added to AIKeyConcurrencyManager**
- `enqueue_owner()` - Add owner to FIFO queue
- `dequeue_owner()` - Pop next owner from queue
- `remove_from_queue()` - Remove specific owner (for cancellation)
- `get_queue_depth()` - Query queue size
- `get_slot_utilization()` - Query active/total/available
- `recover_stale_owners()` - Clean up stale entries
- `try_acquire_for_queued_owner()` - Assign slot to queued owner
- `acquire_key_with_queue()` - Explicit queue without acquire attempt

**Decision: Backward compatibility maintained**
- `acquire_key(config_id, keys_info, default_key)` still works (owner_token optional)
- `release_key(config_id, api_key)` still works (other params optional)
- Existing service.py calls continue to work
- Queue advancement works when keys_info/default_key passed

---

### Task 7: Stale-Owner Recovery and Zombie-Slot Cleanup Decisions (2026-03-18)

**Decision: Idempotent recovery prevents double-decrement**
- Before decrementing counter, check if current value > 0
- If already released, only clean metadata (no counter change)
- Rationale: Race conditions where owner releases normally while recovery runs

**Decision: Zombie-slot cleanup complements timestamp-based recovery**
- `recover_stale_owners()`: Uses timestamps (acquired_at, enqueued_at) to detect staleness
- `cleanup_zombie_slots()`: Uses structural detection (counter > 0 but no owner metadata)
- Rationale: Timestamps miss cases where owner metadata TTL expires but counter remains

**Decision: Zombie cleanup returns detailed result dict**
- `{zombies_found, zombies_cleaned, orphaned_queue}`
- Rationale: Provides observability for operators/debugging
- Enables monitoring/alerting on zombie detection

**Decision: Both methods advance queue after cleanup**
- After recovering stale/zombie slots, attempt to advance queued owners
- Rationale: Maximizes throughput after cleanup
- Prevents slots from staying empty after recovery

**Decision: Health check via max_age_seconds parameter**
- `recover_stale_owners(max_age_seconds=3600)` - default 1 hour
- `cleanup_zombie_slots()` - no timestamp needed, structural check only
- Rationale: Allows flexible staleness thresholds per deployment
