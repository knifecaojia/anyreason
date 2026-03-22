# Task 3 Evidence: Global Balance Dataflow

## Source of Truth

| Layer | Technology | Location |
|-------|-----------|----------|
| Backend API | GET /api/v1/credits/my | Returns `{ code, msg, data: { balance } }` |
| Frontend Action | `creditsMy()` in `components/actions/credits-actions.ts` | Line 68-70 |
| Type Definition | `ApiResponse<{ balance: number }>` | Line 48-68 in credits-actions.ts |

**Conclusion**: Single source of truth is `creditsMy()` action → `/api/v1/credits/my`.

## Initial Load Strategy

### Option A: Server-side in Layout (Recommended)
- **Pros**: Zero layout shift, immediately visible, follows existing `getMe()` pattern
- **Cons**: Adds another server fetch to critical path

### Option B: Client-side fetch in AppLayout
- **Pros**: More dynamic, can show loading state
- **Cons**: Layout shift on first render, inconsistent with `me` pattern

### Decision: Option A (Hybrid)
- Initial balance fetched server-side in `(aistudio)/layout.tsx` alongside `me`
- Balance passed to `AppLayout` as a prop
- Client-side React state manages balance with ability to refresh

```tsx
// In (aistudio)/layout.tsx (pseudo-code)
export default async function Layout({ children }) {
  const [me, credits] = await Promise.all([
    getMe(),
    creditsMy()  // Fetch balance alongside me
  ]);
  
  if (!me) redirect("/login");
  
  return (
    <AppLayout 
      me={me} 
      initialBalance={credits?.data?.balance ?? 0}
    >
      {children}
    </AppLayout>
  );
}
```

## State Management Approach

### Constraint: No Second Auth/User Store
- Must reuse existing `me` state in AppLayout (already has `meState` from `useState(me)`)
- Balance should NOT have its own authentication layer

### Recommended: Local State in AppLayout
```tsx
// In AppLayout.tsx
const [balance, setBalance] = useState(initialBalance);
```

### Refresh Trigger Strategy
After any debit/refund-producing operation, the balance needs to refresh. Three patterns exist:

1. **Event-based refresh**: Dispatch custom event → AppLayout listens
2. **Context-based refresh**: CreditsContext with refresh function
3. **Component re-render via router refresh**: Use Next.js router refresh

**Decision: Context-based approach**
- Create `CreditsContext` that provides `balance` and `refreshBalance()` function
- AppLayout owns the context, AI operation components consume it
- `refreshBalance()` calls `creditsMy()` and updates state

```tsx
// CreditsContext structure
interface CreditsContextValue {
  balance: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
}
```

## Refresh After Operations

### Pattern for AI Operation Components
```tsx
// After successful AI operation
const { refresh: refreshBalance } = useCredits();
await performAIOperation();
await refreshBalance();  // Refresh global balance
```

### Consistency with Existing Patterns
- `meState` in AppLayout already refreshes via avatar update pattern (lines 210-213)
- Follow same React state update pattern for balance

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  (aistudio)/layout.tsx (Server Component)                   │
│  ├── getMe() → /api/v1/users/me                             │
│  └── creditsMy() → /api/v1/credits/my                       │
│       ↓                      ↓                               │
│       me                   balance                          │
└─────────────────────────────────────────────────────────────┘
                           ↓ props
┌─────────────────────────────────────────────────────────────┐
│  AppLayout.tsx (Client Component)                            │
│  ├── Receives: me, initialBalance                           │
│  ├── State: meState, balance (useState)                     │
│  ├── Provides: CreditsContext                               │
│  └── Renders: Header with balance badge                     │
└─────────────────────────────────────────────────────────────┘
                           ↓ Context
┌─────────────────────────────────────────────────────────────┐
│  AI Operation Components (Consumers)                        │
│  ├── useCredits() → { balance, refresh }                   │
│  ├── Show cost preview                                      │
│  └── After success: refresh()                               │
└─────────────────────────────────────────────────────────────┘
```

## Verification Criteria

- [ ] Balance visible on initial page load (no loading flash for authenticated users)
- [ ] Balance persists across navigation (shell-level, not page-level)
- [ ] Balance refreshes after AI operation success
- [ ] No duplicate auth token management
- [ ] Type-safe throughout (uses existing `ApiResponse<T>` pattern)
