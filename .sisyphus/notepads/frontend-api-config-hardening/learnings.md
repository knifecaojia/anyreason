# Learnings: Frontend API Config Hardening

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
