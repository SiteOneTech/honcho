# Quality Review - Honcho Memory Console

Project: `honcho-memory-console`
Task: `honcho-memory-console-t11q-independent-quality-review-of-conso`
Branch: `factory/honcho-memory-console/inc-115-t11q-independent-quality-review`
Worktree: `/home/jean/Projects/.worktrees/honcho-memory-console/inc-115-t11q-independent-quality-review`
Reviewer: `factory-orchestrator` acting as independent Factory reviewer after quality-reviewer runtime failure
Reviewed at: 2026-06-22T04:47:25Z
Decision: BLOCKED

## Source-of-truth and docs consulted

Factory status was verified with `hermes factory status honcho-memory-console`: Agent Core Postgres/`zeus_agent.factory` is canonical, SQLite disabled; project `honcho-memory-console` is active with 18 tasks, 29 gates, and 72 runs.

Canonical project docs read before review:

- `factory/projects/honcho-memory-console/DOCUMENTATION_INDEX.md`
- `factory/projects/honcho-memory-console/PRD.md`
- `factory/projects/honcho-memory-console/TECHNICAL_BLUEPRINT.md`
- `factory/projects/honcho-memory-console/QA_GATES.md`
- `factory/projects/honcho-memory-console/SECURITY_GATES.md`
- `factory/projects/honcho-memory-console/QA_REPORT.md`
- `factory/projects/honcho-memory-console/SECURITY_REVIEW.md`
- `factory/projects/honcho-memory-console/DELIVERY_REPORT.md`
- `factory/projects/honcho-memory-console/TASK_GRAPH.md`
- `factory/projects/honcho-memory-console/evidence/t10-deployment-packaging/deploy-and-health-evidence.md`

## Scope reviewed

This review inspected the integrated console state at commit `953fba0dfa850f5914fda82ce3cf54897415fe55` (`origin/main` and current T11Q branch head at review start). There was no code diff between the assigned branch and `origin/main`, so the review is against the already integrated console/ops/factory artifacts from T01-T10.

Primary code/artifact surfaces inspected:

- `console/backend/app/main.py`
- `console/backend/app/models.py`
- `console/backend/app/adapters/agent_registry.py`
- `console/frontend/src/App.tsx`
- `console/frontend/src/components/AgentsView.tsx`
- `console/frontend/src/lib/fixtures.ts`
- `console/frontend/src/lib/health.ts`
- `console/frontend/src/lib/memory.ts`
- `console/frontend/smoke/*.spec.ts`
- `ops/honcho-memory-prod/*`
- existing UI screenshots under `factory/projects/honcho-memory-console/evidence/`

## Checks actually run

| Check | Result |
|---|---|
| `pwd && git rev-parse --show-toplevel && git branch --show-current && git status --short --branch && git remote -v && git log --oneline --decorate -5` | Confirmed assigned worktree/branch only; branch `factory/honcho-memory-console/inc-115-t11q-independent-quality-review`; remote `https://github.com/SiteOneTech/honcho.git`; initial worktree clean. |
| `git rev-parse HEAD`, `git diff --stat origin/main...HEAD` | HEAD `953fba0dfa850f5914fda82ce3cf54897415fe55`; no diff vs `origin/main`. |
| `hermes factory status honcho-memory-console` | `Factory DB: Agent Core Postgres/zeus_agent.factory (canonical; SQLite disabled)`; project active; 18 tasks; 29 gates; 72 runs. |
| `npm run test` from `console/frontend` | PASS: Node contract tests `18` passed, `0` failed, duration `140.837625ms`. |
| `npm run build` from `console/frontend` | FAIL/BLOCKER: `node_modules=no` and TypeScript cannot resolve React/types, first errors `TS2307: Cannot find module 'react'` and `TS2875: react/jsx-runtime` missing. `CI=1 npm run smoke` did not run because build stopped. Per task rule, no `npm ci`/package install was performed to mask the missing dependency state. |
| `git diff --check` | PASS: no whitespace errors. |
| `uv run --frozen pytest console/backend/tests -q` | PASS: `39 passed in 6.54s`. |
| `uv run --frozen ruff check console/backend` | PASS: `All checks passed!`. |
| `uv run --frozen basedpyright console/backend` | PASS: `0 errors, 0 warnings, 0 notes`. |
| screenshot file/sha check | Existing desktop/mobile PNG evidence exists for T05/T07/T08; see evidence section below. |
| focused source scans for protected-value markers | Frontend hits are negative assertions/test text; backend hits are code/docs around redaction/auth/secret handling, not literal committed runtime credentials found in reviewed console implementation. |

## Evidence observed

Existing UI screenshot artifacts are present but are local/fixture-smoke evidence, not deployed public sandbox evidence:

- `factory/projects/honcho-memory-console/evidence/t05-premium-frontend-shell/desktop-premium-shell.png` — PNG `1440x1000`, sha256 `2f329e18add5ea6f91d0663d5ae034ea695aa9864f999feaa375ea5442e4c754`.
- `factory/projects/honcho-memory-console/evidence/t05-premium-frontend-shell/mobile-memory-shell.png` — PNG `570x1208`, sha256 `3703c244509c9fd03bb61ee0f970539c5b875b2561ffea1f9358c0b999b86a76`.
- `factory/projects/honcho-memory-console/evidence/t07-health-cockpit/desktop-health-cockpit.png` — PNG `1440x1844`, sha256 `b957dbac159fe3fe708546f647d6c329bb5660ac99fec45d9f61e2923df2b57b`.
- `factory/projects/honcho-memory-console/evidence/t07-health-cockpit/mobile-health-cockpit.png` — PNG `390x3326`, sha256 `6178e33328be101e64f5c2b078ae3c73055fcf0a9816815669f1b82d432c6910`.
- `factory/projects/honcho-memory-console/evidence/t08-memory-explorer/desktop-memory-explorer.png` — PNG `1440x1727`, sha256 `e4125e970eb4cc0bd36b8ac2e5bee5f99dbe09b00cc47f8f29691b130a1e348e`.
- `factory/projects/honcho-memory-console/evidence/t08-memory-explorer/mobile-memory-explorer.png` — PNG `390x3655`, sha256 `4aa94adf792267247b56b12e369be1f446f09923cec53ef5e7b4c49adb644240`.

T10 deployment evidence is private Tailscale-only:

- `factory/projects/honcho-memory-console/DELIVERY_REPORT.md` records private URL `http://100.71.144.114:8080/`, deploy path `/srv/factory/projects/honcho-memory-console/repo`, and Docker Compose path `ops/honcho-memory-prod/docker-compose.yml`.
- `factory/projects/honcho-memory-console/evidence/t10-deployment-packaging/deploy-and-health-evidence.md` records `/healthz=200`, unauthenticated `/=401`, authenticated `/api/settings=200`, runtime env mode `600 root:root`, and explicitly states the console is not published to public `kidu.app` in T10.

## Findings

### BLOCKER 1 — Review cannot validate frontend build/browser smoke in the assigned worktree

The frontend contract tests pass, but production build fails in the assigned T11Q worktree because the isolated worktree has no frontend dependencies installed:

- `console/frontend/node_modules` was absent (`node_modules=no`).
- `npm run build` failed immediately with missing React/type declarations: `TS2307: Cannot find module 'react'`, `TS2875: react/jsx-runtime` missing, and cascading JSX errors.
- Because build failed, `CI=1 npm run smoke` did not execute, so this review cannot provide a fresh desktop/mobile/browser `console_error_check` or `core_flow_interaction` result from the assigned worktree.

Per the task runtime rule, I did not run `npm ci` or install packages to repair the review environment. This is a quality evidence blocker, not an approval condition.

Required rework:

1. Re-run this review/QA in a prepared worktree where frontend dependencies are present, or explicitly authorize dependency installation for the QA/review run.
2. Run `npm run build` and `CI=1 npm run smoke` successfully from `console/frontend`.
3. Record fresh desktop/mobile screenshots, clean console/page error checks, and core flow interaction evidence in the project-local QA/report artifacts.

### BLOCKER 2 — The deployed console is still not fully wired to live backend data required by the PRD/blueprint

The PRD launch criteria require the console to show real data from the current self-hosted Honcho and to avoid fake metrics except fixture-labeled dev mode. The blueprint defines live backend contracts for `/api/overview`, `/api/agents`, `/api/health/services`, `/api/memory/*`, `/api/telemetry`, `/api/audit/events`, and `/api/settings`.

Review found meaningful implementation progress, but major product surfaces remain fixture/scaffold-backed:

- `console/frontend/src/lib/fixtures.ts` keeps `FIXTURE_META.fixtureOnly: true` and says non-health sections use development fixtures.
- `console/frontend/src/App.tsx` imports and renders `overviewFixture`, `telemetryFixture`, `auditFixture`, and `providersFixture` directly for Overview/Telemetry/Audit/Settings.
- `console/frontend/src/components/AgentsView.tsx` imports `agentsFixture`, simulates a 700ms load, and sets `const allAgents = agentsFixture` instead of calling the existing `/api/agents` backend endpoint.
- `console/backend/app/main.py` still describes `GET /api/overview` as a scaffold overview with `status: "scaffold"` and `None` metrics.

This means the current UI can still look polished while showing sample control-plane data on critical pages. That violates the PRD core jobs for active agents, workspace counts, queue status, API usage/telemetry, audit trail, and settings/provider posture.

Required rework:

1. Add typed frontend clients for `/api/overview`, `/api/agents`, `/api/telemetry`, `/api/audit/events`, and `/api/settings`, mirroring the live integration pattern already used for Health and Memory.
2. Replace the global `fixtureOnly: true` posture with explicit live/fixture state per surface; fallback fixtures must be visibly labeled only when the backend call fails or when a dev fixture mode is deliberately active.
3. Replace backend `/api/overview` scaffold metrics with real/safely-null data aggregation from the existing adapters.
4. Add contract and browser tests proving Agents/Overview/Telemetry/Audit/Settings call their backend endpoints and do not silently render sample production metrics.

### BLOCKER 3 — Delivery/sandbox/UI gate evidence is incomplete for approval toward delivery

The canonical delivery contract in the task requires a public authorized sandbox (`kidu.app`/`*.kidu.app`) or an explicit waiver, plus UI gate evidence: browser smoke, desktop screenshot, mobile screenshot, clean console error check, core flow interaction, `QA_REPORT.md`, and evidence paths.

The reviewed artifacts explicitly state that T10 is private Tailscale-only and that browser/deployed QA remains pending:

- `DELIVERY_REPORT.md` states public `kidu.app` is intentionally not used in T10 and browser UI QA remains pending T11/T11B.
- `TASK_GRAPH.md` still has T11 Browser QA and T11B Post-deploy verification pending after T10/T11Q.
- No public `kidu.app` sandbox URL or waiver exists in the evidence read for this review.

Required rework:

1. Either publish the console to the authorized public sandbox (`kidu.app`/`*.kidu.app`) with deploy/health evidence, or record an explicit Jean/Zeus waiver that private Tailscale is the accepted sandbox boundary for this project.
2. Complete T11/T11B deployed browser/API QA against the real deployed surface, not only local Playwright route fixtures.
3. Update `QA_REPORT.md` and `DELIVERY_REPORT.md` with URL, deploy path, compose path, health checks, screenshots, console-error checks, core-flow checks, and unresolved risks.

### Quality notes that are not standalone blockers

- The backend security posture is strong for this stage: Basic Auth, redaction, token fingerprinting, telemetry/audit sanitization, and command allowlisting all have passing backend tests and security review evidence.
- The visual direction is custom and dense enough to avoid the obvious generic AI-purple dashboard trope in the reviewed screenshots; however, several pages are still fixture/scaffold shells, so the product cannot be called delivery-ready.
- Maintainability should improve before final delivery: `console/frontend/src/App.tsx` is now a 1,099-line multi-page component mixing routing, fixture imports, page rendering, and live client fallback logic. Splitting Overview/Memory/Health/Telemetry/Audit/Settings into route components and shared API clients would make the live-data rework safer.

## Decision

Quality review is BLOCKED. Do not close T11Q as passed and do not mark delivery/critical-readiness passed from the current evidence. The next work should be rework/live-integration plus a prepared frontend build/smoke run, followed by deployed UI QA.

STATE: BLOCKED
