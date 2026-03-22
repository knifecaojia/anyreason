# Task 5: Fixture Reuse Analysis

## Overview

This document identifies existing test fixtures, harnesses, and patterns in the repository that can be reused for credits-related testing. It also documents any missing harness support.

---

## Backend (pytest) Fixtures

### Existing Fixtures in `tests/conftest.py`

| Fixture | Usage | Credits Reusable |
|---------|-------|------------------|
| `test_client` | AsyncClient with ASGITransport | ✅ Directly usable for credits API tests |
| `db_session` | AsyncSession with auto-rollback | ✅ For querying credit_transactions, AIUsageEvent |
| `engine` | Fresh test DB per function | ✅ Required for isolation |
| `authenticated_user` | Creates user + JWT token + credits account | ✅ Already calls `credit_service.ensure_account()` |
| `authenticated_superuser` | Creates admin + JWT token + credits account | ✅ For admin credits tests |
| `mock_minio` | Fake MinIO client | ⚠️ Not needed for credits tests |

### Credits-Specific Fixture Pattern

From `test_credits.py`:
```python
async def test_my_credits_returns_balance(test_client, authenticated_user, db_session):
    user_id = authenticated_user["user"].id
    acc = (await db_session.execute(select(UserCreditAccount).where(...))).scalars().first()
    resp = await test_client.get("/api/v1/credits/my", headers=authenticated_user["headers"])
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["balance"] == settings.DEFAULT_INITIAL_CREDITS
```

**Pattern**: Use `authenticated_user` fixture which already:
1. Creates a user with initial credits balance
2. Provides JWT headers
3. Provides user object with ID

### New Fixtures Needed for Credits

```python
# NEW: Fixture for low-balance user (insufficient funds testing)
@pytest_asyncio.fixture(scope="function")
async def low_balance_user(test_client, db_session):
    """User with intentionally low balance for insufficient-funds tests."""
    user_data = {
        "id": uuid.uuid4(),
        "email": "lowbalance@example.com",
        "hashed_password": PasswordHelper().hash("TestPassword123#"),
        "is_active": True,
        "is_superuser": False,
        "is_verified": True,
    }
    user = User(**user_data)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    
    # Set balance to 1 credit (below image/video costs)
    await credit_service.adjust_balance(db=db_session, user_id=user.id, delta=-999, reason="init")
    await db_session.commit()
    
    strategy = get_jwt_strategy()
    access_token = await strategy.write_token(user)
    
    return {"headers": {"Authorization": f"Bearer {access_token}"}, "user": user}


# NEW: Fixture for user with transactions (history testing)
@pytest_asyncio.fixture(scope="function")
async def user_with_transactions(test_client, db_session, authenticated_user):
    """User that has made several credit transactions for history tests."""
    user_id = authenticated_user["user"].id
    
    # Create consume transaction
    await credit_service.adjust_balance(db=db_session, user_id=user_id, delta=-5, reason="ai.consume")
    # Create admin adjust
    await credit_service.adjust_balance(db=db_session, user_id=user_id, delta=10, reason="admin.adjust", actor_user_id=user_id)
    # Create refund
    await credit_service.adjust_balance(db=db_session, user_id=user_id, delta=5, reason="ai.refund")
    await db_session.commit()
    
    return authenticated_user
```

---

## Frontend (Jest) Patterns

### Existing Test Patterns

From `__tests__/loginPage.test.tsx`:
```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

jest.mock("../components/actions/login-action", () => ({
  login: jest.fn(),
}));

describe("Login Form Component", () => {
  beforeEach(() => { /* ... */ });
  afterEach(() => { jest.clearAllMocks(); });
  
  it("renders the form", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });
});
```

### Jest Configuration

- `jest.config.ts`: Uses Next.js preset, jsdom environment
- Test discovery: `**/__tests__/**/*.[jt]s?(x)` and `**/?(*.)+(spec|test).[tj]s?(x)`
- Command: `pnpm test`

### New Test Fixtures Needed for Credits

```typescript
// __tests__/setup/credits-mocks.ts

// Mock credits-actions
jest.mock("@/components/actions/credits-actions", () => ({
  creditsMy: jest.fn(),
  creditsMyTransactions: jest.fn(),
  creditsAdminGetUser: jest.fn(),
  creditsAdminAdjustUser: jest.fn(),
}));

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => ({ get: jest.fn() }),
}));

// Mock useToast (if used by credits components)
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));
```

---

## Frontend (Playwright) Patterns

### Existing Playwright Test

From `tests/remote-login.spec.ts`:
```typescript
import { test, expect } from '@playwright/test';

test('Remote Login Check', async ({ browser }) => {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  // ... test implementation
});
```

### Playwright Configuration Notes

- Configuration file: `playwright.config.ts` (NOT found in repo - needs to be created)
- Test file pattern: `**/*.spec.ts`
- Installed: `@playwright/test: ^1.58.2`

### Missing Playwright Configuration

**GAP IDENTIFIED**: No `playwright.config.ts` exists in the repo. Playwright tests will need a config file created.

**Recommended playwright.config.ts**:
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

---

## Fixtures Summary Table

| Fixture | Location | Reusable For | Status |
|---------|----------|--------------|--------|
| `test_client` | conftest.py | Credits API tests | ✅ Ready |
| `authenticated_user` | conftest.py | User-facing credits tests | ✅ Ready |
| `authenticated_superuser` | conftest.py | Admin credits tests | ✅ Ready |
| `db_session` | conftest.py | Transaction/event queries | ✅ Ready |
| `low_balance_user` | conftest.py (NEW) | Insufficient balance tests | 📝 Documented above |
| `user_with_transactions` | conftest.py (NEW) | History tests | 📝 Documented above |
| Jest mocks | `__tests__/setup/` (NEW) | Credits component tests | 📝 Documented above |
| Playwright config | `playwright.config.ts` (NEW) | All E2E tests | 📝 Documented above |

---

## Missing Harness Support

### 1. Frontend Credits Component Test Harness

**Gap**: No dedicated test utility exists for credits components like `CreditCostPreview`.

**Needed**:
- Mock for `/api/ai/cost-estimate` endpoint
- Mock for `creditsMy()` server action
- Mock for balance refresh mechanism

**Recommendation**: Create `__tests__/setup/credits-mocks.ts` with standardized mocks.

### 2. Playwright Authentication Helper

**Gap**: Each Playwright test currently handles login manually (see `remote-login.spec.ts`).

**Needed**:
- Shared `loginAsUser()` function
- Shared `loginAsAdmin()` function  
- Cookie/storage management utilities

**Recommendation**: Create `tests/helpers/auth.ts` with reusable login functions.

### 3. Backend Transaction Assertion Helpers

**Gap**: No helpers exist for asserting transaction records in DB.

**Needed**:
- Helper to fetch user's transactions
- Helper to assert transaction has specific fields
- Helper to assert AIUsageEvent linkage

**Recommendation**: Create test helpers in `tests/helpers/credits.py`.

---

## Test Command Mapping

| Test Type | Current Pattern | Recommended Pattern |
|-----------|-----------------|---------------------|
| Backend | `uv run pytest tests/routes/test_credits.py` | Continue as-is |
| Frontend Jest | `pnpm test -- --testPathPattern="xxx"` | Continue as-is |
| Playwright | No config exists | Create `playwright.config.ts`, run `pnpm playwright test` |

---

## Recommendations

1. **Create `playwright.config.ts`** in `nextjs-frontend/` directory
2. **Create `tests/helpers/auth.ts`** with reusable login functions
3. **Create `tests/helpers/credits.ts`** (backend) with transaction assertion helpers
4. **Create `__tests__/setup/credits-mocks.ts`** with standardized Jest mocks
5. **Add new fixtures** (`low_balance_user`, `user_with_transactions`) to `conftest.py`

---

*Generated by Task 5 (Plan: global-user-credits-experience)*
