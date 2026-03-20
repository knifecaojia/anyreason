# LOGGING MEMO: Backend Diagnostic Logging Configuration

## Executive Summary

This memo identifies existing logging sinks, recommended hook points for persistent diagnostic logs to diagnose batch_video task creation and two-phase slot acquisition issues.

---

## 1. Current Log Sinks & Persistence

### Log Sinks (From `app/log/log.py`)

| Sink | Level | Path | Retention | Notes |
|-----|-------|------|-----------|-------|
| **stdout** | INFO/DEBUG | `sys.stdout` | N/A | Console output (non-persistent) |
| **backend_{date}.log** | DEBUG | `{log_dir}/backend_{YYYY-MM-DD}.log` | 30 days | **Persists to disk** ✓ |
| **backend_error_{date}.log** | ERROR | `{log_dir}/backend_error_{YYYY-MM-DD}.log` | 90 days | **Persists to disk** ✓ |
| **backend_critical_{date}.log** | CRITICAL | `{log_dir}/backend_critical_{YYYY-MM-DD}.log` | 180 days | **Persists to disk** ✓ |

**Log Directory:** `LOGS_ROOT` from settings (defaults to `logs/` relative to app root)

**Format:** JSON-lines with structured fields:
- `timestamp`, `level`, `message`, `logger`, `module`, `function`, `line`, `process`, `thread`, `service`, `environment`
- `context` dict merged into top-level
- `exception` object for errors (with traceback)

---

## 2. Logger Initialization

### Main Application (`app/core/init_app.py`)
- Calls `setup_logging()` at app startup (line 157)
- Imports `loguru` logger from `app.log`
- **Intercepts standard `logging`** via `InterceptHandler`

### Worker Process (`app/tasks/worker.py`)
- Calls `setup_logging()` at startup (line 167, 181)
- Uses custom `_log()` helper for worker-prefixed stdout output (lines 19-22)
- **Note:** Worker uses `print()` directly, not loguru for most messages

---

## 3. Current Logging in Key Files

### `process_task.py` (Two-Phase Task Processing)
- Uses `logging.getLogger(__name__)` (standard logger, intercepted by loguru)
- **Existing diagnostic logs:**
  - Line 79-92: `acquire_slot_with_queue` logs task queued/acquired
  - Line 126: Task start info
  - Line 211-216: `queued_for_slot` transition
  - Line 233-238: Slot acquired transition
  - Line 292-295: Submit success
  - Line 321: `waiting_external` transition
  - Line 355-356: Submit failed

### `batch_video_asset_generate.py` (Handler)
- Uses `logging.getLogger(__name__)`
- **Minimal logging** - mostly error handling in `on_fail`
- **Missing:** No diagnostic logs in `submit()` or `get_slot_config_id()` resolution

### `concurrency.py` (Slot Manager)
- Uses `logging.getLogger(__name__)`
- **Existing diagnostic logs:**
  - Line 529: Slot acquired
  - Line 567: Queued (no slots available)
  - Line 706: Slot released
  - Line 785: Owner not found warning
  - Line 804: Slot released with owner

### `reporter.py` (TaskReporter)
- **No file logging** - only publishes events to DB/Redis

### `batch_video.py` (API Route)
- **No logging** - task creation is silent

### `task_service.py` (Task Creation)
- **No logging** - task creation is silent

---

## 4. Recommended Hook Points for Persistent Diagnostic Logs

### CRITICAL: Batch Video Task Creation (`app/api/v1/batch_video.py`)

**Location:** `generate_videos()` endpoint (line 527-572)

**What to log:**
```python
logger.info(
    "[batch-video] task created task_id=%s type=batch_video_asset_generate asset_id=%s job_id=%s model_config_id=%s",
    task_id, asset_id, job_id, input_json.get("config", {}).get("model_config_id"),
)
```

**Why:** This is where `job.config` is first read. The `model_config_id` value determines which slot configuration will be used. Currently this is completely opaque.

---

### CRITICAL: Slot Configuration Resolution (`app/tasks/handlers/base.py`)

**Location:** `get_slot_config_id()` method (line 23-44)

**What to log:**
```python
logger.debug(
    "[slot-config] task=%s resolved config_id=%s from input_json=%s",
    task.id, model_config_id, input_json,
)
```

**Why:** Currently no logging exists. When debugging "old slot-config logic" issues, we need to trace exactly what `model_config_id` was resolved and whether it came from `input_json` directly or from `input_json.config`.

---

### CRITICAL: Two-Phase Slot Acquisition (`app/tasks/process_task.py`)

**Location:** `process_two_phase_task()` function, lines 153-375

**What to log:**
```python
# Before slot acquisition (line 192-200)
logger.debug(
    "[two-phase] task=%s attempting slot acquisition config_id=%s handler=%s",
    task_id, config_id, handler.__class__.__name__,
)

# After acquire_slot_with_queue result (line 201-247)
logger.info(
    "[two-phase] task=%s slot_result queued=%s position=%s api_key=%s owner_token=%s",
    task_id, slot_result.get("queued"), slot_result.get("queue_position"), slot_result.get("api_key"), slot_result.get("owner_token"),
)

# In handler.submit() before API call (line 281-291)
logger.info(
    "[two-phase] task=%s calling handler.submit() with config_id=%s slot_api_key=%s",
    task_id, config_id, slot_result.get("api_key"),
)
```

**Why:** These are the critical gaps where "old slot-config logic" could manifest. Currently:
 1. No logging when `model_config_id` is resolved
 2. No logging of slot acquisition result (was it queued vs acquired?)
 3. No logging before `handler.submit()` to show what api_key/config is being used

---

### HIGH: Handler Submit Phase (`app/tasks/handlers/batch_video_asset_generate.py`)

**Location:** `submit()` method (lines 186-254)

**What to log:**
```python
logger.info(
    "[batch-video-handler] task=%s submit starting model_config_id=%s input_config=%s",
    task.id, model_config_id, config,
)

# After extracting pre-acquired key (line 226-232)
logger.debug(
    "[batch-video-handler] task=%s extracted slot info api_key=%s acquired_config_id=%s",
    task.id, acquired_api_key, acquired_config_id,
)

# Before ai_gateway_service call (line 234-244)
logger.info(
    "[batch-video-handler] task=%s calling ai_gateway with model_config_id=%s acquired=%s",
    task.id, model_config_id, acquired,
)
```

**Why:** This is where the handler decides whether to use pre-acquired slot or acquire a new one. The "old slot-config logic" issue could occur if `model_config_id` passed to `submit()` differs from `config_id` resolved earlier.

---

### MEDIUM: Task Service Create (`app/services/task_service.py`)

**Location:** `create_task()` method (lines 18-52)

**What to log:**
```python
logger.info(
    "[task-service] task created task_id=%s type=%s entity_type=%s entity_id=%s input_json=%s",
    task_id, payload.type, payload.entity_type, payload.entity_id, payload.input_json,
)
```

**Why:** Provides visibility into what `input_json` contains when task is created. This is especially important for batch_video tasks to verify `config.model_config_id` was set correctly in job.config.

---

### MEDIUM: External Poller Slot Release (`app/tasks/external_poller.py`)

**Location:** `_release_task_slot()` function (lines 46-93)

**What to log:**
```python
logger.debug(
    "[ext-poller] task=%s slot release check: api_key=%s config_id=%s owner_token=%s",
    task.id, api_key, config_id_str, owner_token,
)
```

**Why:** Helps trace slot lifecycle and understand if slots are being released correctly.

---

## 5. Existing Log Gaps Analysis

### Gap 1: No logging in `batch_video.py` API route
- Task creation is completely silent
- Cannot trace what `input_json` was passed to task creation
- Cannot verify if `model_config_id` was correctly set in job.config

### Gap 2: No logging in `BaseTaskHandler.get_slot_config_id()`
- Resolution logic is completely opaque
- Cannot diagnose if nested `config.model_config_id` vs flat `model_config_id` is being used
- Cannot trace which resolution path is taken

### Gap 3: Missing submit phase logging in handler
- No logging before `ai_gateway_service.submit_media_async()` call
- No logging of slot info extraction from `external_meta`
- Cannot trace if pre-acquired slot is being used

### Gap 4: Task service lacks creation logging
- No logging when task is enqueued to Redis
- Cannot correlate task creation with downstream processing

---

## 6. Implementation Notes

### Logger Usage Pattern
- Main app uses `loguru` via `InterceptHandler` (intercepts standard `logging`)
- Worker uses `loguru` + custom `print()` for worker messages
- All logs use JSON format with structured fields

### Persistence Guarantees
- All three file sinks (backend, error, critical) persist to disk
- Rotation: 100MB (backend), 50MB (error), 10MB (critical)
- Compression: zip
- Encoding: UTF-8

### No Additional Log Files
- No separate task-specific log files
- No worker-specific log files
- No slot-acquisition log files

---

## 7. Recommended Log File Additions

For stronger tracing of batch video tasks, consider creating a dedicated log file:

```python
# In LoggingConfig.setup() (app/log/log.py), after line 213
logger.add(
    sink=f"{self.log_dir}/batch_video_{time:YYYY-MM-DD}.log",
    level="DEBUG",
    format="{extra[serialized]}",
    rotation="50 MB",
    retention="30 days",
    compression="zip",
    encoding="utf-8",
    backtrace=True,
    diagnose=self.debug,
    enqueue=self.enqueue,
)
```

This would capture all batch_video task lifecycle events without mixing with general application logs.

