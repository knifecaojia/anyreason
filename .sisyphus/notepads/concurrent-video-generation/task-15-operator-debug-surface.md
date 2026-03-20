# Task 15: Operator/Debug Queue-Health Inspection Surface

## Status: COMPLETED

## Summary

Task 15 adds an operator/debug inspection surface for video slot queue health diagnostics.

## What Was Done

### 1. Existing Implementation (Tasks 9 & 5)
The internal queue API endpoints were already implemented in Task 9:
- `GET /api/v1/internal/queue/depth` - Queue depth per model config
- `GET /api/v1/internal/queue/utilization` - Slot utilization (active/total/available)
- `GET /api/v1/internal/queue/stale` - Stale slot candidates
- `GET /api/v1/internal/queue/health` - Combined health summary

Schemas were already defined in `app/schemas.py`:
- `QueueDepthInfo`
- `SlotUtilizationInfo`
- `StaleOwnerInfo`
- `QueueHealthConfigSummary`
- `QueueHealthResponse`

All 14 observability tests from Task 5 pass.

### 2. New Implementation: Debug Script

Created `debug_video_slot_queue.py` - a CLI-based operator inspection tool that provides:
- **Commands**: `health`, `depth`, `utilization`, `stale`, `owners`
- **JSON output**: Optional `--json` flag for scripting
- **Full redaction**: No plaintext API keys exposed

### 3. New Tests

Created `tests/scripts/test_debug_video_slot_queue.py` with 24 tests:
- Redaction helper tests
- Inspector redaction tests
- Print function tests
- Secret pattern tests
- JSON output tests

All tests verify that only safe identifiers (key IDs/hashes, counts, timestamps) are exposed.

## Files Changed

### Created
1. `fastapi_backend/debug_video_slot_queue.py` - CLI operator inspection script
2. `fastapi_backend/tests/scripts/test_debug_video_slot_queue.py` - Test suite (24 tests)

### Existing (Verified Working)
1. `fastapi_backend/app/api/v1/internal_queue.py` - Internal queue endpoints
2. `fastapi_backend/app/schemas.py` - Queue observability schemas
3. `fastapi_backend/tests/api/test_video_queue_observability.py` - Observability tests (14 tests)

## Verification

```
cd fastapi_backend
uv run pytest tests/api/test_video_queue_observability.py tests/scripts/test_debug_video_slot_queue.py -v
```

Result: **38 passed** (14 observability + 24 debug script tests)

## Security Guarantees

The operator surface NEVER exposes:
- Plaintext API keys (sk-*, sk1-*, etc.)
- `api_key` field values
- `Bearer` tokens
- Passwords or secrets

The surface ALWAYS exposes:
- Key IDs/hashes (safe identifiers)
- Counts and timestamps
- Task IDs
- Owner tokens (safe - not secrets)

## Usage

```bash
# Health summary (default)
python debug_video_slot_queue.py health

# Queue depth per config
python debug_video_slot_queue.py depth

# Slot utilization
python debug_video_slot_queue.py utilization

# Stale slot candidates
python debug_video_slot_queue.py stale

# Active slot owners
python debug_video_slot_queue.py owners

# JSON output for scripting
python debug_video_slot_queue.py health --json
```

## Task Dependencies

- Blocks: Task 19 (Runbook/docs)
- Blocks: Task F1 (Plan compliance audit)
- Depends on: Task 5 (Observability contract tests)
- Depends on: Task 9 (Internal queue API)
