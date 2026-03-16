# Frontend API Configuration Hardening for Docker/Multi-Node Deployment

## TL;DR

> **Quick Summary**: Eliminate unsafe `localhost` deployment assumptions from the frontend configuration model, separate browser/public API access from SSR/internal service access, and standardize Docker/deploy settings around proxy-first routing.
>
> **Deliverables**:
> - Unified frontend API URL configuration model
> - Cleaned env / compose / Docker defaults without deployment-time `localhost`
> - Centralized SSR/internal API base resolution
> - Verification coverage for browser, SSR, Docker config, and docs
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Task 1 → Task 2 → Task 5 → Task 7 → Final Verification

---

## Context

### Original Request
深入分析前端项目是否写死了访问后端的 url 使用了大量的localhost？这将为未来的部署带来灾难，请分析这种问题并给出解决方案。未来可能通过docker 在不同的节点启动，因此必须使用配置的方式统一设置信息。

### Interview Summary
**Key Discussions**:
- Frontend browser-side requests are already mostly proxy-friendly because `nextjs-frontend/lib/clientConfig.ts` uses relative `baseURL = ""` in browser context.
- The real risk is configuration drift: multiple env and compose files still inject `http://localhost:8000` into frontend-visible config.
- Docker and deployment config currently mix browser/public URL semantics with SSR/internal service-discovery semantics.
- Future deployment must support Docker-based and potentially multi-node environments, so config must be explicit, centralized, and environment-safe.

**Research Findings**:
- `nextjs-frontend/lib/clientConfig.ts` centralizes OpenAPI client setup for browser/SSR.
- `nextjs-frontend/.env` and `.env.local` hardcode `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`, and `INTERNAL_API_BASE_URL` to localhost.
- `docker/compose.app.yml` and `docker/docker-compose.deploy.yml` correctly use `http://backend:8000` for internal access but incorrectly expose `NEXT_PUBLIC_API_BASE_URL: http://localhost:8000`.
- `docker/nginx/anyreason-https.conf` already proxies `/api/` and websocket traffic, so browser-side relative access is the safest architecture.
- Additional server-side helpers/routes still fallback to `http://localhost:8000`, not just `clientConfig.ts`.

### Metis Review
**Identified Gaps** (addressed in this plan):
- Guardrail added: production/deploy config must never expose localhost as browser API origin.
- Guardrail added: browser-side access must remain relative `/api` unless an explicit documented split-origin deployment is required.
- Acceptance criteria expanded to cover server-side helper fallbacks, Docker build args, env precedence, docs, and grep-based regression checks.
- Scope locked to single-backend, nginx/gateway-mediated deployment hardening; no service-mesh or multi-backend routing redesign.

---

## Work Objectives

### Core Objective
Harden the frontend/backend URL configuration model so browser traffic remains deployment-safe through proxy-relative routing, SSR uses explicit internal service-discovery configuration, and Docker/deployment configs no longer depend on localhost assumptions.

### Concrete Deliverables
- Centralized API base resolver(s) with explicit browser vs SSR semantics
- Updated frontend env templates and local-development guidance
- Updated Docker compose / deploy configuration without unsafe public localhost defaults
- Regression checks preventing reintroduction of hardcoded deployment-time localhost API origins
- Documentation describing public-vs-internal URL rules and deployment patterns

### Definition of Done
- [ ] No production/deploy compose file exposes `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`
- [ ] Browser-side frontend API access works through relative `/api` paths behind nginx/proxy
- [ ] SSR/server-side calls use explicit internal base URL semantics
- [ ] Hardcoded server helper fallbacks to `http://localhost:8000` are removed or dev-only and centralized
- [ ] Tests / lint / grep verification pass and documentation reflects the new rules

### Must Have
- Explicit separation of **browser/public API access** vs **SSR/internal API access**
- One documented, centralized configuration contract for frontend API routing
- Safe defaults for Docker and deployment scenarios
- Fail-fast or clearly validated behavior when required server-side API config is missing

### Must NOT Have (Guardrails)
- No deploy/runtime dependency on browser hitting `localhost`
- No browser exposure of Docker-internal hostnames such as `backend:8000`
- No scattered fallback logic duplicated across many route handlers/actions after refactor
- No service-mesh, multi-backend routing, or runtime hot-reload configuration expansion beyond this scope

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after
- **Framework**: jest + eslint + tsc + Playwright available
- **Policy**: Add focused regression coverage for config resolution and grep-based deployment safety checks; use agent-executed QA for browser, SSR proxying, and Docker config validation.

### QA Policy
Every task below includes executable QA scenarios. Evidence should be captured under `.sisyphus/evidence/` by the executing agent.

- **Frontend/UI**: Playwright against proxied frontend routes
- **SSR/Node**: Bash running `pnpm test`, `pnpm tsc`, node-based config assertions
- **Config/Docker**: Bash using grep/search/read plus compose config rendering if available
- **Gateway/Proxy**: Bash + curl against nginx-routed endpoints in local containerized stack

---

## Execution Strategy

### Parallel Execution Waves

```text
Wave 1 (Start Immediately — inventory + contract):
├── Task 1: Inventory all frontend/server API base URL resolution points [quick]
├── Task 2: Define and document target config contract [writing]
├── Task 3: Audit Docker/build/runtime env injection path [quick]
└── Task 4: Audit proxy/websocket/browser-path assumptions [unspecified-high]

Wave 2 (After Wave 1 — centralization + config cleanup):
├── Task 5: Centralize SSR/internal API base resolution [deep]
├── Task 6: Normalize env templates and local-dev defaults [quick]
├── Task 7: Remove unsafe deploy/public localhost defaults from compose and build flow [unspecified-high]
└── Task 8: Add guardrail docs and precedence rules [writing]

Wave 3 (After Wave 2 — regression protection, max parallel):
├── Task 9: Add automated tests for config resolution behavior [deep]
├── Task 10: Add static regression checks for forbidden localhost patterns [quick]
├── Task 11: Validate proxy-first browser/API/websocket behavior in app routes [unspecified-high]
└── Task 12: Add startup/fail-fast validation for missing internal server config [deep]

Wave 4 (After Wave 3 — integration hardening):
├── Task 13: End-to-end Docker/dev compose verification [unspecified-high]
├── Task 14: Production compose/deploy verification [unspecified-high]
└── Task 15: Final cleanup of messages/examples/scripts that encourage unsafe deployment usage [quick]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA execution of all scenarios (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: 1 → 2 → 5 → 7 → 9/12 → 13/14 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4
```

### Dependency Matrix

- **1**: — → 5, 10, 15
- **2**: — → 5, 6, 7, 8, 9, 12
- **3**: — → 7, 13, 14
- **4**: — → 11, 13, 14
- **5**: 1, 2 → 9, 12, 15
- **6**: 2 → 13
- **7**: 2, 3 → 10, 13, 14, 15
- **8**: 2 → 15
- **9**: 2, 5 → 13, 14
- **10**: 1, 7 → 13, 14
- **11**: 4, 7 → 13, 14
- **12**: 2, 5 → 13, 14
- **13**: 6, 7, 9, 10, 11, 12 → F1-F4
- **14**: 7, 9, 10, 11, 12 → F1-F4
- **15**: 1, 5, 7, 8 → F1-F4

### Agent Dispatch Summary

- **Wave 1**: T1 `quick`, T2 `writing`, T3 `quick`, T4 `unspecified-high`
- **Wave 2**: T5 `deep`, T6 `quick`, T7 `unspecified-high`, T8 `writing`
- **Wave 3**: T9 `deep`, T10 `quick`, T11 `unspecified-high`, T12 `deep`
- **Wave 4**: T13 `unspecified-high`, T14 `unspecified-high`, T15 `quick`
- **FINAL**: F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] 1. Inventory all frontend/server API base URL resolution points

  **What to do**:
  - Enumerate every place the frontend or Next server code derives backend base URLs or full upstream URLs.
  - Include `lib/clientConfig.ts`, app route handlers under `app/api/**`, server actions under `components/actions/**`, helper utilities, scripts, and user-facing error messages.
  - Group findings into: browser-relative safe usage, centralized SSR/internal usage, duplicated fallback logic, and unsafe deployment examples.

  **Must NOT do**:
  - Do not refactor code yet.
  - Do not treat docs/examples as runtime logic without labeling them separately.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: concentrated repo inventory and classification work.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `systematic-debugging`: this is inventory, not bug root-cause isolation.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: 5, 10, 15
  - **Blocked By**: None

  **References**:
  - `nextjs-frontend/lib/clientConfig.ts:6-34` - Primary OpenAPI client config; defines browser relative base and SSR env resolution pattern.
  - `nextjs-frontend/components/actions/*.ts` - Many server actions duplicate `getApiBaseUrl()` fallback logic and likely need consolidation.
  - `nextjs-frontend/app/api/**/route.ts` - App route handlers proxy upstream requests and may embed localhost fallbacks.
  - `nextjs-frontend/lib/utils.ts:112` - User-facing error text still references default localhost backend assumptions.

  **Acceptance Criteria**:
  - [ ] A complete inventory table exists in implementation notes or PR description, covering all runtime URL-resolution points.
  - [ ] Every inventory item is classified as browser-only, SSR-only, shared helper, docs/example, or script-only.
  - [ ] No runtime URL-resolution location is left unclassified.

  **QA Scenarios**:
  ```
  Scenario: Enumerate all runtime URL base resolution points
    Tool: Bash (grep)
    Preconditions: Repository available locally
    Steps:
      1. Search `nextjs-frontend` for `NEXT_PUBLIC_API_BASE_URL|INTERNAL_API_BASE_URL|API_BASE_URL|http://localhost:8000|http://127.0.0.1:8000` in `*.ts` and `*.tsx` files.
      2. Review the result set and mark each match as browser-safe relative usage, SSR helper, route proxy, or non-runtime example.
      3. Confirm every `getApiBaseUrl()`-style helper is included in the inventory.
    Expected Result: A complete, non-duplicated inventory of all code-level URL resolution points.
    Failure Indicators: A later refactor uncovers new untracked URL resolution logic.
    Evidence: .sisyphus/evidence/task-1-url-inventory.txt

  Scenario: Detect unsafe runtime localhost fallbacks missed by inventory
    Tool: Bash (grep)
    Preconditions: Same repository state
    Steps:
      1. Search `nextjs-frontend` for literal `localhost:8000` and `127.0.0.1:8000` in runtime code paths.
      2. Compare results against the inventory table.
      3. Fail if any runtime file match is not represented.
    Expected Result: Zero runtime matches exist outside the tracked inventory.
    Evidence: .sisyphus/evidence/task-1-inventory-negative.txt
  ```

  **Commit**: NO

- [x] 5. Centralize SSR/internal API base resolution

- [x] 6. Normalize env templates and local-development defaults

- [x] 7. Remove unsafe deploy/public localhost defaults from compose and build flow

- [x] 8. Add guardrail documentation and environment precedence rules

  **What to do**:
  - Document which files/variables are authoritative in local dev, Docker local app stack, and production/deploy contexts.
  - Explain env precedence, build-time versus runtime semantics, and why browser should remain proxy-relative.
  - Include a short “forbidden patterns” section: browser localhost, browser Docker-internal hostname, duplicated per-file fallback chains.

  **Must NOT do**:
  - Do not bury critical deploy rules in comments only.
  - Do not rely on tribal knowledge for env precedence.

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: explicit operational documentation.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7)
  - **Blocks**: 15
  - **Blocked By**: 2

  **References**:
  - `README.md` - Existing developer onboarding needs updated guidance.
  - `docker/README.md` - Docker startup docs likely still imply localhost-centric assumptions.
  - `nextjs-frontend/Dockerfile.prod:22-28` - Must explain build-time public variable behavior.
  - `nextjs-frontend/.gitignore:28-30` - Clarifies `.env` and `.env.local` are local-only files.

  **Acceptance Criteria**:
  - [ ] Documentation states env precedence and deployment rules plainly.
  - [ ] Documentation includes explicit forbidden patterns.
  - [ ] Documentation is sufficient for a new engineer to configure local and deploy environments correctly.

  **QA Scenarios**:
  ```
  Scenario: Docs include environment precedence and forbidden patterns
    Tool: Bash (read/grep)
    Preconditions: Docs updated
    Steps:
      1. Read the updated docs.
      2. Confirm they explicitly cover precedence, build-time/runtime distinction, and forbidden browser patterns.
      3. Confirm they mention proxy-relative browser access as the preferred model.
    Expected Result: Operational guardrails are explicit and discoverable.
    Evidence: .sisyphus/evidence/task-8-doc-guardrails.txt

  Scenario: Docs distinguish local dev from deploy behavior
    Tool: Bash (grep)
    Preconditions: Same docs
    Steps:
      1. Search for `localhost`, `INTERNAL_API_BASE_URL`, and `NEXT_PUBLIC_API_BASE_URL`.
      2. Confirm local-dev usage is separate from deploy guidance.
    Expected Result: No ambiguity between local and deploy paths.
    Evidence: .sisyphus/evidence/task-8-doc-guardrails-negative.txt
  ```

  **Commit**: YES
  - Message: `docs(deploy): add frontend api configuration guardrails`

- [x] 2. Define and document the target frontend API configuration contract

  **What to do**:
  - Specify the exact semantics for browser/public API access, SSR/internal API access, and optional split-origin deployments.
  - Decide the canonical rule: browser uses relative `/api` by default; SSR uses `INTERNAL_API_BASE_URL`; public full origin is optional and documented, not default.
  - Document variable names, precedence, and examples for local dev, Docker single-host, and future multi-node deployment.

  **Must NOT do**:
  - Do not introduce multi-backend routing or service-mesh assumptions.
  - Do not leave public vs internal semantics ambiguous.

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: architecture contract and configuration semantics documentation.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `brainstorming`: requirements are already clear and documented.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: 5, 6, 7, 8, 9, 12
  - **Blocked By**: None

  **References**:
  - `nextjs-frontend/lib/clientConfig.ts:13-29` - Existing split between browser relative mode and SSR env mode.
  - `docker/nginx/anyreason-https.conf:66-126` - Gateway/proxy path contract enabling same-origin browser calls.
  - `docker/compose.app.yml:123-128` - Current semantic conflict between internal and public-facing values.
  - `docker/docker-compose.deploy.yml:190-196` - Production/deploy env semantics that must be corrected.

  **Acceptance Criteria**:
  - [ ] The target config contract is documented in a repo markdown file.
  - [ ] The contract explicitly defines default browser behavior, SSR behavior, and optional split-origin override behavior.
  - [ ] The contract explicitly states that deploy config must not set browser API origin to localhost.

  **QA Scenarios**:
  ```
  Scenario: Validate contract covers all deployment modes
    Tool: Bash (read/grep)
    Preconditions: Drafted documentation file exists
    Steps:
      1. Read the new/updated config documentation.
      2. Verify it contains sections for local development, Docker local app stack, and remote deployment.
      3. Verify it distinguishes browser/public access from SSR/internal access.
    Expected Result: Documentation fully defines the allowed configuration contract.
    Failure Indicators: Missing environment mode or ambiguous variable semantics.
    Evidence: .sisyphus/evidence/task-2-config-contract.txt

  Scenario: Validate localhost deploy ban is explicit
    Tool: Bash (grep)
    Preconditions: Same documentation file
    Steps:
      1. Search the documentation for `localhost` and `NEXT_PUBLIC_API_BASE_URL`.
      2. Confirm the text clearly marks localhost as local-dev-only and forbidden as a deploy default.
    Expected Result: Guardrail is stated in documentation.
    Evidence: .sisyphus/evidence/task-2-config-contract-negative.txt
  ```

  **Commit**: NO

- [x] 3. Audit Docker build/runtime env injection path

  **What to do**:
  - Trace how env values flow from `.env` / compose files into Docker build args, runtime container env, and Next.js build output.
  - Identify where `NEXT_PUBLIC_API_BASE_URL` is baked at build time versus read at runtime.
  - Document the mismatch between `Dockerfile.prod`, compose files, and actual desired runtime behavior.

  **Must NOT do**:
  - Do not change image structure yet.
  - Do not assume build-time public env vars are safely mutable at runtime.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: narrow config-path tracing across a few files.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: 7, 13, 14
  - **Blocked By**: None

  **References**:
  - `nextjs-frontend/Dockerfile.prod:22-28` - Build arg `NEXT_PUBLIC_API_BASE_URL` is baked into the image at build time.
  - `docker/compose.app.yml:115-128` - Local app compose runtime env values.
  - `docker/docker-compose.deploy.yml:181-199` - Deploy compose runtime env values.
  - `nextjs-frontend/package.json:5-15` - Build/test command surface used by verification.

  **Acceptance Criteria**:
  - [ ] Build-time versus runtime env responsibilities are explicitly mapped.
  - [ ] The plan for runtime-safe deployment config is grounded in actual Dockerfile/compose behavior.
  - [ ] No ambiguity remains about whether browser-facing config is baked or runtime-derived.

  **QA Scenarios**:
  ```
  Scenario: Trace build-time public API env injection
    Tool: Bash (read/grep)
    Preconditions: Dockerfile and compose files available
    Steps:
      1. Read `nextjs-frontend/Dockerfile.prod` and confirm which ARG/ENV values are set before `pnpm run build`.
      2. Read deploy compose and local compose files to identify where those values are supplied.
      3. Produce a short mapping of source -> build arg -> runtime env -> consumer.
    Expected Result: A verified env flow map exists.
    Evidence: .sisyphus/evidence/task-3-env-flow.txt

  Scenario: Detect build/runtime mismatch
    Tool: Bash (grep)
    Preconditions: Same files
    Steps:
      1. Compare build arg names and runtime env names.
      2. Fail if browser-facing values are assumed runtime-configurable while only being build-time injected.
    Expected Result: Any mismatch is documented before implementation proceeds.
    Evidence: .sisyphus/evidence/task-3-env-flow-negative.txt
  ```

  **Commit**: NO

- [x] 4. Audit proxy, websocket, and browser-path assumptions

  **What to do**:
  - Verify which browser-side requests use relative `/api` and whether websocket/event-stream paths also stay same-origin or route through proxy.
  - Confirm nginx routing supports the intended browser behavior for API and websocket endpoints.
  - Identify any client-side full-origin exceptions and classify whether they are legitimate external calls or misconfigurations.

  **Must NOT do**:
  - Do not redesign nginx topology.
  - Do not conflate backend absolute URLs returned from API responses with frontend request origins.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: requires end-to-end reasoning across browser, app routes, and nginx proxy behavior.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: 11, 13, 14
  - **Blocked By**: None

  **References**:
  - `docker/nginx/anyreason-https.conf:66-115` - `/api`, websocket, docs, and frontend proxy definitions.
  - `nextjs-frontend/hooks/useVideoModelSpec.ts:31` - Example browser-side relative fetch usage.
  - `nextjs-frontend/components/scripts/ScriptAIAssistantSessionPane.tsx` - Heavy browser API usage through relative `/api` routes.
  - `nextjs-frontend/app/openapi-client/core/serverSentEvents.gen.ts` - Relevant if stream/event transport behavior depends on URL config.

  **Acceptance Criteria**:
  - [ ] Browser-side request categories are classified as proxy-safe, external, or problematic.
  - [ ] Websocket/event-stream proxy expectations are documented.
  - [ ] No hidden assumption remains that browser can reach Docker-internal hostnames.

  **QA Scenarios**:
  ```
  Scenario: Verify browser-side requests are same-origin capable
    Tool: Bash (grep)
    Preconditions: Frontend source available
    Steps:
      1. Search browser components/hooks for `fetch(` and `new WebSocket(` usage.
      2. Confirm internal API calls primarily use relative `/api` or `/api/.../stream` paths.
      3. Flag any browser usage with hardcoded full backend origin.
    Expected Result: Browser traffic is predominantly relative-path based.
    Evidence: .sisyphus/evidence/task-4-browser-paths.txt

  Scenario: Verify nginx supports required browser paths
    Tool: Bash (read)
    Preconditions: Nginx config available
    Steps:
      1. Read nginx config.
      2. Confirm `/api/` proxying and websocket upgrade headers exist.
      3. Confirm frontend root and static assets route separately.
    Expected Result: Proxy contract matches browser relative routing assumptions.
    Evidence: .sisyphus/evidence/task-4-proxy-negative.txt
  ```

  **Commit**: NO

- [x] 9. Add automated tests for config resolution behavior

- [x] 10. Add static regression checks for forbidden localhost patterns

  **What to do**:
  - Add a lightweight automated check (test/script/CI command) that fails if forbidden patterns reappear in deploy/runtime frontend config.
  - Focus on runtime/frontend/deploy files, not docs/examples that are intentionally local-dev-specific unless policy says otherwise.
  - Ensure the check is easy to run locally and in CI.

  **Must NOT do**:
  - Do not create noisy checks that flag every docs localhost mention.
  - Do not rely on manual review to catch regressions.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: narrow regression guard implementation.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 11, 12)
  - **Blocks**: 13, 14
  - **Blocked By**: 1, 7

  **References**:
  - Inventory from Task 1 - Distinguishes forbidden runtime paths from allowed docs/examples.
  - `docker/compose.app.yml` and `docker/docker-compose.deploy.yml` - Primary deploy config targets.
  - `nextjs-frontend/components/actions/*.ts` and `app/api/**` - Runtime server code where fallback regressions matter.
  - CI workflow files under `.github/workflows/` if the check is wired into CI.

  **Acceptance Criteria**:
  - [ ] A reproducible command exists that fails on forbidden localhost deployment patterns.
  - [ ] The check excludes approved local-dev/docs cases or scopes only to runtime/deploy files.
  - [ ] The check is documented for maintainers.

  **QA Scenarios**:
  ```
  Scenario: Regression check passes on clean configuration
    Tool: Bash
    Preconditions: Static check implemented
    Steps:
      1. Run the regression-check command.
      2. Confirm it exits successfully on the cleaned codebase.
      3. Save output.
    Expected Result: Clean repository passes the forbidden-pattern check.
    Evidence: .sisyphus/evidence/task-10-regression-check.txt

  Scenario: Regression check fails on forbidden deploy localhost pattern
    Tool: Bash
    Preconditions: Temporary or fixture-based mutation available for validation
    Steps:
      1. Introduce or simulate a forbidden line such as `NEXT_PUBLIC_API_BASE_URL: http://localhost:8000` in a scoped validation context.
      2. Run the regression-check command.
      3. Confirm it fails and pinpoints the offending file.
    Expected Result: Forbidden pattern is caught automatically.
    Evidence: .sisyphus/evidence/task-10-regression-check-negative.txt
  ```

  **Commit**: YES
  - Message: `test(config): add forbidden localhost regression check`

- [x] 11. Validate proxy-first browser, app-route, and websocket behavior

  **What to do**:
  - Verify that browser flows continue to work through relative `/api` paths after config cleanup.
  - Validate app routes and stream/websocket endpoints remain reachable behind nginx/proxy without browser full-origin configuration.
  - Confirm no feature depends on browser access to localhost or Docker-internal hostnames.

  **Must NOT do**:
  - Do not switch browser flows to explicit full backend origin unless the contract explicitly allows it for split-origin deployments.
  - Do not skip websocket/event-stream paths.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: integration verification across frontend + proxy behavior.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 12)
  - **Blocks**: 13, 14
  - **Blocked By**: 4, 7

  **References**:
  - `docker/nginx/anyreason-https.conf:66-115` - Required proxy path behavior.
  - Browser fetch usages in `nextjs-frontend/components/**` and `hooks/**` - Relative route consumers to spot-check.
  - Any stream/websocket routes under `nextjs-frontend/app/api/**` or generated client transport files.

  **Acceptance Criteria**:
  - [ ] Browser requests to internal app APIs remain same-origin/relative.
  - [ ] Proxy-routed API and websocket/stream paths continue to work after config changes.
  - [ ] No browser-visible config requires localhost or backend container hostnames.

  **QA Scenarios**:
  ```
  Scenario: Browser can fetch internal API through same-origin path
    Tool: Playwright
    Preconditions: Frontend and proxy stack running locally
    Steps:
      1. Open the app in browser through the proxied frontend origin.
      2. Trigger a page or component that performs a known `/api/...` request.
      3. Inspect network requests and confirm the request URL is same-origin with a relative `/api` path.
    Expected Result: API call succeeds without any browser-side full backend origin.
    Evidence: .sisyphus/evidence/task-11-browser-proxy.png

  Scenario: Websocket or stream path upgrades through proxy without full backend origin
    Tool: Playwright or Bash (curl for stream endpoint)
    Preconditions: Relevant endpoint available in local stack
    Steps:
      1. Exercise a stream or websocket-backed feature/path routed through nginx.
      2. Confirm connection succeeds via proxied path.
      3. Fail if the browser attempts to connect to localhost/backend hostname directly.
    Expected Result: Real-time path works with proxy-relative addressing.
    Evidence: .sisyphus/evidence/task-11-browser-proxy-negative.txt
  ```

  **Commit**: NO

- [x] 12. Add startup or fail-fast validation for missing internal server config

  **What to do**:
  - Introduce explicit validation so server-side code fails clearly when required internal API configuration is missing in non-dev environments.
  - Ensure the failure happens early and explains which variable is required.
  - Align validation with the shared resolver from Task 5 and the contract from Task 2.

  **Must NOT do**:
  - Do not silently fall back to localhost in production-like contexts.
  - Do not make local development unusable if documented dev fallback is intentionally retained.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: correctness and lifecycle behavior for server startup/runtime config.
  - **Skills**: [`test-driven-development`]
    - `test-driven-development`: fail-fast behavior should be encoded before implementation.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 11)
  - **Blocks**: 13, 14
  - **Blocked By**: 2, 5

  **References**:
  - `nextjs-frontend/lib/clientConfig.ts:19-28` - Existing error behavior when no server API base URL is configured.
  - Shared resolver from Task 5 - Primary place to enforce fail-fast validation.
  - Server route handlers and actions reusing that resolver - Consumers of the validation behavior.

  **Acceptance Criteria**:
  - [ ] Production-like server execution without required internal API config fails with a clear error.
  - [ ] Error text names the correct required variables.
  - [ ] Local development behavior remains consistent with the documented contract.

  **QA Scenarios**:
  ```
  Scenario: Production-like missing config fails fast with actionable error
    Tool: Bash
    Preconditions: Test or script can run resolver/startup path under production-like env
    Steps:
      1. Clear internal API env vars.
      2. Set `NODE_ENV=production`.
      3. Invoke the server config resolution path and capture stderr/output.
    Expected Result: Execution fails immediately with a message naming required variables.
    Evidence: .sisyphus/evidence/task-12-failfast.txt

  Scenario: Documented dev mode still behaves as intended
    Tool: Bash
    Preconditions: Same codebase with dev env settings
    Steps:
      1. Set `NODE_ENV=development` with the documented local-dev config path.
      2. Run the targeted resolver test or app startup check.
      3. Confirm behavior matches the documented development contract.
    Expected Result: Dev remains usable without reintroducing unsafe production defaults.
    Evidence: .sisyphus/evidence/task-12-failfast-negative.txt
  ```

  **Commit**: YES
  - Message: `feat(frontend-config): fail fast on missing internal api config`

- [x] 13. Verify local Docker app stack end to end

  **What to do**:
  - Run the local Docker app stack using the cleaned config.
  - Verify frontend loads, browser-side API calls are same-origin/proxy-relative, and SSR/server calls reach backend via internal config.
  - Confirm no feature requires browser access to localhost backend origin.

  **Must NOT do**:
  - Do not verify only container startup; verify actual request behavior.
  - Do not treat direct backend port access as proof that frontend routing is correct.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: multi-component integration and behavior verification.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 14, 15)
  - **Blocks**: F1, F2, F3, F4
  - **Blocked By**: 6, 7, 9, 10, 11, 12

  **References**:
  - `README.md` and `docker/README.md` - Local startup commands and expectations.
  - `docker/compose.app.yml` - Local app stack config under test.
  - Browser flows using `/api` requests - choose at least one stable page/component with API traffic.

  **Acceptance Criteria**:
  - [ ] Local Docker app stack starts successfully with updated config.
  - [ ] Browser network requests for internal APIs use same-origin/proxy-relative paths.
  - [ ] Server-side routes/actions successfully reach backend without localhost dependency.

  **QA Scenarios**:
  ```
  Scenario: Local Docker app stack serves frontend and proxied API correctly
    Tool: Bash + Playwright
    Preconditions: Docker daemon available
    Steps:
      1. Start the documented local app stack.
      2. Open the frontend URL in Playwright.
      3. Navigate to a page known to load data via `/api` and assert successful render/network response.
    Expected Result: UI works and network requests stay same-origin.
    Evidence: .sisyphus/evidence/task-13-local-stack.png

  Scenario: No browser request targets localhost backend origin
    Tool: Playwright
    Preconditions: Same running stack
    Steps:
      1. Open the same page and capture the network request list.
      2. Fail if any internal API request targets `http://localhost:8000` or `http://127.0.0.1:8000`.
    Expected Result: Zero browser API calls target localhost backend origin.
    Evidence: .sisyphus/evidence/task-13-local-stack-negative.txt
  ```

  **Commit**: NO

- [x] 14. Verify production/deploy configuration behavior

- [x] 15. Final cleanup of messages/examples/scripts that encourage unsafe deployment usage

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Verify every Must Have / Must NOT Have against the resulting diff, config files, docs, and evidence files.

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run frontend lint/type/test commands, inspect changed files for duplicated URL logic, unsafe defaults, or config slop.

- [x] F3. **Real Manual QA** — `unspecified-high`
  Execute every scenario from every task, including browser proxy calls, SSR calls, compose rendering, and failure-mode validation. Save evidence under `.sisyphus/evidence/final-qa/`.

- [x] F4. **Scope Fidelity Check** — `deep`
  Confirm the work stayed within URL/config hardening scope and did not redesign unrelated routing, auth, or backend API semantics.

---

## Commit Strategy

- **1**: `refactor(frontend-config): centralize api base resolution`
- **2**: `chore(docker): remove unsafe localhost deploy defaults`
- **3**: `test(config): add api url regression coverage`
- **4**: `docs(deploy): document frontend api configuration model`

---

## Success Criteria

### Verification Commands
```bash
pnpm lint
pnpm tsc
pnpm test
```

Additional verification:
```bash
# no unsafe deploy localhost defaults
grep -R "NEXT_PUBLIC_API_BASE_URL: http://localhost:8000" docker || true

# no scattered hardcoded localhost fallbacks in frontend runtime/server helpers
grep -R "http://localhost:8000\|http://127.0.0.1:8000" nextjs-frontend --include="*.ts" --include="*.tsx" || true
```

### Final Checklist
- [ ] All deploy-facing config uses explicit safe semantics
- [ ] Browser-side API routing remains relative/proxy-first
- [ ] SSR/internal routing is centralized and validated
- [ ] Tests and static checks prevent regression
- [ ] Docs explain how to configure local dev vs Docker vs deployment
