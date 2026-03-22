# Global User Credits Experience

## TL;DR

> **Quick Summary**: Build a unified credits experience by showing the current user's balance globally, exposing per-call credit cost on every resource-consuming AI action, and making credit consumption traceable for both users and admins through reusable transaction/history flows.
>
> **Deliverables**:
> - Global balance display in the main AI Studio layout
> - Cost labeling/previews on all resource-consuming AI operations
> - User-facing credit transaction history entry and view
> - Admin-visible credit history continuity with richer traceability
> - Automated tests added after implementation plus agent-executed QA
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Backend traceability contract → global balance data flow → AI operation UI integrations → transaction history UX → final verification

---

## Context

### Original Request
全局展示用户积分余额；所有会消耗资源的 AI 操作都要标明本次调用的积分消耗；全程记录用户积分消费记录以便追溯；用户和管理员都能查看消费记录。

### Interview Summary
**Key Discussions**:
- 全局余额必须可见，而不只是管理后台或局部页面可见。
- AI 操作覆盖范围已确认：所有会消耗资源的 AI 操作，而不只是生成类操作。
- 消费记录查看范围已确认：用户查看自己的流水，管理员查看全部用户流水与调整记录。
- 测试策略已确认：实现后补自动化测试（Frontend Jest/Playwright，Backend pytest），并且所有任务仍需 agent-executed QA。

**Research Findings**:
- 前端已有 `creditsMy()` 与 `creditsMyTransactions()`，但主布局 `AppLayout` 未接入全局余额。
- 前端已有 `CreditCostPreview.tsx`，可展示 `estimated_cost` 与 `user_balance`，但未形成统一接入。
- 后端已有 `/api/v1/credits/my`、`/api/v1/credits/my/transactions`、`/api/v1/ai/cost-estimate`、`credit_transactions`、`ai_usage_events`。
- AI 扣费点已分布于 `fastapi_backend/app/ai_gateway/service.py` 与 `fastapi_backend/app/services/agent_service.py`，覆盖文本、流式文本、图片/视频、异步媒体、Agent 调用。
- 测试基础设施已存在：前端 Jest + Playwright，后端 pytest；后端 credits/auth/audit 测试成熟，前端 credits UI 测试相对薄弱。

### Metis Review
**Identified Gaps** (addressed):
- 需要明确 guardrails，防止把充值/兑换/支付系统一起扩进本次工作范围。
- 需要显式要求复用现有 credits API、`CreditCostPreview`、`credit_transactions`、`ai_usage_events`，避免重复造轮子。
- 需要覆盖边界情况：余额不足、成本预估失败、退款/负向流水展示、连续调用带来的余额更新。
- 需要在计划里补足“哪些 AI 页面/操作必须接入成本展示”的核查任务，避免遗漏 batch / async / stream 场景。

---

## Work Objectives

### Core Objective
在不引入充值/支付等额外业务扩展的前提下，把现有积分数据层、扣费逻辑与交易流水能力整合成一套完整的用户体验：用户在 AI Studio 任意页都能看到自己的积分余额，在所有会消耗资源的 AI 操作前后都能看见本次积分消耗，并且用户与管理员都能追溯积分消费记录。

### Concrete Deliverables
- AI Studio 全局余额展示入口
- 覆盖所有资源消耗类 AI 操作的成本标注/预估 UI
- 用户可访问的积分流水视图
- 管理员积分流水可继续使用并增强追溯信息
- 后端 traceability contract（交易记录与 AI 使用事件的关联/查询能力）
- 自动化测试补充（frontend/backend/e2e）

### Definition of Done
- [ ] 登录后在 AI Studio 任意页面可看到当前用户积分余额
- [ ] 每个资源消耗类 AI 操作在执行前或执行入口处明确显示本次积分消耗
- [ ] 用户可查看自己的积分流水，管理员可查看并追溯用户流水与调整记录
- [ ] 至少一个消费成功场景与一个失败/退款场景在流水中可追溯
- [ ] 自动化测试通过，且 agent-executed QA 覆盖余额展示、扣费展示、流水追溯、余额不足/预估失败边界

### Must Have
- 复用现有 credits API、cost-estimate API、`CreditCostPreview` 组件、`credit_transactions` 与 `ai_usage_events`
- 前端对所有资源消耗类 AI 操作都显示本次成本
- 用户与管理员都可见消费记录（用户看自己，管理员看全部）
- 失败/退款场景保持可追溯

### Must NOT Have (Guardrails)
- 不实现充值、兑换、支付、套餐、导出报表、赠送积分、积分过期等新业务
- 不改写现有积分计价核心规则，除非为统一前端展示所必需
- 不新建并行的“第二套”积分流水系统，必须基于现有 `credit_transactions` / `ai_usage_events`
- 不破坏现有管理员积分调整能力
- 不把 work scope 扩展到与积分无关的 AI 模型配置、支付系统或通知系统

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after
- **Framework**: Frontend Jest + Playwright; Backend pytest
- **If TDD**: N/A for this plan (explicitly not selected)

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — navigate, interact, assert DOM, capture screenshots
- **API/Backend**: Use Bash (`curl`) — send authenticated requests, assert status/fields, capture response bodies
- **Library/Module**: Use Bash (test commands / script entry points) — assert outputs and exit codes

---

## Execution Strategy

### Parallel Execution Waves

> Maximize throughput by grouping independent tasks into parallel waves.
> Each wave completes before the next begins.

```
Wave 1 (Start Immediately — contracts + inventory + shared plumbing):
├── Task 1: Audit all resource-consuming AI entry points [unspecified-high]
├── Task 2: Define backend traceability contract for credit transaction/event linkage [deep]
├── Task 3: Design frontend global credits state and layout injection plan [quick]
├── Task 4: Define user transaction history UX entry and route/container [visual-engineering]
└── Task 5: Plan automated test targets and fixture reuse [quick]

Wave 2 (After Wave 1 — backend + global shell):
├── Task 6: Implement backend transaction/event traceability enhancements (depends: 2) [unspecified-high]
├── Task 7: Implement global balance fetch/display in main layout (depends: 3) [visual-engineering]
├── Task 8: Implement reusable frontend credit history data flow (depends: 4, 6) [quick]
├── Task 9: Integrate user-facing credit history view (depends: 4, 8) [visual-engineering]
└── Task 10: Harden admin history view for richer traceability (depends: 6) [quick]

Wave 3 (After Wave 2 — AI operation UI integrations, MAX PARALLEL):
├── Task 11: Integrate cost labeling into text/chat operations (depends: 1, 7) [visual-engineering]
├── Task 12: Integrate cost labeling into image operations (depends: 1, 7) [visual-engineering]
├── Task 13: Integrate cost labeling into video/async media operations (depends: 1, 7) [visual-engineering]
├── Task 14: Integrate cost labeling into agent execution flows (depends: 1, 7) [quick]
└── Task 15: Add shared insufficient-balance / estimate-failure UX states (depends: 7, 11-14) [quick]

Wave 4 (After Wave 3 — tests):
├── Task 16: Add backend pytest coverage for traceability and transaction queries (depends: 6, 10) [quick]
├── Task 17: Add frontend Jest coverage for credit UI units (depends: 7, 9, 11-15) [quick]
├── Task 18: Add Playwright flows for global balance, operation cost visibility, and history traceability (depends: 7, 9, 11-15) [unspecified-high]
└── Task 19: Run integrated regression commands and fix test-only gaps (depends: 16-18) [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA via agent-executed scenarios (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: 2 → 6 → 8 → 9 → 18 → 19 → F1-F4
Parallel Speedup: High (~60%+ faster than sequential)
Max Concurrent: 5
```

### Dependency Matrix

- **1**: — → 11, 12, 13, 14
- **2**: — → 6
- **3**: — → 7
- **4**: — → 8, 9
- **5**: — → 16, 17, 18
- **6**: 2 → 8, 10, 16
- **7**: 3 → 11, 12, 13, 14, 15, 17, 18
- **8**: 4, 6 → 9
- **9**: 4, 8 → 17, 18
- **10**: 6 → 16
- **11**: 1, 7 → 15, 17, 18
- **12**: 1, 7 → 15, 17, 18
- **13**: 1, 7 → 15, 17, 18
- **14**: 1, 7 → 15, 17, 18
- **15**: 7, 11, 12, 13, 14 → 17, 18
- **16**: 6, 10 → 19
- **17**: 7, 9, 11, 12, 13, 14, 15 → 19
- **18**: 7, 9, 11, 12, 13, 14, 15 → 19
- **19**: 16, 17, 18 → F1, F2, F3, F4

### Agent Dispatch Summary

- **Wave 1**: T1 `unspecified-high`, T2 `deep`, T3 `quick`, T4 `visual-engineering`, T5 `quick`
- **Wave 2**: T6 `unspecified-high`, T7 `visual-engineering`, T8 `quick`, T9 `visual-engineering`, T10 `quick`
- **Wave 3**: T11-T13 `visual-engineering`, T14 `quick`, T15 `quick`
- **Wave 4**: T16 `quick`, T17 `quick`, T18 `unspecified-high`, T19 `unspecified-high`
- **FINAL**: F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Audit all resource-consuming AI entry points

  **What to do**:
  - Inventory every frontend entry point that triggers resource-consuming AI work, including text/chat, streaming text, image generation, video/async media, batch flows if applicable, and agent execution.
  - Map each entry point to its backend charging path and identify whether it already has cost-estimate inputs (`category`, `model_config_id`, agent per-call credits, or equivalent).
  - Produce a definitive coverage list for the executor so no AI entry point is missed in later UI integration tasks.

  **Must NOT do**:
  - Do not redesign AI workflows or model selection logic.
  - Do not add credits UI before the inventory is complete.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires careful cross-cutting repository audit across frontend and backend AI paths.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `systematic-debugging`: This is coverage mapping, not bug diagnosis.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 11, 12, 13, 14
  - **Blocked By**: None

  **References**:
  - `nextjs-frontend/app/(aistudio)/ai/image/page.tsx` - Image-generation UI entry point likely needing cost preview placement.
  - `nextjs-frontend/app/(aistudio)/ai/video/page.tsx` - Video-generation UI path with existing cost references in result display.
  - `nextjs-frontend/components/agents/AgentPickerDialog.tsx` - Agent per-call credits metadata already displayed in one local context.
  - `fastapi_backend/app/ai_gateway/service.py` - Canonical backend charging paths for text/media operations.
  - `fastapi_backend/app/services/agent_service.py` - Agent execution charging path.

  **Acceptance Criteria**:
  - [ ] A documented list exists of all resource-consuming AI UI entry points and their corresponding backend charge paths.
  - [ ] Each listed operation is classified into text/chat, agent, image, video/async, or batch derivative flow.
  - [ ] No later integration task depends on guessed coverage.

  **QA Scenarios**:
  ```
  Scenario: AI charging coverage inventory complete
    Tool: Bash (search/read oriented command if needed) or repository read tools during execution
    Preconditions: Repository available
    Steps:
      1. Enumerate frontend AI operation entry files.
      2. Cross-check each against backend charge sites in ai_gateway/service.py and agent_service.py.
      3. Save resulting coverage matrix as execution evidence.
    Expected Result: Every backend charging path is mapped to one or more frontend entry points or explicitly marked backend-only.
    Failure Indicators: A charging path exists without mapped UI entry point, or a known AI page lacks classification.
    Evidence: .sisyphus/evidence/task-1-ai-entrypoint-matrix.md

  Scenario: Missing-path detection
    Tool: Bash/read tools
    Preconditions: Coverage matrix drafted
    Steps:
      1. Compare matrix against grep results for AI trigger handlers and route actions.
      2. Assert no uncategorized resource-consuming operation remains.
    Expected Result: Zero uncategorized resource-consuming AI operations.
    Evidence: .sisyphus/evidence/task-1-missing-path-check.md
  ```

  **Evidence to Capture**:
  - [ ] `task-1-ai-entrypoint-matrix.md`
  - [ ] `task-1-missing-path-check.md`

  **Commit**: NO

- [x] 2. Define backend traceability contract for credit transaction/event linkage

  **What to do**:
  - Decide the minimal contract that allows user/admin transaction history to trace an AI consumption record back to the originating AI usage event without creating a second ledger.
  - Specify which fields in `credit_transactions.meta` should carry linkage/context such as `category`, `binding_key`, `model`, `manufacturer`, `agent_id`, and a stable usage-event reference when available.
  - Define the API response shape additions needed for user/admin history queries.

  **Must NOT do**:
  - Do not invent a separate transaction store.
  - Do not expand scope into analytics dashboards or exports.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful contract design across persistence, APIs, and downstream UI use.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `API Integration Specialist`: Existing internal APIs already exist; this is contract shaping, not third-party integration.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 6
  - **Blocked By**: None

  **References**:
  - `fastapi_backend/app/models.py` - Existing `CreditTransaction` and `AIUsageEvent` model definitions to extend/reuse.
  - `fastapi_backend/app/services/credit_service.py` - Central transaction creation logic and balance mutation behavior.
  - `fastapi_backend/app/api/v1/credits.py` - Existing user/admin transaction query surface.
  - `fastapi_backend/app/schemas_credits.py` - Existing response schema patterns for credits endpoints.

  **Acceptance Criteria**:
  - [ ] A concrete linkage contract is defined without creating a new ledger system.
  - [ ] Required API response fields for user/admin history are named and scoped.
  - [ ] Refund and failed-operation traceability are accounted for in the contract.

  **QA Scenarios**:
  ```
  Scenario: Traceability contract covers consume and refund flows
    Tool: Read tools / design validation during execution
    Preconditions: Current credit and usage models inspected
    Steps:
      1. Draft consume-path trace fields.
      2. Draft refund-path trace fields.
      3. Validate both against existing model/service capabilities.
    Expected Result: One contract supports ai.consume and ai.refund style tracing without ambiguous record lookup.
    Failure Indicators: Refund cannot be linked back to originating operation, or user/admin histories require separate schemas.
    Evidence: .sisyphus/evidence/task-2-traceability-contract.md

  Scenario: Contract does not introduce forbidden scope
    Tool: Read review
    Preconditions: Contract drafted
    Steps:
      1. Review contract additions.
      2. Confirm no payment/topup/export analytics fields are introduced.
    Expected Result: Contract remains limited to visibility and traceability.
    Evidence: .sisyphus/evidence/task-2-scope-guardrail-check.md
  ```

  **Evidence to Capture**:
  - [ ] `task-2-traceability-contract.md`
  - [ ] `task-2-scope-guardrail-check.md`

  **Commit**: NO

- [x] 3. Design frontend global credits state and layout injection plan

  **What to do**:
  - Define how the current user's balance will be fetched, refreshed, and injected into the AI Studio shell without duplicating user/auth state.
  - Decide whether balance lives in layout-level server data, client-side refresh state, or a shared provider with targeted invalidation after operations.
  - Specify where balance is shown globally in `AppLayout` and how it opens the history entry point.

  **Must NOT do**:
  - Do not create a second auth/user store.
  - Do not hide balance in a page-local component only.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Scoped architectural decision around existing layout and credits action reuse.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `brainstorming`: Requirements are already settled; this is implementation planning detail.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 7
  - **Blocked By**: None

  **References**:
  - `nextjs-frontend/app/(aistudio)/layout.tsx` - Current top-level shell data-loading pattern using `getMe()`.
  - `nextjs-frontend/components/aistudio/AppLayout.tsx` - Actual global UI surface where balance must become visible.
  - `nextjs-frontend/components/actions/credits-actions.ts` - Existing balance and transaction data actions.

  **Acceptance Criteria**:
  - [ ] There is one documented source of truth for global balance display.
  - [ ] Refresh behavior after credit-consuming operations is specified.
  - [ ] Global balance entry point location is explicitly chosen in the layout.

  **QA Scenarios**:
  ```
  Scenario: Global balance state plan supports update-after-consume
    Tool: Read/design review
    Preconditions: Layout and credits actions inspected
    Steps:
      1. Define initial load source.
      2. Define refresh/invalidation trigger after successful AI operation or refund.
      3. Verify no duplicate auth or me store is introduced.
    Expected Result: Single coherent data flow from creditsMy() to AppLayout and downstream refresh points.
    Failure Indicators: Balance source duplicates me-state ownership or lacks post-operation refresh.
    Evidence: .sisyphus/evidence/task-3-global-balance-dataflow.md

  Scenario: Balance display remains global, not page-local
    Tool: Read review
    Preconditions: Placement decision documented
    Steps:
      1. Inspect chosen insertion point.
      2. Confirm it is rendered across AI Studio pages.
    Expected Result: Chosen UI surface is present across the shell.
    Evidence: .sisyphus/evidence/task-3-layout-placement-check.md
  ```

  **Evidence to Capture**:
  - [ ] `task-3-global-balance-dataflow.md`
  - [ ] `task-3-layout-placement-check.md`

  **Commit**: NO

- [x] 4. Define user transaction history UX entry and route/container

  **What to do**:
  - Decide the user-facing history access pattern: dedicated page, drawer, modal, or layout-triggered panel.
  - Define required columns/fields for user-visible history and how admins continue to access richer history.
  - Ensure the chosen UX can be opened from the global balance entry and supports future pagination/filtering without requiring redesign.

  **Must NOT do**:
  - Do not bury user history only inside admin settings.
  - Do not overbuild advanced analytics or export UI.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: User-entry interaction and information architecture need a clear UI-level decision.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `artistry`: This is product UI structuring, not unconventional creative exploration.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 8, 9
  - **Blocked By**: None

  **References**:
  - `nextjs-frontend/app/(aistudio)/settings/_components/CreditsSection.tsx` - Existing admin credits entry patterns.
  - `nextjs-frontend/app/(aistudio)/settings/_components/CreditsAdjustModal.tsx` - Existing history display pattern to borrow row semantics from.
  - `nextjs-frontend/components/aistudio/AppLayout.tsx` - Global shell where a history entry launcher may live.

  **Acceptance Criteria**:
  - [ ] One user-facing history access pattern is chosen and documented.
  - [ ] User-visible fields are defined.
  - [ ] Admin-visible continuation path is preserved.

  **QA Scenarios**:
  ```
  Scenario: User history UX is reachable from global balance entry
    Tool: Read/design review
    Preconditions: Layout placement and history UX drafted
    Steps:
      1. Identify global balance trigger.
      2. Trace click/open path to user history container.
      3. Verify no admin-only permission gate blocks users.
    Expected Result: Authenticated user has a direct route from global balance to personal transaction history.
    Failure Indicators: User flow depends on admin settings or hidden navigation.
    Evidence: .sisyphus/evidence/task-4-user-history-entry-flow.md

  Scenario: UX scope remains history-focused
    Tool: Read review
    Preconditions: UI container drafted
    Steps:
      1. Review controls and content.
      2. Confirm there are no recharge/redeem/export controls added.
    Expected Result: User history container contains only viewing/tracing functionality.
    Evidence: .sisyphus/evidence/task-4-history-scope-check.md
  ```

  **Evidence to Capture**:
  - [ ] `task-4-user-history-entry-flow.md`
  - [ ] `task-4-history-scope-check.md`

  **Commit**: NO

- [x] 5. Plan automated test targets and fixture reuse

  **What to do**:
  - Turn the settled requirements into a concrete automated test map: backend pytest targets, frontend Jest units, and Playwright flows.
  - Reuse existing auth/credits fixtures and note any missing frontend test harness support needed for credits components.
  - Ensure the tests-after phase has exact target files and commands before implementation starts.

  **Must NOT do**:
  - Do not postpone test planning until after code is written.
  - Do not require human verification as a substitute for missing test coverage.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: This is focused mapping onto existing test infrastructure.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `test-driven-development`: Explicitly not chosen as the development strategy.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 16, 17, 18
  - **Blocked By**: None

  **References**:
  - `fastapi_backend/tests/routes/test_credits.py` - Existing backend credits route testing patterns.
  - `fastapi_backend/tests/routes/test_admin_rbac.py` - Existing audit/admin verification patterns.
  - `nextjs-frontend/__tests__/loginPage.test.tsx` - Existing frontend unit test style.
  - `nextjs-frontend/tests/remote-login.spec.ts` - Existing Playwright entry point pattern.

  **Acceptance Criteria**:
  - [ ] Backend, frontend unit, and e2e targets are named with expected commands.
  - [ ] Existing reusable fixtures/mocks are identified.
  - [ ] Missing harness gaps are documented before test-writing tasks start.

  **QA Scenarios**:
  ```
  Scenario: Test map covers every requested capability
    Tool: Read review
    Preconditions: Test plan drafted
    Steps:
      1. Map each user requirement to backend/frontend/e2e test targets.
      2. Confirm no core requirement lacks at least one automated check.
    Expected Result: Global balance, cost display, user history, admin history, insufficient balance, and refund traceability each map to tests.
    Failure Indicators: Any core requirement lacks explicit automated verification.
    Evidence: .sisyphus/evidence/task-5-test-map.md

  Scenario: Test map reuses infrastructure
    Tool: Read review
    Preconditions: Existing test infra reviewed
    Steps:
      1. Link each planned test to current Jest/pytest/Playwright patterns.
      2. Note any missing harness utilities.
    Expected Result: Planned tests follow existing repo conventions with minimal new scaffolding.
    Evidence: .sisyphus/evidence/task-5-fixture-reuse.md
  ```

  **Evidence to Capture**:
  - [ ] `task-5-test-map.md`
  - [ ] `task-5-fixture-reuse.md`

  **Commit**: NO

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit okay before completing.

- [x] 6. Implement backend transaction/event traceability enhancements

  **What to do**:
  - Update backend credits querying and transaction creation flow to expose the traceability contract defined in Task 2.
  - Ensure user/admin history responses include the minimum context needed to understand what consumed or refunded credits.
  - Reuse existing transaction creation paths so trace metadata is consistently applied across all AI charge sites.

  **Must NOT do**:
  - Do not create new parallel history tables.
  - Do not change business pricing rules unless necessary for metadata propagation.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Touches multiple backend layers and must maintain compatibility.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `API Integration Specialist`: Internal API enhancement, not third-party integration.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 8, 10, 16
  - **Blocked By**: 2

  **References**:
  - `fastapi_backend/app/services/credit_service.py` - Core balance mutation and transaction recording.
  - `fastapi_backend/app/api/v1/credits.py` - User/admin query endpoints to enrich.
  - `fastapi_backend/app/schemas_credits.py` - Response shapes to update.
  - `fastapi_backend/app/ai_gateway/service.py` - Charge points needing consistent metadata.
  - `fastapi_backend/app/services/agent_service.py` - Agent charge points needing consistent metadata.

  **Acceptance Criteria**:
  - [ ] User/admin credits history API returns traceability fields needed by the frontend.
  - [ ] AI consume and refund paths both preserve trace context.
  - [ ] Existing admin adjustments continue to work.

  **QA Scenarios**:
  ```
  Scenario: User transaction API includes trace context
    Tool: Bash (curl)
    Preconditions: Authenticated user with at least one AI credit transaction
    Steps:
      1. Call GET /api/v1/credits/my with a valid token to confirm current balance exists.
      2. Call GET /api/v1/credits/my/transactions?limit=20.
      3. Assert each AI-related record includes delta, balance_after, reason, created_at, and the newly exposed trace fields defined in Task 2.
    Expected Result: API returns machine-usable trace data for user history rendering.
    Failure Indicators: AI-related records lack context to identify operation type/model/agent or refund origin.
    Evidence: .sisyphus/evidence/task-6-user-transactions-response.json

  Scenario: Refund path remains traceable
    Tool: Bash (curl or test command invoking failing AI flow)
    Preconditions: A controlled failing AI operation that triggers refund exists in test/dev setup
    Steps:
      1. Trigger a credit-consuming AI operation that fails after debit.
      2. Fetch the latest transaction list.
      3. Assert refund record is visible and linkable to the originating operation context.
    Expected Result: Refund record appears with sufficient trace context to explain the reversal.
    Evidence: .sisyphus/evidence/task-6-refund-traceability.json
  ```

  **Evidence to Capture**:
  - [ ] `task-6-user-transactions-response.json`
  - [ ] `task-6-refund-traceability.json`

  **Commit**: YES
  - Message: `feat(credits): enrich transaction traceability`
  - Files: `fastapi_backend/app/services/credit_service.py`, `fastapi_backend/app/api/v1/credits.py`, `fastapi_backend/app/schemas_credits.py`, related charge paths
  - Pre-commit: `cd fastapi_backend && uv run pytest`

- [x] 7. Implement global balance fetch/display in main layout

  **What to do**:
  - Fetch the current user's credit balance through the chosen global data path and render it in the AI Studio shell.
  - Make the balance entry accessible from every AI Studio page and usable as the launcher for the user's transaction history view.
  - Ensure balance can refresh after successful debit/refund without requiring a full re-login.

  **Must NOT do**:
  - Do not add a page-local balance badge that disappears on navigation.
  - Do not create a second, unsynchronized user state source.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Global shell UI plus interaction behavior.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `tailwind`: Styling work is limited and should follow existing utility patterns without a special docs consult.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 11, 12, 13, 14, 15, 17, 18
  - **Blocked By**: 3

  **References**:
  - `nextjs-frontend/app/(aistudio)/layout.tsx` - Current server-side shell composition.
  - `nextjs-frontend/components/aistudio/AppLayout.tsx` - Global header/sidebar rendering target.
  - `nextjs-frontend/components/actions/credits-actions.ts` - Balance fetch action.

  **Acceptance Criteria**:
  - [ ] Balance is visible in AI Studio shell across pages.
  - [ ] Balance launcher opens or routes to the user's history view.
  - [ ] Balance can refresh after debit/refund-producing operations.

  **QA Scenarios**:
  ```
  Scenario: Global balance visible across navigation
    Tool: Playwright
    Preconditions: Authenticated user with non-zero balance
    Steps:
      1. Open AI Studio dashboard.
      2. Assert a global balance element is visible in the shell and contains a numeric balance.
      3. Navigate to at least two other AI Studio pages (e.g. image and settings or video) without full logout.
      4. Assert the same balance element remains visible.
    Expected Result: Balance is a shell-level UI element present across page transitions.
    Failure Indicators: Balance appears only on one page or disappears after navigation.
    Evidence: .sisyphus/evidence/task-7-global-balance-shell.png

  Scenario: Balance entry opens history access path
    Tool: Playwright
    Preconditions: User is on an AI Studio page with global balance visible
    Steps:
      1. Click the global balance UI element.
      2. Wait for the user history route/panel to appear.
      3. Assert at least one history heading, list, or empty-state element is visible.
    Expected Result: User can reach personal credit history from the global balance UI.
    Evidence: .sisyphus/evidence/task-7-balance-launches-history.png
  ```

  **Evidence to Capture**:
  - [ ] `task-7-global-balance-shell.png`
  - [ ] `task-7-balance-launches-history.png`

  **Commit**: YES
  - Message: `feat(credits): add global balance display`
  - Files: `nextjs-frontend/app/(aistudio)/layout.tsx`, `nextjs-frontend/components/aistudio/AppLayout.tsx`, any local credits shell helper files
  - Pre-commit: `cd nextjs-frontend && pnpm test`

- [x] 8. Implement reusable frontend credit history data flow

  **What to do**:
  - Build the frontend data access layer for user-visible transaction history using existing credits actions and any enriched response contract from Task 6.
  - Normalize display-ready fields so the UI can show consume/refund/admin-adjust events consistently.
  - Keep this data flow reusable by both user-facing history and admin enhancements.

  **Must NOT do**:
  - Do not hardcode history rows directly in view components.
  - Do not fork separate fetch logic for user and admin if shared normalization can handle both.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Data plumbing and shaping within an existing frontend action pattern.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `API Integration Specialist`: Existing internal API only.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 9
  - **Blocked By**: 4, 6

  **References**:
  - `nextjs-frontend/components/actions/credits-actions.ts` - Existing transaction-fetch API surface.
  - `nextjs-frontend/app/(aistudio)/settings/_components/CreditsAdjustModal.tsx` - Existing row semantics for delta/balance_after/reason.
  - `fastapi_backend/app/schemas_credits.py` - Backend response fields to reflect accurately.

  **Acceptance Criteria**:
  - [ ] Frontend has a reusable history data flow for personal transaction history.
  - [ ] Consume, refund, and admin-adjust rows can be rendered consistently.
  - [ ] Data flow supports later pagination/filtering without redesign.

  **QA Scenarios**:
  ```
  Scenario: History data normalization supports mixed transaction types
    Tool: Jest or execution-time unit harness
    Preconditions: Mock or fixture responses containing consume/refund/admin-adjust rows
    Steps:
      1. Feed mixed transaction payload into the normalization layer.
      2. Assert UI-facing row objects preserve delta sign, balance_after, time, and reason/trace labels.
    Expected Result: One data pipeline can render all supported transaction row types consistently.
    Failure Indicators: Refund rows lose sign/context or admin-adjust rows need special-case UI hacks.
    Evidence: .sisyphus/evidence/task-8-history-normalization.txt

  Scenario: Reusable flow supports empty and populated states
    Tool: Jest or execution-time unit harness
    Preconditions: Mock empty response and populated response
    Steps:
      1. Run the history loader against an empty result set.
      2. Run the history loader against a populated result set.
      3. Assert view-model outputs support both empty-state and list-state rendering.
    Expected Result: No UI layer needs ad hoc branching beyond normal empty/list rendering.
    Evidence: .sisyphus/evidence/task-8-empty-and-filled-states.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-8-history-normalization.txt`
  - [ ] `task-8-empty-and-filled-states.txt`

  **Commit**: YES
  - Message: `feat(credits): add reusable history data flow`
  - Files: credits history hooks/helpers plus `components/actions/credits-actions.ts` if needed
  - Pre-commit: `cd nextjs-frontend && pnpm test`

- [x] 9. Integrate user-facing credit history view

  **What to do**:
  - Implement the chosen user-facing history container (page/drawer/modal) and connect it to the global balance entry.
  - Show transaction rows with enough detail for ordinary users to understand what consumed or refunded credits.
  - Provide clear empty, loading, and error states.

  **Must NOT do**:
  - Do not expose admin-only controls in the user view.
  - Do not overload the first version with analytics charts or export actions.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Main user-facing credits UX implementation.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `artistry`: Straightforward product UI extension.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 17, 18
  - **Blocked By**: 4, 8

  **References**:
  - `nextjs-frontend/components/aistudio/AppLayout.tsx` - Launcher origin for this view.
  - `nextjs-frontend/app/(aistudio)/settings/_components/CreditsAdjustModal.tsx` - Existing history row display clues.
  - `nextjs-frontend/components/actions/credits-actions.ts` - User transaction fetch entry.

  **Acceptance Criteria**:
  - [ ] Authenticated user can open personal credits history.
  - [ ] History shows loading, empty, success, and error states.
  - [ ] Transaction rows explain credits changes sufficiently for user traceability.

  **QA Scenarios**:
  ```
  Scenario: User can view populated credit history
    Tool: Playwright
    Preconditions: Authenticated user with at least one credit transaction
    Steps:
      1. Click global balance element.
      2. Wait for user history container to load.
      3. Assert at least one row shows a delta, timestamp, and human-readable reason/operation context.
    Expected Result: User sees a usable transaction history, not raw JSON or admin-only terminology.
    Evidence: .sisyphus/evidence/task-9-user-history-populated.png

  Scenario: Empty-state history is graceful
    Tool: Playwright
    Preconditions: Authenticated user with zero transactions or isolated test user
    Steps:
      1. Open the personal history view.
      2. Assert an empty-state message is visible and no error styling is shown.
    Expected Result: User sees a clear “暂无流水” style empty state.
    Evidence: .sisyphus/evidence/task-9-user-history-empty.png
  ```

  **Evidence to Capture**:
  - [ ] `task-9-user-history-populated.png`
  - [ ] `task-9-user-history-empty.png`

  **Commit**: YES
  - Message: `feat(credits): add user history view`
  - Files: new/updated user history view components and shell integration files
  - Pre-commit: `cd nextjs-frontend && pnpm test`

- [x] 10. Harden admin history view for richer traceability

  **What to do**:
  - Extend the current admin credits experience so admins can see the richer traceability context exposed by Task 6 without losing current adjust/set workflows.
  - Ensure admin history rows distinguish consumption, refunds, and manual adjustments clearly.
  - Keep the admin flow aligned with the user-visible data semantics while preserving extra admin detail.

  **Must NOT do**:
  - Do not regress current admin adjust/set balance functionality.
  - Do not add unrelated admin analytics or export controls.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Enhancement to an existing admin surface with limited UI spread.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `requesting-code-review`: Review happens later in verification waves, not as a planning dependency.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 16
  - **Blocked By**: 6

  **References**:
  - `nextjs-frontend/app/(aistudio)/settings/_components/CreditsSection.tsx` - Admin credits entry point.
  - `nextjs-frontend/app/(aistudio)/settings/_components/CreditsAdjustModal.tsx` - Current admin trace/history UI.
  - `nextjs-frontend/app/(aistudio)/settings/page.tsx` - Orchestration state for credits modal.

  **Acceptance Criteria**:
  - [ ] Admin can still adjust and set user balances.
  - [ ] Admin history rows expose richer trace context than before.
  - [ ] Refunds and AI-consume events are distinguishable from manual adjustments.

  **QA Scenarios**:
  ```
  Scenario: Admin sees enriched user transaction history
    Tool: Playwright
    Preconditions: Admin user with credits permission and a target user having AI transactions
    Steps:
      1. Log in as admin and open settings > credits.
      2. Open a user's credit dialog.
      3. Assert rows include delta, balance_after, timestamp, and richer trace context for AI operations where available.
    Expected Result: Admin receives more trace detail without losing readability.
    Evidence: .sisyphus/evidence/task-10-admin-history-enriched.png

  Scenario: Admin adjust flow still works
    Tool: Playwright
    Preconditions: Admin credits dialog open for a test user
    Steps:
      1. Submit a small balance adjustment.
      2. Wait for success state and refreshed history.
      3. Assert adjustment row appears and existing controls remain functional.
    Expected Result: Traceability enhancement does not break core admin adjustment workflow.
    Evidence: .sisyphus/evidence/task-10-admin-adjust-still-works.png
  ```

  **Evidence to Capture**:
  - [ ] `task-10-admin-history-enriched.png`
  - [ ] `task-10-admin-adjust-still-works.png`

  **Commit**: YES
  - Message: `feat(credits): enrich admin credit history`
  - Files: `nextjs-frontend/app/(aistudio)/settings/page.tsx`, `_components/CreditsAdjustModal.tsx`, related admin credits components
  - Pre-commit: `cd nextjs-frontend && pnpm test`

- [x] F1. **Plan Compliance Audit** — `oracle`
- [x] 11. Integrate cost labeling into text/chat operations

  **What to do**:
  - Add cost visibility to all text/chat entry points that consume credits, including non-streaming and streaming chat where applicable.
  - Use existing cost-estimate or known pricing signals to show the user what the action will cost before execution when possible.
  - Keep the UI aligned with the eventual debit behavior and global balance refresh model.

  **Must NOT do**:
  - Do not display misleading stale values without clearly defined refresh behavior.
  - Do not skip streaming chat if it also consumes credits.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Cost labels must be integrated into interactive text/chat UI flows.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `parallel-debugging`: This is planned UI integration, not competing-hypothesis debugging.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 15, 17, 18
  - **Blocked By**: 1, 7

  **References**:
  - `fastapi_backend/app/ai_gateway/service.py` - Text and streaming charge sites to mirror in UX.
  - `nextjs-frontend/components/credits/CreditCostPreview.tsx` - Reusable cost/balance display component.
  - Text/chat frontend entry files identified in Task 1 - exact insertion points to use.

  **Acceptance Criteria**:
  - [ ] Every credit-consuming text/chat trigger shows cost information.
  - [ ] Streaming and non-streaming variants are both covered if they consume credits.
  - [ ] Cost label does not disappear before user can reasonably see it.

  **QA Scenarios**:
  ```
  Scenario: Text operation shows cost before send
    Tool: Playwright
    Preconditions: Authenticated user on a text/chat page that consumes credits
    Steps:
      1. Open the text/chat page.
      2. Enter a prompt or configure required inputs.
      3. Assert a cost label/preview is visible before clicking send/run.
    Expected Result: User can see the cost of the text operation before executing it.
    Evidence: .sisyphus/evidence/task-11-text-cost-preview.png

  Scenario: Streaming text path also exposes cost
    Tool: Playwright
    Preconditions: Authenticated user on a streaming text flow, if present
    Steps:
      1. Open the streaming-capable text flow.
      2. Assert cost information is visible before starting the stream.
      3. Start the stream and confirm the balance refresh path remains intact after completion.
    Expected Result: Streaming credit-consuming flow is not omitted from cost disclosure.
    Evidence: .sisyphus/evidence/task-11-streaming-cost-preview.png
  ```

  **Evidence to Capture**:
  - [ ] `task-11-text-cost-preview.png`
  - [ ] `task-11-streaming-cost-preview.png`

  **Commit**: YES
  - Message: `feat(credits): show text operation costs`
  - Files: text/chat UI entry components identified in Task 1 plus any shared credits UI helper wiring
  - Pre-commit: `cd nextjs-frontend && pnpm test`

- [x] 12. Integrate cost labeling into image operations

  **What to do**:
  - Add cost labeling/previews to all image-related AI operations that consume credits.
  - Reuse `CreditCostPreview` and existing estimate endpoints where available.
  - Ensure selected model/config changes can update displayed cost appropriately.

  **Must NOT do**:
  - Do not hardcode image cost where a config-driven estimate already exists.
  - Do not show the label only after image generation completes.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI integration with model-selection-dependent cost display.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `API Integration Specialist`: Existing estimate endpoint already exists.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 15, 17, 18
  - **Blocked By**: 1, 7

  **References**:
  - `nextjs-frontend/app/(aistudio)/ai/image/page.tsx` - Primary image operation UI.
  - `nextjs-frontend/components/credits/CreditCostPreview.tsx` - Existing image-appropriate cost preview widget.
  - `nextjs-frontend/app/api/ai/cost-estimate/route.ts` - Frontend proxy to backend estimate API.

  **Acceptance Criteria**:
  - [ ] Image-generation UI shows cost before execution.
  - [ ] Cost reacts correctly to model/config changes where supported.
  - [ ] Balance warning state is visible when insufficient.

  **QA Scenarios**:
  ```
  Scenario: Image generation page shows cost before generate
    Tool: Playwright
    Preconditions: Authenticated user on image generation page
    Steps:
      1. Open the image page.
      2. Select a model/config if required.
      3. Assert a cost preview is visible near the generate action before clicking it.
    Expected Result: Cost is visible at decision time, not only in results.
    Evidence: .sisyphus/evidence/task-12-image-cost-preview.png

  Scenario: Insufficient balance warning appears for image operation
    Tool: Playwright
    Preconditions: User with balance lower than estimated image cost
    Steps:
      1. Open the image generation page as the low-balance user.
      2. Configure the operation.
      3. Assert warning styling or insufficient-balance messaging is visible in the cost preview area.
    Expected Result: User is warned before triggering an unaffordable image operation.
    Evidence: .sisyphus/evidence/task-12-image-insufficient-warning.png
  ```

  **Evidence to Capture**:
  - [ ] `task-12-image-cost-preview.png`
  - [ ] `task-12-image-insufficient-warning.png`

  **Commit**: YES
  - Message: `feat(credits): show image operation costs`
  - Files: `nextjs-frontend/app/(aistudio)/ai/image/page.tsx`, related image UI components
  - Pre-commit: `cd nextjs-frontend && pnpm test`

- [x] 13. Integrate cost labeling into video/async media operations

  **What to do**:
  - Add cost labeling/previews to video and asynchronous media submission flows, including any batch-adjacent media submission surface identified in Task 1.
  - Ensure the pre-submit cost is visible even when the actual generation completes later asynchronously.
  - Keep the display aligned with config-driven pricing and any backend-estimate response.

  **Must NOT do**:
  - Do not omit async submit flows just because result delivery is delayed.
  - Do not rely solely on post-result “Cost: X credits” text.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Async/batch-like UI states need careful cost disclosure placement.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `subagent-driven-development`: This is an execution pattern, not a planning input.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 15, 17, 18
  - **Blocked By**: 1, 7

  **References**:
  - `nextjs-frontend/app/(aistudio)/ai/video/page.tsx` - Primary video UI path.
  - Video/async frontend entry files identified in Task 1 - additional exact integration points.
  - `fastapi_backend/app/ai_gateway/service.py` - `generate_media()` and `submit_media_async()` charge sites.

  **Acceptance Criteria**:
  - [ ] Video or async media submit actions show cost before submission.
  - [ ] Any batch-adjacent media flows identified in Task 1 also receive disclosure if they consume credits.
  - [ ] Async submission still refreshes balance/history correctly after debit.

  **QA Scenarios**:
  ```
  Scenario: Video generation page shows pre-submit cost
    Tool: Playwright
    Preconditions: Authenticated user on video generation page
    Steps:
      1. Open the video page.
      2. Configure required inputs.
      3. Assert cost preview is visible before clicking submit/generate.
    Expected Result: Video cost is disclosed before the async/sync generation begins.
    Evidence: .sisyphus/evidence/task-13-video-cost-preview.png

  Scenario: Async media submission updates credits traceability
    Tool: Playwright + Bash (optional API check)
    Preconditions: Authenticated user completes an async media submission
    Steps:
      1. Submit the async media job.
      2. Re-open global balance/history after submission.
      3. Assert balance and/or history reflects the debit.
    Expected Result: Async submission is still traceable through balance/history updates.
    Evidence: .sisyphus/evidence/task-13-async-media-traceability.png
  ```

  **Evidence to Capture**:
  - [ ] `task-13-video-cost-preview.png`
  - [ ] `task-13-async-media-traceability.png`

  **Commit**: YES
  - Message: `feat(credits): show video operation costs`
  - Files: `nextjs-frontend/app/(aistudio)/ai/video/page.tsx`, other async media UI files identified in Task 1
  - Pre-commit: `cd nextjs-frontend && pnpm test`

- [x] 14. Integrate cost labeling into agent execution flows

  **What to do**:
  - Add cost disclosure to all agent execution entry points using the existing `credits_per_call` metadata where available.
  - Ensure the user sees the cost before invoking an agent, not only in settings/admin views.
  - Keep labels aligned with actual agent charge behavior on the backend.

  **Must NOT do**:
  - Do not rely on admin-only agent settings pages for end-user cost visibility.
  - Do not skip agent flows because their pricing may be static.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Existing metadata likely makes this more direct than model-estimate-driven media flows.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `API Integration Specialist`: Internal data already exists.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 15, 17, 18
  - **Blocked By**: 1, 7

  **References**:
  - `nextjs-frontend/components/agents/AgentPickerDialog.tsx` - Existing end-user-ish agent selection UI already showing `credits_per_call` locally.
  - `nextjs-frontend/components/actions/agent-actions.ts` - Agent metadata shapes.
  - `fastapi_backend/app/services/agent_service.py` - Agent execution charge behavior.

  **Acceptance Criteria**:
  - [ ] Agent execution surfaces show cost before invocation.
  - [ ] Cost display uses actual agent metadata or backend-aligned value.
  - [ ] Agent-triggered balance/history refresh follows the shared model.

  **QA Scenarios**:
  ```
  Scenario: Agent picker shows invocation cost before run
    Tool: Playwright
    Preconditions: Authenticated user on a page that launches an agent
    Steps:
      1. Open the agent picker or equivalent execution surface.
      2. Select/view an agent with a known `credits_per_call` value.
      3. Assert the cost is visible before execution.
    Expected Result: User can see the cost of invoking the chosen agent.
    Evidence: .sisyphus/evidence/task-14-agent-cost-preview.png

  Scenario: Agent execution updates balance/history
    Tool: Playwright
    Preconditions: Authenticated user invokes a credit-consuming agent successfully
    Steps:
      1. Execute the agent.
      2. Re-open the global balance/history view.
      3. Assert the new debit appears in the balance or transaction list.
    Expected Result: Agent charges participate in the same traceability UX as other AI operations.
    Evidence: .sisyphus/evidence/task-14-agent-history-trace.png
  ```

  **Evidence to Capture**:
  - [ ] `task-14-agent-cost-preview.png`
  - [ ] `task-14-agent-history-trace.png`

  **Commit**: YES
  - Message: `feat(credits): show agent operation costs`
  - Files: agent execution UI files, `components/agents/AgentPickerDialog.tsx`, related agent runner views
  - Pre-commit: `cd nextjs-frontend && pnpm test`

- [x] 15. Add shared insufficient-balance and estimate-failure UX states

  **What to do**:
  - Standardize how cost previews and operation entry points behave when cost estimation fails or balance is insufficient.
  - Reuse warning/error states so users get consistent feedback across text, image, video, and agent flows.
  - Ensure failure cases do not hide the balance/history entry point.

  **Must NOT do**:
  - Do not silently omit costs on estimate failure without fallback messaging.
  - Do not produce radically different insufficient-balance UX between operation types.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Shared UI-state harmonization across previously integrated flows.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `systematic-debugging`: This is proactive UX unification, not post-failure debugging.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential after 11-14 in Wave 3
  - **Blocks**: 17, 18
  - **Blocked By**: 7, 11, 12, 13, 14

  **References**:
  - `nextjs-frontend/components/credits/CreditCostPreview.tsx` - Existing warning/fallback behavior.
  - Integrated operation UIs from Tasks 11-14 - Consistency targets.
  - `nextjs-frontend/app/api/ai/cost-estimate/route.ts` - Failure semantics coming from estimate proxy.

  **Acceptance Criteria**:
  - [ ] Insufficient-balance state is consistently visible across all integrated operation types.
  - [ ] Estimate-failure fallback is user-visible and non-crashing.
  - [ ] Shared behavior does not block access to balance/history.

  **QA Scenarios**:
  ```
  Scenario: Estimate failure degrades gracefully
    Tool: Playwright
    Preconditions: Cost-estimate endpoint failure can be simulated or test environment can induce failure
    Steps:
      1. Open one integrated AI operation page.
      2. Force estimate API failure.
      3. Assert the UI shows a fallback message/state instead of breaking or removing the action context entirely.
    Expected Result: User sees graceful degradation such as fallback cost or error hint.
    Evidence: .sisyphus/evidence/task-15-estimate-failure.png

  Scenario: Insufficient balance feedback is consistent across operation types
    Tool: Playwright
    Preconditions: Low-balance user and at least two operation types integrated
    Steps:
      1. Open image flow and inspect insufficient state.
      2. Open agent or video flow and inspect insufficient state.
      3. Compare messaging/warning treatment.
    Expected Result: Warning semantics are consistent across operation surfaces.
    Evidence: .sisyphus/evidence/task-15-insufficient-consistency.png
  ```

  **Evidence to Capture**:
  - [ ] `task-15-estimate-failure.png`
  - [ ] `task-15-insufficient-consistency.png`

  **Commit**: YES
  - Message: `feat(credits): unify credits warning states`
  - Files: shared credits preview/warning helpers and integrated AI operation UI files
  - Pre-commit: `cd nextjs-frontend && pnpm test`

- [x] 16. Add backend pytest coverage for traceability and transaction queries

  **What to do**:
  - Add backend tests for the enriched transaction/history behavior, including consume, refund, admin-adjust, and user/admin query expectations.
  - Reuse existing credit/auth fixtures and route test patterns.
  - Cover traceability semantics without requiring manual inspection of database rows outside test assertions.

  **Must NOT do**:
  - Do not leave backend contract verification to manual QA alone.
  - Do not create brittle tests dependent on unrelated AI provider externals.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mature pytest patterns already exist.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `test-driven-development`: Tests are intentionally added after implementation here.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: 19
  - **Blocked By**: 6, 10

  **References**:
  - `fastapi_backend/tests/routes/test_credits.py` - Primary route-test pattern.
  - `fastapi_backend/tests/routes/test_admin_rbac.py` - Audit/admin permission checks.
  - `fastapi_backend/tests/conftest.py` - Fixtures for auth and database isolation.

  **Acceptance Criteria**:
  - [ ] Backend tests cover user transaction retrieval, admin enriched history, and traceability fields.
  - [ ] Refund visibility is asserted.
  - [ ] Existing credits behavior remains green.

  **QA Scenarios**:
  ```
  Scenario: Backend pytest suite covers new credits traceability paths
    Tool: Bash
    Preconditions: Backend dependencies installed and test DB configured
    Steps:
      1. Run targeted pytest files for credits/admin history.
      2. Confirm new tests for traceability pass.
      3. Optionally run the broader credits/auth subset.
    Expected Result: Backend test suite passes with explicit coverage of new transaction/history behavior.
    Failure Indicators: New traceability fields are untested or regress existing credits routes.
    Evidence: .sisyphus/evidence/task-16-backend-pytest.txt

  Scenario: Refund assertions are present and passing
    Tool: Bash
    Preconditions: Targeted pytest selection available
    Steps:
      1. Run refund-related credits tests.
      2. Inspect output for PASS on refund traceability cases.
    Expected Result: Refund cases are part of the automated suite.
    Evidence: .sisyphus/evidence/task-16-refund-tests.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-16-backend-pytest.txt`
  - [ ] `task-16-refund-tests.txt`

  **Commit**: YES
  - Message: `test(credits): cover transaction traceability`
  - Files: `fastapi_backend/tests/routes/test_credits.py` and any new focused credits test modules
  - Pre-commit: `cd fastapi_backend && uv run pytest`

- [x] 17. Add frontend Jest coverage for credit UI units

  **What to do**:
  - Add unit-level coverage for the reusable credits UI pieces and data normalization logic introduced by earlier tasks.
  - Focus on cost preview states, history row rendering/normalization, and global balance display behavior where unit tests are appropriate.
  - Keep tests aligned with current Jest/RTL patterns in the repo.

  **Must NOT do**:
  - Do not use Jest to cover scenarios already better handled by Playwright end-to-end.
  - Do not skip edge states like estimate failure or insufficient balance warnings.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Jest/RTL tests are straightforward once UI components are stable.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `verification-before-completion`: Final verification comes later; this task is about creating tests.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: 19
  - **Blocked By**: 7, 9, 11, 12, 13, 14, 15

  **References**:
  - `nextjs-frontend/__tests__/loginPage.test.tsx` - RTL style to follow.
  - `nextjs-frontend/components/credits/CreditCostPreview.tsx` - Main unit-test target for cost preview states.
  - New credits history/global balance UI files from Tasks 7-15 - Additional unit targets.

  **Acceptance Criteria**:
  - [ ] Jest covers cost preview happy/error/warning states.
  - [ ] Jest covers history normalization or row rendering logic.
  - [ ] Jest covers the global balance component at least at unit level where feasible.

  **QA Scenarios**:
  ```
  Scenario: Frontend Jest suite covers credit UI edge states
    Tool: Bash
    Preconditions: Frontend dependencies installed
    Steps:
      1. Run targeted Jest tests for credits UI files.
      2. Assert pass output includes insufficient balance and estimate-failure related test names.
    Expected Result: Core credit UI states are covered by unit tests.
    Evidence: .sisyphus/evidence/task-17-frontend-jest.txt

  Scenario: History rendering logic is unit-tested
    Tool: Bash
    Preconditions: Credits history UI/data tests added
    Steps:
      1. Run the specific Jest test file for history rendering/normalization.
      2. Confirm it passes for mixed transaction types.
    Expected Result: UI can reliably render consume/refund/admin-adjust transaction rows.
    Evidence: .sisyphus/evidence/task-17-history-jest.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-17-frontend-jest.txt`
  - [ ] `task-17-history-jest.txt`

  **Commit**: YES
  - Message: `test(credits): add frontend credits UI coverage`
  - Files: frontend `__tests__` and related credits UI files if needed for testability
  - Pre-commit: `cd nextjs-frontend && pnpm test`

- [x] 18. Add Playwright flows for global balance, operation cost visibility, and history traceability

  **What to do**:
  - Add end-to-end flows covering the user-visible credits experience: global balance, operation pre-cost visibility, history access, and traceability after execution.
  - Cover at least one success path and one warning/failure path.
  - Reuse existing login and navigation patterns from current Playwright tests.

  **Must NOT do**:
  - Do not rely on screenshots alone without DOM assertions.
  - Do not skip cross-page/global-shell verification.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: End-to-end orchestration across auth, navigation, UI, and backend state.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `playwright` skill: Not available as a named skill here; use existing project Playwright patterns directly.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: 19
  - **Blocked By**: 7, 9, 11, 12, 13, 14, 15

  **References**:
  - `nextjs-frontend/tests/remote-login.spec.ts` - Existing Playwright auth/navigation baseline.
  - Global balance/history UI from Tasks 7 and 9.
  - Operation surfaces from Tasks 11-15.

  **Acceptance Criteria**:
  - [ ] Playwright covers global balance visibility.
  - [ ] Playwright covers at least one pre-cost disclosure flow.
  - [ ] Playwright covers user history access and at least one traceable post-operation record or balance update.

  **QA Scenarios**:
  ```
  Scenario: End-to-end global balance and history flow
    Tool: Playwright
    Preconditions: Test user credentials available and environment running
    Steps:
      1. Log in as the test user.
      2. Assert global balance is visible in the shell.
      3. Open history via the balance element.
      4. Assert the history view loads successfully.
    Expected Result: Core credits shell experience works end-to-end.
    Evidence: .sisyphus/evidence/task-18-e2e-balance-history.png

  Scenario: End-to-end pre-cost visibility before AI operation
    Tool: Playwright
    Preconditions: One integrated AI operation page available
    Steps:
      1. Navigate to an AI operation page.
      2. Configure required inputs.
      3. Assert pre-cost disclosure is visible before submit.
      4. Submit if environment allows, then assert balance/history reflects the operation.
    Expected Result: User sees cost before acting, and credits experience remains coherent after the action.
    Evidence: .sisyphus/evidence/task-18-e2e-precost-flow.png
  ```

  **Evidence to Capture**:
  - [ ] `task-18-e2e-balance-history.png`
  - [ ] `task-18-e2e-precost-flow.png`

  **Commit**: YES
  - Message: `test(credits): add credits end-to-end flows`
  - Files: `nextjs-frontend/tests/*credits*.spec.ts` or equivalent
  - Pre-commit: `cd nextjs-frontend && pnpm exec playwright test`

- [x] 19. Run integrated regression commands and fix test-only gaps

  **What to do**:
  - Run the planned backend/frontend/e2e verification commands together.
  - Fix test-only issues, mocks, selectors, or environment assumptions discovered by the new suite, without expanding scope.
  - Confirm the completed implementation is ready for final verification wave.

  **Must NOT do**:
  - Do not use this task to add new product scope.
  - Do not ignore flaky failures; stabilize them or scope them out with evidence and rationale.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Final multi-surface stabilization across test layers.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `systematic-debugging`: Useful if failures occur during execution, but not a mandatory planning attachment here.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential after Wave 4
  - **Blocks**: F1, F2, F3, F4
  - **Blocked By**: 16, 17, 18

  **References**:
  - Verification commands listed in this plan.
  - Test files added in Tasks 16-18.

  **Acceptance Criteria**:
  - [ ] Backend pytest passes.
  - [ ] Frontend Jest passes.
  - [ ] Playwright credits flows pass or have documented environment-specific exclusions approved before final verification.

  **QA Scenarios**:
  ```
  Scenario: Full regression command set passes
    Tool: Bash
    Preconditions: App/test environment running and configured
    Steps:
      1. Run backend pytest.
      2. Run frontend Jest.
      3. Run Playwright credits-related flows.
      4. Save all command output.
    Expected Result: Regression suite passes across backend, unit, and e2e layers.
    Evidence: .sisyphus/evidence/task-19-regression-suite.txt

  Scenario: No scope creep introduced during stabilization
    Tool: Bash (git diff/status review) + read review
    Preconditions: Regression fixes completed
    Steps:
      1. Inspect changed files after stabilization.
      2. Assert they are limited to tests, selectors, fixtures, or credits-related implementation.
    Expected Result: Stabilization work does not introduce unrelated product features.
    Evidence: .sisyphus/evidence/task-19-scope-creep-check.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-19-regression-suite.txt`
  - [ ] `task-19-scope-creep-check.txt`

  **Commit**: YES
  - Message: `test(credits): stabilize credits regression suite`
  - Files: test files, selectors, mocks, minimal related credits implementation adjustments
  - Pre-commit: run full verification command set

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists using file reads, API checks, and evidence files. For each "Must NOT Have": search for forbidden additions such as payment/topup flows or unrelated billing scope. Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT`.

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run relevant frontend/backend verification commands, review changed files for type/lint/test issues, dead code, AI slop, and inconsistent credits naming. Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`.

- [x] F3. **Real Manual QA** — `unspecified-high`
  Execute every task QA scenario with Playwright / curl / shell as appropriate. Verify global balance, per-operation cost labels, user history, admin history, insufficient balance, and refund/failed-operation traceability. Save evidence under `.sisyphus/evidence/final-qa/`. Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`.

- [x] F4. **Scope Fidelity Check** — `deep`
  Compare the final diff against the plan. Confirm all changes are directly tied to credits visibility/traceability and no payment/topup/export analytics scope was added. Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`.

## Commit Strategy

- Prefer one commit per completed task or tightly related pair of tasks.
- Commit message convention: `feat(credits): ...`, `test(credits): ...`, `refactor(credits): ...`
- Avoid mixing backend traceability, frontend layout, and UI integration changes in the same commit unless the task explicitly couples them.

## Success Criteria

### Verification Commands
```bash
# Backend
cd fastapi_backend && uv run pytest

# Frontend unit tests
cd nextjs-frontend && pnpm test

# Frontend e2e (project-specific invocation to be chosen based on existing Playwright setup)
cd nextjs-frontend && pnpm exec playwright test
```

### Final Checklist
- [ ] All "Must Have" capabilities are present
- [ ] All "Must NOT Have" exclusions remain absent
- [ ] User balance is globally visible in AI Studio
- [ ] Every resource-consuming AI operation shows its credit cost
- [ ] User and admin transaction histories are both usable and traceable
- [ ] Refund/failure flows remain traceable
- [ ] Automated tests pass
