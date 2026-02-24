# Fix Verification Plan: asset_image_generate Handler

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Verify the fix for `parent_node_id is required` error is properly deployed and working.

**Context:** The handler code has been updated to remove the mandatory `parent_node_id` check, but the worker may still be running old code or Redis may have old tasks.

---

## Task 1: Verify Code Change is Saved

**Files:**
- Check: `app/tasks/handlers/asset_image_generate.py`

**Step 1: Confirm no "parent_node_id is required" check**

Run command:
```bash
cd fastapi_backend
grep -n "parent_node_id is required" app/tasks/handlers/asset_image_generate.py
```

**Expected:** No output (check removed)

**Step 2: Verify the new logic exists**

Run command:
```bash
grep -n "get_or_create_user_ai_folder\|get_or_create_project_ai_folder" app/tasks/handlers/asset_image_generate.py
```

**Expected:** Should show imports and usage at lines ~111-113

**Step 3: Commit** (if all checks pass)
```bash
git add app/tasks/handlers/asset_image_generate.py app/services/storage/vfs_service.py
git commit -m "fix: allow asset_image_generate without parent_node_id"
```

---

## Task 2: Clear Redis Task Queue

**Why:** Old tasks in Redis were created with old code logic and may still fail.

**Step 1: Flush Redis task queue**

Options (choose one):

**Option A - Flush all Redis data (nuclear option):**
```bash
cd fastapi_backend
uv run python -c "import asyncio; from app.tasks.queue import redis_client; asyncio.run(redis_client.flushall()); print('Redis flushed')"
```

**Option B - Only delete the task queue:**
```bash
cd fastapi_backend
uv run python -c "import asyncio; from app.tasks.queue import redis_client; asyncio.run(redis_client.delete('tasks:queue')); print('Task queue cleared')"
```

**Step 2: Verify queue is empty**
```bash
uv run python -c "import asyncio; from app.tasks.queue import redis_client; print(asyncio.run(redis_client.llen('tasks:queue')))"
```

**Expected:** Output should be `0`

---

## Task 3: Restart Worker with Fresh Code

**Why:** Ensure worker loads the updated code, not cached bytecode.

**Step 1: Kill any existing workers**
```bash
taskkill /F /IM python.exe 2>nul || true
```

**Step 2: Clear Python cache (optional but recommended)**
```bash
cd fastapi_backend
find . -type d -name __pycache__ -exec rm -rf {} + 2>nul || true
find . -name "*.pyc" -delete 2>nul || true
```

**Step 3: Start fresh worker**
```bash
cd fastapi_backend
uv run python -m app.tasks.worker --reload
```

**Step 4: Verify worker started successfully**

Check logs for:
- `[task-worker] registered handlers: ... asset_image_generate ...`
- `[task-worker] reload: enabled`
- `[task-worker] connected to redis.`

---

## Task 4: End-to-End Test

**Step 1: Create a test task via API or UI**

Using curl:
```bash
curl -X POST http://localhost:8000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "type": "asset_image_generate",
    "entity_type": "asset",
    "entity_id": null,
    "input_json": {
      "prompt": "A cute cat in space suit",
      "resolution": "1024x1024",
      "model_config_id": "YOUR_MODEL_CONFIG_ID"
    }
  }'
```

**Note:** The request should NOT include `parent_node_id` or `project_id` to test the fix.

**Step 2: Monitor task execution**

Watch worker logs for:
- Task picked up: `got item: ('tasks:queue', 'TASK_ID')`
- Handler execution (no "parent_node_id is required" error)
- Progress updates: `progress: 5`, `progress: 70`, etc.
- Success: Task completes without error

**Step 3: Verify result**

Check that:
- Task status is `completed` (not `failed`)
- A new file was created in the user's `AI_Generated` folder
- The file is accessible via VFS API

---

## Success Criteria

✅ **All tasks completed successfully:**
1. Code change verified (no "parent_node_id is required" check)
2. Redis queue cleared
3. Worker restarted with fresh code
4. End-to-end test passed (task created without parent_node_id completes successfully)

---

## Rollback Plan (if needed)

If the fix causes issues:

```bash
# Revert code changes
git checkout -- app/tasks/handlers/asset_image_generate.py
git checkout -- app/services/storage/vfs_service.py

# Restart worker
taskkill /F /IM python.exe
uv run python -m app.tasks.worker --reload
```
