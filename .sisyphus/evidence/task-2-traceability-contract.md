# Task 2: Backend Traceability Contract for Credit Transaction/Event Linkage

> **Purpose**: Define the minimal contract that links `credit_transactions` and `AIUsageEvent` for user/admin traceability without creating a new ledger.
> 
> **Date**: 2026-03-22
> **Task**: 2 of 19 (Global User Credits Experience Plan)

---

## 1. Current State Analysis

### 1.1 Existing Models

#### CreditTransaction (`models.py` lines 1026-1041)
```python
class CreditTransaction(Base):
    id: UUID
    user_id: UUID
    delta: int
    balance_after: int
    reason: str  # e.g., "ai.consume", "ai.refund", "agent.consume", "admin.adjust"
    actor_user_id: UUID | null
    meta: JSONB  # Currently: category, binding_key, manufacturer, model
    created_at: datetime
```

#### AIUsageEvent (`models.py` lines 238-266)
```python
class AIUsageEvent(Base):
    id: UUID
    user_id: UUID
    category: str  # text, image, video
    binding_key: str | null
    ai_model_config_id: UUID | null
    cost_credits: int
    latency_ms: int | null
    error_code: str | null
    raw_payload: JSONB
    created_at: datetime
```

### 1.2 Current meta Usage Patterns

| Charge Path | Reason | Current meta fields |
|------------|--------|---------------------|
| `chat_text()` | `ai.consume` / `ai.refund` | `{category, binding_key, manufacturer, model}` |
| `chat_text_stream()` | `ai.consume` / `ai.refund` | `{category, binding_key, manufacturer, model}` |
| `generate_media()` | `ai.consume` / `ai.refund` | `{category, binding_key, manufacturer, model}` |
| `submit_media_async()` | `ai.consume` / `ai.refund` | `{category, binding_key, manufacturer, model}` |
| `run_text_agent()` | `agent.consume` / `agent.refund` | `{agent_id}` |
| `admin_adjust_user_credits()` | `admin.adjust` | `{...admin_provided}` |

### 1.3 Identified Gaps

1. **No bidirectional linkage**: `credit_transactions.meta` has no reference to `AIUsageEvent.id`, and vice versa
2. **Refund traceability missing**: No field to link a refund transaction back to the original consume
3. **Agent operations lack AIUsageEvent**: `agent_service.run_text_agent()` doesn't create an `AIUsageEvent`
4. **Inconsistent meta**: Agent consume only stores `agent_id`, missing model/context info
5. **No display-ready fields**: Response schemas lack human-readable operation descriptions

---

## 2. Proposed Traceability Contract

### 2.1 CreditTransaction.meta Field Specifications

#### For `reason = "ai.consume"` or `"ai.refund"`:

```python
{
    # --- Discriminator (required) ---
    "trace_type": "ai",           # str: discriminator for AI operations
    
    # --- Operation Context (required for traceability) ---
    "category": str,              # str: "text" | "image" | "video"
    "binding_key": str | null,   # str: binding key used
    "ai_model_config_id": str,   # str: UUID of AIModelConfig
    
    # --- Linkage Fields (required for contract) ---
    "ai_usage_event_id": str,    # str: UUID of corresponding AIUsageEvent
    "operation_id": str | null,  # str: optional request correlation ID
    
    # --- Refund Linkage (required for refund traceability) ---
    "refunded": bool,                        # bool: true if this is a refund record
    "original_transaction_id": str | null,   # str: UUID of original consume, only on refunds
    "original_delta": int | null,            # int: original debit amount, only on refunds
    
    # --- Attempted Operation (for failed operations) ---
    "attempted_category": str | null,  # str: what was attempted (if different)
    "attempted_model": str | null,    # str: model attempted (if known)
}
```

#### For `reason = "agent.consume"` or `"agent.refund"`:

```python
{
    # --- Discriminator ---
    "trace_type": "agent",         # str: discriminator for agent operations
    
    # --- Agent Context ---
    "agent_id": str,               # str: UUID of the Agent
    "agent_name": str | null,      # str: agent name for display
    "ai_model_config_id": str,    # str: UUID of AIModelConfig
    
    # --- Linkage Fields ---
    "ai_usage_event_id": str | null,  # str: UUID of AIUsageEvent (optional, add in Task 6)
    "operation_id": str | null,
    
    # --- Refund Linkage ---
    "refunded": bool,
    "original_transaction_id": str | null,
    "original_delta": int | null,
}
```

#### For `reason = "admin.adjust"` or `"admin.set"`:

```python
{
    "trace_type": "admin",           # str: discriminator
    
    # Admin context is already in actor_user_id FK
    # Additional optional fields:
    "notes": str | null,             # str: admin-provided notes
    "previous_balance": int | null,  # int: balance before adjustment (for set operations)
}
```

#### For `reason = "init"` (account creation):

```python
{
    "trace_type": "init",    # str: account initialization
}
```

### 2.2 AIUsageEvent Linkage Strategy

**Primary Linkage**: `AIUsageEvent.id` stored in `credit_transactions.meta.ai_usage_event_id`

**Timestamp Proximity**: For queries without explicit ID:
- Same user
- Within 5-second window
- Same `category`, `binding_key`
- Can correlate via `raw_payload.metadata.operation_id` if present

**Refunds**: Explicit via `original_transaction_id` field in transaction meta.

### 2.3 Required Schema Additions

#### CreditTransactionRead (`schemas_credits.py`)

```python
class CreditTransactionRead(BaseModel):
    id: UUID
    user_id: UUID
    delta: int
    balance_after: int
    reason: str
    actor_user_id: UUID | None = None
    meta: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    
    # --- New Traceability Fields ---
    trace_type: str | None = None  # Extracted from meta.trace_type
    
    model_config = {"from_attributes": True}
```

**Response Shape Additions for User History UI**:
```python
class CreditTransactionWithTrace(BaseModel):
    # ... CreditTransactionRead fields ...
    
    # Computed/flattened for UI convenience:
    operation_display: str | None = None  # "Text: GPT-4", "Image: Stable Diffusion", etc.
    is_refund: bool = False
    linked_event_id: UUID | None = None
```

---

## 3. Consume Path Behavior

### 3.1 AI Operations (chat_text, chat_text_stream, generate_media, submit_media_async)

**Order of Operations**:
1. Resolve model config
2. Calculate credits cost
3. **Debit balance** (`credit_service.adjust_balance`, reason=`ai.consume`)
   - meta includes: `trace_type: "ai"`, `category`, `binding_key`, `ai_model_config_id`, `ai_usage_event_id: null` (will update)
4. **Execute AI operation**
5. **Create AIUsageEvent** with calculated `cost_credits`
   - Link: Store transaction ID in event if needed, or rely on timestamp proximity
6. **Update transaction meta** with `ai_usage_event_id` (requires separate update or deferred pattern)
7. Commit all

**Simplified Approach** (recommended for Task 6):
- Write AIUsageEvent FIRST
- Use event ID in transaction meta
- Commit together

### 3.2 Agent Operations (run_text_agent)

**Current Gap**: No AIUsageEvent created.

**Required Fix** (Task 6):
1. Create AIUsageEvent before debit
2. Store event ID in transaction meta
3. Update meta to include model context

### 3.3 Operation ID Propagation

For distributed tracing, propagate `operation_id`:
- Generate at API entry point
- Pass through service layers
- Include in both AIUsageEvent.raw_payload and transaction meta

---

## 4. Refund Path Behavior

### 4.1 Refund Trigger Conditions

| Condition | Response |
|-----------|----------|
| AI operation fails with AppError | Refund consumed credits |
| Upstream provider error | Refund consumed credits |
| Insufficient balance (pre-check) | Reject, no debit |
| Slot exhaustion (queue flow) | Return queue reference |

### 4.2 Refund Transaction Structure

```python
# For ai.refund:
{
    "trace_type": "ai",
    "category": "...",           # Match original
    "binding_key": "...",
    "ai_model_config_id": "...",
    "ai_usage_event_id": "...",
    "refunded": True,
    "original_transaction_id": "<uuid of original ai.consume>",
    "original_delta": <negative value>,
    
    # Optional additional context:
    "error_code": "...",
    "error_message": "...",
}
```

### 4.3 Refund Linkage Query

To find the original operation from a refund:
1. Read `meta.original_transaction_id` → direct link
2. Fallback: Query by `reason="ai.consume"`, same user, same `category`+`model`, timestamp within window

---

## 5. Admin vs User Visibility

### 5.1 User-Facing History Fields

| Field | Source | Description |
|-------|--------|-------------|
| `delta` | `delta` | Credit change (+/-) |
| `balance_after` | `balance_after` | Balance after transaction |
| `reason` | `reason` | Machine-readable reason |
| `operation_display` | Computed | Human-readable: "文本生成: GPT-4" |
| `is_refund` | `meta.refunded` | Whether this is a refund |
| `created_at` | `created_at` | Transaction timestamp |

### 5.2 Admin-Extended History Fields

| Field | Source | Description |
|-------|--------|-------------|
| All user fields | — | — |
| `ai_usage_event_id` | `meta.ai_usage_event_id` | Link to usage event |
| `ai_model_config_id` | `meta.ai_model_config_id` | Model config UUID |
| `actor_user_id` | `actor_user_id` | Admin who made adjustment |
| `error_code` | `meta.error_code` | Error code if failed |
| `raw_payload` | AIUsageEvent.raw_payload | Raw provider response |

### 5.3 Schema Strategy

```python
# Base user-facing schema
class CreditTransactionRead(BaseModel):
    id: UUID
    delta: int
    balance_after: int
    reason: str
    created_at: datetime
    # meta still available but not flattened
    
# Admin-extended schema (used in admin endpoints)
class CreditTransactionAdminRead(CreditTransactionRead):
    actor_user_id: UUID | None
    meta: dict[str, Any]
```

---

## 6. Implementation Notes for Task 6

### 6.1 Backward Compatibility

- `credit_transactions.meta` is JSONB — new fields are additive
- Existing transactions without new fields gracefully degrade
- Response schemas use `| None` for new fields

### 6.2 Transaction Ordering

For atomicity, consider:
1. Create transaction record with placeholder `ai_usage_event_id: null`
2. Create AIUsageEvent
3. Update transaction with event ID
4. Commit

Or use database transaction with both writes before commit.

### 6.3 AIUsageEvent for Agent Operations

Current: No AIUsageEvent for agent calls.

Required addition:
```python
# In agent_service.run_text_agent():
# After debit, before AI call:
db.add(AIUsageEvent(
    user_id=user_id,
    category="text",  # agents are text-only currently
    binding_key=None,
    ai_model_config_id=agent.ai_model_config_id,
    cost_credits=cost,
    latency_ms=None,
    error_code=None,
    raw_payload={"agent_id": str(agent.id), "agent_name": agent.name},
))
```

### 6.4 Query Patterns

**User history with trace info**:
```sql
SELECT ct.*, ct.meta->>'operation_display' as op_display
FROM credit_transactions ct
WHERE ct.user_id = :user_id
ORDER BY ct.created_at DESC
LIMIT :limit
```

**Admin: Find linked usage event**:
```sql
SELECT aue.*
FROM ai_usage_events aue
WHERE aue.user_id = :user_id
  AND aue.created_at BETWEEN :txn_time - interval '5 seconds'
                          AND :txn_time + interval '5 seconds'
  AND aue.category = :category
```

---

## 7. Summary

| Aspect | Decision |
|--------|----------|
| Linkage mechanism | `meta.ai_usage_event_id` in CreditTransaction |
| Refund linkage | `meta.original_transaction_id` in refund records |
| Schema additions | `trace_type`, `operation_display`, `is_refund` computed fields |
| Admin vs user | Shared base schema, admin gets full `meta` access |
| Agent gap | Task 6 must add AIUsageEvent creation for agent operations |
| Backward compat | Additive JSONB fields, nullable new schema fields |
| No new ledger | Reuses existing CreditTransaction + AIUsageEvent tables |

---

## Evidence

- Read: `fastapi_backend/app/models.py` (lines 238-266, 1026-1041)
- Read: `fastapi_backend/app/services/credit_service.py`
- Read: `fastapi_backend/app/ai_gateway/service.py`
- Read: `fastapi_backend/app/services/agent_service.py`
- Read: `fastapi_backend/app/schemas_credits.py`
- Read: `fastapi_backend/app/api/v1/credits.py`
- Referenced: `.sisyphus/evidence/task-1-ai-entrypoint-matrix.md` (learnings from Task 1)
