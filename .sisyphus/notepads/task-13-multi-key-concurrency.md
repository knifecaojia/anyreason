# Task 13: Enforce multi-key aggregated concurrency semantics per config

## Summary

Implemented exact key assignment semantics for the multi-key video slot scheduler.

## Files Modified

### `fastapi_backend/app/ai_gateway/concurrency.py`
- **Added**: `get_assigned_key_for_owner(config_id, owner_token)` method
  - Retrieves the assigned API key info for a queued/acquired owner token
  - Returns dict with `api_key` and `key_id` if found
  - Returns `None` if owner not found or slot not yet acquired
  - Enables exact key tracking for diagnostics and cleanup

### `fastapi_backend/tests/ai_gateway/test_video_slot_scheduler.py`
- **Added**: `test_get_assigned_key_method_exists` - Verifies method exists
- **Added**: `test_get_assigned_key_returns_correct_key` - Verifies correct key returned
- **Added**: `test_get_assigned_key_returns_none_for_nonexistent_owner` - Edge case
- **Added**: `test_queued_owner_key_retrieved_after_acquisition` - Queue advancement with key
- **Added**: `test_multi_key_each_owner_gets_correct_key` - Multi-key correctness
- **Added**: `test_disabled_key_not_assigned` - Disabled keys excluded
- **Added**: `test_sum_of_limits_capacity_with_three_keys` - QA Scenario 1
- **Added**: `test_assigned_key_traceable_in_owner_metadata` - QA Scenario 2

### FakeRedis Test Helper Fixes
- Fixed `delete()` to also clean `_owner_metadata`
- Fixed `lpop()` / `rpop()` return type annotations

## Verification

### Pre-commit Command
```bash
pytest fastapi_backend/tests/ai_gateway/test_video_slot_scheduler.py -k "multi_key" -q
```

### Test Results
- **32/32 tests pass** in `test_video_slot_scheduler.py`
- **42/42 tests pass** in combined scheduler + queue integration tests
- All Task 13-specific tests pass:
  - `test_get_assigned_key_method_exists`
  - `test_get_assigned_key_returns_correct_key`
  - `test_get_assigned_key_returns_none_for_nonexistent_owner`
  - `test_queued_owner_key_retrieved_after_acquisition`
  - `test_multi_key_each_owner_gets_correct_key`
  - `test_disabled_key_not_assigned`
  - `test_sum_of_limits_capacity_with_three_keys`
  - `test_assigned_key_traceable_in_owner_metadata`

## Key Implementation Details

### Multi-Key Aggregate Capacity
- Already implemented in Tasks 6/11/12
- `_get_total_capacity()` sums enabled key limits correctly
- Disabled keys contribute zero capacity
- Default limit of 5 when unspecified preserved

### Exact Key Assignment
- `acquire_key()` returns `api_key` and `key_id` when slot acquired
- `try_acquire_for_queued_owner()` records key in owner metadata
- `get_assigned_key_for_owner()` allows retrieval for diagnostics/cleanup
- Two-phase flow correctly stores `_slot_api_key` in `task.external_meta`

### Note on `release_key` parameter
- Tests revealed that `release_key` needs `keys_info` parameter for queue advancement
- Production code uses `release_key_with_owner` from two-phase flow which has same requirement
- This is a known design consideration for production integration

## QA Scenarios Covered

### Scenario 1: Three-key config admits sum-of-limits concurrent submissions
- ✅ `test_sum_of_limits_capacity_with_three_keys` - 7 slots from 1+2+4 limits

### Scenario 2: Assigned provider key is recorded per task
- ✅ `test_assigned_key_traceable_in_owner_metadata`
- ✅ `test_get_assigned_key_returns_correct_key`
- Key hash (16 chars) available for safe display without exposing secret

## Dependencies
- Tasks 6, 11, 12 complete and verified
- Task 13 blocks Tasks 16, 18

## Status
- [x] Implementation complete
- [x] Tests added
- [x] All tests pass
- [x] Committed: `2e497b5`
