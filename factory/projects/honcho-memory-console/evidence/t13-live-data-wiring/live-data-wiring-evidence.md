# T13 live data wiring evidence

Updated: 2026-06-23T15:12:06Z
Worktree: `/home/jean/Projects/.worktrees/honcho-memory-console/inc-095-t13-live-data-wiring-and-interna`
Branch: `factory/honcho-memory-console/inc-095-t13-live-data-wiring-and-interna`

## Scope verified

- No public internet URL added or required. The UI copy and `/api/overview` payload identify the boundary as private Tailscale/internal.
- Overview, Agents, Agent detail, Memory, Health, Telemetry, Audit, and Settings now call live backend API clients or render explicit unavailable/error states when their backend endpoint is unreachable.
- Production App/Agents UI no longer imports or renders `overviewFixture`, `agentsFixture`, `telemetryFixture`, `auditFixture`, `providersFixture`, `FIXTURE_META`, fixture banners, simulated ready timers, or sample-fixture production labels.
- Development/test fixtures remain only in `console/frontend/src/lib/fixtures.ts` and test route intercepts.

## Commands and results

- `uv run --frozen pytest console/backend/tests/test_honcho_memory_adapters.py::test_overview_endpoint_aggregates_live_sources_without_fixture_scaffold console/backend/tests/test_honcho_memory_adapters.py::test_overview_endpoint_returns_truthful_unavailable_state_when_honcho_is_down -q` -> `2 passed in 4.94s`.
- `uv run --frozen pytest console/backend/tests -q` -> `41 passed in 5.58s`.
- `npm ci` -> `added 31 packages`, `found 0 vulnerabilities`.
- `npm test` -> `21` frontend contract tests passed, `0` failed.
- `npm run build` -> TypeScript and Vite production build passed; `26 modules transformed`; generated `dist/index.html`, CSS, and JS assets.
- `npm run smoke` -> Playwright Chromium passed `3 passed (8.1s)` across Health, Memory, and Shell/Agents flows; console/page error checks were asserted empty inside the smoke specs.
- `git diff --check` -> exit `0`.
- `claude -p ...` static diff review (Claude Code 2.1.175, read-only/disallow edit tools) -> `T13 Live Data Wiring — Review: PASS`, `No blockers found`; note that the reviewer did not execute tests, so command/test evidence above remains authoritative.
- Source scan: `search_files` over `console/frontend/src/App.tsx` and `console/frontend/src/components/AgentsView.tsx` for fixture-only production markers -> `total_count: 0` in both files.

## Browser evidence artifacts

- Desktop live wiring smoke: `factory/projects/honcho-memory-console/evidence/t13-live-data-wiring/desktop-live-wiring-smoke.png` — `148091` bytes — sha256 `94ae5629a21b74350bbf342e0cc740563295b3af21a1fc11604a423b8f1e1fde`.
- Mobile live wiring smoke: `factory/projects/honcho-memory-console/evidence/t13-live-data-wiring/mobile-live-wiring-smoke.png` — `183427` bytes — sha256 `24a48a81e182234f357fb288f79eccf855282123e49234bc8f24c0f0005b538d`.
- Desktop Health live smoke: `factory/projects/honcho-memory-console/evidence/t13-live-data-wiring/desktop-health-live-smoke.png` — `317542` bytes — sha256 `b957dbac159fe3fe708546f647d6c329bb5660ac99fec45d9f61e2923df2b57b`.
- Desktop Memory live smoke: `factory/projects/honcho-memory-console/evidence/t13-live-data-wiring/desktop-memory-live-smoke.png` — `266592` bytes — sha256 `a13f2c86d6edb885efd10d2c5e4858cb694cc3d186cfe76d16760d42b6678955`.

## Remaining blockers / rework

- No secret/destructive/private-boundary decision is required from Jean for this increment.
- Deployed private Tailscale verification of this branch remains for T11B/T12 after integration/deploy; T13 local Playwright evidence uses route-intercepted live-shaped backend responses and does not add any public URL.
