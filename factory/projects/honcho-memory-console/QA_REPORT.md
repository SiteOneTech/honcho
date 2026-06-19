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

## Planned QA Evidence

- Backend adapter/API contract tests for later increments.
- Frontend build/type/lint output.
- API smoke output after deployment packaging.
- Browser/Playwright evidence against deployed console.
- Screenshots or trace paths.
