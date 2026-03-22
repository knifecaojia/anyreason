# Task 4 Evidence: History Scope Guardrail Check

## Scenario: UX scope remains history-focused

### Guardrails from Plan

The plan explicitly forbids:
- "Do not implement UI code yet" → This task is planning only; no UI code is written.
- "Do not add recharge/redeem/export/analytics controls" → No such controls appear in the drawer design.
- "Do not bury user history inside admin settings only" → The drawer is opened directly from the global balance badge, reachable without navigating to settings.

### Scope Inventory

#### ✅ IN SCOPE (Task 4 + future Tasks 8, 9)

| Element | Status |
|---------|--------|
| User-facing history container (drawer) | Planned |
| Entry point: balance badge in shell header | Planned (Task 7 wires the trigger) |
| User-visible transaction fields: delta, balance_after, reason, created_at | Defined |
| Reason label humanization | Defined |
| Empty/loading/error states | Defined (Task 9) |
| Pagination design | Defined (supports future without redesign) |
| Admin continuity: `CreditsAdjustModal` unchanged | Confirmed |
| `creditsMyTransactions()` API reuse | Confirmed |
| `CreditTransaction` type reuse from `credits-actions.ts` | Confirmed |

#### ❌ OUT OF SCOPE (Explicitly Excluded)

| Element | Why Excluded |
|---------|-------------|
| Recharge / top-up UI | Guardrail: no payment/recharge in this work |
| Redeem / coupon / exchange UI | Guardrail: no payment/redeem in this work |
| Export to CSV / PDF | Guardrail: no analytics/export |
| Analytics charts / graphs | Guardrail: no analytics |
| In-app notification when balance changes | Future enhancement, not in scope |
| Balance auto-refresh mechanism | Task 7 addresses this |
| Admin adjustment/set controls in user drawer | Admin modal keeps these; user drawer has no write controls |
| Changing `credit_transactions` or `ai_usage_events` schema | Task 6 (backend) handles schema, not this task |
| Cost preview / cost labeling | Tasks 11-14 address this separately |
| Batch/async operation cost display | Tasks 11-14 address this separately |

### Design-Time Decisions Made

1. **No write controls in user drawer** — The user drawer is read-only. There are no buttons to adjust balance, set balance, or trigger recharges. This is enforced by design.

2. **No analytics or charts** — The drawer shows a flat list of transaction rows. No bar charts, pie charts, balance trend lines, or export buttons.

3. **No pagination beyond "Load More"** — The initial implementation uses a simple "Load More" pattern. No full pagination UI is built in V1, but the API (`creditsMyTransactions`) supports `limit` which allows incremental loading.

4. **No recharge entry point** — Even though `CreditsSection.tsx` already has disabled "充值" and "兑换" buttons as placeholders, the user history drawer does not reference them. This keeps the scope clean.

5. **Reason humanization is the only "enrichment"** — The only transformation applied to raw transaction data is converting `reason` codes to user-friendly labels. No new fields are synthesized; no calculations are performed.

### Design-Time Decision: Why Not a Full Page?

A dedicated route (`/history` or `/settings/history`) was considered and rejected:
- It would require users to navigate away from their current AI Studio context
- The balance badge in the header is a more discoverable entry point (especially for new users)
- A drawer scales naturally for mobile vs desktop widths
- No new route file needs to be created in the Next.js app router for the drawer (it's a component in `components/credits/`)

### Verification

| Check | Status |
|-------|--------|
| User history is NOT gated behind admin settings | ✅ Drawer opened from global balance badge |
| No recharge/redeem controls in user history | ✅ Drawer is read-only |
| No analytics charts in user history | ✅ Flat row list only |
| No export button in user history | ✅ Not in scope |
| Admin adjust/set is NOT removed | ✅ `CreditsAdjustModal` untouched |
| Future pagination fits without redesign | ✅ "Load More" + `limit` param supports this |
| Only viewing/tracing functionality | ✅ Only list, no write, no export, no analytics |
