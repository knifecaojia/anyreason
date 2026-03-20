# Fix: GET /api/tasks?status=queued,running 500

## Root Cause

**Missing Alembic migration** — the `tasks` table in the production database was
missing 5 columns that the SQLAlchemy `Task` model requires:

- `queue_position`    (Integer, nullable)
- `queued_at`         (DateTimeTZ, nullable)
- `slot_owner_token`  (String(64), nullable)
- `slot_config_id`    (UUID, nullable)
- `slot_acquired_at`  (DateTimeTZ, nullable)

When FastAPI/asyncpg tried to SELECT from the `tasks` table, PostgreSQL raised:

```
column tasks.queue_position does not exist
```

This caused an unhandled `ProgrammingError` → FastAPI 500.

The `nextjs-frontend/app/api/tasks/route.ts` proxy and
`fastapi_backend/app/api/v1/tasks.py` were correct. The bug was entirely a
schema-migration mismatch. The tests passed because the test database is built
fresh via `Base.metadata.create_all()` (which emits all model columns), while
production uses Alembic migrations (which had no migration for those columns).

## Fix Applied

The migration `add7f8b9c0e1_task_queue_slot_metadata.py` (already in the repo)
was applied to the production database:

```bash
cd fastapi_backend && uv run alembic upgrade head
```

It also updates the `ck_tasks_status` check constraint to include the new
statuses `queued_for_slot` and `submitting`, and adds the partial index
`idx_tasks_queued_for_slot`.

## Files Changed

- `fastapi_backend/alembic_migrations/versions/add7f8b9c0e1_task_queue_slot_metadata.py`
  — **already existed** in the repo; just needed to be applied to prod DB
- `fastapi_backend/tests/routes/test_tasks.py`
  — added `test_list_tasks_multi_status_filter` regression test

## Verification

- Direct DB check: `queue_position` column now exists ✓
- Live HTTP: `GET /api/v1/tasks/?page=1&size=50&status=queued,running` → 200 ✓
- All 4 task route tests pass (including the new regression test) ✓

## Command to Verify

```bash
cd fastapi_backend
uv run pytest tests/routes/test_tasks.py -v
```
