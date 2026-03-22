# Task 3 Evidence: Layout Placement Check

## Chosen Insertion Point

**Primary Location**: `AppLayout.tsx` header area, right side

**Specific Position**: Inside `<header>` element (lines 576-598), after `NotificationCenter` and before closing `</header>`

```tsx
// Current header structure (lines 576-598)
<header className="h-16 px-6 border-b border-border bg-surface/80 backdrop-blur-md flex items-center justify-between z-10 sticky top-0 flex-shrink-0">
  {/* Left side: breadcrumb */}
  <div className="flex items-center gap-2 text-textMuted">...</div>
  
  {/* Right side: search + notifications */}
  <div className="flex items-center gap-6">
    <div className="relative group hidden md:block">...</div>
    <NotificationCenter />
  </div>
</header>
```

**Insertion Point**:
```tsx
<div className="flex items-center gap-6">
  {/* NEW: Credits badge - clickable, opens history */}
  <CreditsBadge balance={balance} onClick={openCreditsHistory} />
  
  <div className="relative group hidden md:block">...</div>
  <NotificationCenter />
</div>
```

## Why This Location?

| Criteria | Score | Rationale |
|----------|-------|-----------|
| Visibility | ★★★★★ | Header is always visible across all AI Studio pages |
| Persistence | ★★★★★ | Header survives navigation (shell-level component) |
| Accessibility | ★★★★☆ | Visible but not obtrusive, clickable for details |
| Alignment | ★★★★★ | Matches `NotificationCenter` placement pattern |
| Responsive | ★★★★☆ | Hidden on very small screens via `hidden md:block` |

## Alternative Considered: Sidebar Footer

**Location**: Bottom of sidebar, near user profile area (lines 391-446)

**Pros**:
- Always visible
- Consistent with profile placement

**Cons**:
- Crowded with existing user profile
- Collapsed sidebar would need icon-only representation
- Less intuitive for "status" information

**Decision**: Rejected - header is cleaner for status-like information

## Component Design: CreditsBadge

```tsx
// Proposed CreditsBadge component interface
interface CreditsBadgeProps {
  balance: number;
  onClick: () => void;  // Opens history drawer/panel
}

// Visual design (following existing patterns):
// - Pill/badge shape matching notification bell
// - Icon: Coins or CreditCard from lucide-react
// - Shows "X 积分" or just icon when collapsed
// - Hover state: subtle highlight
// - Click: opens credits history panel/drawer
```

## Layout Injection Verification

**Test Scenarios**:

1. **Page Coverage**
   - [ ] Dashboard: balance visible in header
   - [ ] Image generation: balance visible in header
   - [ ] Video generation: balance visible in header
   - [ ] Settings: balance visible in header
   - [ ] Any AI Studio page: balance visible

2. **Navigation Persistence**
   - [ ] Navigate from Dashboard → Image → Video
   - [ ] Balance remains visible (not re-fetching on each page)
   - [ ] Balance is the same value (no duplicate fetches)

3. **Collapsed Sidebar**
   - [ ] Sidebar collapsed: balance still visible in header
   - [ ] No layout breakage

4. **Responsive**
   - [ ] Mobile: may hide balance (follow NotificationCenter pattern)
   - [ ] Desktop: always visible

## History Entry Point

Clicking the balance badge should open the user's credits transaction history.

**UX Pattern Options**:

| Option | Description | Recommendation |
|--------|-------------|----------------|
| Modal | Centered dialog with history list | Good for quick peek |
| Drawer | Right-side slide-out panel | Recommended - more space for list |
| Page Route | Navigate to /credits-history | Higher friction, not recommended |

**Decision**: Drawer pattern - consistent with profile dialog approach in AppLayout

**Trigger Flow**:
```
User clicks balance badge
  → CreditsDrawer opens (right side panel)
  → Shows: transaction list, balance, pagination
  → User can close drawer to return
```

## Compliance Verification

- [ ] Placement is in shell (`AppLayout`), not page-level component
- [ ] Balance is passed as prop from server layout, not local-fetch-only
- [ ] No duplicate auth state introduced
- [ ] Follows existing UI patterns (NotificationCenter, Avatar)
