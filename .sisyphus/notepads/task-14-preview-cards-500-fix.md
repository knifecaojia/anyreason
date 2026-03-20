# Task 14 Fix: /api/batch-video/jobs/{jobId}/preview-cards 500 Error

## Status: FIXED

## Root Cause

The production database was **missing 5 columns** from the `tasks` table that were added to the SQLAlchemy Task model in a previous task but never had an Alembic migration created for them:

- `queue_position` (Integer, nullable)
- `queued_at` (DateTime, nullable)
- `slot_owner_token` (String, nullable)
- `slot_config_id` (UUID, nullable)
- `slot_acquired_at` (DateTime, nullable)

When `get_preview_cards()` endpoint loaded a `BatchVideoHistory` record with a `task_id` and called `db.get(Task, history.task_id)`, SQLAlchemy emitted `SELECT ... FROM tasks` with ALL model columns including these missing ones → `asyncpg.exceptions.UndefinedColumnError: column tasks.queue_position does not exist` → **FastAPI 500**.

Additionally, `ck_tasks_status` constraint was still at the old set (missing `queued_for_slot` and `submitting`).

## Verification Evidence

```python
# Live DB query that triggered the 500:
asyncpg.exceptions.UndefinedColumnError: column tasks.queue_position does not exist

# After migration applied:
# get_preview_cards() for job 4ef782cc-bd07-4b50-8b78-dc3b8452639c
# SUCCESS! code=200, msg=OK, Cards: 9
```

## Files Changed

### 1. `fastapi_backend/alembic_migrations/versions/add7f8b9c0e1_task_queue_slot_metadata.py` (NEW)
- Adds `queue_position`, `queued_at` columns to `tasks` table
- Adds `slot_owner_token`, `slot_config_id`, `slot_acquired_at` columns to `tasks` table
- Updates `ck_tasks_status` constraint to include `queued_for_slot` and `submitting`
- Creates `idx_tasks_queued_for_slot` partial index
- Migration already applied to production DB

### 2. `fastapi_backend/app/schemas_batch_video.py`
- Added `queue_position: Optional[int] = None` to `BatchVideoPreviewTaskRead`
- Added `queued_at: Optional[datetime] = None` to `BatchVideoPreviewTaskRead`
  (Required so frontend receives queue metadata for `queued_for_slot` tasks)

### 3. `fastapi_backend/app/api/v1/batch_video.py`
- Updated `_build_preview_task()` to include `queue_position` and `queued_at` from Task model
- Comment: Chinese comment prefix fixed from `# From` to `# 从` (cosmetic, not a fix)

### 4. `fastapi_backend/tests/routes/test_batch_video_preview_cards.py`
- Added new test: `test_preview_cards_with_queued_for_slot_status`
  - Creates task with `status="queued_for_slot"` and `queue_position=3`
  - Verifies 200 response
  - Verifies `queue_position=3` in response
  - Verifies `queued_at` is returned

### 5. `fastapi_backend/app/tasks/handlers/batch_video_asset_generate.py`
- Fixed pre-existing bug: Removed local `from uuid import UUID` inside `submit()` method
  - Local import shadowed module-level `UUID` → `UnboundLocalError` at type annotation
  - Fix: Use module-level `UUID` directly

### 6. `fastapi_backend/tests/tasks/test_batch_video_asset_generate.py`
- Added `external_meta={}` to test's `SimpleNamespace` mock task
- Added `acquired_api_key=None, acquired_config_id=None` to mock function signature
  (test was broken by pre-existing changes to handler adding these fields)

## Test Results

```bash
$ uv run pytest tests/routes/test_batch_video_preview_cards.py -v
tests/routes/test_batch_video_preview_cards.py::test_preview_cards_returns_asset_ordered_cards_with_latest_and_history PASSED
tests/routes/test_batch_video_preview_cards.py::test_retry_batch_video_task_creates_new_task_and_history PASSED
tests/routes/test_batch_video_preview_cards.py::test_preview_cards_with_queued_for_slot_status PASSED
tests/routes/test_batch_video_preview_cards.py::test_stop_batch_video_task_cancels_internal_and_reports_external_cancel_attempt PASSED
======================== 4 passed, 4 warnings

$ pnpm test -- batchVideoPreviewCards
PASS __tests__/batchVideoPreviewCards.test.tsx
  BatchVideoPage video preview cards
    √ renders preview cards, expandable history, and task actions
    √ falls back to source image when preview thumbnail fails to load
    √ auto-refreshes preview cards while there are cloud-running tasks and stops after success
    √ displays queue position for queued_for_slot status
    √ shows submitting status with appropriate messaging
    √ can cancel queued_for_slot tasks
Tests: 6 passed, 6 total
```

## Key Insight

**Migration blindness**: The Task model was updated with new columns, but no Alembic migration was created. SQLAlchemy ORM code works fine with new columns in test DBs (which are created fresh), but fails against production DB that hasn't been migrated. The fix is the migration + updating the response schema + updating `_build_preview_task`.
