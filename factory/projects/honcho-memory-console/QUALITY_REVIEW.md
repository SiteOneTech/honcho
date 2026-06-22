# Quality Review - Honcho Memory Console

Project: `honcho-memory-console`
Task: `honcho-memory-console-t11q-independent-quality-review-of-conso`
Branch: `factory/honcho-memory-console/inc-115-t11q-independent-quality-review`
Worktree: `/home/jean/Projects/.worktrees/honcho-memory-console/inc-115-t11q-independent-quality-review`
Reviewer: quality-reviewer (Hermes profile)
Reviewed at: 2026-06-22T05:20:00Z
Decision: BLOCKED — rework required before approval

---

## Source-of-truth and docs consulted

Canonical project docs read before review:

- `factory/projects/honcho-memory-console/DOCUMENTATION_INDEX.md`
- `factory/projects/honcho-memory-console/PRD.md`
- `factory/projects/honcho-memory-console/TECHNICAL_BLUEPRINT.md`
- `factory/projects/honcho-memory-console/QA_GATES.md`
- `factory/projects/honcho-memory-console/SECURITY_GATES.md`
- `factory/projects/honcho-memory-console/QA_REPORT.md`
- `factory/projects/honcho-memory-console/DELIVERY_REPORT.md`
- `factory/projects/honcho-memory-console/SECURITY_REVIEW.md`
- `console/frontend/src/lib/fixtures.ts`
- `console/frontend/src/components/AgentsView.tsx`
- `console/frontend/src/App.tsx`
- `console/frontend/package.json`
- `console/backend/app/main.py`

---

## Checks actually run

| Check | Result |
|---|---|
| `git branch --show-current` | `factory/honcho-memory-console/inc-115-t11q-independent-quality-review` |
| `git status --short` | clean worktree |
| `git log --oneline origin/main..HEAD` | `a7b9954 docs(console): record T11Q quality review blockers` (1 doc-only commit) |
| `ls node_modules` from `console/frontend/` | ABSENT — no frontend deps installed |
| `uv run --frozen pytest console/backend/tests -q` | `39 passed in 5.53s` |
| `uv run --frozen ruff check console/backend` | `All checks passed!` |
| `uv run --frozen basedpyright console/backend` | `0 errors, 0 warnings, 0 notes` |
| `grep -n "overviewFixture\|telemetryFixture\|auditFixture\|providersFixture" console/frontend/src/App.tsx` | 9 hits across lines 8, 11, 12, 13, 175, 241, 295–326, 995, 1034, 1065 |
| `grep -n "agentsFixture" console/frontend/src/components/AgentsView.tsx` | line 449: `const allAgents = agentsFixture` (not a live API call) |
| `grep -n "fixtureOnly" console/frontend/src/lib/fixtures.ts` | line 7: `fixtureOnly: true` |
| `grep -n "status.*scaffold" console/backend/app/main.py` | line 186: `"status": "scaffold"` in `GET /api/overview` |
| `wc -l console/frontend/src/App.tsx` | 1099 lines |
| `grep -rn "dashboard-template\|card-grid\|generic.*dashboard\|ai-purple" console/frontend/src/` | no matches |
| `grep -n "vite\|recharts\|reactflow\|styled-components" console/frontend/package.json` | only vite; no generic dashboard libraries |
| `grep -n "fetch\|/api/" console/frontend/src/App.tsx console/frontend/src/components/*.tsx` | 9 occurrences of `/api/` in App.tsx (imports) but only 1 actual fetch call |

---

## Findings

### BLOCKER 1 — Frontend build/smoke cannot run from the isolated worktree

The `console/frontend/node_modules` directory is absent in the T11Q worktree, making it impossible to run `npm run build` or `CI=1 npm run smoke`. This blocks fresh browser smoke evidence from the current branch.

Evidence:
- `ls node_modules` from `console/frontend/` → ABSENT
- The previous T05/T07/T08 worktrees had `npm ci` run and node_modules present
- This is a worktree isolation issue, not a code defect

Required rework:
1. Run `npm ci` from `console/frontend/` to install frontend dependencies in the worktree
2. Run `npm run build` to confirm clean TypeScript + Vite production build
3. Run `CI=1 npm run smoke` to capture fresh browser evidence
4. Commit any screenshot artifacts that need to be tracked

Note: This is a process/preparedness blocker, not a code quality issue. The code itself was confirmed buildable in prior worktrees (T05/T07/T08 had passing builds).

---

### BLOCKER 2 — Frontend still globally in fixture mode; Overview, Telemetry, Audit, and Settings are not connected to live backend endpoints

The PRD (line 102: "Shows real data from current self-hosted Honcho") and blueprint (live API contracts for `/api/overview`, `/api/agents`, `/api/telemetry`, `/api/audit/events`, `/api/settings`) are not satisfied.

**Evidence:**

| Surface | Backend endpoint | Frontend status |
|---|---|---|
| Overview | `GET /api/overview` | Returns `status: "scaffold"`, all metrics `None` |
| Agents | `GET /api/agents` | `AgentsView.tsx:449` uses `agentsFixture` directly; 700ms timer simulates load; never calls `/api/agents` |
| Telemetry | `GET /api/telemetry` | `App.tsx:995` renders `telemetryFixture` directly |
| Audit | `GET /api/audit/events` | `App.tsx:1034` renders `auditFixture` directly |
| Settings | `GET /api/settings` | `App.tsx:1065` renders `providersFixture` directly |
| Health | `GET /api/health/services` | Live — `fetchServiceHealth()` called in App.tsx |
| Memory | `GET /api/memory/*` | Live — `fetchMemoryExplorerSnapshot()` called in App.tsx |

Root cause:
- `console/frontend/src/lib/fixtures.ts` line 7: `FIXTURE_META.fixtureOnly: true` with note "Non-health sections use explicit development fixtures until their assigned integration increments land."
- `AgentsView.tsx` line 16: imports `agentsFixture`; line 423–426: simulates 700ms load with `setTimeout` instead of `fetch`
- `App.tsx` lines 241, 295–326, 995, 1034, 1065: all render fixture data directly
- Backend `main.py` lines 179–199: `/api/overview` returns hardcoded scaffold payload with `None` metrics

The pattern is inconsistent: Health and Memory surfaces are properly live-connected; the other 5 surfaces are not.

Required rework:
1. Add typed frontend API clients for `/api/overview`, `/api/agents`, `/api/telemetry`, `/api/audit/events`, and `/api/settings`
2. Replace `FIXTURE_META.fixtureOnly: true` with per-surface live/fixture state; fixtures as explicit fallback only when backend call fails
3. Wire `AgentsView.tsx` to call `/api/agents` with error/loading states (remove the 700ms `setTimeout`)
4. Replace backend `/api/overview` scaffold metrics with real aggregation from existing adapters (health, agent registry, Honcho API)

---

### BLOCKER 3 — Canonical delivery/sandbox/UI gate evidence is incomplete

Per the task acceptance criteria: "Review diff against PRD, technical blueprint, and premium UX mandate."

| Gate requirement | Status |
|---|---|
| Sandbox URL public authorized (`kidu.app`/`.kidu.app`) | NOT PRESENT — T10 is private Tailscale-only |
| Waiver for private Tailscale as project sandbox | NOT RECORDED |
| Fresh browser smoke from deployed surface | NOT RUN (node_modules absent) |
| Desktop screenshot from deployed console | NOT AVAILABLE for T11Q branch |
| Mobile screenshot from deployed console | NOT AVAILABLE for T11Q branch |
| Console error check (deployed) | NOT RUN |
| Core flow interaction (deployed) | NOT RUN |
| QA_REPORT.md updated with deployed evidence | PARTIAL — local smoke evidence exists (T05/T07/T08) but not fresh deployed evidence |

Evidence from existing artifacts:
- `DELIVERY_REPORT.md`: T10 private URL `http://100.71.144.114:8080/`; explicit note "Public kidu.app URL is intentionally not used for T10"
- Existing UI screenshots are local-smoke artifacts from T05/T07/T08, not fresh deployed-browser captures

The canonical contract requires either a public kidu.app deployment or an explicit Jean/Zeus waiver accepting private Tailscale as the sandbox boundary.

Required rework:
1. Either publish console to public sandbox (`*.kidu.app`) with fresh deploy evidence, or obtain explicit waiver from Jean/Zeus
2. Install frontend deps, run `CI=1 npm run smoke` against the deployed URL
3. Update `QA_REPORT.md` with fresh deployed desktop/mobile screenshots, console error check, and core flow evidence

---

### Quality notes (not standalone blockers)

**Visual/UX quality — positive:**
- No generic AI-purple dashboard template found (grep scan returned no matches)
- Only Vite used — no Recharts, ReactFlow, styled-components, or Radix UI generic components
- Custom Phosphor-style icon system in `Icon.tsx`
- Dense data tables with proper sort/filter, accessible ARIA, WCAG AA contrast tokens
- Dark/light mode, skeleton/empty/error states, responsive breakpoints
- Screenshots from T05/T07/T08 confirm premium visual quality

**Maintainability concern — App.tsx is 1,099 lines:**
`console/frontend/src/App.tsx` mixes routing, fixture imports, live API fallback logic, and page rendering for all 7 routes in a single file. This makes the live-integration rework (BLOCKER 2) riskier than it needs to be. Recommended: extract each route (Overview, Telemetry, Audit, Settings) into its own component before wiring live data.

**Backend security — solid:**
- 39/39 backend tests passing
- `ruff check` and `basedpyright` clean
- No raw token/JWT/API-key markers in backend source
- Auth, redaction, fingerprinting, telemetry sanitization all covered by tests

---

## Decision

Quality review is **BLOCKED**. The three blockers are:

1. **Process** — Worktree needs `npm ci` + build + smoke to produce fresh browser evidence
2. **Integration** — Overview/Telemetry/Audit/Settings/Agents not wired to live backend per PRD/blueprint
3. **Delivery boundary** — No public kidu.app sandbox URL or recorded waiver; deployed browser QA evidence missing

Backend tests are clean and the visual/UX direction is premium. The integration gap (BLOCKER 2) is the most substantive issue: Health and Memory are already live, so the pattern is established — the remaining surfaces just need the same treatment.

**STATE: BLOCKED**

---

## Rework checklist (priority order)

- [ ] **P0** Run `npm ci` from `console/frontend/`; then `npm run build` and `CI=1 npm run smoke`; commit fresh screenshots
- [ ] **P0** Wire `AgentsView.tsx` to call `/api/agents` (remove `agentsFixture` direct use, add fetch/error states)
- [ ] **P0** Add frontend typed clients and wire Overview, Telemetry, Audit, Settings to live endpoints
- [ ] **P1** Replace backend `/api/overview` scaffold with real aggregation from existing adapters
- [ ] **P1** Refactor `App.tsx` to extract route components before doing live wiring (reduces risk)
- [ ] **P1** Replace global `fixtureOnly: true` with per-surface fallback-only fixture mode
- [ ] **P2** Publish to public sandbox or record Jean/Zeus waiver for private Tailscale boundary
- [ ] **P2** Update `QA_REPORT.md` with fresh deployed browser evidence

---

## Evidence paths used in this review

- Worktree: `/home/jean/Projects/.worktrees/honcho-memory-console/inc-115-t11q-independent-quality-review`
- Frontend fixtures: `console/frontend/src/lib/fixtures.ts`
- AgentsView: `console/frontend/src/components/AgentsView.tsx`
- App.tsx: `console/frontend/src/App.tsx` (1099 lines)
- Backend main: `console/backend/app/main.py`
- QA Report: `factory/projects/honcho-memory-console/QA_REPORT.md`
- Delivery Report: `factory/projects/honcho-memory-console/DELIVERY_REPORT.md`
- PRD: `factory/projects/honcho-memory-console/PRD.md`
- Technical Blueprint: `factory/projects/honcho-memory-console/TECHNICAL_BLUEPRINT.md`
- T05 screenshots: `factory/projects/honcho-memory-console/evidence/t05-premium-frontend-shell/`
- T07 screenshots: `factory/projects/honcho-memory-console/evidence/t07-health-cockpit/`
- T08 screenshots: `factory/projects/honcho-memory-console/evidence/t08-memory-explorer/`
- T10 evidence: `factory/projects/honcho-memory-console/evidence/t10-deployment-packaging/deploy-and-health-evidence.md`
