# Task 5: Test Map — Requirements to Automated Test Targets

## Overview

This document maps each core requirement from the Global User Credits Experience plan to specific automated test targets (backend pytest, frontend Jest, and Playwright E2E).

---

## Requirement 1: Global Balance Display

**Definition**: Login后，在AI Studio任意页面可看到当前用户积分余额。

### Test Targets

| Layer | Target File | Test Command | Coverage |
|-------|-------------|--------------|----------|
| Backend API | `tests/routes/test_credits.py` | `uv run pytest tests/routes/test_credits.py::test_my_credits_returns_balance` | `GET /api/v1/credits/my` returns balance |
| Backend API | `tests/routes/test_credits.py` | `uv run pytest tests/routes/test_credits.py` | All credits route tests pass |
| Frontend Jest | `__tests__/components/credits/CreditCostPreview.test.tsx` (NEW) | `cd nextjs-frontend && pnpm test -- --testPathPattern="CreditCostPreview"` | Component renders with balance prop |
| Frontend Jest | `__tests__/components/actions/credits-actions.test.ts` (NEW) | `cd nextjs-frontend && pnpm test -- --testPathPattern="credits-actions"` | `creditsMy()` action returns balance |
| Playwright E2E | `tests/global-balance.spec.ts` (NEW) | `cd nextjs-frontend && pnpm playwright test tests/global-balance.spec.ts` | Balance visible in AI Studio shell across pages |

---

## Requirement 2: Cost Display on AI Operations

**Definition**: 每个资源消耗类AI操作在执行前或执行入口处明确显示本次积分消耗。

### Test Targets

| Layer | Target File | Test Command | Coverage |
|-------|-------------|--------------|----------|
| Backend API | `tests/test_service_and_routes.py::TestGenerateMediaImageRouting::test_image_category_deducts_credits` | `uv run pytest tests/test_service_and_routes.py -k "deducts_credits"` | Image operation deducts credits |
| Backend API | `tests/test_service_and_routes.py::TestGenerateMediaVideoRouting::test_video_category_deducts_credits` | `uv run pytest tests/test_service_and_routes.py -k "video_category_deducts"` | Video operation deducts credits |
| Backend API | `tests/routes/test_agents.py::test_agent_run_consumes_credits` | `uv run pytest tests/routes/test_agents.py -k "consumes_credits"` | Agent run deducts credits |
| Backend API | `tests/test_service_and_routes.py::TestGenerateMediaImageRouting::test_image_category_refunds_on_provider_error` | `uv run pytest tests/test_service_and_routes.py -k "refunds_on"` | Refund on error |
| Frontend Jest | `__tests__/components/credits/CreditCostPreview.test.tsx` (NEW) | `pnpm test -- --testPathPattern="CreditCostPreview"` | Component displays estimated cost |
| Playwright E2E | `tests/cost-display-text.spec.ts` (NEW) | `pnpm playwright test tests/cost-display-text.spec.ts` | Text/chat operation shows cost |
| Playwright E2E | `tests/cost-display-image.spec.ts` (NEW) | `pnpm playwright test tests/cost-display-image.spec.ts` | Image operation shows cost |
| Playwright E2E | `tests/cost-display-video.spec.ts` (NEW) | `pnpm playwright test tests/cost-display-video.spec.ts` | Video operation shows cost |
| Playwright E2E | `tests/cost-display-agent.spec.ts` (NEW) | `pnpm playwright test tests/cost-display-agent.spec.ts` | Agent execution shows cost |

---

## Requirement 3: User Transaction History View

**Definition**: 用户可查看自己的积分流水 (credit_transactions).

### Test Targets

| Layer | Target File | Test Command | Coverage |
|-------|-------------|--------------|----------|
| Backend API | `tests/routes/test_credits.py::test_admin_adjust_user_credits` | `uv run pytest tests/routes/test_credits.py::test_admin_adjust_user_credits` | Transactions returned for user |
| Backend API | `tests/routes/test_credits.py` (NEW) | `uv run pytest tests/routes/test_credits.py::test_my_transactions_returns_history` | `GET /api/v1/credits/my/transactions` works |
| Backend API | `tests/routes/test_credits.py` (NEW) | `uv run pytest tests/routes/test_credits.py::test_my_transactions_includes_trace_context` | Transaction includes trace fields |
| Frontend Jest | `__tests__/components/credits/TransactionHistory.test.tsx` (NEW) | `pnpm test -- --testPathPattern="TransactionHistory"` | History component renders rows |
| Frontend Jest | `__tests__/components/actions/credits-actions.test.ts` (NEW) | `pnpm test -- --testPathPattern="credits-actions"` | `creditsMyTransactions()` returns data |
| Playwright E2E | `tests/user-history.spec.ts` (NEW) | `pnpm playwright test tests/user-history.spec.ts` | User can view populated history |
| Playwright E2E | `tests/user-history-empty.spec.ts` (NEW) | `pnpm playwright test tests/user-history-empty.spec.ts` | Empty state renders gracefully |

---

## Requirement 4: Admin Transaction History with Traceability

**Definition**: 管理员可查看并追溯用户流水与调整记录 (ai_usage_events linkage).

### Test Targets

| Layer | Target File | Test Command | Coverage |
|-------|-------------|--------------|----------|
| Backend API | `tests/routes/test_credits.py::test_admin_adjust_user_credits` | `uv run pytest tests/routes/test_credits.py::test_admin_adjust_user_credits` | Admin can view user transactions |
| Backend API | `tests/routes/test_credits.py` (NEW) | `uv run pytest tests/routes/test_credits.py::test_admin_user_transactions_includes_ai_usage` | Admin history includes AI usage linkage |
| Backend API | `tests/routes/test_admin_rbac.py` | `uv run pytest tests/routes/test_admin_rbac.py` | Admin RBAC for credits endpoints |
| Frontend Jest | `__tests__/components/credits/AdminCreditDialog.test.tsx` (NEW) | `pnpm test -- --testPathPattern="AdminCreditDialog"` | Admin credits dialog renders |
| Playwright E2E | `tests/admin-history.spec.ts` (NEW) | `pnpm playwright test tests/admin-history.spec.ts` | Admin sees enriched history |
| Playwright E2E | `tests/admin-adjust.spec.ts` (NEW) | `pnpm playwright test tests/admin-adjust.spec.ts` | Admin adjust still works |

---

## Requirement 5: Insufficient Balance Boundary

**Definition**: 失败/退款场景保持可追溯. 余额不足时显示警告.

### Test Targets

| Layer | Target File | Test Command | Coverage |
|-------|-------------|--------------|----------|
| Backend API | `tests/test_service_and_routes.py::TestGenerateMediaImageRouting::test_image_category_refunds_on_provider_error` | `uv run pytest tests/test_service_and_routes.py -k "refunds_on_provider_error"` | Credits refunded on failure |
| Backend API | `tests/routes/test_agents.py::test_agent_run_refunds_on_llm_error` | `uv run pytest tests/routes/test_agents.py -k "refunds_on_llm_error"` | Credits refunded on agent error |
| Frontend Jest | `__tests__/components/credits/CreditCostPreview.test.tsx` (NEW) | `pnpm test -- --testPathPattern="CreditCostPreview"` | Warning displayed when insufficient |
| Playwright E2E | `tests/insufficient-balance-warning.spec.ts` (NEW) | `pnpm playwright test tests/insufficient-balance-warning.spec.ts` | Warning appears for low balance |

---

## Requirement 6: Refund Traceability

**Definition**: 至少一个消费成功场景与一个失败/退款场景在流水中可追溯.

### Test Targets

| Layer | Target File | Test Command | Coverage |
|-------|-------------|--------------|----------|
| Backend API | `tests/test_service_and_routes.py` (NEW) | `uv run pytest tests/test_service_and_routes.py -k "refund"` | Refund records appear in transactions |
| Backend API | `tests/routes/test_credits.py` (NEW) | `uv run pytest tests/routes/test_credits.py::test_refund_transaction_has_trace_context` | Refund linked to original operation |
| Playwright E2E | `tests/refund-traceability.spec.ts` (NEW) | `pnpm playwright test tests/refund-traceability.spec.ts` | Refund visible in user history |

---

## Summary: Test Execution Commands

### Backend (pytest)
```bash
cd fastapi_backend
uv run pytest tests/routes/test_credits.py -v
uv run pytest tests/routes/test_agents.py -v
uv run pytest tests/test_service_and_routes.py -v
uv run pytest tests/routes/test_admin_rbac.py -v
```

### Frontend Jest
```bash
cd nextjs-frontend
pnpm test -- --testPathPattern="credits|CreditCostPreview|TransactionHistory"
```

### Playwright E2E
```bash
cd nextjs-frontend
pnpm playwright test tests/global-balance.spec.ts
pnpm playwright test tests/cost-display-*.spec.ts
pnpm playwright test tests/user-history*.spec.ts
pnpm playwright test tests/admin-*.spec.ts
pnpm playwright test tests/insufficient-balance-warning.spec.ts
pnpm playwright test tests/refund-traceability.spec.ts
```

---

## Verification Checklist

- [ ] All backend pytest commands pass
- [ ] All frontend Jest commands pass  
- [ ] All Playwright E2E tests pass
- [ ] Coverage report generated and reviewed
- [ ] No test-only gaps identified

---

## Key File References for Implementation

### Backend
| File | Purpose | Test Target |
|------|---------|-------------|
| `fastapi_backend/app/services/credit_service.py` | Transaction creation, balance mutation | New tests in `test_credits.py` |
| `fastapi_backend/app/api/v1/credits.py` | User/admin query endpoints | Extend existing tests |
| `fastapi_backend/app/models.py` | `CreditTransaction`, `AIUsageEvent` models | DB assertions |

### Frontend
| File | Purpose | Test Target |
|------|---------|-------------|
| `nextjs-frontend/components/credits/CreditCostPreview.tsx` | Cost preview component | `__tests__/CreditCostPreview.test.tsx` (NEW) |
| `nextjs-frontend/components/actions/credits-actions.ts` | Server actions for credits | `__tests__/credits-actions.test.tsx` (NEW) |
| `nextjs-frontend/app/api/ai/cost-estimate/route.ts` | Cost estimate proxy | Mock in Jest tests |

### E2E
| File | Purpose | Test Target |
|------|---------|-------------|
| `nextjs-frontend/app/(aistudio)/layout.tsx` | Global shell | `tests/credits-global-balance.spec.ts` |
| `nextjs-frontend/components/aistudio/AppLayout.tsx` | Balance display location | Screenshot verification |
| `nextjs-frontend/app/(aistudio)/ai/image/page.tsx` | Image AI page | `tests/credits-cost-preview.spec.ts` |

---

## Environment Caveats (From Local Testing)

### Backend pytest
- **Issue**: Missing `hypothesis` package — may cause test collection failures if used
- **Issue**: Non-UTF8 `test_out.txt` collector problem — encoding issue during test collection
- **Workaround**: Run specific test files rather than entire suite during development

### Frontend Jest
- **Issue**: Passing `--runInBand` through `pnpm test -- ...` matched no tests
- **Workaround**: Use `--testPathPattern` instead, e.g., `pnpm test -- --testPathPattern="CreditCostPreview"`

### Playwright
- **Issue**: No `playwright.config.ts` exists
- **Workaround**: Tests in `tests/*.spec.ts` need config file to be created

---

*Generated: 2026-03-22 | Task 5 | Blocks: Tasks 16, 17, 18*
*Updated with environment caveats and key file references*
