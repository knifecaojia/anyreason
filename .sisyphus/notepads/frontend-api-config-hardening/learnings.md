# Learnings: Frontend API Config Hardening

## ROOT CAUSE: `/studio` Forces Logout on Deployed Server

### Investigation Date: 2026-03-21

### Primary Root Cause: `proxy.ts` middleware uses Axios with no `baseURL` in production

**File:** `nextjs-frontend/proxy.ts` (lines 3, 14-20)

The middleware (`proxy.ts`) runs on ALL requests to `/studio/:path*` and validates auth by calling the OpenAPI-generated `usersCurrentUser()` SDK function:

```typescript
// proxy.ts:20
const { error } = await usersCurrentUser(options);
```

This SDK function uses **Axios** (not `fetch`) as its HTTP client. The Axios client is configured by `lib/clientConfig.ts`:

```typescript
// clientConfig.ts:11-13, 32-33
if (isBrowser) {
  baseURL = "";  // ← Empty string for browser
} else {
  // SSR: INTERNAL_API_BASE_URL || API_BASE_URL || NEXT_PUBLIC_API_BASE_URL || undefined
}
client.setConfig({ baseURL: baseURL });
```

**The problem:** `clientConfig.ts` is designed for browser/SSR use with a browser-detection pattern (`typeof window !== "undefined"`). When this runs in the Next.js Edge/Node.js middleware context:

1. `isBrowser = false` (Node.js)
2. `baseURL` tries to resolve from `INTERNAL_API_BASE_URL`, `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL` env vars
3. In production, if NONE are set → `baseURL = undefined`
4. Axios is created with `baseURL = undefined`

When Axios makes a request with `baseURL = undefined` and a relative path like `/users/me` in a Node.js environment, it resolves to the **middleware's own host** (not the backend). The request goes to `<your-domain>/users/me` which is not a valid Next.js route → network error.

The error is caught by the Axios error handler → `error.error` is set → `if (error)` is truthy → middleware redirects to `/login`. This happens **every time** a logged-in user tries to visit `/studio`.

**Why only `/studio`?**: Because `proxy.ts` explicitly matches `/studio/:path*` (line 43). Other protected routes like `/dashboard`, `/projects`, etc. also match but the issue would be there too if accessed. The user reports only `/studio` because that's likely the entry point they tested.

**Why development works**: `clientConfig.ts` falls back to `http://127.0.0.1:8000` when `NODE_ENV === "development"`. But in production (`NODE_ENV === "production"`), no fallback → `baseURL = undefined` → broken.

### Secondary Issue: Canvas API Wrong Port in `_proxy.ts`

**File:** `nextjs-frontend/app/api/canvases/_proxy.ts` (line 5)

```typescript
const getApiBaseUrl = () =>
  process.env.INTERNAL_API_BASE_URL || "http://localhost:8100";
//                                                     ↑ WRONG PORT
```

The backend runs on **port 8000** (FastAPI default), but the fallback is `8100`. If `INTERNAL_API_BASE_URL` is not set in production, the canvas API proxied requests would go to the wrong port. However, this is secondary to the middleware issue because it would cause 500 errors, not forced logout redirects.

The **correct pattern** (used in VFS routes like `app/api/vfs/nodes/route.ts:4-5`):
```typescript
return process.env.INTERNAL_API_BASE_URL || process.env.API_BASE_URL || 
       process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
```

### Related: Multiple files have `localhost:8100` fallback

4 files use `8100` as fallback instead of `8000`:
- `app/api/canvases/_proxy.ts:5` → canvas VFS operations
- `app/api/assets/route.ts:5` → assets
- `app/api/assets/[assetId]/resources/[resourceId]/file/route.ts:5` → asset file download
- `app/api/ai/text/chat/stream/route.ts:9` → chat stream

### Fix Candidates (investigation only, not implementing)

1. **Replace Axios call in middleware with native `fetch`**: The simplest fix is to not use `usersCurrentUser()` in `proxy.ts` at all, instead making a direct `fetch()` call with the proper server-side `baseURL`. The `fetch()` URL would correctly resolve relative to the Next.js server.

2. **Fix `_proxy.ts` baseURL**: Change `8100` fallback to `8000` and ensure the full env var chain is used.

3. **Fix `clientConfig.ts` for middleware**: Add a server-side `baseURL` resolver specifically for the middleware context, or ensure `INTERNAL_API_BASE_URL` is always set in production.

### Files Confirmed Safe (no auth issue)
- Canvas page (`app/(studio)/studio/page.tsx`): Uses relative `/api/canvases` → goes through Next.js route handler → correctly reads cookie and forwards Bearer token to backend
- Canvas editor (`app/(studio)/studio/[canvasId]/page.tsx`): Same pattern, uses `/api/vfs/...`, `/api/canvases/...` relative paths
- VFS API routes: All correctly read cookie, check 401, forward Bearer token
- Scripts API routes: All correctly read cookie, check 401, forward Bearer token

---

## Wave 1 Summary (Tasks 1-4)

### Key Findings

1. **93 files** have duplicated `getApiBaseUrl()` fallback logic with hardcoded `http://localhost:8000`
   - 11 Server Action files
   - 82 App API Route proxy files
   - These need centralization (Task 5)

2. **Centralized config exists but not used**
   - `lib/clientConfig.ts` has proper browser/SSR split
   - But route handlers/server actions define their own local `getApiBaseUrl()`
   - Need to consolidate (Task 5)

3. **Critical Build-Time vs Runtime Mismatch**
   - `NEXT_PUBLIC_API_BASE_URL` is baked at build time in Dockerfile.prod
   - Compose files pass it as runtime ENV - this has ZERO effect
   - To change API URL requires full rebuild (Task 7)

4. **Nginx Proxy Architecture is Sound**
   - All browser requests use relative `/api` paths
   - Nginx proxies to backend correctly
   - WebSocket upgrade headers present
   - No client-side full origins needed (Task 4 - verified)

5. **Current Deployment Issues**
   - `compose.app.yml:127` sets `NEXT_PUBLIC_API_BASE_URL: http://localhost:8000` - WRONG
   - `docker-compose.deploy.yml:194` - same wrong config
   - These don't actually affect the built app due to build-time baking
   - Browser uses relative paths anyway, so this is harmless but confusing

### Safe Patterns Confirmed
- Browser uses relative `/api` paths ✅
- Nginx proxies correctly ✅
- No WebSocket from browser directly ✅
- SSR can use INTERNAL_API_BASE_URL ✅

### Tasks for Next Wave (Wave 2)
- Task 5: Centralize SSR resolver (blocks 9, 12, 15)
- Task 6: Normalize env templates (blocks 13)
- Task 7: Remove unsafe deploy defaults (blocks 10, 11, 13, 14, 15)
- Task 8: Add guardrail docs (blocks 15)
