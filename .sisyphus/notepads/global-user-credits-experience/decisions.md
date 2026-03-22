# Decisions: Global User Credits Experience

> Append-only log of architectural and design decisions made during implementation.

---

## 2026-03-22: Task 2 - Backend Traceability Contract

### Decision: Link Credit Transactions to AI Usage Events via JSONB Metadata

#### Context
Task 1 revealed that `credit_transactions` and `AIUsageEvent` are written separately without bidirectional linkage. Agent operations don't even create `AIUsageEvent` records. Refund transactions have no explicit link back to the original consume operation.

#### Decision

**Primary Linkage Mechanism**: `credit_transactions.meta.ai_usage_event_id`

```
credit_transactions.meta.ai_usage_event_id → AIUsageEvent.id
```

**Refund Linkage**: `credit_transactions.meta.original_transaction_id`

```
refund_transaction.meta.original_transaction_id → original_consume_transaction.id
```

#### Rationale

1. **No schema changes required**: Both tables already exist. The contract extends `meta` JSONB fields only.

2. **Backward compatible**: Existing transactions without new fields gracefully degrade. All new fields are optional.

3. **Timestamp proximity fallback**: For queries without explicit ID, events within 5-second windows can be correlated.

4. **Explicit for refunds**: `original_transaction_id` provides direct linkage without guessing.

5. **Minimal overhead**: JSONB additions don't require migrations.

#### Contract Summary

| Transaction Type | Required meta Fields |
|-----------------|---------------------|
| `ai.consume` | `trace_type: "ai"`, `category`, `ai_usage_event_id`, `refunded: false` |
| `ai.refund` | `trace_type: "ai"`, `original_transaction_id`, `refunded: true`, `original_delta` |
| `agent.consume` | `trace_type: "agent"`, `agent_id`, `ai_usage_event_id` (add in Task 6) |
| `agent.refund` | `trace_type: "agent"`, `original_transaction_id`, `refunded: true` |
| `admin.adjust` | `trace_type: "admin"`, optional `notes` |

#### Schema Additions

- `CreditTransactionRead` remains unchanged (meta is JSONB)
- New computed fields for API responses: `operation_display`, `is_refund`, `trace_type`
- Admin endpoint returns full `meta` for debugging

#### Alternatives Considered

| Alternative | Rejected Reason |
|-------------|-----------------|
| Add FK column `credit_transactions.ai_usage_event_id` | Requires migration; JSONB is simpler for optional linkage |
| Create new `CreditAuditLog` table | Violates "no second ledger" guardrail |
| Store AIUsageEvent ID in `reason` field | Would break reason field semantics |
| UUID correlation table | Adds unnecessary join complexity |

#### Implications for Task 6

1. Agent operations must create `AIUsageEvent` records
2. Transaction creation must happen after event creation (or use placeholder pattern)
3. Refund path must populate `original_transaction_id`

#### Evidence
- `.sisyphus/evidence/task-2-traceability-contract.md`
- `.sisyphus/evidence/task-2-scope-guardrail-check.md`

---

## 2026-03-22: Task 6 - Implementation of Backend Traceability

### Implemented Changes

#### 1. Credit Service (`credit_service.py`)
- Enhanced `adjust_balance()` to return tuple `(account, transaction)` for traceability
- Enhanced `set_balance()` to return tuple `(account, transaction)` for traceability
- Added auto-extraction of `trace_type` discriminator based on reason prefix
- Added `previous_balance` tracking for set operations
- Added legacy methods `adjust_balance_simple()` and `set_balance_simple()` for backward compatibility

#### 2. AI Gateway Service (`ai_gateway/service.py`)
- **`chat_text()`**: Creates AIUsageEvent BEFORE debit, stores event ID in transaction meta, creates final event with actual cost/error on completion
- **`chat_text_stream()`**: Same pattern as chat_text with proper event tracking
- **`generate_media()`**: Same pattern for image/video generation
- **`submit_media_async()`**: Adds traceable meta fields (event ID set to null since async completion creates event separately)

All refund paths now include:
- `original_transaction_id` - links to original consume transaction
- `original_delta` - stores original debit amount
- `error_code` and `error_message` - for debugging

#### 3. Agent Service (`agent_service.py`)
- **`run_text_agent()`**: Now creates AIUsageEvent for agent operations
- Stores `agent_id`, `agent_name`, and model config ID in event metadata
- Includes `ai_usage_event_id` in transaction meta
- Proper refund linkage with error context

#### 4. API Schemas (`schemas_credits.py`)
- **`CreditTransactionRead`**: Added computed fields via Pydantic model_validator:
  - `trace_type` - discriminator (ai/agent/admin/init)
  - `operation_display` - human-readable description (e.g., "文本生成: GPT-4")
  - `is_refund` - boolean flag
  - `linked_event_id` - UUID of linked AIUsageEvent
  - `category` - AI category (text/image/video)
  - `model_display` - model name for display
- **`CreditTransactionAdminRead`**: Extended schema for admin views
- **`AdminCreditAdjustRequest`**: Added `notes` field
- **`AdminCreditSetRequest`**: Added `notes` field

#### 5. API Routes (`credits.py`)
- `/my/transactions`: Returns transactions with computed traceability fields
- `/admin/users/{user_id}`: Returns admin-extended view with full meta
- Admin adjust/set: Auto-populate `trace_type: "admin"` and `notes` in meta

### Traceability Meta Fields Per Operation

| Operation | trace_type | Key Fields |
|-----------|------------|------------|
| AI text consume | ai | ai_usage_event_id, category="text", model |
| AI image consume | ai | ai_usage_event_id, category="image", model |
| AI video consume | ai | ai_usage_event_id, category="video", model |
| Agent consume | agent | ai_usage_event_id, agent_id, agent_name |
| Admin adjust | admin | notes, previous_balance |
| Admin set | admin | notes, previous_balance |

### Refund Chain Structure

```
Original Consume Transaction:
  delta: -1
  meta.ai_usage_event_id: "evt-uuid"
  meta.refunded: false

Refund Transaction:
  delta: +1
  meta.refunded: true
  meta.original_transaction_id: "original-txn-uuid"
  meta.original_delta: -1
  meta.ai_usage_event_id: "evt-uuid" (same as consume)

AIUsageEvent (created with consume):
  id: "evt-uuid"
  cost_credits: 1 (or 0 if refunded)
  error_code: null (or error if failed)
```

### Verification Results

```
tests/routes/test_credits.py::test_my_credits_returns_balance PASSED
tests/routes/test_credits.py::test_admin_adjust_user_credits PASSED
tests/routes/test_agents.py::test_agent_run_consumes_credits PASSED
tests/routes/test_agents.py::test_agent_run_refunds_on_llm_error PASSED
tests/ai_gateway/test_non_media_regression.py (17 tests) PASSED
```

### Technical Notes

1. **AIUsageEvent UPDATE Pattern (CRITICAL BUG FIX)**:
   - Initial implementation created a NEW final_event in the finally block, leaving the placeholder with cost_credits=0
   - This broke the Task 2 contract: `credit_transactions.meta.ai_usage_event_id` pointed to the WRONG row
   - FIX: Track placeholder_event reference, then UPDATE its attributes instead of creating new row
   - This ensures the linked event always has the correct final cost/error data
   - Fixed in: `chat_text()`, `chat_text_stream()`, `generate_media()` (ai_gateway/service.py)
   - Fixed in: `run_text_agent()` (agent_service.py) - was creating new row, now updates placeholder

2. **AIUsageEvent Creation Pattern**: 
   - Create placeholder event first to get ID
   - Use ID in transaction meta for linkage
   - UPDATE placeholder attributes in finally block (cost_credits, latency_ms, error_code, raw_payload)
   - Single event row with correct data, always linked from transaction

3. **Pydantic Schema Validator**: Used `model_validator(mode='before')` to extract computed fields from meta. Must handle both SQLAlchemy model instances and dicts.

4. **Backward Compatibility**: All changes are additive. Existing transactions without new meta fields gracefully degrade (computed fields return None/false).

5. **SQLAlchemy Type Issues**: Pre-existing LSP errors for `Column[...]` type assignments are benign - SQLAlchemy allows assignment to column descriptors at runtime.

### Evidence Files
- `.sisyphus/evidence/task-6-user-transactions-response.json`
- `.sisyphus/evidence/task-6-refund-traceability.json`

### Dependencies Unblocked
- Task 8 (frontend history display) - can now use operation_display, is_refund fields
- Task 9 (refund UI) - can link refund to original via original_transaction_id
- Task 10 (admin debugging) - can query AIUsageEvent by linked_event_id
- Task 16 (backend tests) - can verify traceability fields in tests

---

## 2026-03-22: Task 7 - Global Balance Display Implementation

### Design Decisions Made

#### 1. Context vs Prop Drilling Decision

**Decision**: Created `CreditsContext` instead of prop drilling

**Rationale**:
- Drawer needs balance, balance badge needs balance, future components will need balance
- Prop drilling would couple AppLayout to every component that needs balance
- Context provides clean API: `useCredits().balance` and `useCredits().refresh()`

**Alternative Considered**: Prop drilling from layout → AppLayout → components
- **Rejected**: Would require passing props through every intermediate component
- Would couple page components to balance state they shouldn't care about

#### 2. Server-Side vs Client-Side Initial Load

**Decision**: Server-side fetch in layout.tsx

**Rationale**:
- Zero layout shift - balance visible immediately on page load
- Follows existing `getMe()` pattern in layout
- Avoids "loading..." flash for balance badge

**Alternative Considered**: Client-side fetch in AppLayout
- **Rejected**: Would show loading state briefly on every page
- Inconsistent with existing `me` state pattern

#### 3. Drawer vs Modal vs Page Route

**Decision**: Right-side drawer (per Task 4 design)

**Rationale**:
- Non-blocking - user can dismiss and return to work
- Stays in context - doesn't navigate away
- Accessible from any AI Studio page via header badge
- Matches app's existing dialog patterns

#### 4. Refresh Mechanism

**Decision**: `refresh()` function in context that calls `creditsMy()`

**Rationale**:
- Simple - one API call to get fresh balance
- AI operation components can call `refresh()` after successful operations
- Drawer refreshes on open to show latest after operations

**Usage Pattern**:
```tsx
// In AI operation component (Tasks 11-15)
const { refresh } = useCredits();
await performAIOperation();
await refresh(); // Refresh global balance
```

#### 5. Reason Labeling Strategy

**Decision**: Client-side formatting in drawer, not in normalization layer

**Rationale**:
- Drawer is the primary consumer of formatted reasons
- Normalization layer (Task 8) returns raw data
- Formatter function in drawer converts `reason` → friendly label
- Reusable across user drawer and admin modal if needed later

**Label Mapping**:
| Reason Prefix | Display Label |
|--------------|---------------|
| `ai.text` | AI 文本生成 |
| `ai.image` | AI 绘图 |
| `ai.video` | AI 视频生成 |
| `ai.media` | AI 媒体生成 |
| `agent.*` | 智能体执行 |
| `admin.adjust` | 管理员调整 |
| `admin.set` | 管理员设置 |
| `*refund*` | 退款 |
| `init` | 账户初始化 |

### Architecture Summary

```
(aistudio)/layout.tsx (Server Component)
├── getMe() → user
├── creditsMy() → initialBalance
└── CreditsProvider
    └── AppLayout (Client Component)
        ├── Header: Balance Badge (Coins icon + number)
        ├── creditsMyTransactions() → history drawer
        └── CreditsHistoryDrawer
            ├── Balance summary
            ├── Transaction list
            └── Footer hint
```

### Future Integration Points

Tasks 11-15 will use:
```tsx
const { balance, refresh } = useCredits();

// After AI operation
await refresh();
```

This pattern ensures global balance stays in sync across all pages.

---

## End of Decisions