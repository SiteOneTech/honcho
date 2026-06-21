# T06 QA Report — Agents Table and Agent Detail UX

## Task
T06: Agents table and agent detail UX  
Branch: `factory/honcho-memory-console/inc-070-t06-agents-table-and-agent-detai`  
Worktree: `/home/jean/Projects/.worktrees/honcho-memory-console/inc-070-t06-agents-table-and-agent-detai`  
Run: `run-1782082097-ae62a39f` (rework)

## Rework Summary

This is a **rework** of the original T06 implementation. The original code delivered correct functionality but a theme-toggle smoke test was failing due to a desync between two theme systems:

- `theme.ts` `readInitialTheme()` always defaulted to `'dark'` when no `localStorage` value was found.
- The inline `<script>` in `index.html` used `|| system` (OS `prefers-color-scheme`) as fallback when no stored value existed.
- On a system with light OS preference, the inline script set `data-theme="light"` but `useState('dark')` initialized the React toggle to dark — so the toggle click would go `dark→light`, but the pre-click attribute captured by Playwright was `"dark"` and post-click was `"light"`, causing the "not to have attribute light" assertion to fail.

**Fix applied:**
1. Changed `theme.ts` to use `_THEME_KEY = 'hmc-theme'` (already correct in index.html inline script).
2. Removed OS preference fallback from the inline HTML script — always default to `'dark'` when no stored value exists, matching `readInitialTheme()`.

This fix is in `theme.ts` (also committed here) and `index.html`.

---

## Verification Evidence

### Backend Tests
```
cd /worktree && uv run pytest console/backend/tests/ -q
23 passed in 5.66s
```

### Frontend Build
```
cd console/frontend && pnpm run build
dist/index.html                   1.52 kB │ gzip:  0.81 kB
dist/assets/index-B17iClf-.css   20.89 kB │ gzip:  4.60 kB
dist/assets/index-DUXn9A-6.js   179.24 kB │ gzip: 56.18 kB
✓ built in 227ms
```

### Frontend Contract Tests
```
cd console/frontend && pnpm test
ℹ tests 12  ℹ pass 12  ℹ fail 0
```

### Playwright Smoke Test
```
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4178 pnpm exec playwright test --reporter=list
✓ 1/1 passed (2.8s)
Test: premium shell renders, navigates, toggles theme, and captures UI evidence
```

### Browser Console Errors
```
page.on('console', error) → []
page.on('pageerror')      → []
0 JS errors on agents page load
```

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|---|---|---|
| Build agents/tenants table with required VM/token/memory/health columns and search/filter/sort | PASS | AgentsView.tsx + agents.ts: `AGENT_COLUMNS`, `searchAgents`, `filterAgentsByHealth`, `sortAgents`; 7 columns; contract tests pass |
| Build agent detail view with overview, memory, token, VM health, and events sections | PASS | `AgentDetail` component with 5 tabs; contract test `renders an agent detail with Overview, Memory, Token, VM Health, and Events sections` passes |
| UI handles loading, empty, degraded, and error states with no fake production metrics | PASS | `TableSkeleton`, `NoAgents`, `LoadError`; fixture label banner; `data-fixture="true"` attribute; 12/12 contract tests pass |
| No raw secrets or tokens exposed | PASS | Tokens shown as SHA-256 fingerprint only; `CANONICAL_FINGERPRINT`; `fixture-label` banner; backend redaction in `redaction.py`; agent_registry tests confirm fingerprint-only |
| TypeScript build passes | PASS | `tsc --noEmit && vite build` exit 0 |
| Backend tests pass | PASS | 23/23 tests pass |

---

## Files Changed in This Rework

```
console/frontend/index.html                        — Remove OS pref fallback, always default to 'dark'
console/frontend/src/lib/theme.ts                  — Add _THEME_KEY='hmc-theme' constant
console/frontend/dist/                            — Regenerated
factory/.../evidence/t05-premium-frontend-shell/*.png — Regenerated with fixed theme
```

## Commits on Branch

```
f13d0f3 fix(console/t06): sync theme inline script default to 'dark'
46ba284 T06 agents table and agent detail UX
c2e4b85 T06 QA artifacts: Playwright e2e spec, screenshots, updated QA_REPORT
4187a7c chore(console/t06): commit pnpm-lock.yaml and QA report evidence
0535c4c T06 close: QA report + tracker update for agents table + detail drawer
fade518 fixup! feat(console/t06): agents table and agent detail UX
899f947 feat(console/t06): agents table and agent detail UX
```

## Docs Read (Source of Truth)

- `DOCUMENTATION_INDEX.md`
- `REQUIREMENTS_ANALYSIS.md`
- `TASK_GRAPH.md`
- `TECHNICAL_BLUEPRINT.md`
- `PATTERN_ANALYSIS.md`

---

## Unresolved

- **Git push blocked**: No GitHub credentials in this environment. Branch is committed locally; push deferred to environment with credentials.
- **Sandbox deploy**: Out of scope for this task. T10 handles deployment packaging.
