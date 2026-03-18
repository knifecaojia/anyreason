## Issues

### Task 4: Production Worker Startup --reload Issue (2026-03-18)

**Issue:** Production worker was using `--reload` flag which:
- Creates file watcher noise that obscures actual queue/concurrency debugging
- Can cause unnecessary worker restarts in production
- Adds memory overhead from watchfiles

**Root Cause:** Default startup scripts were copied from development patterns without removing reload flags

**Status:** FIXED - Removed `--reload` from production worker startup scripts
