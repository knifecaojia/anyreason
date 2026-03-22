# Learnings: Global User Credits Experience

> Append-only log of discoveries during implementation.

---

## 2026-03-22: Task 1 - AI Entry Point Audit

### Key Findings

#### 1. Backend Charging Architecture
- **Primary charging service**: `ai_gateway_service` in `app/ai_gateway/service.py`
- **4 charge methods**: `chat_text()`, `chat_text_stream()`, `generate_media()`, `submit_media_async()`
- **Agent charging**: `agent_service.run_text_agent()` in `app/services/agent_service.py`

#### 2. Pricing Logic
- Uses `credit_price_service` for dynamic pricing based on `AIModelConfig.credits_cost`
- Defaults: text=1, image=5, video=50 credits
- Exception: `submit_media_async()` has HARDCODED pricing (10 for video, 5 for other)

#### 3. Critical Gap: Hardcoded Pricing in submit_media_async
```python
# Line 597 in ai_gateway/service.py
credits_cost = 10 if category == "video" else 5
```
- Ignores model-specific pricing
- Potential revenue mismatch

#### 4. Critical Gap: Agent Executions Don't Log to AIUsageEvent
- `agent_service.run_text_agent()` only records in transaction meta
- No `AIUsageEvent` created for agent calls
- Analytics blind spot for agent usage

#### 5. PydanticAI Services Bypass Charging
- `run_chat()`, `run_episode_characters()`, `run_scene_test_chat()` use pydantic-ai directly
- `resolve_text_model_for_pydantic_ai()` only resolves config, doesn't charge
- These flows are effectively free

#### 6. Backend-Only Internal Paths
Several services charge credits without direct frontend routes:
- `ai_storyboard_service._chat_completions()` - hardcoded 1 credit
- `ai_asset_extraction_service._chat_completions()` - hardcoded 1 credit
- Episode agent handlers (6 types) - via `agent_service`
- Asset/task handlers - via `generate_media()`

### Files Verified
- `fastapi_backend/app/ai_gateway/service.py` (856 lines)
- `fastapi_backend/app/services/agent_service.py` (256 lines)
- `fastapi_backend/app/services/credit_price_service.py` (98 lines)
- API routes: `ai_text.py`, `ai_image.py`, `ai_video.py`, `ai_media.py`, `agents.py`
- Task handlers: `batch_video_asset_generate.py`, `asset_image_generate.py`, `model_test_image_generate.py`, `shot_video_generate.py`, `episode_*_agent_apply.py` (6 files)
- Scene engine: `ai_storyboard_service.py`, `ai_asset_extraction_service.py`, `script_split.py`, `chat.py`, `episode_characters.py`
- AI runtime: `pydanticai_model_factory.py`, `ai_scene_test/runner.py`

### Evidence Files Created
- `.sisyphus/evidence/task-1-ai-entrypoint-matrix.md` - Full coverage matrix
- `.sisyphus/evidence/task-1-missing-path-check.md` - Unmapped/ambiguous paths

---

## 2026-03-22: Task 5 - Test Targets and Fixture Reuse Planning

### Key Findings

#### 1. Backend pytest Infrastructure
- **Mature fixtures in `conftest.py`**: `test_client`, `db_session`, `authenticated_user`, `authenticated_superuser`
- **Existing `authenticated_user` already calls `credit_service.ensure_account()`** — no manual balance setup needed
- **Environment issues observed**:
  - Missing `hypothesis` package (may cause collection failures)
  - Non-UTF8 `test_out.txt` collector problem

#### 2. Frontend Jest Infrastructure  
- **Existing test pattern**: `__tests__/loginPage.test.tsx` shows standard pattern with `@testing-library/react`
- **Jest config**: `jest.config.ts` uses Next.js preset with jsdom environment
- **Command caveat**: `--runInBand` through `pnpm test --` matched no tests — use `--testPathPattern` instead

#### 3. Playwright Infrastructure
- **No `playwright.config.ts` exists** — needs to be created for proper e2e test execution
- **`@playwright/test` already installed** (v1.58.2)
- **Existing remote-login.spec.ts** shows basic browser test pattern

#### 4. Frontend Credits Components Available for Testing
- `CreditCostPreview.tsx` — ready for component unit tests (props: category, modelConfigId, estimatedCost, userBalance, showWarning)
- `credits-actions.ts` — server actions: `creditsMy()`, `creditsMyTransactions()`, `creditsAdminGetUser()`, `creditsAdminAdjustUser()`, `creditsAdminSetUser()`

#### 5. Recommended New Fixtures (conftest.py)
```python
# Low-balance user fixture
@pytest_asyncio.fixture(scope="function")
async def low_balance_user(...):
    """User with 1 credit for insufficient-funds tests."""
    # Set balance below image/video costs

# User with transaction history
@pytest_asyncio.fixture(scope="function")
async def user_with_transactions(...):
    """User with consume, admin-adjust, and refund transactions."""
```

#### 6. Missing Harnesses Identified
1. **No Playwright config** — create `playwright.config.ts`
2. **No credits Jest mocks** — create `__tests__/setup/credits-mocks.ts`
3. **No auth helpers for Playwright** — create `tests/helpers/auth.ts`
4. **No backend transaction helpers** — create `tests/helpers/credits.py`

### Evidence Files Updated
- `.sisyphus/evidence/task-5-test-map.md` — requirement → test target mapping with commands
- `.sisyphus/evidence/task-5-fixture-reuse.md` — existing fixtures and recommended new fixtures

### Dependencies Unblocked
- Task 16 (backend pytest) — can now write tests using `authenticated_user` fixture
- Task 17 (frontend Jest) — can now write tests using `CreditCostPreview` component
- Task 18 (Playwright e2e) — needs `playwright.config.ts` created first

---

## 2026-03-22: Task 8 - Reusable Frontend Credit History Data Flow

### Key Findings

#### 1. Data Layer Architecture
Created three new files under `components/credits/`:
- `credits-history-types.ts` - TypeScript interfaces for UI-ready history data
- `credits-history-normalizer.ts` - Pure functions to transform raw API → view-ready rows
- `credits-history-hooks.ts` - React hooks for data loading with state management

#### 2. Normalization Strategy
- Backend provides enriched fields: `operation_display`, `is_refund`, `trace_type`, `linked_event_id`, `category`, `model_display`
- Normalizer uses these when available (from Task 6)
- Falls back to deriving from raw fields (`reason` prefix, `meta.*`) for backward compatibility with legacy transactions
- One `normalizeTransaction()` function handles all types: consume, refund, admin-adjust

#### 3. Trace Type Detection
Backend Task 6 added `trace_type` discriminator. Normalizer derives from:
1. Backend-provided `trace_type` field (preferred)
2. Reason prefix: `ai.*`, `agent.*`, `admin.*`, `init.*`
3. Meta fields: `ai_usage_event_id`, `agent_id`, `notes`

#### 4. Category Classification
Transactions classified into three UI categories:
- `consume`: Negative delta without refund flag
- `refund`: `is_refund=true` or meta.refunded or reason contains "refund"
- `admin-adjust`: `admin.*` reason or positive delta without refund

#### 5. State Management
Three hooks provided:
- `useCreditHistory()` - Full state with refresh capability
- `useCreditHistoryList()` - Simplified [rows, isLoading, error] tuple
- `useCreditHistoryPage()` - Paginated with `loadMore()` and `hasMore` tracking

#### 6. Type Safety Issue Encountered
```
Type '{}' is not assignable to type 'string'
```
Fix: Changed `tx.linked_event_id ?? tx.meta?.ai_usage_event_id ?? null` to explicit type narrowing:
```typescript
typeof tx.linked_event_id === 'string' 
  ? tx.linked_event_id 
  : typeof tx.meta?.ai_usage_event_id === 'string' 
    ? tx.meta.ai_usage_event_id 
    : null
```

### Files Created
- `nextjs-frontend/components/credits/credits-history-types.ts`
- `nextjs-frontend/components/credits/credits-history-normalizer.ts`
- `nextjs-frontend/components/credits/credits-history-hooks.ts`

### Evidence Files Created
- `.sisyphus/evidence/task-8-history-normalization.txt` - Mixed transaction type normalization
- `.sisyphus/evidence/task-8-empty-and-filled-states.txt` - Empty/loading/populated states

### Dependencies Unblocked
- Task 9 (user-facing history view) - Can now import hooks and types
- Task 10 (admin history) - Can reuse normalizer for consistency
- Task 17 (frontend Jest tests) - Test targets identified

### Technical Notes
1. Normalizer is pure functions - no side effects, easy to test
2. Hooks are client components (`"use client"`) - use server actions from credits-actions.ts
3. State factory functions (`createEmptyHistoryState()`) ensure consistent empty/loading/error shapes
4. Pagination support built-in via `hasMore` and `loadMore()` in useCreditHistoryPage

---

## 2026-03-22: Task 11 - Text/Chat Cost Labels

### Key Findings

- Existing text credit preview pattern was already established in `app/(aistudio)/chat/page.tsx`, `app/(aistudio)/ai/page.tsx`, and `components/scripts/ScriptAIAssistantPane.tsx`.
- The remaining missing surfaces were `components/scripts/ScriptAIAssistantChatboxPane.tsx` and `components/scripts/ScriptAIAssistantSessionPane.tsx`.
- Reusing `CreditCostPreview` with `category="text"` was sufficient; no backend or shared billing logic changes were needed.
- Build verification remained green after adding the two missing UI surfaces.

---

## 2026-03-22: Task 12 - Image Cost Labels

### Key Findings

- `app/(aistudio)/ai/image/page.tsx` already had a clean pre-submit action area, so the lowest-risk placement was directly above the generate button.
- `ModelSelector` currently exposes selected model code and capabilities, but not a stable `modelConfigId`, so image preview binding can follow current model selection context only where available.
- Reusing `CreditCostPreview` with `category="image"` plus `CreditsContext` balance was enough to surface both pre-run cost and insufficient-balance warning styling without backend changes.

---

## 2026-03-22: Task 13 - Video/Async Media Cost Labels

### Key Findings

- `app/(aistudio)/ai/video/page.tsx` mirrors the image page structure, so the safest integration path was the same pre-submit preview block directly above the primary generate button.
- The existing async/media debit refresh requirement was satisfied by wiring `CreditsContext.refresh()` in the submit completion path, without changing backend APIs.
- As with image, the current selector exposes model code/capabilities rather than a stable `modelConfigId`, so the preview follows the active video model context where available.

---

## 2026-03-22: Task 14 - Agent Execution Cost Labels

### Key Findings

- `AgentPickerDialog.tsx` already carried `credits_per_call` in the fetched agent metadata, so Task 14 could stay entirely inside the picker UI without touching backend or unrelated execution surfaces.
- For agent execution flows, the most useful UX is explicit pre-run disclosure inside the picker (`消耗 X 积分`) plus a short explanatory note, instead of introducing a separate shared credits component.
- Existing picker `onPick` behavior remained unchanged; this task only clarified cost visibility before invocation.

---

## 2026-03-22: Task 15 - Shared Insufficient/Fallback Credits UX

### Key Findings

- The best leverage point for harmonization was `components/credits/CreditCostPreview.tsx`: one shared change immediately aligned text, image, and video flows.
- Estimate-failure UX is clearer when it stays visible in the same preview block as a fallback note (`预估暂不可用，已显示默认价格`) instead of silently dropping to a default cost.
- Agent flows do not use the shared preview component, so the least invasive alignment was a lightweight note in `AgentPickerDialog.tsx` that preserves the global balance/history entry path when balance is insufficient.

---

## 2026-03-22: Task 16 - Backend Traceability and Refund Tests

### Key Findings

- `tests/routes/test_credits.py` was the right primary target: the runtime contract for traceability fields is exposed via `/credits/my/transactions` and `/credits/admin/users/{user_id}`.
- The most robust fixture-driven way to create real traceability rows was to reuse the existing agent execution path with a mocked `ai_gateway_service.chat_text`, rather than manufacturing raw transactions by hand.
- Refund coverage is strongest when asserting both sides of the linkage: the refund row points back to the original consume transaction, and the original consume row remains visible with non-refund semantics.

---

## 2026-03-22: Task 17 - Frontend Credit UI Jest Coverage

### Key Findings

- `CreditCostPreview` is best unit-tested with explicit `estimatedCost` for loading-state cases, otherwise its fetch effect will intentionally leave the pure loading path.
- In this Jest environment, `global.fetch` is not reliably present for `spyOn`, so direct assignment stubs are more robust for component tests that exercise fallback API behavior.
- `credits-history-normalizer.ts` and `CreditsContext.tsx` provide stable, low-friction unit boundaries that add meaningful coverage without needing higher-level UI integration tests.

---

## 2026-03-22: Task 18 - Playwright Credits Flows

### Key Findings

- The repo-aligned reliable auth path for Playwright in this environment is not the login form and not `/api/v1/auth/...`; it is direct token acquisition from `http://127.0.0.1:8000/auth/jwt/login` plus writing the `accessToken` cookie for the frontend origin.
- For this credits flow, stable end-to-end assertions come from checking persistent shell/history affordances first, then checking pre-cost visibility on `/ai/image` without over-coupling the test to fragile model-option text interactions.
- Keeping the spec single-purpose and removing redundant second-pass history assertions made the flow much more stable while still satisfying the Task 18 coverage goals.

---

## 2026-03-22: Task 19 - Integrated Regression Sweep

### Key Findings

- The selected regression command set is now stable as a compact verification pack: targeted backend pytest, targeted frontend Jest, and one credits Playwright e2e flow.
- By Task 19, no additional test-only fixes were needed; the prior Task 18 auth/setup repair was sufficient for the integrated rerun.
- Keeping the regression scope tightly focused on credits-specific backend, unit, and e2e flows provides high signal without dragging unrelated flaky suites into the release gate.

---

## 2026-03-22: Task 7 - Global Balance Display in Main Layout

### Key Findings

#### 1. Implementation Pattern
Created four files for global credits display:
- `CreditsContext.tsx` - React context for balance state management
- `CreditsHistoryDrawer.tsx` - Right-side drawer for transaction history
- Updated `(aistudio)/layout.tsx` - Server-side balance fetch
- Updated `AppLayout.tsx` - Balance badge and drawer integration

#### 2. Server-Side Fetch Strategy
- Balance fetched alongside `getMe()` in layout.tsx using `creditsMy()`
- Initial balance passed as prop to `CreditsProvider`
- Avoids client-side loading flash for authenticated users
- Graceful fallback to 0 if credits API fails

#### 3. State Management Approach
- `CreditsContext` provides `balance`, `isLoading`, `refresh()`
- Context consumed by both AppLayout (balance badge) and Drawer (transaction list)
- Refresh mechanism ready for Task 11-15 (AI operation balance updates)

#### 4. Drawer Design (Task 4 Alignment)
- Right-side drawer slides in from edge
- Header: "积分流水" with close button
- Balance summary: "当前余额 X 积分"
- Transaction list: scrollable with friendly reason labels
- Footer: "完整历史记录可在「系统设置」中查看"

#### 5. Visual Styling
- Balance badge: Primary color with Coins icon, hover state
- Drawer: Surface background, border, shadow
- Transactions: Colored deltas (green positive, red negative)
- Reason mapping: "ai.text" → "AI 文本生成", "ai.image" → "AI 绘图", etc.

### QA Results
- [x] Balance visible in header on dashboard page (showed "99199")
- [x] Balance persists across navigation to other pages
- [x] Clicking balance opens history drawer
- [x] Drawer shows transaction list with formatted entries
- [x] Empty state, loading state, populated state all handled

### Files Created/Modified
- `nextjs-frontend/components/credits/CreditsContext.tsx` (NEW)
- `nextjs-frontend/components/credits/CreditsHistoryDrawer.tsx` (NEW)
- `nextjs-frontend/app/(aistudio)/layout.tsx` (MODIFIED)
- `nextjs-frontend/components/aistudio/AppLayout.tsx` (MODIFIED)

### Evidence Files Created
- `.sisyphus/evidence/task-7-global-balance-shell.png` - Balance badge visible in header
- `.sisyphus/evidence/task-7-balance-launches-history.png` - Drawer opens on click

### Dependencies Unblocked
- Task 11-15 (AI operation cost integration) - Can use `useCredits().refresh()` to update balance after operations
- Task 9 (user history view) - Drawer shell already implemented

### Technical Notes
1. CreditsProvider wraps entire AI Studio layout for global access
2. Drawer fetches fresh balance on open to reflect post-operation updates
3. `useCredits()` hook provides clean API for any component needing balance access
4. Existing AppLayout patterns (profile dialog, TaskProvider) preserved

---

## 2026-03-22: Task 9 - User-Facing Credit History View

### Key Findings

#### 1. Task 7 Already Implemented Shell
- `CreditsContext.tsx` - Context with balance/refresh
- `CreditsHistoryDrawer.tsx` - Basic drawer component
- `AppLayout.tsx` - Balance badge integrated
- `(aistudio)/layout.tsx` - Server-side balance fetch

#### 2. Enhancement Strategy
Enhanced existing `CreditsHistoryDrawer` with:
- Better date formatting (relative: "今天", "昨天", "3月20日")
- Refund badge indicators
- Improved loading/error/empty states
- Refresh button
- Better visual styling

#### 3. Transaction Row Details
Each row shows:
- **Reason label**: Humanized (e.g., "AI 绘图", "退款")
- **Timestamp**: Relative date formatting
- **Delta**: Colored (+green refund, -red consume)
- **Balance after**: Running balance

#### 4. State Coverage
| State | Condition | UI |
|-------|-----------|-----|
| Loading | `isLoading && transactions.length === 0` | Spinner + "加载中..." |
| Error | `error && transactions.length === 0` | Error message + retry button |
| Empty | `!isLoading && !error && transactions.length === 0` | Icon + message |
| Success | `transactions.length > 0` | Scrollable transaction list |

#### 5. Humanized Reason Mapping
```typescript
// AI operations
"ai.text" → "AI 文本生成"
"ai.image" → "AI 绘图"
"ai.video" → "AI 视频生成"
"ai.media" → "AI 媒体生成"

// Admin operations
"admin.adjust" → "管理员调整"
"admin.set" → "设置余额"

// Other
"refund" → "退款"
"init" → "账户初始化"
```

#### 6. Available Hook for Reuse
Created `useCreditsHistory.ts` for reusable data normalization:
- Can be imported by other components
- Provides `NormalizedTransaction` type
- Includes refresh capability

### Files Modified
- `nextjs-frontend/components/credits/CreditsHistoryDrawer.tsx` - Enhanced drawer with better UX

### Files Created
- `nextjs-frontend/components/credits/useCreditsHistory.ts` - Reusable hook (not used by drawer yet, for future use)

### Evidence Files Created
- `.sisyphus/evidence/task-9-user-history-populated.png` - Populated state screenshot
- `.sisyphus/evidence/task-9-user-history-empty.png.md` - Empty state documentation

### QA Results
- [x] Balance badge visible in header (showing "99199")
- [x] Click opens history drawer
- [x] Transactions display with proper formatting
- [x] Refund badges shown for positive deltas
- [x] Relative dates ("昨天", "3月20日")
- [x] Delta colors correct (red negative, green positive)
- [x] Drawer dismissable (X button)

### Dependencies
- Task 7 (global balance) - Already done, balance badge + drawer shell in place
- Task 4 (UX design) - Drawer chosen, entry flow defined
- Task 6 (backend traceability) - Fields available: delta, balance_after, reason, meta

### Technical Notes
1. Drawer uses inline normalization (not imported hook) for self-contained component
2. `CreditsContext` provides balance, `handleRefresh()` fetches fresh data
3. Empty state cannot be tested with current user (has 50+ transactions)
4. Build passes: `pnpm build` successful

---

## 2026-03-22: Task 8 Bug Fix - Fake Pagination Removed

### Bug Found
`useCreditHistoryPage().loadMore()` called `creditsMyTransactions(initialLimit)` without offset, then deduplicated client-side. This was fake pagination that violated the requirement to "support pagination without redesign."

### Root Cause
The backend API `/api/v1/credits/my/transactions` only supports `limit`, not `offset`. The original implementation pretended it could paginate when it couldn't.

### Fix Applied
1. **Removed** `useCreditHistoryPage()` - replaced with honest implementation
2. **Created** `useCreditHistoryWithLoadAll(limit)` - provides full refresh, not pagination
3. **Deprecated** `loadMore` in favor of `refresh` - both are aliases for re-fetching all data
4. **Updated** `CreditHistoryQueryOptions.offset` - marked as `never` with deprecation note
5. **Updated** Evidence files - document the honest "load all" behavior

### Honest Contract
```typescript
interface HistoryState {
  rows: CreditHistoryRow[];
  isLoading: boolean;
  isRefreshing: boolean;    // True when refresh() is in progress
  error: string | null;
  balance: number | null;
  hasMore: boolean;         // True if API returned exactly `limit` rows
  refresh: () => Promise<void>;  // Re-fetch all data
  /** @deprecated Use refresh() - backend doesn't support offset */
  loadMore: () => Promise<void>; // Alias for refresh()
}
```

### Future Proofing
The data layer is ready for true pagination when backend adds offset support:
- Types already support `limit` parameter
- Normalizer works with any transaction set
- Hook pattern easily swappable

### Files Modified
- `nextjs-frontend/components/credits/credits-history-hooks.ts` - Fixed pagination
- `nextjs-frontend/components/credits/credits-history-types.ts` - Updated offset type

### Evidence Updated
- `.sisyphus/evidence/task-8-empty-and-filled-states.txt` - Reflects honest pagination

---

## 2026-03-22: Task 10 - Admin History View Hardening

### Key Findings

#### 1. Enhanced Modal Structure
Created three new components within `CreditsAdjustModal.tsx`:
- `TraceTypeBadge` - Visual badge showing transaction origin (AI/Agent/Admin/Init/Refund)
- `DeltaDisplay` - Colored delta with directional arrow icon
- `TransactionRow` - Full transaction row with rich traceability context

#### 2. Trace Type Badges
Admin can now easily distinguish:
- **AI** (blue): AI text/image/video generation operations
- **Agent** (purple): Agent execution operations
- **Admin** (orange): Manual admin adjustments
- **Init** (gray): Account initialization
- **Refund** (green): Refund transactions

#### 3. Rich Info Display Per Row
Each transaction row now shows:
- Trace type badge
- Operation label (from `operation_display` or derived)
- Formatted timestamp
- Model display (for AI operations)
- AI category (for AI operations)
- Admin notes (for admin operations)
- Linked event ID prefix (for AI/Agent)
- Original transaction ID prefix (for refunds)
- Delta with colored indicator
- Balance after transaction

#### 4. Type System Integration
Updated `CreditTransaction` type in `credits-actions.ts` to include Task 6 enriched fields:
- `trace_type`, `operation_display`, `is_refund`
- `linked_event_id`, `category`, `model_display`

#### 5. Normalizer Reuse
The modal reuses `normalizeTransaction()` from `credits-history-normalizer.ts` to transform raw API responses into view-ready rows, maintaining consistency between user and admin views.

### Files Modified
- `nextjs-frontend/app/(aistudio)/settings/_components/CreditsAdjustModal.tsx` - Enhanced with richer trace display
- `nextjs-frontend/components/actions/credits-actions.ts` - Added Task 6 enriched fields to type

### Files Created
- None (components added inline to modal)

### Evidence Files Created
- `.sisyphus/evidence/task-10-admin-history-enriched.png` - Shows enriched history with trace badges
- `.sisyphus/evidence/task-10-admin-adjust-still-works.png` - Shows admin controls still functional

### QA Results
- [x] Modal shows "最近流水（可追溯）" header instead of "最近流水"
- [x] Transaction rows display colored trace type badges
- [x] Delta display shows arrow icons with color coding
- [x] Balance display preserved
- [x] Admin adjust controls (delta input, set balance) remain functional
- [x] Build passes successfully

### Dependencies
- Task 6 (backend traceability) - Provides enriched fields in API response
- Task 8 (frontend history normalizer) - Provides reusable normalization logic

### Technical Notes
1. The `TransactionRow` component uses the normalizer to ensure consistent row structure
2. Admin notes are extracted from `meta.notes` when available
3. Refund linkage shows `original_transaction_id` prefix for debugging
4. Linked event IDs show truncated prefix for AI/Agent traceability
5. The normalizer gracefully handles legacy transactions without enriched fields

### Admin-Side Gotchas
1. **Playwright input testing**: React state doesn't always sync with direct DOM manipulation - need to dispatch input/change events properly
2. **Button disabled state**: The submit button checks `Number(creditsAdjustDelta || 0) === 0` - direct value changes need React event dispatching

---

## End of Log
