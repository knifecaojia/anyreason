# Frontend API Configuration Contract

This document defines the contract for configuring API base URLs in the Next.js frontend application.

## Overview

The frontend uses different API endpoints depending on the execution context:
- **Browser (client-side)**: Uses relative paths to make same-origin requests via nginx proxy
- **SSR (server-side rendering)**: Uses internal network addresses to communicate directly with the backend

## Configuration Variables

| Variable | Scope | Purpose | Default |
|----------|-------|---------|---------|
| `INTERNAL_API_BASE_URL` | Server-only | SSR/internal calls to backend | Required in production |
| `API_BASE_URL` | Server-only | Alias for INTERNAL_API_BASE_URL | Optional fallback |
| `NEXT_PUBLIC_API_BASE_URL` | Public (browser-exposed) | **Only for explicit split-origin deployments** | **DO NOT SET** |

## Semantic Rules

### Rule 1: Browser Uses Relative Path (Default)

When running in the browser, the frontend makes requests to relative URLs:

```typescript
// clientConfig.ts line 16
baseURL = "";  // Relative path: /api/* goes through nginx proxy
```

This is the **default and recommended** configuration. All browser requests go to the same origin and are proxied by nginx to the backend.

**Why this is safe:**
- No mixed content issues (HTTP/HTTPS consistency)
- No CORS issues
- Works behind nginx reverse proxy
- Works for same-host deployments

### Rule 2: SSR Uses Internal Network Address

Server-side rendering runs in the backend container's internal network:

```typescript
// clientConfig.ts lines 19-23
baseURL = process.env.INTERNAL_API_BASE_URL 
  || process.env.API_BASE_URL 
  || process.env.NEXT_PUBLIC_API_BASE_URL 
  || (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : undefined);
```

**Required environment variable:** `INTERNAL_API_BASE_URL`

### Rule 3: NEXT_PUBLIC_API_BASE_URL is NOT for Localhost

> **Critical**: Never set `NEXT_PUBLIC_API_BASE_URL` to `http://localhost:8000` or any localhost address.

Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser bundle. Setting this to localhost will:
1. Attempt to connect from user's browser to their own localhost (wrong target)
2. Create security issues if accidentally used client-side
3. Break cross-origin deployments

**When to use NEXT_PUBLIC_API_BASE_URL:**
Only for explicit split-origin deployments where:
- Frontend and backend are on different domains/ origins
- Browser must make cross-origin requests directly (not via proxy)
- Example: `NEXT_PUBLIC_API_BASE_URL=https://api.example.com`

## Deployment Scenarios

### Local Development

```
Frontend: http://localhost:3000
Backend:  http://localhost:8000
```

Environment:
```bash
# .env.local for frontend
INTERNAL_API_BASE_URL=http://127.0.0.1:8000
# Do NOT set NEXT_PUBLIC_API_BASE_URL
```

Browser behavior: Relative `/api/*` requests resolve to `http://localhost:3000/api/*` → nginx proxy → backend

### Docker Single-Host (Local Stack)

```
nginx:        https://localhost (or http://localhost)
frontend:     http://frontend:3000 (internal)
backend:      http://backend:8000 (internal)
```

compose.app.yml configuration:
```yaml
environment:
  NODE_ENV: development
  INTERNAL_API_BASE_URL: http://backend:8000
  # API_BASE_URL: http://backend:8000      # Optional alias
  # Do NOT set NEXT_PUBLIC_API_BASE_URL    # Uses relative path
```

Browser behavior: Same as local development - relative path via nginx proxy.

### Production Deployment

```
https://anyreason.example.com     (nginx/gateway)
  → frontend                     (internal)
  → /api/* → backend:8000        (internal proxy)
```

docker-compose.deploy.yml configuration:
```yaml
environment:
  NODE_ENV: production
  INTERNAL_API_BASE_URL: http://backend:8000
  # Do NOT set NEXT_PUBLIC_API_BASE_URL
```

### Split-Origin Deployment (Optional, Future)

Only use when frontend and backend are on different domains:

```
https://app.example.com          (frontend)
https://api.example.com          (backend)
```

```yaml
environment:
  INTERNAL_API_BASE_URL: http://backend:8000
  NEXT_PUBLIC_API_BASE_URL: https://api.example.com
```

## Current Issues in compose.app.yml

The following lines in `docker/compose.app.yml` (lines 123-128) contain a semantic conflict:

```yaml
environment:
  NODE_ENV: development
  INTERNAL_API_BASE_URL: http://backend:8000   # Correct
  API_BASE_URL: http://backend:8000            # Correct
  NEXT_PUBLIC_API_BASE_URL: http://localhost:8000  # WRONG - leaks to browser
```

**Problem**: `NEXT_PUBLIC_API_BASE_URL` should NOT be set to localhost. It should be removed or left unset.

**Same issue exists in** `docker/docker-compose.deploy.yml` (lines 190-196).

## Nginx Proxy Contract

The nginx configuration (`docker/nginx/anyreason-https.conf`) provides the proxy contract:

```nginx
location /api/ {
    proxy_pass http://anyreason_backend/api/;
    # ... headers
}
```

All `/api/*` requests from the browser are proxied to the backend, enabling the same-origin relative URL pattern.

## Summary

| Context | baseURL Value | How It Works |
|---------|---------------|--------------|
| Browser | `""` (relative) | `/api/*` → nginx proxy → backend |
| SSR | `INTERNAL_API_BASE_URL` | Direct internal network call |
| Split-origin | `NEXT_PUBLIC_API_BASE_URL` | Cross-origin call (rare) |

**Canonical Rule**: Browser uses relative `/api` by default; SSR uses `INTERNAL_API_BASE_URL`; public full origin is optional and documented, not default.

---

## Environment Precedence Rules

This section documents which environment sources are authoritative in different deployment contexts.

### Local Development (Host Machine)

**Context**: Running `pnpm dev` directly on host machine.

**Env file loading order**:
1. `.env.local` (highest priority, gitignored)
2. `.env`
3. Default values in code

**Authoritative variables**:
| Variable | Source | Notes |
|----------|--------|-------|
| `INTERNAL_API_BASE_URL` | `.env.local` or `.env` | Required for SSR |
| `API_BASE_URL` | `.env.local` or `.env` | Alias fallback |
| `NEXT_PUBLIC_`* | `.env.local` only | NEVER commit to `.env` |

**Example `.env.local`**:
```bash
# Frontend (nextjs-frontend/.env.local)
INTERNAL_API_BASE_URL=http://127.0.0.1:8000
# Do NOT set NEXT_PUBLIC_API_BASE_URL
```

### Docker Local Stack (compose.app.yml)

**Context**: Running `docker compose -f docker-compose.yml -f compose.app.yml --profile app up`

**Env file loading order**:
1. `environment:` block in compose file (highest priority)
2. `env_file:` (`.env` from docker directory)
3. Defaults in compose file

**Authoritative variables in compose.app.yml**:
| Variable | Source | Notes |
|----------|--------|-------|
| `INTERNAL_API_BASE_URL` | compose `environment:` block | Must use internal hostname `backend:8000` |
| `API_BASE_URL` | compose `environment:` block | Alias fallback |
| `NEXT_PUBLIC_API_BASE_URL` | **DO NOT SET** | See forbidden patterns |

**Correct compose.app.yml frontend service**:
```yaml
frontend:
  environment:
    NODE_ENV: development
    INTERNAL_API_BASE_URL: http://backend:8000
    # Do NOT set NEXT_PUBLIC_API_BASE_URL
```

### Production Deployment

**Context**: Running `docker compose -f docker-compose.yml -f docker-compose.deploy.yml` or similar production compose.

**Env file loading order**:
1. CI/CD injected environment variables
2. `environment:` block in compose file
3. `env_file:` (production .env)
4. Image baked-in defaults (for build args only)

**Authoritative variables**:
| Variable | Source | Notes |
|----------|--------|-------|
| `INTERNAL_API_BASE_URL` | compose `environment:` | Internal network only |
| Build args (`ARG`) | Dockerfile `ARG` | Baked at build time |

---

## Build-Time vs Runtime Semantics

Understanding when environment variables are resolved is critical for correct deployment.

### Build-Time Variables (Baked into Image)

The following are baked into the Docker image at build time:

```dockerfile
# Dockerfile.prod lines 22-23
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
```

**Implications**:
- `NEXT_PUBLIC_*` variables are embedded in the JavaScript bundle
- Changing these requires rebuilding the image
- Available in browser (visible in network tab, source maps)

### Runtime Variables (Available After Container Starts)

The following are available at container runtime:

```yaml
# compose.app.yml lines 124-128
environment:
  NODE_ENV: development
  INTERNAL_API_BASE_URL: http://backend:8000
  API_BASE_URL: http://backend:8000
```

**Implications**:
- Can be changed without rebuilding (via compose override)
- Only available in SSR/Server components
- Not visible in browser bundle

### Variable Scope Summary

| Variable Prefix | Build-Time | Runtime | Browser-Exposed |
|----------------|------------|---------|-----------------|
| `NEXT_PUBLIC_` | Yes (baked) | Yes | **Yes** |
| `INTERNAL_API_BASE_URL` | No | Yes | No |
| `API_BASE_URL` | No | Yes | No |
| `NODE_ENV` | No | Yes | No |

**Critical Rule**: Never use `NEXT_PUBLIC_` for internal service addresses. It leaks to the browser and cannot be changed without rebuild.

---

## Forbidden Patterns

This section documents patterns that must NEVER be used.

### Pattern 1: Browser Localhost

**NEVER do this**:
```bash
# WRONG - in any .env file
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

**Why it's forbidden**:
1. Browser will try to connect to user's localhost, not your server
2. Breaks for any user who is not you
3. Causes CORS/mixed-content errors in production

**Correct approach**: Use relative paths (`baseURL = ""`) for browser requests.

### Pattern 2: Docker Internal Hostname in NEXT_PUBLIC

**NEVER do this**:
```yaml
# WRONG - compose.app.yml lines 127
NEXT_PUBLIC_API_BASE_URL: http://localhost:8000  # WRONG
```

or

```yaml
# WRONG
NEXT_PUBLIC_API_BASE_URL: http://backend:8000  # BROKEN - browser can't resolve "backend"
```

**Why it's forbidden**:
1. `localhost` in browser = user's machine, not container
2. `backend` hostname only exists in Docker internal network
3. Browser cannot make requests to internal Docker network

**Correct approach**:
- For SSR: use `INTERNAL_API_BASE_URL=http://backend:8000` (internal network)
- For browser: use relative path `""` (nginx proxy handles routing)

### Pattern 3: Duplicated Fallback Chains Across Files

**NEVER do this**:
```typescript
// WRONG - clientConfig.ts has fallback chain
baseURL = process.env.INTERNAL_API_BASE_URL 
  || process.env.API_BASE_URL 
  || process.env.NEXT_PUBLIC_API_BASE_URL
  || "http://localhost:8000"  # HARDCODED FALLBACK
```

**AND ALSO do this**:
```yaml
# WRONG - compose file also has fallback
environment:
  INTERNAL_API_BASE_URL: ${API_BASE_URL:-http://default:8000}
```

**Why it's forbidden**:
1. Multiple fallback layers hide misconfiguration
2. Hardcoded defaults mask missing env vars
3. Makes debugging impossible ("why is it using this value?")

**Correct approach**:
- Define authoritative source in ONE place only
- Fail fast if required variable is missing
- Use explicit error messages, not silent fallbacks

### Pattern 4: Mixing Build-Time and Runtime for Same Variable

**NEVER do this**:
```dockerfile
# Dockerfile.prod
ARG INTERNAL_API_BASE_URL  # Build-time
ENV INTERNAL_API_BASE_URL=${INTERNAL_API_BASE_URL}
```

**Why it's forbidden**:
1. `INTERNAL_API_BASE_URL` should be runtime-only (internal network)
2. Baking it into image wastes build complexity
3. Makes deploys require rebuilds unnecessarily

**Correct approach**:
- `NEXT_PUBLIC_*` = build-time (ARG)
- `INTERNAL_API_BASE_URL` = runtime (environment: block)

### Pattern 5: Using .env in Production

**NEVER commit this**:
```bash
# .env (committed to git - WRONG)
DATABASE_URL=postgres://prod-db:5432/anyreason
SECRET_KEY=super-secret-production-key
```

**Why it's forbidden**:
1. Secrets in git = compromised secrets
2. .env should be in .gitignore
3. Use CI/CD injection or secrets management

**Correct approach**:
- Use `.env.example` as template (committed, no secrets)
- Use `.env.local` for local dev (gitignored)
- Use CI/CD secrets or vault for production

---

## Quick Reference Card

| Scenario | `NEXT_PUBLIC_` | `INTERNAL_API_BASE_URL` | Browser baseURL |
|----------|----------------|--------------------------|-----------------|
| Local dev (host) | DO NOT SET | `http://127.0.0.1:8000` | `""` (relative) |
| Docker local | DO NOT SET | `http://backend:8000` | `""` (relative) |
| Production | DO NOT SET | `http://backend:8000` | `""` (relative) |
| Split-origin (rare) | `https://api.example.com` | Still required for SSR | Full origin |

**One rule to remember**: Browser never needs `NEXT_PUBLIC_*` unless frontend and backend are on completely different domains. Default to relative paths.
