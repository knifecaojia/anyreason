# Add Configurable COS Object Storage

## TL;DR

> **Quick Summary**: Add a provider-based object storage layer so the backend can run against either MinIO or Tencent COS by configuration, without changing business-layer behavior.
>
> **Deliverables**:
> - A unified storage abstraction with MinIO and COS implementations
> - Config/env/deployment support for provider selection
> - Regression coverage for current upload/download/thumbnail/generated-media flows under the abstraction
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: inventory/contract → abstraction/config → provider integrations → regression/verification

---

## Context

### Original Request
按照上述思路创作一个增加 cos 对象存储的计划，并支持按配置选择 MinIO 或 COS。

### Interview Summary
**Key Discussions**:
- User wants Tencent COS added as an alternative, not a hard cutover.
- Provider choice should be configurable rather than implemented with business-layer branching.
- Existing MinIO support must remain available.

**Research Findings**:
- Object storage is centered around `fastapi_backend/app/storage/minio_client.py`.
- Direct MinIO usage appears in `fastapi_backend/app/services/storage/vfs_service.py`, `fastapi_backend/app/services/script_service.py`, `fastapi_backend/app/api/v1/scripts.py`, `fastapi_backend/app/api/v1/assets.py`, `fastapi_backend/app/services/script_structure_service.py`, `fastapi_backend/app/tasks/handlers/canvas_export.py`, and `fastapi_backend/app/ai_gateway/providers/media/gemini.py`.
- The codebase stores object references as bucket/key pairs in DB fields currently named `minio_*`, which can remain unchanged in phase 1.
- Tencent COS has provider-specific endpoint, region, bucket naming, and URL-signing/domain behavior that cannot be handled by config substitution alone.
- A local ignored COS reference file already provides enough baseline access data for planning: full bucket name, region, credentials, and public domain; implementation should therefore prefer configuring the final bucket identity directly instead of requiring bucket+APPID assembly by default.

### Metis Review
**Identified Gaps** (addressed):
- Missing guardrail around schema churn: phase 1 explicitly forbids DB field renames.
- Missing guardrail around provider branching: all branching must stay inside storage/config layers.
- Missing acceptance coverage for provider parity: plan now requires MinIO regression plus COS-positive-path verification.
- Missing edge-case handling around URL helpers and bucket provisioning: plan now isolates those behaviors into provider-specific implementations.

---

## Work Objectives

### Core Objective
Introduce a configurable storage provider layer that preserves existing MinIO behavior while enabling Tencent COS for the same backend object-storage workflows.

### Concrete Deliverables
- Provider selection configuration in backend settings and env templates
- Explicit COS configuration baseline covering credentials, bucket identity, region, and URL/domain strategy
- Unified storage adapter contract for object CRUD, stream reads, and URL generation
- MinIO adapter migrated behind the contract
- New COS adapter added behind the same contract
- Existing storage consumers refactored to use the contract
- Updated tests, deployment docs, and local configuration guidance

### Definition of Done
- [ ] Backend can be configured to use MinIO without behavior regression in covered flows
- [ ] Backend can be configured to use COS for the same covered flows
- [ ] No business-layer module contains raw provider-switch branching
- [ ] Existing DB schema remains unchanged
- [ ] Regression and provider-specific verification evidence is captured under `.sisyphus/evidence/`

### Must Have
- Runtime provider switch through configuration
- MinIO compatibility preserved
- COS support for upload, download/read, delete, and URL generation used by current flows
- COS configuration contract explicitly defined before adapter implementation, including required vs optional fields
- Test/doc/deployment updates included in the same work

### Must NOT Have (Guardrails)
- No DB column rename from `minio_*` in this phase
- No historical data migration bundled into this work
- No unrelated storage feature additions (CDN, lifecycle, multi-region, background replication)
- No provider-specific `if provider == ...` spread across business services/routes/tasks
- No assumption that COS bucket creation should behave identically to local MinIO bootstrap
- No hidden COS defaults for region/domain/bucket composition; each must be explicitly documented or validated
- No real COS secrets copied into tracked env examples, docs, plan artifacts, or committed config

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — all verification must be agent-executed.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after
- **Framework**: pytest (plus targeted app verification commands already used in repo)
- **If TDD**: Not required for this plan; implementation may still choose failing tests first where practical

### QA Policy
Every task includes agent-executed QA scenarios with evidence files under `.sisyphus/evidence/`.

- **Backend/API**: Use Bash with app test commands and HTTP requests where practical
- **Library/Module**: Use pytest or Python invocation to validate adapter behavior
- **Config/Docs**: Use grep/read/compose config validation to confirm correct provider wiring

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — inventory + contract foundation):
├── Task 1: Storage touchpoint inventory and contract lock [quick]
├── Task 2: Provider config contract and env matrix [quick]
├── Task 3: URL/helper behavior inventory and guardrails [quick]
├── Task 4: Test coverage map for storage consumers [quick]
└── Task 5: Deployment/doc impact inventory [writing]

Wave 2 (After Wave 1 — adapter foundation, max parallel):
├── Task 6: Unified storage adapter interface and factory [deep]
├── Task 7: MinIO adapter migration behind interface [unspecified-high]
├── Task 8: COS adapter design and config mapping [deep]
├── Task 9: Shared error/stream/result contract [quick]
└── Task 10: Bucket/bootstrap policy split by provider [quick]

Wave 3 (After Wave 2 — consumer refactors, max parallel):
├── Task 11: VFS service refactor [unspecified-high]
├── Task 12: Script service + script read/download refactor [unspecified-high]
├── Task 13: Asset/script-structure/canvas-export reads refactor [unspecified-high]
├── Task 14: Gemini media provider refactor [quick]
└── Task 15: URL parsing/public URL compatibility decisions in consumers [deep]

Wave 4 (After Wave 3 — verification + docs):
├── Task 16: MinIO regression tests and fixture updates [unspecified-high]
├── Task 17: COS adapter tests and provider-switch tests [unspecified-high]
├── Task 18: Env templates + compose/deploy docs update [writing]
└── Task 19: Rollout/operations guidance and non-goal documentation [writing]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
```

### Dependency Matrix

- **1**: — — 6, 7, 8, 11, 12, 13, 14
- **2**: — — 6, 8, 17, 18
- **3**: — — 8, 10, 15, 18
- **4**: — — 16, 17
- **5**: — — 18, 19
- **6**: 1, 2 — 7, 8, 9, 11, 12, 13, 14, 15
- **7**: 1, 6 — 11, 12, 13, 14, 16
- **8**: 1, 2, 3, 6 — 10, 15, 17, 18, 19
- **9**: 6 — 11, 12, 13, 14, 17
- **10**: 3, 8 — 18, 19
- **11**: 6, 7, 9 — 16, 17
- **12**: 6, 7, 9 — 16, 17
- **13**: 6, 7, 9 — 16, 17
- **14**: 6, 7, 9 — 16, 17
- **15**: 3, 6, 8 — 17, 18, 19
- **16**: 4, 7, 11, 12, 13, 14 — F1-F4
- **17**: 2, 4, 8, 9, 11, 12, 13, 14, 15 — F1-F4
- **18**: 2, 3, 5, 8, 10, 15 — F1-F4
- **19**: 5, 8, 10, 15 — F1-F4

### Agent Dispatch Summary

- **1**: **5** — T1-T4 → `quick`, T5 → `writing`
- **2**: **5** — T6 → `deep`, T7 → `unspecified-high`, T8 → `deep`, T9-T10 → `quick`
- **3**: **5** — T11-T13 → `unspecified-high`, T14 → `quick`, T15 → `deep`
- **4**: **4** — T16-T17 → `unspecified-high`, T18-T19 → `writing`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Storage touchpoint inventory and contract lock

  **What to do**:
  - Enumerate every current backend call site that directly depends on `get_minio_client()` or MinIO URL helpers.
  - Freeze the exact capability contract needed by existing consumers: upload bytes/stream, read stream/bytes, delete object, optional ensure-bucket/bootstrap behavior, and public/signed URL generation where currently used.
  - Produce a file-to-capability matrix so the executor does not miss any storage entrypoint during refactor.

  **Must NOT do**:
  - Do not redesign business workflows.
  - Do not introduce new storage features beyond the current capability set.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: repository inventory and contract extraction from existing code.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `writing-plans`: planning format already provided here.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5)
  - **Blocks**: 6, 7, 8, 11, 12, 13, 14
  - **Blocked By**: None

  **References**:
  - `fastapi_backend/app/storage/minio_client.py` - current storage entrypoint and helper surface that defines the migration boundary.
  - `fastapi_backend/app/services/storage/vfs_service.py` - highest-density storage consumer, including upload/read/delete/thumbnail behavior.
  - `fastapi_backend/app/services/script_service.py` - second major storage consumer with script + panorama object handling.
  - `fastapi_backend/app/api/v1/scripts.py` - route-level streaming downloads that rely on storage object reads.
  - `fastapi_backend/app/api/v1/assets.py` - asset download and thumbnail retrieval path.
  - `fastapi_backend/app/services/script_structure_service.py` - non-route consumer reading script content from object storage.
  - `fastapi_backend/app/tasks/handlers/canvas_export.py` - task/worker path that reads stored objects.
  - `fastapi_backend/app/ai_gateway/providers/media/gemini.py` - generated-media upload path that depends on public URL creation.

  **Acceptance Criteria**:
  - [ ] A complete touchpoint matrix exists in the implementation notes/plan execution artifacts.
  - [ ] No direct MinIO call site remains unaccounted for before adapter work begins.

  **QA Scenarios**:
  ```
  Scenario: Full inventory happy path
    Tool: Bash (search/read)
    Preconditions: Clean working tree with current repo checked out
    Steps:
      1. Search backend for `get_minio_client`, `build_minio_url`, `parse_minio_url`, `download_minio_bytes`.
      2. Record each matching production file and its exact storage operation type.
      3. Cross-check against the contract list to ensure every operation maps to an adapter method.
    Expected Result: Every production call site is mapped to a contract method with no uncategorized storage usage.
    Failure Indicators: A later refactor finds an unmapped MinIO call or helper not listed here.
    Evidence: .sisyphus/evidence/task-1-storage-touchpoints.txt

  Scenario: Negative inventory check
    Tool: Bash (search/read)
    Preconditions: Same repo state
    Steps:
      1. Search for raw `Minio(` constructor usage and raw `put_object/get_object/remove_object` outside the approved adapter area.
      2. Confirm whether any direct SDK usage exists outside the known files.
    Expected Result: No surprise direct SDK usage remains outside the documented migration scope.
    Evidence: .sisyphus/evidence/task-1-storage-touchpoints-negative.txt
  ```

- [x] 2. Provider config contract and env matrix

  **What to do**:
  - Define the provider selection setting and provider-specific env schema.
  - Separate shared settings from provider-only settings so MinIO and COS validation remains explicit.
  - Lock the phase-1 COS configuration baseline:
    - required: `OBJECT_STORAGE_PROVIDER=cos`, credential pair, region, bucket identity
    - required if URLs are externally returned by current flows: domain/public-base-url strategy
    - optional but explicit: scheme/secure flag, signed URL TTL, custom domain toggle, timeout/retry knobs
    - default decision: accept the final full COS bucket name directly when available; only support bucket+APPID composition if explicitly needed and validated
  - Specify which env templates, compose files, and deploy docs must expose the new configuration.

  **Must NOT do**:
  - Do not overload old MinIO-only variables to mean different things under COS without documentation.
  - Do not require secrets in example files.
  - Do not copy real credentials from ignored/local reference material into tracked files.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: settings contract and env matrix definition is narrow and mechanical.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 6, 8, 17, 18
  - **Blocked By**: None

  **References**:
  - `fastapi_backend/app/config.py` - current backend settings model and MinIO env names.
  - `docker/compose.app.yml` - application container env propagation points.
  - `docker/docker-compose.yml` - local infra defaults and MinIO-specific bootstrap wiring.
  - `docker/docker-compose.deploy.yml` - deploy-time env propagation and storage-related defaults.

  **Acceptance Criteria**:
  - [ ] Provider selection variable and provider-specific env matrix are fully specified.
  - [ ] MinIO and COS required settings are distinguishable and documented.
  - [ ] COS required settings are split into credential, bucket, region, and URL/domain concerns with no ambiguity.
  - [ ] The plan states that phase 1 prefers configuring the final full COS bucket name directly; any bucket+APPID composition path is explicit and validated.
  - [ ] Example env/documentation files use placeholders only and never real secrets.

  **QA Scenarios**:
  ```
  Scenario: Config matrix happy path
    Tool: Bash (search/read)
    Preconditions: Current settings and env templates are readable
    Steps:
      1. List all current MinIO settings from `fastapi_backend/app/config.py`.
      2. Draft the future shared/provider-specific matrix, including COS required vs optional settings.
      3. Verify each matrix item maps to an actual config/deploy location to update.
    Expected Result: A complete config matrix exists with no orphan setting.
    Evidence: .sisyphus/evidence/task-2-config-matrix.txt

  Scenario: Negative config ambiguity check
    Tool: Bash (search/read)
    Preconditions: Same repo state
    Steps:
      1. Inspect current `.env`/compose examples for names that would become ambiguous under dual providers.
      2. Flag every ambiguous variable requiring deprecation or explicit provider scoping.
    Expected Result: Ambiguous env names are documented before implementation begins.
    Evidence: .sisyphus/evidence/task-2-config-matrix-negative.txt
  ```

- [x] 3. URL/helper behavior inventory and guardrails

  **What to do**:
  - Identify every path that depends on MinIO-specific URL construction or URL parsing.
  - Decide which helper behaviors belong in the provider adapter versus which should be removed from consumers.
  - Lock guardrails around COS domain/region/path-style differences so implementation does not fake MinIO semantics.

  **Must NOT do**:
  - Do not assume COS can reuse MinIO URL parsing unchanged.
  - Do not require public URL semantics where the current flow only needs authenticated SDK reads.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: focused behavior inventory with limited files.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 8, 10, 15, 18
  - **Blocked By**: None

  **References**:
  - `fastapi_backend/app/storage/minio_client.py` - defines `build_minio_url`, `parse_minio_url`, and `download_minio_bytes`.
  - `fastapi_backend/app/ai_gateway/providers/media/gemini.py` - depends on provider-generated URL return values.
  - `fastapi_backend/app/api/v1/scripts.py` - route reads currently use SDK object reads instead of URL parsing, providing a non-URL baseline.
  - `fastapi_backend/app/api/v1/assets.py` - thumbnail path shows where DB keys are preferred over URL-derived lookup.

  **Acceptance Criteria**:
  - [ ] All MinIO-specific URL helper dependencies are explicitly documented.
  - [ ] The future provider contract states whether URL generation is public, signed, or optional per flow.

  **QA Scenarios**:
  ```
  Scenario: URL dependency happy path
    Tool: Bash (search/read)
    Preconditions: Source tree available
    Steps:
      1. Search for `build_minio_url`, `parse_minio_url`, and `download_minio_bytes` usages.
      2. Categorize each usage as public URL generation, internal read helper, or dead/minimizable behavior.
    Expected Result: Every URL helper has an explicit migration decision.
    Evidence: .sisyphus/evidence/task-3-url-helper-inventory.txt

  Scenario: Negative provider-semantics check
    Tool: Bash (search/read)
    Preconditions: Same repo state
    Steps:
      1. Compare current helper assumptions against COS constraints documented in planning research.
      2. Flag every assumption that cannot carry over safely.
    Expected Result: No MinIO-only URL assumption is left implicit.
    Evidence: .sisyphus/evidence/task-3-url-helper-negative.txt
  ```

- [x] 4. Test coverage map for storage consumers

  **What to do**:
  - Map existing automated coverage that exercises storage-backed flows.
  - Identify which tests can remain provider-agnostic and which need provider-specific fixtures.
  - Define the minimum regression set for MinIO parity and the minimum positive-path set for COS.

  **Must NOT do**:
  - Do not add broad unrelated test suites.
  - Do not assume current MinIO mocks prove COS behavior.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: focused test inventory and gap mapping.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 16, 17
  - **Blocked By**: None

  **References**:
  - `fastapi_backend/tests/routes/test_scripts.py` - current example of MinIO client mocking and script flow coverage.
  - `fastapi_backend/tests/` - broader test tree to search for storage-related route/service/provider coverage.
  - `fastapi_backend/app/services/storage/vfs_service.py` and `fastapi_backend/app/services/script_service.py` - core behaviors needing regression protection.

  **Acceptance Criteria**:
  - [ ] A storage test map exists with current coverage, gaps, and target provider coverage split.
  - [ ] Required regression suite for MinIO and target suite for COS are explicitly named.

  **QA Scenarios**:
  ```
  Scenario: Test map happy path
    Tool: Bash (search/read)
    Preconditions: Test tree available
    Steps:
      1. Search tests for storage, MinIO, script upload/download, VFS, and Gemini media references.
      2. Map each test to the consumer/module it protects.
      3. Mark missing modules lacking direct regression coverage.
    Expected Result: A gap-aware coverage map exists for all storage consumers.
    Evidence: .sisyphus/evidence/task-4-storage-test-map.txt

  Scenario: Negative false-confidence check
    Tool: Bash (search/read)
    Preconditions: Same repo state
    Steps:
      1. Review current MinIO mocks to see whether they only validate interface shape.
      2. Flag behaviors that still need provider-specific assertions for COS.
    Expected Result: COS-specific risk areas are listed instead of being assumed covered.
    Evidence: .sisyphus/evidence/task-4-storage-test-map-negative.txt
  ```

- [x] 5. Deployment/doc impact inventory

  **What to do**:
  - Inventory README, docker docs, and deploy docs that mention MinIO assumptions.
  - Define the documentation delta required to support selectable providers without confusing local development.
  - Specify rollout notes and non-goal statements the final docs must include.

  **Must NOT do**:
  - Do not rewrite unrelated infrastructure docs.
  - Do not promise automated COS provisioning unless implementation actually provides it.

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: documentation inventory and rollout wording.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 18, 19
  - **Blocked By**: None

  **References**:
  - `README.md` - top-level local-development and infra assumptions currently reference MinIO.
  - `docker/README.md` - storage env variable and bootstrap notes.
  - `docker/docker-compose.yml` and `docker/docker-compose.deploy.yml` - deployment assumptions that docs must match.
  - `docs/` references mentioning MinIO bucket/key semantics - ensure docs stay accurate after provider abstraction.

  **Acceptance Criteria**:
  - [ ] Every user-facing MinIO assumption has a corresponding documentation update target.
  - [ ] The final doc plan distinguishes local MinIO dev from COS-backed deployment choices.

  **QA Scenarios**:
  ```

- [x] 6. Unified storage adapter interface and factory

  **What to do**:
  - Define the single abstraction layer that all business code will consume.
  - Introduce a provider factory/resolver selected only by configuration.
  - Ensure the contract covers current operations without leaking MinIO- or COS-specific naming into consumers.

  **Must NOT do**:
  - Do not allow consumers to instantiate provider SDKs directly.
  - Do not create a “god object” with methods not justified by current usage.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: contract design determines all downstream refactors and long-term maintainability.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential starter for Wave 2
  - **Blocks**: 7, 8, 9, 11, 12, 13, 14, 15
  - **Blocked By**: 1, 2

  **References**:
  - `fastapi_backend/app/storage/minio_client.py` - current implicit interface to preserve or replace.
  - `fastapi_backend/app/storage/__init__.py` - current indirection point suitable for factory exposure.
  - Inventory artifacts from Tasks 1-3 - required to keep the contract exact and minimal.

  **Acceptance Criteria**:
  - [ ] A single adapter interface/factory exists and is sufficient for all mapped call sites.
  - [ ] Provider selection is configuration-driven and not consumer-driven.

  **QA Scenarios**:
  ```
  Scenario: Interface sufficiency happy path
    Tool: Bash (code search + targeted tests)
    Preconditions: Adapter interface drafted
    Steps:
      1. Compare each mapped call site from Task 1 against the new adapter methods.
      2. Verify every existing operation can be expressed without provider-specific branching in consumers.
    Expected Result: All storage consumers can compile/refactor against the new contract alone.
    Evidence: .sisyphus/evidence/task-6-adapter-contract.txt

  Scenario: Negative interface leak check
    Tool: Bash (code search)
    Preconditions: Adapter interface drafted
    Steps:
      1. Search the new contract for provider-specific names like `minio` or `cos` in method signatures intended for general consumers.
      2. Confirm provider-specific concerns are kept in implementations/config only.
    Expected Result: No provider-specific leak remains in the shared interface.
    Evidence: .sisyphus/evidence/task-6-adapter-contract-negative.txt
  ```

- [x] 7. MinIO adapter migration behind interface

  **What to do**:
  - Re-home current MinIO behavior behind the shared storage contract.
  - Preserve existing upload/read/delete semantics and current MinIO-backed local-development behavior.
  - Keep MinIO-specific helpers internal to the MinIO adapter.

  **Must NOT do**:
  - Do not change current MinIO runtime behavior except where required to fit the shared contract.
  - Do not leave direct `Minio(` construction accessible from business modules.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: medium-sized refactor over existing production code with regression sensitivity.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with 8, 9, 10 after 6)
  - **Blocks**: 11, 12, 13, 14, 16
  - **Blocked By**: 1, 6

  **References**:
  - `fastapi_backend/app/storage/minio_client.py` - source behavior to preserve in adapter form.
  - `fastapi_backend/tests/routes/test_scripts.py` - existing MinIO mock semantics useful to preserve in tests.

  **Acceptance Criteria**:
  - [ ] All current MinIO-backed operations are available through the shared storage interface.
  - [ ] Existing MinIO behavior remains regression-testable through the adapter.

  **QA Scenarios**:
  ```
  Scenario: MinIO adapter parity happy path
    Tool: pytest / Bash
    Preconditions: Shared adapter introduced; MinIO implementation migrated
    Steps:
      1. Run targeted MinIO-backed tests for script upload/download and any adapter unit tests.
      2. Verify current mocked MinIO semantics still satisfy consumer expectations.
    Expected Result: Existing MinIO flows pass unchanged through the adapter.
    Evidence: .sisyphus/evidence/task-7-minio-adapter-regression.txt

  Scenario: Negative direct-SDK leakage check
    Tool: Bash (search)
    Preconditions: MinIO adapter refactor complete
    Steps:
      1. Search production code outside the MinIO adapter for `Minio(` and direct SDK methods.
      2. Confirm only adapter-layer files still reference MinIO SDK APIs.
    Expected Result: No business-layer direct MinIO SDK usage remains.
    Evidence: .sisyphus/evidence/task-7-minio-adapter-negative.txt
  ```

- [x] 8. COS adapter design and config mapping

  **What to do**:
  - Add a Tencent COS implementation of the shared contract using COS-native configuration and endpoint semantics.
  - Define how bucket name, APPID, region, domain/public URL strategy, credential configuration, and optional signed-URL behavior map into the adapter.
  - Contain COS-specific differences within the adapter and config validation layers.

  **Must NOT do**:
  - Do not fake MinIO endpoint semantics on top of COS if the provider does not support them.
  - Do not assume runtime bucket creation is identical to local MinIO behavior.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: provider-specific integration with external semantics and several design traps.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 10, 15, 17, 18, 19
  - **Blocked By**: 1, 2, 3, 6

  **References**:
  - COS research findings gathered earlier - source of provider constraints and required config behavior.
  - `fastapi_backend/app/config.py` - destination for COS provider settings.
  - `fastapi_backend/app/storage/minio_client.py` - contrast for behavior that must remain provider-internal.

  **Phase-1 COS Config Baseline**:
  - Required: provider selector, COS credential pair, COS region, COS bucket identity
  - Required when current feature returns externally consumable object URLs: COS public/base domain strategy
  - Optional but explicit: secure/scheme override, signed URL TTL, custom domain flag, timeout/retry knobs
  - Default decision: accept the full final bucket name as config when available (current evidence suggests this is already available)
  - Optional alternate path only if needed: accept bucket + appid inputs and normalize them in config validation; do not leave both implicit

  **Acceptance Criteria**:
  - [ ] COS adapter exposes the same shared contract as MinIO.
  - [ ] COS config needs are represented explicitly, including region/domain-related inputs where required.
  - [ ] COS-specific limitations are documented rather than hidden.
  - [ ] Config validation rejects incomplete COS setup before consumer code runs.
  - [ ] Adapter/config code treats credentials as runtime secrets only and never depends on tracked example values.

  **QA Scenarios**:
  ```
  Scenario: COS adapter positive-path design check
    Tool: pytest / Bash
    Preconditions: COS adapter wired behind factory
    Steps:
      1. Execute adapter-level tests or scripted calls that validate put/read/delete/url-generation behavior with COS configuration.
      2. Confirm the adapter returns results in shared-contract shape.
    Expected Result: COS path supports the scoped contract without consumer-specific branching.
    Evidence: .sisyphus/evidence/task-8-cos-adapter.txt

  Scenario: Negative config validation check
    Tool: pytest / Bash
    Preconditions: COS adapter/config validation in place
    Steps:
      1. Start with missing or malformed COS settings such as absent region or invalid bucket/domain input.
      2. Confirm startup/config validation fails with explicit errors.
    Expected Result: Misconfigured COS does not fail silently or at arbitrary call sites.
    Evidence: .sisyphus/evidence/task-8-cos-adapter-negative.txt
  ```

- [x] 9. Shared error/stream/result contract

  **What to do**:
  - Normalize the result and error shapes returned from provider implementations.
  - Ensure streaming reads, byte reads, metadata access, and missing-object behavior are consistent enough for existing consumers.
  - Define how provider exceptions map into app-layer errors.

  **Must NOT do**:
  - Do not expose raw provider exception types to business modules.
  - Do not invent metadata requirements not used by current consumers.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: narrow cross-cutting contract normalization.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 11, 12, 13, 14, 17
  - **Blocked By**: 6

  **References**:
  - `fastapi_backend/app/api/v1/scripts.py` - streaming response expectations.
  - `fastapi_backend/app/api/v1/assets.py` - thumbnail and resource error behavior.
  - `fastapi_backend/app/services/storage/vfs_service.py` - byte-read and object-not-found expectations.

  **Acceptance Criteria**:
  - [ ] Provider results and exceptions are normalized for all currently-used operations.
  - [ ] Consumers do not need provider-specific exception handling.

  **QA Scenarios**:
  ```
  Scenario: Shared result contract happy path
    Tool: pytest
    Preconditions: Shared contract implemented
    Steps:
      1. Run tests that read bytes/streams from both provider implementations using the same consumer-facing API.
      2. Confirm the returned data and metadata shape match consumer expectations.
    Expected Result: Consumers can operate identically over either provider path.
    Evidence: .sisyphus/evidence/task-9-result-contract.txt

  Scenario: Negative missing-object check
    Tool: pytest
    Preconditions: Shared contract implemented
    Steps:
      1. Request a nonexistent object through each provider implementation.
      2. Confirm both normalize to the same app-level missing/error behavior.
    Expected Result: Missing-object semantics are provider-independent.
    Evidence: .sisyphus/evidence/task-9-result-contract-negative.txt
  ```

- [x] 10. Bucket/bootstrap policy split by provider

  **What to do**:
  - Define and implement provider-aware behavior for bucket existence checks and provisioning.
  - Preserve local MinIO bootstrap behavior where needed.
  - Prevent unsafe assumptions that COS buckets will be auto-created like local MinIO buckets.

  **Must NOT do**:
  - Do not silently auto-provision COS resources unless explicitly supported and documented.
  - Do not break local MinIO developer convenience without replacement guidance.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: behavior split is narrow but important.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 18, 19
  - **Blocked By**: 3, 8

  **References**:
  - `fastapi_backend/app/services/storage/vfs_service.py` - current `_ensure_bucket` behavior.
  - `fastapi_backend/app/services/script_service.py` - current `_ensure_bucket` behavior.
  - `docker/minio/init/create-buckets.sh` - current local bucket bootstrap expectations.
  - `docker/docker-compose.yml` - MinIO bootstrap flow that should remain local-dev compatible.

  **Acceptance Criteria**:
  - [ ] Provider-specific bucket/bootstrap behavior is explicit and documented.
  - [ ] Local MinIO dev remains workable; COS path does not depend on local auto-create semantics.

  **QA Scenarios**:
  ```
  Scenario: MinIO bootstrap happy path
    Tool: Bash / pytest
    Preconditions: MinIO path enabled
    Steps:
      1. Exercise a MinIO-backed upload flow requiring bucket existence.
      2. Confirm the bucket/bootstrap behavior still supports local workflows.
    Expected Result: Local MinIO flow remains functional.
    Evidence: .sisyphus/evidence/task-10-bootstrap-minio.txt

  Scenario: COS bootstrap negative-path check
    Tool: Bash / pytest
    Preconditions: COS path enabled with missing/unavailable bucket
    Steps:
      1. Exercise a COS-backed upload against an unavailable bucket configuration.
      2. Confirm the system returns an explicit provider/setup error rather than silently trying to mimic MinIO auto-create.
    Expected Result: COS setup failures are explicit and documented.
    Evidence: .sisyphus/evidence/task-10-bootstrap-cos-negative.txt
  ```

- [x] 11. VFS service refactor

  **What to do**:
  - Refactor VFS storage operations to use the shared storage adapter.
  - Preserve file upload, file read, delete, rename/update, and thumbnail behavior.
  - Keep DB writes to existing `minio_*` fields unchanged in schema while sourcing values from the provider-agnostic adapter.

  **Must NOT do**:
  - Do not rename DB columns in this phase.
  - Do not change VFS permission/business rules.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: large production service with multiple storage paths and cleanup logic.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with 12, 13, 14, 15)
  - **Blocks**: 16, 17
  - **Blocked By**: 6, 7, 9

  **References**:
  - `fastapi_backend/app/services/storage/vfs_service.py` - full VFS behavior to preserve.
  - `fastapi_backend/app/models.py` `FileNode` fields - storage pointer persistence shape to preserve.

  **Acceptance Criteria**:
  - [ ] VFS service no longer depends on MinIO-specific client/helpers directly.
  - [ ] Upload/read/delete/thumbnail flows still use existing DB schema and behavior.

  **QA Scenarios**:
  ```
  Scenario: VFS upload/read happy path
    Tool: pytest / Bash
    Preconditions: Refactored VFS service wired to provider abstraction
    Steps:
      1. Upload a sample image/file through the VFS-backed path.
      2. Read back file bytes and thumbnail bytes via existing service/API flows.
      3. Assert DB pointer fields are populated and content types remain correct.
    Expected Result: VFS behavior is unchanged from the consumer perspective.
    Evidence: .sisyphus/evidence/task-11-vfs-happy.txt

  Scenario: VFS delete cleanup negative-path check
    Tool: pytest
    Preconditions: Refactored VFS service with stored file + thumbnail
    Steps:
      1. Delete a node/object through the service.
      2. Confirm primary and thumbnail objects are cleaned up and missing-object cleanup errors are normalized.
    Expected Result: Cleanup behavior remains safe and provider-agnostic.
    Evidence: .sisyphus/evidence/task-11-vfs-negative.txt
  ```

- [x] 12. Script service and script read/download refactor

  **What to do**:
  - Refactor script creation storage writes and route-level script/panorama download reads onto the shared adapter.
  - Preserve panorama thumbnail generation flow and current response semantics.
  - Keep script DB pointer fields unchanged.

  **Must NOT do**:
  - Do not change script creation business rules.
  - Do not alter response payload structure or content-disposition behavior beyond storage backend substitution.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: combined service + route refactor with multiple binary-content paths.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 16, 17
  - **Blocked By**: 6, 7, 9

  **References**:
  - `fastapi_backend/app/services/script_service.py` - current write/delete behavior.
  - `fastapi_backend/app/api/v1/scripts.py` - download and panorama streaming behavior.
  - `fastapi_backend/tests/routes/test_scripts.py` - existing regression baseline for these flows.

  **Acceptance Criteria**:
  - [ ] Script uploads and reads no longer depend directly on MinIO client usage.
  - [ ] Download/panorama/thumbnail routes preserve current observable behavior.

  **QA Scenarios**:
  ```
  Scenario: Script flow happy path
    Tool: pytest / Bash
    Preconditions: Refactored script service/routes
    Steps:
      1. Create a script with panorama input.
      2. Download the script, panorama, and panorama thumbnail through existing endpoints.
      3. Verify response status, content type, and content-disposition remain correct.
    Expected Result: Script-related file flows behave the same under the abstraction.
    Evidence: .sisyphus/evidence/task-12-script-happy.txt

  Scenario: Script missing-object negative-path check
    Tool: pytest
    Preconditions: Refactored script routes
    Steps:
      1. Simulate missing storage object for script or panorama.
      2. Confirm the route returns the expected app-level storage/read failure instead of provider-native exceptions.
    Expected Result: Error behavior is normalized and route-safe.
    Evidence: .sisyphus/evidence/task-12-script-negative.txt
  ```
  Scenario: Doc inventory happy path
    Tool: Bash (search/read)
    Preconditions: Documentation files available
    Steps:
      1. Search docs for `MinIO`, bucket env names, and local object storage instructions.
      2. Map each occurrence to one of: keep, update, or clarify dual-provider behavior.
    Expected Result: No public-facing MinIO-only instruction is left untracked.
    Evidence: .sisyphus/evidence/task-5-doc-impact-inventory.txt

  Scenario: Negative rollout-scope check
    Tool: Bash (search/read)
    Preconditions: Same repo state
    Steps:
      1. Inspect docs for claims that would incorrectly imply data migration or MinIO removal.
      2. List statements that must be corrected or guarded.
    Expected Result: Scope creep in docs is prevented before updates start.
    Evidence: .sisyphus/evidence/task-5-doc-impact-negative.txt
  ```

- [x] 13. Asset, script-structure, and canvas-export read-path refactor

  **What to do**:
  - Refactor remaining storage-read consumers onto the shared adapter.
  - Preserve streaming/object-read behavior in assets, script structure parsing, and canvas export task flows.
  - Ensure these consumers no longer know which provider is active.

  **Must NOT do**:
  - Do not alter asset permission behavior or resource lookup logic beyond storage substitution.
  - Do not change worker/task orchestration behavior in canvas export.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: multiple production consumers across routes/services/tasks.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 16, 17
  - **Blocked By**: 6, 7, 9

  **References**:
  - `fastapi_backend/app/api/v1/assets.py` - asset resource and thumbnail read path.
  - `fastapi_backend/app/services/script_structure_service.py` - script content read path.
  - `fastapi_backend/app/tasks/handlers/canvas_export.py` - worker-side object read path.

  **Acceptance Criteria**:
  - [ ] All remaining read-path consumers use the shared adapter only.
  - [ ] Observable route/task behavior remains unchanged.

  **QA Scenarios**:
  ```
  Scenario: Multi-consumer happy path
    Tool: pytest / Bash
    Preconditions: Refactored consumers wired to adapter
    Steps:
      1. Exercise an asset resource download path.
      2. Exercise script structure parsing that loads script content from storage.
      3. Exercise a canvas export path that reads stored file content.
    Expected Result: All consumers successfully read storage content through the abstraction.
    Evidence: .sisyphus/evidence/task-13-consumer-happy.txt

  Scenario: Missing-object negative-path check
    Tool: pytest
    Preconditions: Same consumers refactored
    Steps:
      1. Simulate missing object/thumbnail in each path.
      2. Confirm each path returns or logs normalized app-level failures without provider-native leakage.
    Expected Result: Error behavior is consistent across consumers.
    Evidence: .sisyphus/evidence/task-13-consumer-negative.txt
  ```

- [x] 14. Gemini media provider refactor

  **What to do**:
  - Refactor generated-media upload logic to use the shared storage adapter.
  - Preserve current return semantics for generated image URL/metadata.
  - Ensure provider-specific URL generation happens inside the adapter layer.

  **Must NOT do**:
  - Do not change media-provider business behavior unrelated to storage.
  - Do not let Gemini provider construct MinIO/COS URLs directly after refactor.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: small isolated consumer once the adapter exists.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 16, 17
  - **Blocked By**: 6, 7, 9

  **References**:
  - `fastapi_backend/app/ai_gateway/providers/media/gemini.py` - current direct upload + URL construction path.
  - `fastapi_backend/app/storage/minio_client.py` - current helper source being removed from this consumer.

  **Acceptance Criteria**:
  - [ ] Gemini provider no longer uses MinIO-specific client or URL helpers directly.
  - [ ] Returned media URL/metadata behavior remains valid for the chosen provider.

  **QA Scenarios**:
  ```
  Scenario: Generated-media happy path
    Tool: pytest / Bash
    Preconditions: Refactored Gemini provider with storage adapter
    Steps:
      1. Simulate/generated invoke media output storage path.
      2. Confirm uploaded object reference and returned URL/metadata are produced through adapter APIs.
    Expected Result: Generated media is stored and surfaced without provider-specific logic in Gemini code.
    Evidence: .sisyphus/evidence/task-14-gemini-happy.txt

  Scenario: Upload-failure negative-path check
    Tool: pytest
    Preconditions: Same refactor
    Steps:
      1. Force provider upload failure.
      2. Confirm Gemini provider returns an app-level storage/upload error rather than provider-native exception text.
    Expected Result: Failure is normalized and debuggable.
    Evidence: .sisyphus/evidence/task-14-gemini-negative.txt
  ```

- [x] 15. URL parsing/public URL compatibility decisions in consumers

  **What to do**:
  - Remove or isolate remaining consumer dependence on MinIO-style URL parsing.
  - Decide where the system truly requires a URL versus where bucket/key or stream reads are sufficient.
  - Document compatibility debt retained in phase 1, especially around existing DB field naming and externally visible URLs.

  **Must NOT do**:
  - Do not preserve broken path-style assumptions for COS.
  - Do not invent new external URL contracts beyond current needs.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: subtle compatibility decisions with external-facing behavior implications.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 17, 18, 19
  - **Blocked By**: 3, 6, 8

  **References**:
  - `fastapi_backend/app/storage/minio_client.py` - current URL parsing/building behavior to retire or internalize.
  - `fastapi_backend/app/ai_gateway/providers/media/gemini.py` - current URL-emitting consumer.
  - Any docs or API responses currently exposing object URLs - to ensure compatibility decisions are explicit.

  **Acceptance Criteria**:
  - [ ] Every remaining URL-dependent behavior has an explicit provider-compatible implementation decision.
  - [ ] No consumer depends on MinIO-only path parsing after refactor.

  **QA Scenarios**:
  ```
  Scenario: URL-need happy path
    Tool: Bash / pytest
    Preconditions: Consumer URL behaviors refactored
    Steps:
      1. Identify each remaining outward-facing URL returned by storage-backed flows.
      2. Validate it is generated by the provider layer and is appropriate for the chosen backend.
    Expected Result: All remaining URLs are intentional and provider-compatible.
    Evidence: .sisyphus/evidence/task-15-url-compatibility.txt

  Scenario: Negative legacy-helper check
    Tool: Bash (search)
    Preconditions: Refactor complete
    Steps:
      1. Search for `parse_minio_url` and any MinIO-style URL parsing usage outside provider internals.
      2. Confirm no consumer still depends on MinIO-only URL structure.
    Expected Result: Legacy MinIO URL parsing is fully isolated or removed.
    Evidence: .sisyphus/evidence/task-15-url-compatibility-negative.txt
  ```

- [x] 16. MinIO regression tests and fixture updates

  **What to do**:
  - Update existing tests so MinIO remains the regression baseline under the new adapter.
  - Add or adjust fixtures/mocks to target the shared storage contract instead of raw MinIO wiring where appropriate.
  - Confirm current MinIO-backed local/test workflows still pass.

  **Must NOT do**:
  - Do not delete useful MinIO regression coverage because COS is added.
  - Do not couple tests tightly to one adapter implementation when the goal is shared-contract behavior.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: important regression coverage work across storage-related tests.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: 4, 7, 11, 12, 13, 14

  **References**:
  - `fastapi_backend/tests/routes/test_scripts.py` - existing MinIO mock pattern.
  - Additional storage-related tests under `fastapi_backend/tests/` - to align with the new abstraction.

  **Acceptance Criteria**:
  - [ ] MinIO regression coverage passes through the new adapter-based architecture.
  - [ ] Shared-contract tests protect business consumers from MinIO-specific implementation drift.

  **QA Scenarios**:
  ```
  Scenario: MinIO regression happy path
    Tool: pytest
    Preconditions: Adapter refactor complete
    Steps:
      1. Run targeted MinIO regression tests for scripts/VFS/storage consumers.
      2. Confirm all previously supported MinIO flows still pass.
    Expected Result: MinIO remains a supported provider with passing regression evidence.
    Evidence: .sisyphus/evidence/task-16-minio-regression.txt

  Scenario: Negative regression-gap check
    Tool: Bash / pytest
    Preconditions: Same test suite
    Steps:
      1. Compare Task 4 coverage map against actual updated tests.
      2. Confirm each critical MinIO-backed consumer has at least one regression test path.
    Expected Result: No mapped critical consumer is left unprotected.
    Evidence: .sisyphus/evidence/task-16-minio-regression-negative.txt
  ```

- [x] 17. COS adapter tests and provider-switch tests

  **What to do**:
  - Add adapter-level and configuration-level tests covering COS positive paths and provider selection behavior.
  - Verify consumers operate through the shared contract when the provider is switched to COS.
  - Add misconfiguration tests for missing/invalid COS settings.

  **Must NOT do**:
  - Do not require full production COS deployment inside every test if adapter-level or mocked integration tests suffice.
  - Do not call COS “supported” without positive-path test evidence.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: new-provider confidence depends on solid tests.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: 2, 4, 8, 9, 11, 12, 13, 14, 15

  **References**:
  - COS config and adapter work from Tasks 2 and 8.
  - Consumer refactors from Tasks 11-15.

  **Acceptance Criteria**:
  - [ ] Provider switch to COS is covered by automated tests.
  - [ ] COS misconfiguration errors are covered by automated tests.
  - [ ] At least one end-to-end or near-end-to-end positive-path test exercises COS-backed consumer behavior.

  **QA Scenarios**:
  ```
  Scenario: COS provider-switch happy path
    Tool: pytest / Bash
    Preconditions: COS provider path configured for tests
    Steps:
      1. Enable COS provider via test config.
      2. Run adapter and consumer tests that upload/read/delete using the shared contract.
      3. Confirm expected objects/URLs/results are produced through the COS path.
    Expected Result: COS works as a selectable provider for the scoped flows.
    Evidence: .sisyphus/evidence/task-17-cos-provider-tests.txt

  Scenario: COS misconfiguration negative-path
    Tool: pytest
    Preconditions: COS config validation exists
    Steps:
      1. Provide invalid or incomplete COS settings.
      2. Assert startup/config resolution or first adapter resolution fails with explicit validation errors.
    Expected Result: Broken COS configuration is caught deterministically.
    Evidence: .sisyphus/evidence/task-17-cos-provider-tests-negative.txt
  ```

- [x] 18. Env templates and compose/deploy docs update

  **What to do**:
  - Update env examples, compose comments/templates, and deployment docs to document provider selection and required provider-specific settings.
  - Keep local MinIO development guidance intact while documenting COS-backed deployment configuration.
  - Clarify bucket/bootstrap expectations by provider.
  - Ensure all examples use placeholders for COS secrets and, where helpful, document full-bucket-name format without embedding real values.

  **Must NOT do**:
  - Do not document unsupported automated COS provisioning.
  - Do not remove MinIO local-dev instructions if they still represent the main local workflow.

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: documentation/config guidance task.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: 2, 3, 5, 8, 10, 15

  **References**:
  - `README.md` - top-level setup instructions.
  - `docker/README.md` - infra env guidance.
  - `docker/docker-compose.yml`, `docker/compose.app.yml`, `docker/docker-compose.deploy.yml` - config propagation docs/comments.

  **Acceptance Criteria**:
  - [ ] All public setup docs describe provider selection accurately.
  - [ ] Env examples cover MinIO and COS requirements without leaking secrets.
  - [ ] Documentation explicitly shows whether COS bucket config expects the final full bucket name.

  **QA Scenarios**:
  ```
  Scenario: Docs/config happy path
    Tool: Bash (read/search)
    Preconditions: Documentation updates complete
    Steps:
      1. Read updated README and docker docs.
      2. Confirm there is one coherent MinIO path and one coherent COS path with provider selection documented.
    Expected Result: Operator guidance is internally consistent.
    Evidence: .sisyphus/evidence/task-18-docs-config.txt

  Scenario: Negative stale-doc check
    Tool: Bash (search)
    Preconditions: Same updated docs
    Steps:
      1. Search for stale MinIO-only statements that contradict dual-provider support.
      2. Confirm all contradictory instructions are removed or clarified.
    Expected Result: No stale doc instruction remains to mislead rollout.
    Evidence: .sisyphus/evidence/task-18-docs-config-negative.txt
  ```

- [x] 19. Rollout, operations guidance, and non-goal documentation

  **What to do**:
  - Document rollout guidance, fallback expectations, and explicit non-goals for phase 1.
  - State clearly that existing `minio_*` DB field names remain compatibility debt, not a blocker.
  - Document that historical data migration is separate work if ever needed.
  - Add an operational security note that real COS credentials stay only in ignored/private runtime material, not tracked docs or examples.

  **Must NOT do**:
  - Do not blur phase 1 support with a full storage replatform.
  - Do not imply simultaneous dual-write or automatic object migration if not implemented.

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: operational expectation-setting and scope control.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: 5, 8, 10, 15

  **References**:
  - Planning scope and guardrails in this file.
  - Deployment/doc inventory from Task 5.
  - COS/MinIO provider behavior decisions from Tasks 8, 10, and 15.

  **Acceptance Criteria**:
  - [ ] Rollout guidance states what phase 1 does and does not solve.
  - [ ] Operators know how to revert to MinIO by configuration if COS rollout is not accepted.

  **QA Scenarios**:
  ```
  Scenario: Rollout guidance happy path
    Tool: Bash (read/search)
    Preconditions: Operational docs updated
    Steps:
      1. Read rollout guidance end to end.
      2. Confirm it explains enablement, fallback, and explicit exclusions.
    Expected Result: Operators can understand adoption boundaries without guessing.
    Evidence: .sisyphus/evidence/task-19-rollout-guidance.txt

  Scenario: Negative scope-creep check
    Tool: Bash (read/search)
    Preconditions: Same updated docs
    Steps:
      1. Search rollout docs for claims about DB renames, auto migration, dual-write, or unrelated storage capabilities.
      2. Confirm such claims are absent unless explicitly implemented.
    Expected Result: Phase-1 scope remains tightly controlled.
    Evidence: .sisyphus/evidence/task-19-rollout-guidance-negative.txt
  ```

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle` — APPROVE (all 6 claims verified with source evidence)

- [x] F2. **Code Quality Review** — `unspecified-high` — APPROVE (7 non-blocking warnings)
  Run backend type/lint/test commands used by the repo, review changed files for provider branching leakage, dead code, MinIO-only assumptions left in business layers, and undocumented config changes.

- [x] F3. **Real Manual QA** — `unspecified-high` — APPROVE (8/9 scenarios pass)
  Execute the documented happy-path and negative-path scenarios for MinIO and COS configurations, including upload, download/read, thumbnail/media flows, and provider misconfiguration handling. Save evidence to `.sisyphus/evidence/final-qa/`.

- [x] F4. **Scope Fidelity Check** — `deep` — APPROVE (all 5 guardrails verified)
  Confirm implementation stayed within abstraction/config/tests/docs scope, did not rename DB fields, did not include historical data migration, and did not add unrelated storage capabilities.

---

## Commit Strategy

- **1**: `refactor(storage): introduce provider abstraction for object storage`
- **2**: `feat(storage): add tencent cos provider support`
- **3**: `test(storage): cover provider parity and regression paths`
- **4**: `docs(storage): document provider configuration and rollout`

---

## Success Criteria

### Verification Commands
```bash
pytest fastapi_backend/tests/routes/test_scripts.py  # Expected: pass
pytest fastapi_backend/tests -k storage  # Expected: relevant storage/provider tests pass
```

### Final Checklist
- [ ] All current MinIO-backed flows still work through the abstraction
- [ ] COS-backed flows work for the scoped storage operations
- [ ] Provider chosen only by configuration
- [ ] DB schema unchanged
- [ ] Docs/config/deployment guidance updated
