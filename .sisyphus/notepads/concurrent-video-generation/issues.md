## Issues

### Task 4: Production Worker Startup --reload Issue (2026-03-18)

**Issue:** Production worker was using `--reload` flag which:
- Creates file watcher noise that obscures actual queue/concurrency debugging
- Can cause unnecessary worker restarts in production
- Adds memory overhead from watchfiles

**Root Cause:** Default startup scripts were copied from development patterns without removing reload flags

**Status:** FIXED - Removed `--reload` from production worker startup scripts

### Task 9 (Concurrent Video Generation): Shared pytest database setup blocker (2026-03-18)

**Issue:** `pytest fastapi_backend/tests/api/test_video_queue_observability.py -k "stale or health" -x -vv` was failing during fixture setup with:
```
duplicate key value violates unique constraint "pg_type_typname_nsp_index"
DETAIL:  Key (typname, typnamespace)=(canvas_status_enum, ...) already exists.
```

**Root Cause:** The `engine` fixture in `tests/conftest.py` only created the test database if it didn't exist. If a previous test run failed mid-execution (before teardown completed), the database would persist with enums already created. On the next run, `IF NOT EXISTS` in the DDL prevented duplicate creation, but there was a potential race condition when:
1. Database already exists with enums
2. Another process/worker tries to create the same enum

**Fix:** Changed the `engine` fixture to:
1. **Always drop and recreate the database** at the start of setup (not just if it doesn't exist)
2. **Drop the database** at teardown (not just tables/enums)
3. This ensures a truly clean state for each test

**Files Changed:** `fastapi_backend/tests/conftest.py`

**Verification:** 
- `pytest fastapi_backend/tests/api/test_video_queue_observability.py -k "stale or health" -x -vv` → 3 passed
- `pytest tests/routes/test_items.py` → 7 passed  
- `pytest tests/ai_gateway/test_video_slot_scheduler.py` → 24 passed

**Status:** FIXED

### Task 9 (Concurrent Video Generation): Shared pytest database setup blocker - Round 2 (2026-03-18)

**Issue:** `pytest tests/api/test_video_queue_observability.py -k "stale or health" -x -vv` was failing with:
```
asyncpg.exceptions.DuplicateDatabaseError: database "anyreason_test" already exists
```

**Root Cause:** After the first fix (always drop/recreate DB), the issue was that PostgreSQL cannot drop a database that has active connections. The `engine` fixture connects to the test database (which prevents dropping it), and other connections from parallel tests or failed sessions could also block the drop.

**Fix:** Added `pg_terminate_backend()` calls before `DROP DATABASE`:
1. Before dropping: Terminate ALL connections to the target DB using `pg_stat_activity` + `pg_terminate_backend()`
2. Same pattern in teardown
3. Also added assertion for `TEST_DATABASE_URL` being non-None to fix LSP error
4. Fixed `_FakeMinio.get_object` None handling for LSP compliance

**Files Changed:** `fastapi_backend/tests/conftest.py`

**Verification:** 
- `pytest tests/api/test_video_queue_observability.py -k "stale or health" -x -vv` → 3 passed
- `lsp_diagnostics` on conftest.py → No diagnostics found

**Status:** FIXED

### Task 9 (Concurrent Video Generation): Shared pytest database setup blocker - Round 3 (2026-03-18)

**Issue:** `pytest tests/api/test_video_queue_observability.py -k "stale or health" -x -vv` was still failing with:
```
asyncpg.exceptions.DuplicateDatabaseError: database "anyreason_test" already exists
```

**Root Cause:** The prior approach still allowed race conditions. Even with `pg_terminate_backend()` and `DROP DATABASE IF EXISTS`:
1. Connection termination might not complete before DROP attempt
2. PostgreSQL's DROP DATABASE has timing semantics where the catalog entry might briefly persist
3. CREATE DATABASE could race with the actual DROP completion

**Fix:** Created `_reset_test_database()` helper with robust retry logic:
1. Loop until `pg_stat_activity` shows no connections to target DB
2. Try DROP DATABASE with exponential backoff retry (5 attempts)
3. Try CREATE DATABASE with exponential backoff retry (5 attempts)
4. If CREATE fails with DuplicateDatabaseError, terminate any new connections and retry
5. All operations connect to `postgres` database (not the test database)

**Files Changed:** `fastapi_backend/tests/conftest.py`

**Verification:** 
- `pytest tests/api/test_video_queue_observability.py -k "stale or health" -x -vv` → 3 passed
- `lsp_diagnostics` on conftest.py → No diagnostics found
- `pytest tests/routes/test_items.py tests/ai_gateway/test_video_slot_scheduler.py` → 31 passed

**Status:** FIXED

### Task 9 (Concurrent Video Generation): Shared pytest enum DDL blocker - Round 4 (2026-03-18)

**Issue:** `TEST_ENUM_DDL` was failing with:
```
sqlalchemy.exc.IntegrityError ... duplicate key value violates unique constraint "pg_type_typname_nsp_index"
```

**Root Cause:** Two issues:
1. `CREATE TYPE IF NOT EXISTS` syntax wasn't being handled correctly by SQLAlchemy's `exec_driver_sql()` - it threw a syntax error even though PostgreSQL 16 supports it
2. The DO block approach with `IF NOT EXISTS` could have race conditions when multiple tests or connections tried to create enums simultaneously

**Fix:** Changed enum DDL to use `EXCEPTION WHEN duplicate_object THEN NULL` pattern:
```sql
DO $$ BEGIN CREATE TYPE canvas_status_enum AS ENUM (...); EXCEPTION WHEN duplicate_object THEN NULL; END $$
```
This is atomic within PostgreSQL and handles concurrent creation attempts safely.
Also changed DDL execution from SQLAlchemy's `exec_driver_sql()` to direct asyncpg connection for more reliable DDL handling.

**Files Changed:** `fastapi_backend/tests/conftest.py`

**Verification:** 
- `pytest tests/api/test_video_queue_observability.py -k "SlotUtilizationReporting or StaleSlotInspection or QueueHealthSummary" -x -vv` → 5 passed
- `lsp_diagnostics` on conftest.py → No diagnostics found
- `pytest tests/routes/test_items.py tests/ai_gateway/test_video_slot_scheduler.py tests/api/test_video_queue_observability.py` → 45 passed

**Status:** FIXED

### Task 9 (Concurrent Video Generation): Per-test unique database isolation (2026-03-18)

**Issue:** Despite retry logic, tests still occasionally failed with duplicate enum/type errors from shared database state.

**Root Cause:** Fixed-name database approach was fundamentally flawed - even with retries, shared state across tests (especially with `asset_type_enum` from `Base.metadata.create_all()`) could cause collisions.

**Fix:** Refactored to use unique per-test database names:
1. Generate unique database name: `{base_db_name}_{uuid[:12]}`
2. Create fresh database for each test
3. Drop database after test completes
4. Each test gets complete isolation - no shared state possible

Key changes:
- `_create_test_database()`: Creates database with retry logic
- `_drop_test_database()`: Terminates connections and drops with retry
- `engine` fixture: Generates unique name, creates/uses/drops the database

**Files Changed:** `fastapi_backend/tests/conftest.py`

**Verification:** 
- `pytest tests/api/test_video_queue_observability.py -k "SlotUtilizationReporting or StaleSlotInspection or QueueHealthSummary" -x -vv` → 5 passed
- `lsp_diagnostics` on conftest.py → No diagnostics found
- `pytest tests/api/test_video_queue_observability.py tests/routes/test_items.py tests/ai_gateway/test_video_slot_scheduler.py` → 45 passed

**Status:** FIXED
