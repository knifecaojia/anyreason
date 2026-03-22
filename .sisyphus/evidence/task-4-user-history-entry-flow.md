# Task 4 Evidence: User History Entry Flow

## Scenario: User history UX is reachable from global balance entry

### Chosen UX Pattern: Right-Side Drawer

**Rationale:**

The user-facing credit history container is a **right-side drawer** (a slide-in panel anchored to the app shell), not a dedicated page route, not a centered modal, and not buried inside admin settings.

**Why drawer over alternatives:**

| Pattern | Problem for this use case |
|---------|--------------------------|
| Dedicated page (`/credits`) | Forces full navigation, loses current page context, harder to reach from every AI Studio page |
| Centered modal | Blocks the entire page, poor for browsing a list of rows, too heavy for history |
| Sidebar nav item | Adds clutter to sidebar, less discoverable than clicking a balance badge |
| Drawer | Stays in context, reachable from the global balance trigger in the header, scrollable, non-blocking |

The drawer matches the app's existing modal/dialog interaction language (see `CreditsAdjustModal` and profile dialog in `AppLayout`) while being lighter-weight than a full-page route.

### Entry Flow

```
[AI Studio Shell Header]
        │
        ▼
┌──────────────────────────────┐
│  Balance Badge (e.g. "128 ⭐") │  ← rendered in AppLayout header (Task 7)
│  [Click]                      │
└──────────────────────────────┘
        │ onClick → setHistoryDrawerOpen(true)
        ▼
┌──────────────────────────────────────────────────────────┐
│  CreditsHistoryDrawer (right-side, ~400px wide)           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Header: "积分流水" + close button                   │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ Balance summary: "当前余额 128"                     │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ Transaction rows (scrollable, max-h)                │  │
│  │   • delta (colored: green +, red -)                │  │
│  │   • balance_after                                  │  │
│  │   • reason (user-friendly label)                   │  │
│  │   • created_at (formatted date/time)               │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ Pagination controls (Load More or page numbers)     │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Technical integration points:**
- `AppLayout.tsx` holds `historyDrawerOpen` state (added in Task 7 alongside balance display)
- Drawer component: `components/credits/CreditsHistoryDrawer.tsx`
- Data: `creditsMyTransactions(limit)` from `credits-actions.ts`
- The drawer does NOT share state with `CreditsAdjustModal` — user history is a separate concern
- Admin users reach the same drawer (they also want to see their own history), but admin-specific richer history remains in `CreditsAdjustModal` opened from `/settings?tab=credits`

### User-Visible Fields (User History Drawer)

| Field | Source | Display |
|-------|--------|---------|
| `delta` | `CreditTransaction.delta` | `+N` in green or `-N` in red |
| `balance_after` | `CreditTransaction.balance_after` | Plain number, secondary |
| `reason` | `CreditTransaction.reason` | Human-readable label (e.g. "AI 绘图", "积分调整", "退款"), NOT raw `admin.adjust` |
| `created_at` | `CreditTransaction.created_at` | Formatted: `YYYY-MM-DD HH:mm` |

**Reason mapping logic:**
- `reason` starting with `ai.` → operation-type label (derive from `meta.category` or reason prefix)
- `reason` = `admin.adjust` / `admin.set` → "管理员调整"
- `reason` containing `refund` → "退款"
- Fallback: raw reason string (shortened)

### Admin Continuity

Admins access the existing `CreditsAdjustModal` via `/settings?tab=credits` → select user → modal opens. This flow is unchanged and preserved. The modal shows:
- The admin's richer mono-font rows (reason in `font-mono`, full detail)
- The admin's adjust/set controls (not exposed to regular users)
- All transactions for the selected user (not just the admin's own)

**User vs Admin separation:**
- User drawer: reads only `creditsMyTransactions()` (own transactions), no write controls
- Admin modal: reads `creditsAdminGetUser()` (any user), has adjust/set controls

### Preconditions for Task 7 (global balance display)
- `AppLayout` must gain a balance badge in the header
- That badge must expose `onClick → setHistoryDrawerOpen(true)`
- The badge is present on ALL AI Studio pages (shell-level, not page-level)

### QA Verification Checklist
- [ ] Balance badge is visible in `AppLayout` header on any AI Studio page
- [ ] Clicking the badge opens the drawer without navigation
- [ ] Drawer is dismissable (X button or click outside)
- [ ] Rows show delta with correct sign coloring
- [ ] Rows show formatted timestamp (not raw ISO)
- [ ] Empty state is shown when no transactions
- [ ] Loading skeleton is shown while fetching
- [ ] Error state is shown if API fails
- [ ] Regular user cannot see admin adjust controls
- [ ] Admin can still reach `CreditsAdjustModal` via settings

## Failure Indicators
- User must navigate to admin settings to see their own history → WRONG
- User sees raw `admin.adjust` reason instead of friendly label → WRONG
- Drawer not dismissable or blocks page → WRONG
- Pagination/filtering requires redesign → WRONG (designed for it from start)
