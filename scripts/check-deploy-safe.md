# Deploy Safe Regression Check

Static regression check for forbidden localhost patterns in deploy/runtime code.

## Purpose

This check prevents accidentally deploying code with localhost URLs that would fail in production.

## What it checks

1. **Deploy compose files** (`docker/`, `docker-deploy/`):
   - Fails if `NEXT_PUBLIC_API_BASE_URL=localhost` is hardcoded (not as `${VAR:-fallback}`)

2. **Runtime code** (`nextjs-frontend/`, `fastapi_backend/`):
   - Fails if `http://localhost:8000` or `http://127.0.0.1:8000` appears in source code
   - Exception: Only allowed in centralized dev fallback files:
     - `serverApiConfig.ts`
     - `clientConfig.ts`

## Usage

```bash
node scripts/check-deploy-safe.js
```

Exit codes:
- `0` - PASSED (no forbidden patterns found)
- `1` - FAILED (forbidden patterns detected)

## Exclusions

The check automatically excludes:
- Test files (`/test/`, `/tests/`, `test_`, `-test.`)
- Build artifacts (`.next/`, `dist/`, `build/`)
- Virtual environments (`.venv/`)
- Node modules (`node_modules/`)
- Reference code (`refs/`)

## Example output

```
=== Checking for forbidden localhost patterns ===

Checking deploy compose files...
  Scanning: docker/docker-compose.deploy.yml
  Scanning: docker/docker-compose.yml
  Scanning: docker-deploy/docker-compose.hub.yml
  Scanning: docker-deploy/docker-compose.yml

Checking runtime code...
  Scanning: nextjs-frontend
  Scanning: fastapi_backend

=== Results ===

PASSED: No forbidden localhost patterns found.
```
