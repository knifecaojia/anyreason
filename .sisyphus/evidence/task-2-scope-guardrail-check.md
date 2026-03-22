# Task 2: Scope Guardrail Check

> **Purpose**: Validate that the traceability contract does not violate plan guardrails.
> 
> **Date**: 2026-03-22
> **Task**: 2 of 19 (Global User Credits Experience Plan)

---

## 1. Plan Guardrails (from `.sisyphus/plans/global-user-credits-experience.md`)

### Must NOT Have (Guardrails)
1. ❌ Do not implement top-up, redemption, payment, packages, export reports, gifted credits, credit expiration, or other new business
2. ❌ Do not rewrite existing credit pricing core rules unless necessary for unifying frontend display
3. ❌ Do not build a parallel "second ledger" transaction system; must be based on existing `credit_transactions` / `ai_usage_events`
4. ❌ Do not break existing admin credit adjustment capabilities
5. ❌ Do not expand work scope to AI model configuration unrelated to credits, payment systems, or notification systems

### Must Have
1. ✅ Reuse existing credits API, cost-estimate API, `CreditCostPreview` component, `credit_transactions` and `ai_usage_events`
2. ✅ Frontend shows cost for all resource-consuming AI operations
3. ✅ Both users and admins can see consumption records (users see their own, admins see all)
4. ✅ Failure/refund scenarios remain traceable

---

## 2. Contract Scope Analysis

### 2.1 What the Contract IS

| Aspect | Status | Explanation |
|--------|--------|-------------|
| Reuses `credit_transactions` | ✅ PASS | Extends existing table's `meta` JSONB field |
| Reuses `ai_usage_events` | ✅ PASS | Continues using existing table for AI event logging |
| No new ledger | ✅ PASS | Contract is purely additive metadata fields |
| Admin adjustments unaffected | ✅ PASS | `admin.adjust` and `admin.set` still work; new fields are optional |
| Linkage for refund traceability | ✅ PASS | Explicit `original_transaction_id` field enables refund linking |
| User/admin visibility | ✅ PASS | Contract defines both user-facing and admin-extended fields |

### 2.2 What the Contract is NOT

| Forbidden Scope | Status | Evidence |
|-----------------|--------|----------|
| Top-up/payment system | ❌ NOT IN SCOPE | Contract only links existing records |
| Redemption system | ❌ NOT IN SCOPE | Contract doesn't introduce redemption flows |
| Export/analytics dashboard | ❌ NOT IN SCOPE | Contract is query schema only |
| Credit expiration | ❌ NOT IN SCOPE | No expiration logic in contract |
| Gifting/transfer | ❌ NOT IN SCOPE | No inter-user transfer fields |
| Pricing rule changes | ❌ NOT IN SCOPE | Contract extends metadata, not pricing |
| Separate ledger | ❌ NOT IN SCOPE | Uses existing tables only |

---

## 3. Field-by-Field Guardrail Validation

### 3.1 New Fields in `credit_transactions.meta`

| New Field | Type | Purpose | Guardrail Status |
|-----------|------|---------|------------------|
| `trace_type` | string | Discriminator: "ai", "agent", "admin", "init" | ✅ PASS - visibility only |
| `category` | string | AI category (text/image/video) | ✅ PASS - existing field |
| `binding_key` | string | Model binding key | ✅ PASS - existing field |
| `ai_model_config_id` | string (UUID) | Config reference | ✅ PASS - existing FK |
| `ai_usage_event_id` | string (UUID) | Link to usage event | ✅ PASS - linkage only |
| `operation_id` | string | Correlation ID | ✅ PASS - tracing only |
| `refunded` | boolean | Refund indicator | ✅ PASS - visibility only |
| `original_transaction_id` | string (UUID) | Refund linkage | ✅ PASS - traceability |
| `original_delta` | integer | Original amount | ✅ PASS - traceability |
| `attempted_category` | string | Failed op context | ✅ PASS - traceability |
| `attempted_model` | string | Failed op context | ✅ PASS - traceability |
| `agent_id` | string (UUID) | Agent reference | ✅ PASS - existing FK |
| `agent_name` | string | Display name | ✅ PASS - visibility |
| `notes` | string | Admin notes | ✅ PASS - visibility |
| `previous_balance` | integer | Adjustment context | ✅ PASS - visibility |

### 3.2 Forbidden Fields Check

| Forbidden Field Pattern | Found? | Action |
|-------------------------|--------|--------|
| `amount` (payment amount) | ❌ NO | N/A |
| `currency` | ❌ NO | N/A |
| `payment_method` | ❌ NO | N/A |
| `transaction_fee` | ❌ NO | N/A |
| `expiry_date` | ❌ NO | N/A |
| `gift_code` | ❌ NO | N/A |
| `export_*` | ❌ NO | N/A |
| `analytics_*` | ❌ NO | N/A |

---

## 4. API Endpoint Scope Validation

### 4.1 User Endpoints

| Endpoint | Fields Returned | Guardrail Status |
|----------|-----------------|------------------|
| `GET /credits/my` | balance | ✅ PASS - unchanged |
| `GET /credits/my/transactions` | delta, balance_after, reason, created_at, trace_type, operation_display, is_refund | ✅ PASS - visibility only |

### 4.2 Admin Endpoints

| Endpoint | Fields Returned | Guardrail Status |
|----------|-----------------|------------------|
| `GET /credits/admin/users/{id}` | Full transaction + meta | ✅ PASS - unchanged |
| `POST /credits/admin/users/{id}/adjust` | delta, reason, meta (optional) | ✅ PASS - unchanged |
| `POST /credits/admin/users/{id}/set` | balance, reason, meta (optional) | ✅ PASS - unchanged |

### 4.3 Not Modified (Out of Scope)

| Endpoint | Status | Reason |
|----------|--------|--------|
| `POST /credits/topup/intent` | ❌ NOT TOUCHED | Payment system - out of scope |
| `POST /credits/redeem` | ❌ NOT TOUCHED | Redemption system - out of scope |

---

## 5. Behavioral Scope Validation

### 5.1 Consume Path

| Behavior | Guardrail Status |
|----------|------------------|
| Debit balance | ✅ PASS - existing behavior |
| Record transaction with meta | ✅ PASS - existing behavior |
| Create AIUsageEvent | ✅ PASS - existing behavior |
| Link event to transaction | ✅ PASS - contract addition |

### 5.2 Refund Path

| Behavior | Guardrail Status |
|----------|------------------|
| Credit balance | ✅ PASS - existing behavior |
| Record refund transaction | ✅ PASS - existing behavior |
| Link to original transaction | ✅ PASS - contract addition |
| Maintain traceable history | ✅ PASS - contract purpose |

### 5.3 Admin Adjustment Path

| Behavior | Guardrail Status |
|----------|------------------|
| Adjust/set balance | ✅ PASS - existing behavior |
| Actor audit logged | ✅ PASS - existing behavior |
| New optional meta fields | ✅ PASS - additive only |

---

## 6. Contract Compliance Summary

### ✅ PASSING GUARDRAILS

| Guardrail | Evidence |
|-----------|----------|
| No new ledger | Contract extends existing `credit_transactions.meta` JSONB only |
| Reuses existing tables | `credit_transactions` and `ai_usage_events` used unchanged |
| Admin functionality preserved | All admin endpoints unchanged; new fields optional |
| Visibility only | No payment, pricing, or analytics logic introduced |
| Refund traceability | Explicit `original_transaction_id` field enables linking |
| Backward compatible | All new fields nullable; existing data degrades gracefully |

### ❌ VIOLATIONS

**None detected.**

---

## 7. Recommendation

**✅ Contract is within scope. No guardrail violations.**

The proposed contract:
1. Uses only existing persistence infrastructure (`credit_transactions`, `ai_usage_events`)
2. Adds metadata fields for traceability without changing business logic
3. Maintains all existing admin adjustment capabilities
4. Does not introduce payment, redemption, export, or analytics features
5. Is fully backward compatible with existing data

**Task 6 implementation should proceed with confidence.**

---

## Evidence

- Plan: `.sisyphus/plans/global-user-credits-experience.md` (Guardrails section)
- Contract: `.sisyphus/evidence/task-2-traceability-contract.md`
