# QA Report - Honcho Memory Console

Project: `honcho-memory-console`
Owner: Jean García / SitioUno
Created: 2026-06-19T01:26:24-04:00
Validated: yes
Reviewed: yes
Reviewer: Zeus Factory orchestrator bootstrap pass
Status: G1 ready for autonomous Factory execution

Status: implementation evidence started; full browser/deploy QA remains pending later tasks.

## T01 Backend Scaffold Evidence

Scope: `honcho-memory-console-t01-backend-console-scaffold-and-secure-`.

Local checks run from `/home/jean/Projects/.worktrees/honcho-memory-console/inc-020-t01-backend-console-scaffold-and`:

- `uv run --frozen pytest console/backend/tests -q` -> `7 passed in 3.68s`.
- `uv run --frozen ruff check console/backend` -> `All checks passed!`.
- `uv run --frozen basedpyright console/backend` -> `0 errors, 0 warnings, 0 notes`.

Coverage notes:

- Unit tests prove recursive redaction of `Authorization` headers and secret-like fields.
- Unit tests prove `/api/settings`, `/api/overview`, and `/api/audit/events` do not serialize configured raw runtime secrets.
- `/api/*` routes are protected by Basic Auth middleware; missing or wrong credentials return `401` without echoing submitted credentials.

Waivers / pending by phase contract:

- Browser QA, screenshots, public sandbox URL, deployment evidence, and service-file permission checks are not part of T01; they remain pending T10/T11/T11B.

## T03 Agent Registry Evidence

Scope: `honcho-memory-console-t03-agent-registry-and-token-fingerprint`.

Local checks run from `/home/jean/Projects/.worktrees/honcho-memory-console/inc-040-t03-agent-registry-and-token-fin`:

- RED regression check: `uv run --frozen pytest console/backend/tests/test_agent_registry.py::test_fleet_registry_rejects_noncanonical_token_fingerprint_without_leaking_it -q` -> failed before the fix because `token_fingerprint` serialized the raw-looking sentinel instead of `None`.
- GREEN regression check: `uv run --frozen pytest console/backend/tests/test_agent_registry.py::test_fleet_registry_rejects_noncanonical_token_fingerprint_without_leaking_it -q` -> `1 passed in 4.06s`.
- `uv run --frozen pytest console/backend/tests/test_agent_registry.py -q` -> `6 passed in 4.79s`.
- `uv run --frozen pytest console/backend/tests -q` -> `13 passed in 4.15s`.
- `uv run --frozen ruff check console/backend` -> `All checks passed!`.
- `uv run --frozen basedpyright console/backend` -> `0 errors, 0 warnings, 0 notes`.
- `search_files` over `console/backend` for raw JWT/API-key/private-key markers -> `total_count: 0`.

Coverage notes:

- Unit tests prove `/api/agents` uses Honcho/config fallback when fleet registry is absent and includes VM, tenant, workspace, peer, token fingerprint/scope/status, memory counts, queue state, API activity, VM health, alerts, and sources.
- Unit tests prove fleet registry rows take precedence when configured and raw registry tokens are transformed into fingerprints before API serialization.
- Unit tests prove fleet registry rows with non-canonical `token_fingerprint` values are downgraded to `None`/`unknown` with sanitized `fleet_registry_token_fingerprint_invalid` alerts on both `/api/agents` and `/api/agents/{agent_id}`.
- Unit tests prove fleet registry adapter failure degrades to config fallback with sanitized `fleet_registry_unavailable` alerts.
- Unit tests prove `/api/agents/{agent_id}` is authenticated, sanitized, and returns `404` for unknown agents.
- Regression source generates its raw-looking sentinel at runtime; no literal JWT/API-key/private-key markers were found in backend app/tests.

Waivers / pending by phase contract:

- T03 is backend API/model work only; browser QA, screenshots, sandbox URL, and deployed service permission checks remain pending T10/T11/T11B.

## T03 Rework Evidence - Fleet Registry Alert Text Sanitization

Scope: `honcho-memory-console-t03-agent-registry-and-token-fingerprint` rework after security gate 594.

Local checks run from `/home/jean/Projects/.worktrees/honcho-memory-console/inc-040-t03-agent-registry-and-token-fin`:

- RED regression check: `uv run --frozen pytest console/backend/tests/test_agent_registry.py::test_fleet_registry_alert_strings_are_suppressed_without_leaking_text console/backend/tests/test_agent_registry.py::test_fleet_registry_alert_mapping_messages_are_replaced_by_canonical_text -q` -> `2 failed in 4.19s` before the fix because raw fleet alert string/message/source values reached the API response.
- GREEN regression check: same command -> `2 passed in 4.14s` after canonical alert sanitization.
- `uv run --frozen pytest console/backend/tests/test_agent_registry.py -q` -> `8 passed in 4.39s`.
- `uv run --frozen pytest console/backend/tests -q` -> `15 passed in 4.40s`.
- `uv run --frozen ruff check console/backend` -> `All checks passed!`.
- `uv run --frozen basedpyright console/backend` -> `0 errors, 0 warnings, 0 notes`.
- Secret/marker API response scan over `/api/agents` and `/api/agents/scan-agent` with synthetic fleet alert markers plus fake auth/Honcho token values -> `marker_leaks: []`, status codes `[200, 200]`.

Coverage notes:

- Unit tests now prove free-form fleet registry alert strings are replaced by a canonical `fleet_registry_alert_suppressed` alert on both list and detail endpoints.
- Unit tests now prove mapping-based fleet registry alerts keep only allowlisted codes/severity and replace untrusted `message`/`source` with console-authored canonical values.
- Existing fleet registry precedence test now expects canonical alert objects instead of untrusted string passthrough.

Waivers / pending by phase contract:

- T03 remains backend API/model work only; browser QA, screenshots, sandbox URL, deployed service permission checks, and final security review remain pending T10/T11/T11B/T09S.

## T05 Premium Frontend Shell Evidence

Scope: `honcho-memory-console-t05-premium-frontend-shell-and-design-sy`.
Evidence updated: `2026-06-19T07:54:31-04:00`.

Local checks run from `/home/jean/Projects/.worktrees/honcho-memory-console/inc-060-t05-premium-frontend-shell-and-d` and `/home/jean/Projects/.worktrees/honcho-memory-console/inc-060-t05-premium-frontend-shell-and-d/console/frontend`:

- RED/rework reproduction: `node --test console/frontend/tests/shell-contract.test.mjs` -> failed before fix with missing `src/App.tsx`, missing `src/components/StatePanels.tsx`, and fixture text matching the raw-token guard.
- `npm run typecheck` -> `tsc --noEmit` passed.
- `npm run test` -> `5 passed`, `0 failed`, duration `131.243709ms`.
- `npm run build` -> Vite `8.0.16` production build passed; generated `dist/index.html`, CSS asset, and JS asset; `22 modules transformed`, built in `223ms`.
- `CI=1 npm run smoke` -> Playwright/Chrome passed `1 passed (8.3s)`.
- `npm audit --json` -> `0` total vulnerabilities.
- `uv run --frozen pytest console/backend/tests -q` -> `23 passed in 6.67s` after merging current `origin/main` into the T05 worktree.
- `search_files` over `console/frontend/src`, `console/frontend/tests`, and `console/frontend/smoke` for `Bearer|rawToken|password|secret|Authorization|eyJ...` markers -> `total_count: 0` for each path.

UI/browser evidence paths:

- Desktop screenshot: `factory/projects/honcho-memory-console/evidence/t05-premium-frontend-shell/desktop-premium-shell.png` (`165754` bytes, valid PNG signature).
- Mobile screenshot: `factory/projects/honcho-memory-console/evidence/t05-premium-frontend-shell/mobile-memory-shell.png` (`97884` bytes, valid PNG signature).
- Playwright smoke test source: `console/frontend/smoke/shell.spec.ts`.

Coverage notes:

- Frontend scaffold now includes Vite/React/TypeScript entrypoint, app shell, design tokens, light/dark theme toggle, typed fixture data, contract tests, and browser smoke.
- Shell navigation covers Overview, Agents, Memory, Health, Telemetry, Audit, and Settings.
- UI includes a fixture-only banner, explicit status labels, skeleton, empty and error states, accessible focus/focus-visible token styling, live-region status text, mobile navigation flow, and one custom icon system.
- Playwright smoke validates desktop render, mobile render, core navigation interaction, theme toggle, clean console/page-error checks, and screenshot capture.

Waivers / pending by phase contract:

- T05 is local implementation and browser QA for the frontend shell only. Public sandbox URL, sandbox deploy path, docker compose evidence, and post-deploy browser/API verification remain pending T10/T11/T11B. No delivery/critical-readiness gate should be marked passed from this local T05 evidence alone.

## T05 Rework Closure Evidence - Commit/Push Hygiene

Scope: `honcho-memory-console-t05-premium-frontend-shell-and-design-sy` rework after increment integration rejected the task because the worktree still had uncommitted screenshot artifacts.
Evidence updated: `2026-06-19T08:17:06-04:00`.

Local checks rerun from `/home/jean/Projects/.worktrees/honcho-memory-console/inc-060-t05-premium-frontend-shell-and-d` and `/home/jean/Projects/.worktrees/honcho-memory-console/inc-060-t05-premium-frontend-shell-and-d/console/frontend`:

- `npm run typecheck && npm run test && npm run build && CI=1 npm run smoke` -> typecheck passed; frontend shell contract `5 passed`, `0 failed`; Vite production build passed with `22 modules transformed`; Playwright smoke passed `1 passed (8.3s)` and refreshed the browser evidence screenshots.
- `uv run --frozen pytest console/backend/tests -q` -> `23 passed in 5.50s`.
- `npm audit --json` -> `0` total vulnerabilities.
- Frontend protected-value marker scan for `Bearer|rawToken|password|secret|Authorization|eyJ...` over `console/frontend` -> `total_count: 0`.
- Browser smoke source `console/frontend/smoke/shell.spec.ts` keeps `console_error_check` and `page_error_check` assertions as empty arrays after desktop navigation/theme toggle and mobile Memory flow.

Updated UI/browser evidence paths:

- Desktop screenshot: `factory/projects/honcho-memory-console/evidence/t05-premium-frontend-shell/desktop-premium-shell.png` (`165484` bytes, PNG `1440x1000`, sha256 `8a99933789d0546d2a5b6e2a21b66507671114bb017ba1c3095a102715ee55f6`).
- Mobile screenshot: `factory/projects/honcho-memory-console/evidence/t05-premium-frontend-shell/mobile-memory-shell.png` (`96998` bytes, PNG `540x1204`, sha256 `701a5f059188e0761f1b90ef6bcc98b9f9495bb4be33d54d697eb1c3c952ed7b`).

Waivers / pending by phase contract:

- Same as T05: public sandbox URL, sandbox deploy path, docker compose evidence, and post-deploy browser/API verification remain pending T10/T11/T11B. This rework only closes local verification plus commit/push hygiene for the T05 branch.

## T07 Health Cockpit UX and Integration Evidence

Scope: `honcho-memory-console-t07-health-cockpit-ux-and-integration`.
Evidence updated: `2026-06-19T09:13:37-04:00`.

Local checks run from `/home/jean/Projects/.worktrees/honcho-memory-console/inc-080-t07-health-cockpit-ux-and-integr` and `/home/jean/Projects/.worktrees/honcho-memory-console/inc-080-t07-health-cockpit-ux-and-integr/console/frontend`:

- RED contract check: `npm test` initially failed with missing `src/lib/health.ts`, missing canonical Health cockpit backend integration, and missing `src/lib/fixtures.ts`.
- GREEN contract check: `npm test` -> frontend contract suites `8 passed`, `0 failed`, duration `132.523093ms`.
- `npm ci` -> `added 31 packages`, `found 0 vulnerabilities`.
- `npm run build` -> TypeScript + Vite production build passed; `23 modules transformed`; generated `dist/index.html`, CSS asset, and JS asset; built in `213ms`.
- `npm run smoke` -> Playwright/Chrome passed `2 passed (9.8s)`, including the T07 Health cockpit smoke and existing shell smoke.
- `uv run --frozen pytest console/backend/tests/test_local_services_health.py -q` -> `4 passed in 6.27s`.
- `uv run --frozen pytest console/backend/tests -q` -> `23 passed in 5.93s`.
- Frontend protected-value source scan over `console/frontend/src` for `Bearer|rawToken|factory-generated|Authorization|eyJ...` -> `total_count: 0`.

UI/browser evidence paths:

- Desktop Health screenshot: `factory/projects/honcho-memory-console/evidence/t07-health-cockpit/desktop-health-cockpit.png` (`1440x1844`, sha256 `b957dbac159fe3fe708546f647d6c329bb5660ac99fec45d9f61e2923df2b57b`).
- Mobile Health screenshot: `factory/projects/honcho-memory-console/evidence/t07-health-cockpit/mobile-health-cockpit.png` (`390x3326`, sha256 `6178e33328be101e64f5c2b078ae3c73055fcf0a9816815669f1b82d432c6910`).
- Playwright smoke source: `console/frontend/smoke/health-cockpit.spec.ts`.

Coverage notes:

- Health page now fetches live `/api/health/services` from the console backend, normalizes backend `generated_at`, `last_checked_at`, `latency_ms`, `evidence`, and `safe_to_show` fields, and displays source/timestamp metadata.
- Cockpit groups checks by canonical T07 categories: API, Deriver, Storage, Network, LLM, Update, and Host.
- Docker compose aggregate evidence is expanded into per-service rows so `api`, `deriver`, `database`, `redis`, and `console` statuses appear in the right operational group when backend evidence includes service details.
- UI displays degraded/offline/unknown states explicitly with text labels, evidence pills, and accessible loading/error/offline states without raw JSON-first rendering.
- Frontend support modules under `console/frontend/src/lib/` are tracked explicitly despite the repo root Python `lib/` ignore rule.

Waivers / pending by phase contract:

- T07 is local implementation plus browser smoke for the Health cockpit. Public sandbox URL, sandbox deploy path, docker compose deployment evidence, auth-bound deployed browser QA, and post-deploy browser/API verification remain pending T10/T11/T11B. No delivery/critical-readiness gate should be marked passed from this local T07 evidence alone.

## T07 Rework Closure Evidence - Commit/Push Hygiene

Scope: `honcho-memory-console-t07-health-cockpit-ux-and-integration` rework after increment integration rejected the prior terminal status because the worktree still had uncommitted screenshot artifacts.
Evidence updated: `2026-06-19T09:13:37-04:00`.

Local checks rerun from `/home/jean/Projects/.worktrees/honcho-memory-console/inc-080-t07-health-cockpit-ux-and-integr` and `/home/jean/Projects/.worktrees/honcho-memory-console/inc-080-t07-health-cockpit-ux-and-integr/console/frontend`:

- `npm test` -> frontend contract suites `8 passed`, `0 failed`, duration `134.090902ms`.
- `npm run build` -> TypeScript + Vite production build passed; `23 modules transformed`; generated `dist/index.html`, CSS asset, and JS asset; built in `201ms`.
- `npm run smoke -- smoke/health-cockpit.spec.ts` -> Playwright/Chrome Health cockpit smoke passed `1 passed (7.7s)` and refreshed T07 desktop/mobile evidence screenshots.
- `uv run --frozen pytest console/backend/tests/test_local_services_health.py -q` -> `4 passed in 5.03s`.
- `uv run --frozen pytest console/backend/tests -q` -> `23 passed in 5.14s`.
- `git diff --check` -> exit `0`, no whitespace errors.
- Frontend protected-value scan over `console/frontend/src` for `Bearer|rawToken|factory-generated|Authorization|eyJ...|api_key|secret|password|token` -> `total_count: 0`.
- Frontend smoke protected-value scan found only the explicit negative assertion in `console/frontend/smoke/health-cockpit.spec.ts` line 144; no secret values are embedded.

Updated UI/browser evidence paths:

- Desktop Health screenshot: `factory/projects/honcho-memory-console/evidence/t07-health-cockpit/desktop-health-cockpit.png` (`1440x1844`, sha256 `b957dbac159fe3fe708546f647d6c329bb5660ac99fec45d9f61e2923df2b57b`).
- Mobile Health screenshot: `factory/projects/honcho-memory-console/evidence/t07-health-cockpit/mobile-health-cockpit.png` (`390x3326`, sha256 `6178e33328be101e64f5c2b078ae3c73055fcf0a9816815669f1b82d432c6910`).

Closure note:

- Unrelated T05 shell screenshot side effects created by the earlier full `npm run smoke` were restored to the previously committed T05 evidence so this rework remains scoped to T07.
- This rework records only local implementation/browser-smoke evidence and branch hygiene. Sandbox/deploy/delivery evidence remains pending T10/T11/T11B by the canonical project contract.

## T08 Memory Explorer UX and Integration Evidence

Scope: `honcho-memory-console-t08-memory-explorer-ux-and-integration`.
Evidence updated: `2026-06-19T15:08:23Z`.

Local checks run from `/home/jean/Projects/.worktrees/honcho-memory-console/inc-090-t08-memory-explorer-ux-and-integ` and `/home/jean/Projects/.worktrees/honcho-memory-console/inc-090-t08-memory-explorer-ux-and-integ/console/frontend`:

- RED/rework reproduction: `npm test` -> frontend contract suites had `3` failing T08 checks: missing `src/lib/memory.ts`, missing Memory explorer UI labels, and missing explicit `memoryExplorerFixture`.
- `npm ci` -> `added 31 packages`, `found 0 vulnerabilities`.
- `npm test` -> frontend contract suites `11 passed`, `0 failed`, duration `145.304379ms` after implementation.
- `npm run build` -> TypeScript + Vite production build passed; `24 modules transformed`; generated `dist/index.html`, CSS asset, and JS asset; built in `209ms`.
- `npm run smoke -- smoke/memory-explorer.spec.ts` -> Playwright/Chromium Memory explorer smoke passed `1 passed (9.9s)` with backend `/api/memory` route fixtures, desktop/mobile screenshots, clean console/page-error checks, filter interaction, peer-context disclosure, and sensitive message disclosure.
- `npm run smoke` -> Playwright/Chromium frontend smoke suite passed `3 passed (13.6s)` across Health cockpit, Memory explorer, and shell navigation after updating the shell smoke route fixture for the new Memory explorer.
- `uv run --frozen pytest console/backend/tests/test_honcho_memory_adapters.py -q` -> `4 passed in 5.94s`.
- `git diff --check` -> exit `0`, no whitespace errors.
- Frontend protected-value source scan over `console/frontend/src` for `Bearer|rawToken|password|Authorization|eyJ...` -> `total_count: 0`.

UI/browser evidence paths:

- Desktop Memory screenshot: `factory/projects/honcho-memory-console/evidence/t08-memory-explorer/desktop-memory-explorer.png` (`1440x1727`, sha256 `2527534c51a1847d89c4f5fdac854403977507e87957e32ccc9c867584270bb0`).
- Mobile Memory screenshot: `factory/projects/honcho-memory-console/evidence/t08-memory-explorer/mobile-memory-explorer.png` (`390x3655`, sha256 `e1f759e7585a266bfa70283bc2aa78c8f80d38200040b1ec0e3e40b561cad141`).
- Playwright smoke source: `console/frontend/smoke/memory-explorer.spec.ts`.

Coverage notes:

- Memory page now fetches the canonical console backend memory endpoints for workspaces, workspace queue, peers, peer card, representation, peer context, sessions, session messages, and conclusions through a typed `src/lib/memory.ts` client.
- The UX exposes Workspace explorer, Peers, Peer card, Representation, Context, Sessions, Messages, and Conclusions surfaces with live/fixture source labeling, filter input, accessible empty states, and explicit refresh control.
- Sensitive message content remains hidden by default; Playwright verifies the preview is absent until the operator clicks `Reveal sensitive content for msg-1`.
- Peer representation/context text stays behind an explicit `Reveal peer context` disclosure before becoming visible.
- Search/filter interaction is covered by Playwright: filtering `Zeus` keeps the peer visible and hides an unrelated conclusion row.

Waivers / pending by phase contract:

- T08 is local implementation plus browser smoke for the Memory explorer. Public sandbox URL, sandbox deploy path, docker compose deployment evidence, auth-bound deployed browser QA, and post-deploy browser/API verification remain pending T10/T11/T11B. No delivery/critical-readiness gate should be marked passed from this local T08 evidence alone.

## T08 Rework Closure Evidence - Commit/Push Hygiene

Scope: `honcho-memory-console-t08-memory-explorer-ux-and-integration` rework after increment integration rejected the prior terminal status because the worktree still had uncommitted Memory explorer screenshot artifacts.
Evidence updated: `2026-06-19T16:20:20Z`.

Local checks rerun from `/home/jean/Projects/.worktrees/honcho-memory-console/inc-090-t08-memory-explorer-ux-and-integ` and `/home/jean/Projects/.worktrees/honcho-memory-console/inc-090-t08-memory-explorer-ux-and-integ/console/frontend`:

- `npm test` -> frontend contract suites `11 passed`, `0 failed`, duration `137.870381ms`.
- `npm run build` -> TypeScript + Vite production build passed with `24 modules transformed`; generated `dist/index.html`, CSS asset, and JS asset; built in `198ms`.
- `CI=1 npm run smoke -- smoke/memory-explorer.spec.ts` -> Playwright/Chromium Memory explorer smoke passed `1 passed (8.7s)` and refreshed only the T08 desktop/mobile evidence screenshots.
- `uv run --frozen pytest console/backend/tests/test_honcho_memory_adapters.py -q` -> `4 passed in 4.97s`.
- `git diff --check` -> exit `0`, no whitespace errors.
- Frontend protected-value source scan over `console/frontend/src` for `Bearer|rawToken|Authorization|eyJ[A-Za-z0-9_-]+\\.|api_key|secret|password` -> `total_count: 0`.
- Claude Code read-only closure audit (`claude-anthropic-code -p ... --allowedTools '' --max-turns 1 --output-format json`) -> success with `CLAUDE_CODE_AUDIT_OK scoped-to-T08-ready-to-commit`.
- `CHANGELOG.md` now includes a T08 line covering Memory explorer backend/frontend surfaces, explicit sensitive-content disclosure gates, search/filter interactions, and Playwright desktop/mobile evidence.

Updated UI/browser evidence paths:

- Desktop Memory screenshot: `factory/projects/honcho-memory-console/evidence/t08-memory-explorer/desktop-memory-explorer.png` (`1440x1727`, `266927` bytes, sha256 `e4125e970eb4cc0bd36b8ac2e5bee5f99dbe09b00cc47f8f29691b130a1e348e`).
- Mobile Memory screenshot: `factory/projects/honcho-memory-console/evidence/t08-memory-explorer/mobile-memory-explorer.png` (`390x3655`, `208150` bytes, sha256 `4aa94adf792267247b56b12e369be1f446f09923cec53ef5e7b4c49adb644240`).

Closure note:

- This rework records local implementation/browser-smoke evidence plus branch hygiene for T08 only. The final diff is scoped to the T08 changelog line, Memory explorer QA report entry, and T08 screenshot evidence.
- Sandbox URL, sandbox deploy path, docker compose deployment evidence, auth-bound deployed browser QA, and post-deploy browser/API verification remain pending T10/T11/T11B by the canonical project contract; no delivery/critical-readiness gate should be marked passed from this local T08 evidence alone.

## Planned QA Evidence

- Backend adapter/API contract tests for later increments.
- API smoke output after deployment packaging.
- Browser/Playwright evidence against deployed console.
- Public sandbox URL and screenshots from deployed console.
