# Concurrent Video Generation Queue Plan

## TL;DR

> **Quick Summary**: Replace the current fail-fast media submission path with a true FIFO slot scheduler for video generation so tasks queue when API key capacity is exhausted instead of returning immediate 429 failures.
>
> **Deliverables**:
> - A per-model-config FIFO slot queue for async video/media generation tasks
> - Explicit slot lifecycle management that prevents leaked Redis concurrency counters
> - New task states and API/UI visibility for queued, slot-acquired, submitting, external-processing, and canceled phases
> - TDD coverage plus agent-executed QA scenarios for queueing, cancellation, crash recovery, and multi-key concurrency
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Schema/state model → slot scheduler core → media submit integration → queue visibility/cancel flow → verification

---

## Context

### Original Request
Design a production-usable concurrent video generation feature so tasks complete through a queue instead of immediate failure. Concurrency must be limited only by API key configuration. If multiple API keys exist, total concurrency must equal the sum of enabled key limits. When capacity is exceeded, tasks must enter a FIFO queue, wait indefinitely, and allow cancellation while queued.

### Interview Summary
**Key Discussions**:
- Queueing policy selected: FIFO.
- Queued tasks must be cancelable before slot acquisition.
- Queued tasks should wait indefinitely until a slot is available.
- Rollout may add or adjust backend task states and UI-visible states.
- Test strategy selected: TDD.

**Research Findings**:
- `fastapi_backend/app/ai_gateway/concurrency.py` currently uses Redis `incr/decr` counters with a 2-hour TTL safety net.
- `fastapi_backend/app/ai_gateway/service.py` raises `AppError(...429...)` immediately when `acquire_key()` returns no slot.
- `submit_media_async()` acquires a slot and relies on later terminal-state handling to release it, creating stale-slot/leak risk.
- Production Redis contains a live `ai_concurrency:*` key with value `5`, demonstrating that slot saturation persists independently of visible task state.
- Production worker is incorrectly started with `--reload`, which adds watchfiles instability and obscures operational debugging.

### Metis Review
**Identified Gaps** (addressed in this plan):
- Need explicit guardrails to keep scope limited to async media/video generation flows.
- Need explicit queue-depth and stale-recovery guardrails so “wait indefinitely” does not mean “orphan forever.”
- Need explicit acceptance criteria for FIFO ordering, queued-task cancellation, slot leak prevention, crash recovery, and backward compatibility for non-media endpoints.
- Need explicit state-machine changes so queue position and waiting status are observable in API/UI.

---

## Work Objectives

### Core Objective
Implement a true per-model-config FIFO slot scheduler for async video generation so media tasks wait for capacity rather than failing immediately, while ensuring total runnable concurrency equals the sum of enabled API key concurrency limits and leaked slot counters cannot accumulate.

### Concrete Deliverables
- A per-model-config FIFO slot queue for async media/video submission flows.
- Explicit slot reservation and release lifecycle with crash-safe recovery.
- New/updated task states to represent waiting for slot, submitting, external processing, and queued cancellation.
- API and UI visibility for queue position and queue state.
- Backward-compatible behavior for non-media/text/chat paths.
- Production-safe worker startup without `--reload`.

### Definition of Done
- [ ] Async media/video tasks never fail with immediate 429 solely because key capacity is temporarily full; they queue instead.
- [ ] Effective concurrent submissions for a model config equal the sum of enabled API key `concurrency_limit` values.
- [ ] Queued tasks run in FIFO order.
- [ ] Queued tasks can be canceled before slot acquisition.
- [ ] Slot counters are released or recovered correctly on success, failure, timeout, cancellation, and worker crash/restart.
- [ ] Queue state and queue position are visible through API/UI.
- [ ] Non-media endpoints retain existing behavior and are not silently converted to queued semantics.

### Must Have
- FIFO per-model-config queueing.
- Unlimited queue wait with explicit stale/orphan cleanup logic.
- TDD-first implementation for scheduler core and integration flows.
- Agent-executed verification only; no human-only acceptance criteria.

### Must NOT Have (Guardrails)
- No expansion into text/chat queueing.
- No global queue across unrelated model configs.
- No priority queueing or fairness schemes beyond FIFO.
- No reliance on Redis TTL alone as the primary slot cleanup mechanism.
- No production worker startup using `--reload`.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: TDD
- **Framework**: pytest
- **If TDD**: Each task follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Backend/API**: Use Bash (`pytest`, `python`, `curl`) and database/Redis inspection commands
- **Worker/Queue**: Use interactive_bash or Bash to run workers, inspect logs, and validate state transitions
- **UI/API surface**: Use Playwright for queue state and queue-position visibility if frontend changes are included
- **Crash Recovery**: Use controlled worker stop/restart plus Redis/database assertions

---

## Execution Strategy

### Parallel Execution Waves

> Maximize throughput by grouping independent tasks into parallel waves.
> Each wave completes before the next begins.

```
Wave 1 (Start Immediately — test scaffolding + state/schema foundations):
├── Task 1: Queue-state contract tests [quick]
├── Task 2: Slot scheduler unit tests [quick]
├── Task 3: Task state/schema migration design [unspecified-high]
├── Task 4: Production worker startup hardening [quick]
└── Task 5: Queue observability contract tests [quick]

Wave 2 (After Wave 1 — scheduler core + lifecycle correctness):
├── Task 6: Redis FIFO slot scheduler core [deep]
├── Task 7: Slot leak recovery and stale-owner cleanup [unspecified-high]
├── Task 8: Task state machine integration [deep]
├── Task 9: Queue position/query API backend [quick]
└── Task 10: Cancellation while queued backend [quick]

Wave 3 (After Wave 2 — media flow wiring + multi-key semantics):
├── Task 11: submit_media_async integration with scheduler [deep]
├── Task 12: external poller/release-path hardening [deep]
├── Task 13: Multi-key aggregation and config-bound queue semantics [unspecified-high]
├── Task 14: Frontend queue-state visibility [visual-engineering]
└── Task 15: Admin/debug inspection surface for queue health [quick]

Wave 4 (After Wave 3 — end-to-end behavior + regressions):
├── Task 16: End-to-end FIFO and cancellation tests [unspecified-high]
├── Task 17: Crash recovery and zombie-slot tests [unspecified-high]
├── Task 18: Non-media regression tests [quick]
└── Task 19: Runbook/docs for queue operations [writing]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real QA execution (unspecified-high)
└── Task F4: Scope fidelity check (deep)
```

### Dependency Matrix

- **1**: — → 6, 8, 16
- **2**: — → 6, 7, 11, 17
- **3**: — → 8, 9, 10, 14
- **4**: — → 17, F2
- **5**: — → 9, 14, 15
- **6**: 1, 2 → 11, 13, 16, 17
- **7**: 2 → 12, 17
- **8**: 1, 3 → 10, 11, 12, 14, 16
- **9**: 3, 5 → 14, 15, 16
- **10**: 3, 8 → 14, 16
- **11**: 2, 6, 8 → 12, 13, 16, 17, 18
- **12**: 7, 8, 11 → 16, 17, 18
- **13**: 6, 11 → 16, 18
- **14**: 3, 5, 8, 9, 10 → 16, F3
- **15**: 5, 9 → 19, F1
- **16**: 1, 6, 8, 9, 10, 11, 12, 13, 14 → F1, F2, F3, F4
- **17**: 2, 4, 6, 7, 11, 12 → F1, F2, F3, F4
- **18**: 11, 12, 13 → F1, F2, F4
- **19**: 15 → F1, F4

### Agent Dispatch Summary

- **Wave 1**: T1 `quick`, T2 `quick`, T3 `unspecified-high`, T4 `quick`, T5 `quick`
- **Wave 2**: T6 `deep`, T7 `unspecified-high`, T8 `deep`, T9 `quick`, T10 `quick`
- **Wave 3**: T11 `deep`, T12 `deep`, T13 `unspecified-high`, T14 `visual-engineering`, T15 `quick`
- **Wave 4**: T16 `unspecified-high`, T17 `unspecified-high`, T18 `quick`, T19 `writing`
- **FINAL**: F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Define queue-state contracts and TDD fixtures

  **What to do**:
  - Add failing tests that define the new task lifecycle for queued video generation: `queued_for_slot`, `submitting`, `waiting_external`, `canceled` while queued, and successful dequeue into submission.
  - Add fixtures/helpers for creating media tasks, model configs, and fake API-key capacity scenarios without using production Redis keys.
  - Define exact expectations for queue position, task state transitions, and API response semantics when capacity is full.

  **Must NOT do**:
  - Do not change runtime code yet.
  - Do not include text/chat task types in these tests.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: concentrated test scaffolding and state-contract definition.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `test-driven-development`: omitted from skill loading because TDD structure is already embedded in this plan.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: 6, 8, 16
  - **Blocked By**: None

  **References**:
  - `fastapi_backend/tests/tasks/test_batch_video_asset_generate.py` - Existing batch video task test style and fixture conventions.
  - `fastapi_backend/app/tasks/process_task.py` - Current state transitions for queued/running/waiting_external flows; use this to define the desired delta.
  - `fastapi_backend/app/tasks/handlers/batch_video_asset_generate.py` - Current two-phase media task behavior that new states must wrap.
  - `fastapi_backend/app/schemas.py` - Existing task status enumerations/contracts that will need expansion.

  **Acceptance Criteria**:
  - [ ] New failing tests exist for queue wait, FIFO advancement, queued cancellation, and queue position visibility.
  - [ ] `pytest fastapi_backend/tests/...` for the new queue-contract tests fails for the expected missing behavior only.

  **QA Scenarios**:
  ```
  Scenario: Queue-state tests fail before implementation
    Tool: Bash
    Preconditions: Test files added but runtime unchanged
    Steps:
      1. Run `pytest fastapi_backend/tests/tasks/test_video_slot_queue.py -q`
      2. Capture failing assertions showing missing `queued_for_slot`/queue-position behavior
    Expected Result: Tests fail with state-transition/assertion errors, not import or syntax errors
    Failure Indicators: Test file not discovered; unrelated traceback; passing unexpectedly
    Evidence: .sisyphus/evidence/task-1-red-tests.txt

  Scenario: Queue-state fixtures isolate media tasks only
    Tool: Bash
    Preconditions: Queue fixtures implemented in tests
    Steps:
      1. Run `pytest fastapi_backend/tests/tasks/test_video_slot_queue.py -k non_media -q`
      2. Verify tests explicitly document exclusion of text/chat semantics
    Expected Result: Fixture/test names clearly limit coverage to media/video paths
    Failure Indicators: Tests accidentally exercise unrelated task types
    Evidence: .sisyphus/evidence/task-1-media-scope.txt
  ```

  **Commit**: NO

- [x] 2. Specify slot scheduler unit tests for multi-key capacity

  **What to do**:
  - Add unit tests for a Redis-backed per-model-config FIFO slot scheduler that prove total capacity equals the sum of enabled key limits.
  - Cover single-key default limit behavior, multi-key aggregated capacity, disabled-key exclusion, negative-count prevention, and owner-token based release behavior.
  - Define tests for stale-owner recovery and prevention of duplicate dequeue/slot allocation.

  **Must NOT do**:
  - Do not implement the scheduler yet.
  - Do not rely on ad hoc sleeps when deterministic fake Redis state can be asserted directly.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: isolated unit-test authoring with deterministic scheduler expectations.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `systematic-debugging`: omitted because this task is specification-by-test, not root-cause analysis.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 6, 7, 11, 17
  - **Blocked By**: None

  **References**:
  - `fastapi_backend/app/ai_gateway/concurrency.py` - Existing counter semantics and default-limit behavior to preserve or intentionally replace.
  - `fastapi_backend/app/schemas_ai_models.py` - Default `concurrency_limit = 5` contract to preserve for unspecified keys.
  - `fastapi_backend/app/tasks/redis_client.py` - Redis connection utilities that scheduler tests should emulate.

  **Acceptance Criteria**:
  - [ ] Unit tests define owner-aware acquire/release semantics and aggregate multi-key capacity.
  - [ ] Tests explicitly fail under the current immediate-fail counter model.

  **QA Scenarios**:
  ```
  Scenario: Multi-key aggregate-capacity tests fail under old scheduler
    Tool: Bash
    Preconditions: Scheduler unit tests added, scheduler implementation unchanged
    Steps:
      1. Run `pytest fastapi_backend/tests/ai_gateway/test_video_slot_scheduler.py -q`
      2. Confirm failures mention aggregate capacity / queue semantics mismatch
    Expected Result: RED tests fail on scheduling semantics only
    Failure Indicators: Syntax/import failure or no failing tests
    Evidence: .sisyphus/evidence/task-2-red-scheduler.txt

  Scenario: Disabled-key exclusion is documented in tests
    Tool: Bash
    Preconditions: Test module includes enabled/disabled key cases
    Steps:
      1. Run `pytest fastapi_backend/tests/ai_gateway/test_video_slot_scheduler.py -k disabled -q`
      2. Verify disabled keys do not contribute to total capacity
    Expected Result: Tests clearly encode disabled-key exclusion rules
    Failure Indicators: Disabled key still counted in test expectations
    Evidence: .sisyphus/evidence/task-2-disabled-key.txt
  ```

  **Commit**: NO

- [x] 3. Extend task state/schema model for slot-waiting lifecycle

  **What to do**:
  - Add/plan the schema and model changes required for `queued_for_slot`, `submitting`, queue metadata, optional queue position fields, slot owner metadata, and queued cancellation semantics.
  - Define exactly which persistence layer fields belong in DB vs transient Redis state.
  - Add migration tests or schema validation tests for backward compatibility with existing tasks.

  **Must NOT do**:
  - Do not expose vague state names; each state must map to a concrete lifecycle phase.
  - Do not overload `running` to mean both "waiting for slot" and "actively submitting".

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: schema/state-machine design touches persistence and API contract layers.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 8, 9, 10, 14
  - **Blocked By**: None

  **References**:
  - `fastapi_backend/app/schemas.py` - Existing task DTO/status definitions that must be extended safely.
  - `fastapi_backend/app/models/...` (task persistence model) - Determine where queue metadata is stored.
  - `fastapi_backend/app/api/v1/batch_video.py` - Current API responses for batch-video tasks that may need new status fields.
  - `fastapi_backend/app/tasks/task_service.py` - Retry/cancel/update behavior that state additions must respect.

  **Acceptance Criteria**:
  - [ ] Schema/test coverage defines all new status values and persistence fields.
  - [ ] Backward compatibility for pre-existing task rows is explicitly covered.

  **QA Scenarios**:
  ```
  Scenario: Schema validation covers new queue states
    Tool: Bash
    Preconditions: Schema/model tests updated
    Steps:
      1. Run `pytest fastapi_backend/tests/test_task_status_schema.py -q`
      2. Verify new states serialize and deserialize correctly
    Expected Result: Tests cover both old and new status values
    Failure Indicators: Migration/schema rejects old tasks or omits new queue states
    Evidence: .sisyphus/evidence/task-3-schema-states.txt

  Scenario: Backward compatibility for existing tasks is explicit
    Tool: Bash
    Preconditions: Migration/schema tests include legacy rows
    Steps:
      1. Run targeted migration/schema regression tests
      2. Verify legacy rows still parse without queue metadata populated
    Expected Result: Existing tasks remain readable after schema changes
    Failure Indicators: Null constraint or enum mismatch breaks old rows
    Evidence: .sisyphus/evidence/task-3-backward-compat.txt
  ```

  **Commit**: NO

- [x] 4. Harden production worker startup semantics

  **What to do**:
  - Remove or gate `--reload` from production worker startup paths.
  - Ensure worker startup clearly distinguishes development reload mode from production queue processing mode.
  - Add tests or script verification for startup flags and environment-based branching.

  **Must NOT do**:
  - Do not change unrelated deployment topology.
  - Do not leave production behavior dependent on watchfiles for task processing.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: startup script/config hardening is narrow but operationally important.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 17, F2
  - **Blocked By**: None

  **References**:
  - `fastapi_backend/start_worker.sh` - Confirm current production misuse of `--reload`.
  - `fastapi_backend/app/tasks/worker.py` - Understand how reload mode toggles watchfiles and fallback polling.
  - Deployment compose/startup files under `docker-deploy` or backend container startup config - Ensure production entrypoint alignment.

  **Acceptance Criteria**:
  - [ ] Production worker startup path no longer enables reload mode by default.
  - [ ] Dev mode still supports reload when intentionally requested.

  **QA Scenarios**:
  ```
  Scenario: Production worker starts without reload
    Tool: Bash
    Preconditions: Startup scripts/config updated
    Steps:
      1. Run the production worker entrypoint in a test container or shell
      2. Inspect resulting process args/log output for absence of `--reload`
    Expected Result: Worker starts in production mode without watchfiles reload loop
    Failure Indicators: `reload: enabled` appears in logs or process args include `--reload`
    Evidence: .sisyphus/evidence/task-4-prod-worker.txt

  Scenario: Development mode still supports reload intentionally
    Tool: Bash
    Preconditions: Dev-mode flag/environment documented
    Steps:
      1. Start worker with explicit development reload flag
      2. Verify reload mode activates only under that explicit path
    Expected Result: Reload remains available only for local/dev use
    Failure Indicators: Reload unavailable in dev or still on by default in prod
    Evidence: .sisyphus/evidence/task-4-dev-worker.txt
  ```

  **Commit**: NO

- [x] 5. Define queue observability and operator-inspection tests

  **What to do**:
  - Add failing tests/contracts for queue-depth visibility, queue position lookup, slot utilization reporting, and stale-slot inspection.
  - Specify the minimum operator/debug surface needed to inspect per-config queue health without manual Redis spelunking.

  **Must NOT do**:
  - Do not build a full admin dashboard in this task.
  - Do not expose raw secrets or plaintext API keys in observability surfaces.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: contract-first observability definition.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 9, 14, 15
  - **Blocked By**: None

  **References**:
  - `fastapi_backend/app/api/v1/batch_video.py` - Existing task/job endpoints where queue metadata may surface.
  - `fastapi_backend/debug_redis_queue.py` and similar scripts - Existing debugging patterns that can inform operator surfaces.
  - `fastapi_backend/app/tasks/redis_client.py` - Existing Redis access conventions.

  **Acceptance Criteria**:
  - [ ] Failing tests define queue position and slot-utilization output contracts.
  - [ ] Debug/inspection contracts avoid plaintext key exposure.

  **QA Scenarios**:
  ```
  Scenario: Queue observability tests fail before implementation
    Tool: Bash
    Preconditions: Observability contract tests added
    Steps:
      1. Run `pytest fastapi_backend/tests/api/test_video_queue_observability.py -q`
      2. Verify failures mention missing queue position/utilization fields
    Expected Result: RED tests fail on expected missing observability outputs
    Failure Indicators: Tests pass unexpectedly or fail due to syntax/import problems
    Evidence: .sisyphus/evidence/task-5-red-observability.txt

  Scenario: Sensitive data is excluded by contract
    Tool: Bash
    Preconditions: Observability tests include redaction expectations
    Steps:
      1. Run redaction-focused test subset
      2. Verify API key hashes/IDs only, no plaintext keys
    Expected Result: Observability contract forbids plaintext secret exposure
    Failure Indicators: Tests allow plaintext key output
    Evidence: .sisyphus/evidence/task-5-redaction.txt
  ```

  **Commit**: NO

- [x] 6. Implement the Redis FIFO slot scheduler core

  **What to do**:
  - Replace or refactor the current `acquire_key`/`release_key` logic into an owner-aware slot scheduler that supports:
    - per-model-config FIFO waiting queues
    - total capacity = sum of enabled key limits
    - deterministic slot ownership tokens
    - safe release/recovery semantics
  - Preserve per-key accounting so provider calls still know which key is actually allocated.
  - Make slot acquisition non-failing for queueable media tasks: when no capacity exists, return queue placement instead of immediate 429.

  **Must NOT do**:
  - Do not implement a single global queue across unrelated configs.
  - Do not depend on TTL alone as cleanup.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: scheduler correctness under concurrency is the architectural core of this feature.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: 11, 13, 16, 17
  - **Blocked By**: 1, 2

  **References**:
  - `fastapi_backend/app/ai_gateway/concurrency.py` - Existing scheduler to replace/refactor.
  - `fastapi_backend/app/tasks/queue.py` - Existing FIFO task queue patterns for inspiration; keep slot queue separate from worker queue semantics.
  - `fastapi_backend/app/tasks/redis_client.py` - Canonical Redis access path.
  - Tests from Tasks 1 and 2 - Treat these as the executable specification.

  **Acceptance Criteria**:
  - [ ] Scheduler passes RED→GREEN unit tests for FIFO ordering, aggregate capacity, disabled-key exclusion, and owner-aware release.
  - [ ] Scheduler can place media tasks into a waiting queue instead of returning immediate exhaustion error.

  **QA Scenarios**:
  ```
  Scenario: Aggregate capacity equals sum of enabled key limits
    Tool: Bash
    Preconditions: Scheduler core implemented; test fixture with 3 enabled keys limits 2, 3, and 1
    Steps:
      1. Run `pytest fastapi_backend/tests/ai_gateway/test_video_slot_scheduler.py -k aggregate_capacity -q`
      2. Verify six acquisitions succeed and the seventh is queued
    Expected Result: Total runnable capacity equals 6; overflow enters queue
    Failure Indicators: Seventh request gets hard failure or capacity != 6
    Evidence: .sisyphus/evidence/task-6-aggregate-capacity.txt

  Scenario: FIFO dequeue order is preserved
    Tool: Bash
    Preconditions: Three queued requests for same config with one-slot capacity
    Steps:
      1. Run FIFO scheduler tests
      2. Release the active owner slot
      3. Assert oldest queued owner receives the slot next
    Expected Result: Oldest waiting task advances first
    Failure Indicators: Out-of-order dequeue or duplicate slot grant
    Evidence: .sisyphus/evidence/task-6-fifo-order.txt
  ```

  **Commit**: YES
  - Message: `feat(ai-gateway): add fifo video slot scheduler`
  - Files: `fastapi_backend/app/ai_gateway/concurrency.py`, scheduler tests
  - Pre-commit: `pytest fastapi_backend/tests/ai_gateway/test_video_slot_scheduler.py -q`

- [x] 7. Implement stale-owner recovery and zombie-slot cleanup

  **What to do**:
  - Add a robust recovery mechanism for leaked slot ownership, using explicit owner metadata/heartbeats or comparable state rather than TTL-only cleanup.
  - Add background cleanup/repair behavior for dead workers, abandoned queued entries, and slot owners that can no longer be matched to a live task state.
  - Ensure cleanup logic is idempotent and safe under concurrent workers.

  **Must NOT do**:
  - Do not silently free live slots without evidence they are stale.
  - Do not create cleanup logic that can steal slots from healthy workers.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: safety-critical recovery logic with concurrent-worker implications.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 12, 17
  - **Blocked By**: 2

  **References**:
  - `fastapi_backend/app/ai_gateway/concurrency.py` - Existing TTL cleanup limitation.
  - `fastapi_backend/app/tasks/worker.py` - Worker lifecycle behavior relevant to crash/restart recovery.
  - `fastapi_backend/app/tasks/external_poller.py` - Waiting task lifecycle and potential stale-owner detection points.

  **Acceptance Criteria**:
  - [ ] Recovery tests prove leaked slots are reclaimed after owner loss.
  - [ ] Cleanup never drives counters negative or double-releases live work.

  **QA Scenarios**:
  ```
  Scenario: Dead owner slot is recovered safely
    Tool: Bash
    Preconditions: Test simulates worker death after slot ownership recorded
    Steps:
      1. Run `pytest fastapi_backend/tests/ai_gateway/test_video_slot_scheduler.py -k stale_owner -q`
      2. Verify cleanup marks owner stale and advances next queued task
    Expected Result: Orphaned slot is reclaimed without negative counters
    Failure Indicators: Slot remains permanently held or double-release occurs
    Evidence: .sisyphus/evidence/task-7-stale-owner.txt

  Scenario: Cleanup does not steal active slot
    Tool: Bash
    Preconditions: Healthy owner heartbeat/lease exists
    Steps:
      1. Run active-owner protection tests
      2. Attempt cleanup pass while owner still healthy
    Expected Result: Live owner retains slot; no queue advancement occurs
    Failure Indicators: Cleanup incorrectly frees active slot
    Evidence: .sisyphus/evidence/task-7-live-owner-protection.txt
  ```

  **Commit**: YES
  - Message: `fix(ai-gateway): recover stale video slot owners`
  - Files: scheduler core + recovery tests
  - Pre-commit: `pytest fastapi_backend/tests/ai_gateway/test_video_slot_scheduler.py -k 'stale_owner or recovery' -q`

- [x] 8. Integrate new queue states into the task state machine

  **What to do**:
  - Implement the state transitions needed for `queued_for_slot`, `submitting`, `waiting_external`, `failed`, `succeeded`, and queued `canceled` flows.
  - Ensure task services/reporters update state consistently and never conflate “waiting for slot” with “actively executing provider submission.”
  - Add migration and transition validation for retry paths.

  **Must NOT do**:
  - Do not bypass the queue state machine from ad hoc handler code.
  - Do not leave retry behavior ambiguous for tasks that failed before slot acquisition versus after provider submit.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: state-machine work spans task lifecycle, persistence, and handler integration.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 10, 11, 12, 14, 16
  - **Blocked By**: 1, 3

  **References**:
  - `fastapi_backend/app/tasks/process_task.py` - Current lifecycle transitions for two-phase tasks.
  - `fastapi_backend/app/tasks/handlers/base.py` - Base handler contract.
  - `fastapi_backend/app/tasks/task_service.py` - Retry/cancel semantics.
  - `fastapi_backend/app/schemas.py` - Task status serialization contract.

  **Acceptance Criteria**:
  - [ ] State-machine tests cover all transitions into and out of `queued_for_slot` and `submitting`.
  - [ ] Retry/cancel paths behave consistently for pre-slot and post-submit failures.

  **QA Scenarios**:
  ```
  Scenario: Task transitions through queued_for_slot to submitting to waiting_external
    Tool: Bash
    Preconditions: Queue-aware state machine integrated
    Steps:
      1. Run state-machine integration tests
      2. Submit task under full capacity, then free one slot
      3. Verify stored states move `queued_for_slot -> submitting -> waiting_external`
    Expected Result: Each transition is persisted exactly once and in order
    Failure Indicators: Task jumps directly to running, skips states, or duplicates transitions
    Evidence: .sisyphus/evidence/task-8-state-flow.txt

  Scenario: Retry distinguishes pre-slot failure from post-submit failure
    Tool: Bash
    Preconditions: Retry tests for both failure classes
    Steps:
      1. Run retry-specific integration tests
      2. Verify pre-slot retry returns to queued_for_slot, post-submit retry resets correct external state
    Expected Result: Retry semantics match failure phase
    Failure Indicators: Retry loses cleanup or duplicates external submit
    Evidence: .sisyphus/evidence/task-8-retry-flow.txt
  ```

  **Commit**: YES
  - Message: `feat(tasks): add slot-waiting media task states`
  - Files: task schema/model/service/process flow
  - Pre-commit: `pytest fastapi_backend/tests/tasks/test_video_slot_queue.py -q`

- [x] 9. Add queue position and queue-health API support

  **What to do**:
  - Implement API/backend surfaces for queue position, queue depth, slot utilization, and per-task queue metadata needed by the UI/operator tools.
  - Ensure queue position is computed consistently for FIFO ordering and updates after cancellations or dequeues.
  - Keep secrets redacted: expose config IDs, key IDs/hashes, counts, not plaintext keys.

  **Must NOT do**:
  - Do not expose raw Redis implementation details directly to clients.
  - Do not require expensive O(n) scans on every unrelated task request if caching/indexing can avoid it.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: focused API shape work once scheduler/state model is set.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 14, 15, 16
  - **Blocked By**: 3, 5

  **References**:
  - `fastapi_backend/app/api/v1/batch_video.py` - Current task/job response surfaces.
  - `fastapi_backend/app/tasks/task_service.py` - Likely backend layer for queue metadata retrieval.
  - Tests from Task 5 - Observability contract.

  **Acceptance Criteria**:
  - [ ] API returns queue position for queued tasks and hides it when not queued.
  - [ ] Slot utilization/count endpoints or internal surfaces redact secrets.

  **QA Scenarios**:
  ```
  Scenario: Queued task exposes queue position via API
    Tool: Bash (curl)
    Preconditions: At least one task queued_for_slot
    Steps:
      1. `curl -s http://localhost:8000/api/v1/tasks/<queued-task-id>`
      2. Assert JSON includes `status: "queued_for_slot"` and `queue_position: 1`
    Expected Result: Queue position present and correct for queued tasks
    Failure Indicators: Missing field, wrong status, or null queue_position while queued
    Evidence: .sisyphus/evidence/task-9-queue-position.json

  Scenario: Non-queued task hides queue_position
    Tool: Bash (curl)
    Preconditions: Task has advanced to waiting_external or succeeded
    Steps:
      1. Fetch task JSON for active/non-queued task
      2. Assert queue_position is absent or null
    Expected Result: Queue-only metadata is not misleadingly shown after dequeue
    Failure Indicators: Stale queue_position remains visible after task starts
    Evidence: .sisyphus/evidence/task-9-nonqueued-position.json
  ```

  **Commit**: YES
  - Message: `feat(api): expose media queue position and utilization`
  - Files: API/task service/tests
  - Pre-commit: `pytest fastapi_backend/tests/api/test_video_queue_observability.py -q`

- [x] 10. Support user cancellation while queued for slot

  **What to do**:
  - Implement cancellation behavior for tasks that have not yet acquired a slot.
  - Ensure cancellation removes the task from the FIFO queue, clears queue metadata, and never releases a slot that was not actually owned.
  - Ensure subsequent tasks shift forward correctly.

  **Must NOT do**:
  - Do not cancel already-submitted external work through the queued-cancel path unless explicitly owned and supported.
  - Do not leave ghost queue entries behind after cancel.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: contained lifecycle behavior once state machine exists.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 14, 16
  - **Blocked By**: 3, 8

  **References**:
  - `fastapi_backend/app/tasks/task_service.py` - Existing cancel/retry entry points.
  - `fastapi_backend/app/api/v1/tasks.py` or equivalent task routes - Cancellation endpoint behavior.
  - Scheduler queue internals from Task 6 - Queue removal semantics.

  **Acceptance Criteria**:
  - [x] Queued task can be canceled cleanly via API/service.
  - [x] Cancellation updates queue position for later tasks.

  **QA Scenarios**:
  ```
  Scenario: Cancel queued task removes it from FIFO queue
    Tool: Bash (curl)
    Preconditions: Two tasks queued behind one active slot owner
    Steps:
      1. Cancel the first queued task via API
      2. Fetch both tasks and queue-health API
      3. Verify canceled task status is `canceled` and second task becomes first in queue
    Expected Result: Queue compacts correctly after cancellation
    Failure Indicators: Ghost queue entry remains or wrong task advances
    Evidence: .sisyphus/evidence/task-10-cancel-queue.json

  Scenario: Canceling queued task does not affect active slot owner
    Tool: Bash
    Preconditions: One task actively holding slot, one waiting task canceled
    Steps:
      1. Cancel waiting task
      2. Inspect slot owner/utilization before and after
    Expected Result: Active slot ownership unchanged; only queued entry removed
    Failure Indicators: Active slot released accidentally or counters altered incorrectly
    Evidence: .sisyphus/evidence/task-10-cancel-safety.txt
  ```

  **Commit**: YES
  - Message: `feat(tasks): allow queued media task cancellation`
  - Files: task service/routes/tests
  - Pre-commit: `pytest fastapi_backend/tests/tasks/test_video_slot_queue.py -k cancel -q`

---

## Final Verification Wave

- [x] 11. Wire submit_media_async into queue-based slot acquisition

  **What to do**:
  - Refactor `submit_media_async()` so queueable video/media tasks enter slot-waiting flow instead of raising immediate 429 when no slot is free.
  - Ensure the function distinguishes three outcomes clearly: queued, actively submitting with owned slot, and hard failure for non-queueable errors.
  - Remove the current leak-prone “acquire at submit, release only at poll terminal state” gap.

  **Must NOT do**:
  - Do not change text/chat endpoints to queued semantics.
  - Do not preserve immediate 429 for queueable media tasks under temporary saturation.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: central integration point across scheduler, provider submission, and task lifecycle.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: 12, 13, 16, 17, 18
  - **Blocked By**: 2, 6, 8

  **References**:
  - `fastapi_backend/app/ai_gateway/service.py` - Primary integration point.
  - `fastapi_backend/app/tasks/handlers/batch_video_asset_generate.py` - Batch video submission path.
  - `fastapi_backend/app/tasks/handlers/asset_video_generate.py`, `shot_video_generate.py`, `model_test_video_generate.py` - Other queueable media flows to align.
  - Tests from Tasks 1, 2, and 8 - Behavioral contract.

  **Acceptance Criteria**:
  - [ ] Queueable media submit path never fails immediately with slot-exhaustion 429.
  - [ ] Submission path either queues or submits with an explicitly owned slot token.
  - [ ] Slot ownership is released or transferred safely after successful external handoff.

  **QA Scenarios**:
  ```
  Scenario: Saturated media submission queues instead of returning 429
    Tool: Bash (pytest/curl)
    Preconditions: Model config total capacity fully consumed by active media tasks
    Steps:
      1. Submit one more batch-video generation request
      2. Assert API/task response indicates `queued_for_slot`
      3. Assert no AppError 429 is returned for temporary saturation
    Expected Result: Overflow task enters queue with position metadata
    Failure Indicators: Request fails immediately with 429 or task marked failed
    Evidence: .sisyphus/evidence/task-11-queue-instead-of-429.json

  Scenario: Available slot leads directly to provider submission
    Tool: Bash
    Preconditions: At least one slot free for target model config
    Steps:
      1. Submit a queueable media task
      2. Inspect persisted task state and logs
      3. Verify task transitions through `submitting` to `waiting_external`
    Expected Result: Task claims one slot and submits once
    Failure Indicators: Duplicate submit, missing slot token, or lingering queued state with free capacity
    Evidence: .sisyphus/evidence/task-11-direct-submit.txt
  ```

  **Commit**: YES
  - Message: `feat(ai-gateway): queue media submissions when slots are full`
  - Files: ai_gateway service + handler integrations + tests
  - Pre-commit: `pytest fastapi_backend/tests/tasks/test_video_slot_queue.py -k submit -q`

- [x] 12. Harden external poller and terminal release paths

  **What to do**:
  - Ensure every successful submit path has a corresponding explicit release/cleanup path for slot ownership.
  - Cover success, provider failure, timeout, cancellation, post-processing failure, and zombie-sweep cases.
  - Make release logic idempotent and owner-safe so duplicate callbacks/polls cannot corrupt slot counts.

  **Must NOT do**:
  - Do not assume terminal poll always happens.
  - Do not leave cleanup responsibilities split ambiguously across unrelated modules.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: terminal cleanup correctness is the difference between a real queue and another leak source.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 16, 17, 18
  - **Blocked By**: 7, 8, 11

  **References**:
  - `fastapi_backend/app/tasks/external_poller.py` - Polling, timeout, zombie, and completion logic.
  - `fastapi_backend/app/ai_gateway/service.py` - Current release in `query_media_status` and submission error paths.
  - Media handlers’ `on_fail`/`on_external_complete` methods - Ensure they align with cleanup ownership.

  **Acceptance Criteria**:
  - [ ] Release-path tests cover success, failure, timeout, cancellation, and recovery.
  - [ ] Duplicate release attempts do not produce negative counters.

  **QA Scenarios**:
  ```
  Scenario: Terminal success releases slot exactly once
    Tool: Bash
    Preconditions: Task reaches waiting_external with owned slot metadata
    Steps:
      1. Simulate/complete external success
      2. Query slot utilization before and after terminal completion
      3. Re-run completion callback/poll idempotently
    Expected Result: Slot count decreases exactly once and never goes negative
    Failure Indicators: Count unchanged, negative, or decremented twice
    Evidence: .sisyphus/evidence/task-12-terminal-release.txt

  Scenario: Post-processing failure still frees slot
    Tool: Bash
    Preconditions: External provider returns success but post-download/storage step is forced to fail
    Steps:
      1. Run integration test with forced on_external_complete failure
      2. Inspect final task state and slot utilization
    Expected Result: Task fails cleanly and owned slot is released/recovered
    Failure Indicators: Task fails but slot remains held
    Evidence: .sisyphus/evidence/task-12-postprocess-failure.txt
  ```

  **Commit**: YES
  - Message: `fix(tasks): release video slots on all terminal paths`
  - Files: external poller/service/handler cleanup paths + tests
  - Pre-commit: `pytest fastapi_backend/tests/tasks -k 'external and slot' -q`

- [x] 13. Enforce multi-key aggregated concurrency semantics per config

  **What to do**:
  - Ensure the queue and scheduler treat a model config’s effective capacity as the sum of all enabled API key limits.
  - Ensure disabled keys contribute zero capacity.
  - Ensure acquired slot metadata records the exact key used so provider submission remains deterministic.

  **Must NOT do**:
  - Do not create cross-config borrowing of slots.
  - Do not treat unspecified per-key limits inconsistently with current default behavior.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: subtle behavior around multiple keys and config isolation.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 16, 18
  - **Blocked By**: 6, 11

  **References**:
  - `fastapi_backend/app/ai_gateway/concurrency.py` - Candidate selection and current `concurrency_limit` defaults.
  - `fastapi_backend/app/schemas_ai_models.py` - Default-limit contract.
  - Any model config persistence schema storing `api_keys_info` - Ensure enabled/disabled key semantics match persisted data.

  **Acceptance Criteria**:
  - [ ] Multi-key tests prove total capacity equals sum of enabled limits.
  - [ ] Provider requests know which exact key was assigned.

  **QA Scenarios**:
  ```
  Scenario: Three-key config admits sum-of-limits concurrent submissions
    Tool: Bash
    Preconditions: Config with enabled key limits 1, 2, and 4
    Steps:
      1. Launch seven queueable media tasks for that config
      2. Verify seven tasks acquire/submit without queueing, eighth queues
    Expected Result: Effective capacity equals 7
    Failure Indicators: Capacity lower/higher than sum or disabled keys counted
    Evidence: .sisyphus/evidence/task-13-sum-of-limits.txt

  Scenario: Assigned provider key is recorded per task
    Tool: Bash
    Preconditions: Multi-key submit flow active
    Steps:
      1. Submit media task under multi-key config
      2. Inspect task/external metadata or debug surface for key identifier/hash
    Expected Result: Exact assigned key identifier/hash is traceable without exposing plaintext secret
    Failure Indicators: Cannot trace assigned key or plaintext secret is leaked
    Evidence: .sisyphus/evidence/task-13-key-assignment.txt
  ```

  **Commit**: YES
  - Message: `feat(ai-gateway): aggregate video concurrency across enabled keys`
  - Files: scheduler/config integration/tests
  - Pre-commit: `pytest fastapi_backend/tests/ai_gateway/test_video_slot_scheduler.py -k multi_key -q`

- [ ] 14. Surface queue state and cancellation in the frontend

  **What to do**:
  - Update UI flows to show queued-for-slot state, queue position, submitting status, external-processing status, and queued cancellation affordance.
  - Ensure messaging distinguishes “waiting for capacity” from “processing externally.”
  - Show cancellation only when the task is actually cancelable.

  **Must NOT do**:
  - Do not mislabel queued tasks as failed or running.
  - Do not expose internal implementation jargon to end users.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: frontend state presentation and interaction design.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 16, F3
  - **Blocked By**: 3, 5, 8, 9, 10

  **References**:
  - `nextjs-frontend/app/...batch-video...` routes/components showing current task state.
  - Existing task list/detail UI components - find where status labels and retry/cancel controls are rendered.
  - API contracts from Task 9.

  **Acceptance Criteria**:
  - [ ] UI shows queue position and correct queued/submitting/external states.
  - [ ] Queued tasks expose cancel action and non-queued tasks do not misuse it.

  **QA Scenarios**:
  ```
  Scenario: Queued task displays queue position and cancel action
    Tool: Playwright
    Preconditions: Frontend running against backend with one queued media task
    Steps:
      1. Open batch-video task detail/list page
      2. Locate queued task row/card
      3. Assert visible text contains `等待并发槽位` (or approved copy) and queue position number
      4. Assert cancel button is visible and enabled
    Expected Result: User sees accurate queued state and can cancel
    Failure Indicators: Task shown as failed/running or no queue metadata displayed
    Evidence: .sisyphus/evidence/task-14-queued-ui.png

  Scenario: Dequeued task no longer shows queue-specific controls
    Tool: Playwright
    Preconditions: Queued task advances to submitting/waiting_external
    Steps:
      1. Refresh task detail page after slot acquisition
      2. Assert queue position text disappears
      3. Assert queued-cancel button is hidden/disabled
    Expected Result: UI updates from queue-wait state to active processing state
    Failure Indicators: Stale queue info remains after dequeue
    Evidence: .sisyphus/evidence/task-14-active-ui.png
  ```

  **Commit**: YES
  - Message: `feat(batch-video): show queue position and queued cancellation`
  - Files: frontend task UI + tests
  - Pre-commit: frontend test/lint command for affected components

- [x] 15. Add operator/debug queue-health inspection surface

  **What to do**:
  - Provide a safe operator-facing view or internal endpoint/script that shows per-config queue depth, active slot owners, stale-owner candidates, and per-key utilization hashes/IDs.
  - Ensure it supports diagnosing stuck capacity without direct Redis shell access.

  **Must NOT do**:
  - Do not expose plaintext API keys.
  - Do not make this a required public-user feature.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: focused diagnostics surface once APIs and scheduler exist.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 19, F1
  - **Blocked By**: 5, 9

  **References**:
  - Existing `debug_redis_queue.py` / Redis inspection scripts - operational precedent.
  - Scheduler metadata from Tasks 6 and 7.
  - API/task service contracts from Task 9.

  **Acceptance Criteria**:
  - [ ] Operator surface reports queue depth and active slot utilization per config without secret leakage.
  - [ ] Surface helps identify stale-owner candidates.

  **QA Scenarios**:
  ```
  Scenario: Operator surface reports queue and slot utilization
    Tool: Bash (curl/python)
    Preconditions: Queue has both active and waiting tasks
    Steps:
      1. Call operator/debug endpoint or script
      2. Assert output includes config ID, queue depth, active-slot count, waiting count
    Expected Result: Operator can diagnose saturation without raw Redis scans
    Failure Indicators: Missing queue depth/utilization or plaintext secrets exposed
    Evidence: .sisyphus/evidence/task-15-operator-surface.txt

  Scenario: Stale-owner candidate appears in diagnostics
    Tool: Bash
    Preconditions: Simulated stale slot owner exists
    Steps:
      1. Run stale-owner diagnostic query/script
      2. Assert candidate is flagged with reason/age
    Expected Result: Diagnostics help explain persistent saturation
    Failure Indicators: Stale owner invisible to operators
    Evidence: .sisyphus/evidence/task-15-stale-diagnostic.txt
  ```

  **Commit**: YES
  - Message: `feat(ops): add video queue health diagnostics`
  - Files: internal endpoint/script/tests
  - Pre-commit: targeted API/script tests

- [x] 16. Build end-to-end FIFO and queue-position integration coverage

  **What to do**:
  - Add integration tests that exercise the full queued media flow: saturation, queue placement, FIFO advancement, queue-position updates, successful submit, and terminal completion.
  - Ensure tests cover both single-key and multi-key configs.

  **Must NOT do**:
  - Do not rely on brittle sleeps when explicit advancement hooks or polling assertions are available.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: broad cross-module integration verification.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4
  - **Blocks**: F1, F2, F3, F4
  - **Blocked By**: 1, 6, 8, 9, 10, 11, 12, 13, 14

  **References**:
  - All queue-state, scheduler, and API tests from earlier tasks.
  - `fastapi_backend/app/tasks/process_task.py` and media handlers - End-to-end execution path.

  **Acceptance Criteria**:
  - [ ] Full-flow tests verify queued tasks advance FIFO and finish successfully.
  - [ ] Queue position updates correctly after dequeues and cancellations.

  **QA Scenarios**:
  ```
  Scenario: End-to-end FIFO flow with one-slot capacity
    Tool: Bash
    Preconditions: Test environment with one effective slot for chosen config
    Steps:
      1. Submit tasks A, B, C
      2. Assert A enters active processing, B/C queue with positions 1/2
      3. Complete A and verify B advances before C
    Expected Result: Strict FIFO progression end-to-end
    Failure Indicators: B/C order inversion or queue-position drift
    Evidence: .sisyphus/evidence/task-16-e2e-fifo.txt

  Scenario: Queue position updates after cancellation
    Tool: Bash
    Preconditions: Two queued tasks behind active slot
    Steps:
      1. Cancel first waiting task
      2. Fetch second task metadata
      3. Verify queue_position decreases accordingly
    Expected Result: Queue metadata remains accurate after removal
    Failure Indicators: Position stale or canceled task still blocks progression
    Evidence: .sisyphus/evidence/task-16-queue-position-update.txt
  ```

  **Commit**: YES
  - Message: `test(batch-video): cover fifo queue integration flows`
  - Files: integration tests
  - Pre-commit: targeted integration pytest command

- [x] 17. Prove crash recovery and zombie-slot reclamation

  **What to do**:
  - Add integration/system tests that simulate worker crash/restart, external poller interruption, and abandoned slot owners.
  - Verify queued tasks eventually continue once stale slots are reclaimed.

  **Must NOT do**:
  - Do not claim crash-safety without explicit simulated crash evidence.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: failure-injection and recovery verification across systems.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F1, F2, F3, F4
  - **Blocked By**: 2, 4, 6, 7, 11, 12

  **References**:
  - `fastapi_backend/app/tasks/worker.py` - Worker lifecycle and crash/restart implications.
  - `fastapi_backend/app/tasks/external_poller.py` - Poller interruption and zombie handling.
  - Scheduler recovery logic from Task 7.

  **Acceptance Criteria**:
  - [ ] Simulated crashes do not leave permanent slot saturation.
  - [ ] Waiting tasks progress after stale-owner recovery.

  **QA Scenarios**:
  ```
  Scenario: Worker crash does not permanently block queue
    Tool: Bash / interactive_bash
    Preconditions: Active slot owner exists; second task waiting in queue
    Steps:
      1. Start worker and submit active + queued tasks
      2. Kill worker while active task holds slot
      3. Restart worker / recovery loop
      4. Verify stale slot reclaimed and queued task advances
    Expected Result: Queue recovers without manual Redis cleanup
    Failure Indicators: Slot remains saturated indefinitely after restart
    Evidence: .sisyphus/evidence/task-17-worker-crash.txt

  Scenario: Poller interruption does not leak slot forever
    Tool: Bash
    Preconditions: Task reaches waiting_external and poller is interrupted
    Steps:
      1. Stop poller during external wait
      2. Verify recovery/cleanup path eventually reconciles ownership
      3. Restart poller and confirm queue health normalizes
    Expected Result: No permanent zombie slot remains
    Failure Indicators: Queue stays blocked until TTL only
    Evidence: .sisyphus/evidence/task-17-poller-crash.txt
  ```

  **Commit**: YES
  - Message: `test(tasks): verify video queue crash recovery`
  - Files: system/integration tests
  - Pre-commit: crash-recovery test command

- [x] 18. Add regression coverage for non-media fail-fast behavior

  **What to do**:
  - Add regression tests proving text/chat/non-queueable flows retain current behavior and are not accidentally routed into the video slot queue.
  - Verify temporary slot saturation still returns existing behavior for excluded paths where appropriate.

  **Must NOT do**:
  - Do not silently broaden the new queue to all AI operations.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: regression guardrails for out-of-scope paths.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F1, F2, F4
  - **Blocked By**: 11, 12, 13

  **References**:
  - `fastapi_backend/app/ai_gateway/service.py` - Text/chat paths (`chat_text`, `chat_text_stream`) that must remain fail-fast unless explicitly redesigned later.
  - Existing chat/text tests - follow current semantics.

  **Acceptance Criteria**:
  - [ ] Regression tests prove non-media endpoints are unchanged.
  - [ ] Queue code is not invoked for excluded task categories.

  **QA Scenarios**:
  ```
  Scenario: Text/chat path still fails fast under slot/key exhaustion
    Tool: Bash
    Preconditions: Regression fixture routes text/chat through existing behavior
    Steps:
      1. Run non-media regression tests
      2. Verify excluded paths do not enter queued_for_slot state
    Expected Result: Non-media semantics unchanged
    Failure Indicators: Text/chat request is queued or task schema polluted with queue-only states
    Evidence: .sisyphus/evidence/task-18-nonmedia-regression.txt

  Scenario: Video queue code path is media-only
    Tool: Bash
    Preconditions: Path-routing tests exist
    Steps:
      1. Run targeted tests for routing to queueable vs non-queueable flows
      2. Assert only media flows call slot scheduler
    Expected Result: Scheduler invoked for media/video only
    Failure Indicators: Queue scheduler used by unrelated endpoints
    Evidence: .sisyphus/evidence/task-18-routing-scope.txt
  ```

  **Commit**: YES
  - Message: `test(ai-gateway): protect non-media fail-fast semantics`
  - Files: regression tests
  - Pre-commit: targeted non-media pytest command

- [x] 19. Document queue operations and recovery runbook

  **What to do**:
  - Write concise operator/developer documentation for the new queue states, queue-health diagnostics, stale-slot recovery expectations, and normal troubleshooting steps.
  - Include explanation of total concurrency semantics for multi-key configs.

  **Must NOT do**:
  - Do not document outdated TTL-only cleanup as the primary recovery mechanism.

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: documentation/runbook task.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F1, F4
  - **Blocked By**: 15

  **References**:
  - Operator/debug surface from Task 15.
  - Updated task states and queue APIs from Tasks 8, 9, and 14.
  - Current production failure learnings from this investigation.

  **Acceptance Criteria**:
  - [ ] Runbook explains queue states, capacity calculation, cancellation, and stale recovery.
  - [ ] Documentation references the real diagnostics surface rather than ad hoc Redis commands only.

  **QA Scenarios**:
  ```
  Scenario: Runbook covers operator diagnosis workflow
    Tool: Bash
    Preconditions: Runbook drafted
    Steps:
      1. Read runbook file
      2. Verify it includes queue states, total-capacity formula, stale-owner diagnosis, and recovery steps
    Expected Result: Operator can diagnose saturation from documented steps alone
    Failure Indicators: Missing queue-state definitions or recovery guidance
    Evidence: .sisyphus/evidence/task-19-runbook-review.txt

  Scenario: Runbook aligns with actual diagnostics surface
    Tool: Bash
    Preconditions: Debug endpoint/script exists
    Steps:
      1. Execute documented diagnostic command/endpoint
      2. Verify output matches runbook examples and terminology
    Expected Result: Docs match implemented tooling
    Failure Indicators: Runbook references nonexistent commands or stale field names
    Evidence: .sisyphus/evidence/task-19-doc-tool-alignment.txt
  ```

  **Commit**: YES
  - Message: `docs(ops): add video queue recovery runbook`
  - Files: docs/runbook and related notes
  - Pre-commit: markdown lint or doc review command if available

---

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists and behavior matches. For each "Must NOT Have": search for forbidden scope expansion (text/chat queueing, global queue, priority logic, reload in prod). Check evidence files exist in `.sisyphus/evidence/`.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run backend/frontend tests, linting, and type checks as applicable. Review changed files for counter corruption risks, race-prone logic, ambiguous state names, and secret leakage in diagnostics.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Risk Areas [N clean/N issues] | VERDICT`

- [ ] F3. **Real QA Execution** — `unspecified-high`
  Execute all queued-media QA scenarios, including saturation, queue visibility, cancellation, completion, and crash recovery. Save artifacts under `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Recovery [N/N] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  Verify that implementation only changes queueable media/video flows plus necessary shared task infrastructure. Confirm non-media semantics remain intact and no unrelated queue abstractions were added.
  Output: `Tasks [N/N compliant] | Scope [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **1**: `feat(ai-gateway): add fifo video slot scheduler`
- **2**: `fix(ai-gateway): recover stale video slot owners`
- **3**: `feat(tasks): add slot-waiting media task states`
- **4**: `feat(api): expose media queue position and utilization`
- **5**: `feat(tasks): allow queued media task cancellation`
- **6**: `feat(ai-gateway): queue media submissions when slots are full`
- **7**: `fix(tasks): release video slots on all terminal paths`
- **8**: `feat(ai-gateway): aggregate video concurrency across enabled keys`
- **9**: `feat(batch-video): show queue position and queued cancellation`
- **10**: `feat(ops): add video queue health diagnostics`
- **11**: `test(batch-video): cover fifo queue integration flows`
- **12**: `test(tasks): verify video queue crash recovery`
- **13**: `test(ai-gateway): protect non-media fail-fast semantics`
- **14**: `docs(ops): add video queue recovery runbook`

## Success Criteria

### Verification Commands
```bash
pytest fastapi_backend/tests/ai_gateway/test_video_slot_scheduler.py -q
pytest fastapi_backend/tests/tasks/test_video_slot_queue.py -q
pytest fastapi_backend/tests/api/test_video_queue_observability.py -q
pytest fastapi_backend/tests -k "video and queue" -q
pytest fastapi_backend/tests -k "non_media or chat or text" -q
```

### Final Checklist
- [ ] All queueable media/video tasks queue instead of immediate 429 on temporary saturation
- [ ] FIFO ordering is preserved
- [ ] Total config concurrency equals sum of enabled key limits
- [ ] Queued tasks are cancelable
- [ ] Slot leaks are prevented or recovered
- [ ] Queue position is visible in API/UI
- [ ] Non-media flows remain unchanged
- [ ] Production worker no longer starts with reload by default

---

## Final Verification Wave
