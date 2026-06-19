# Security Review - Honcho Memory Console

Project: `honcho-memory-console`
Owner: Jean García / SitioUno
Created: 2026-06-19T01:26:24-04:00
Validated: yes
Reviewed: yes
Reviewer: Zeus Factory orchestrator bootstrap pass
Status: G1 ready for autonomous Factory execution

Status: T03 rework evidence added; final deployed/browser security review remains pending later phases.

## Required Final Review Topics

- Authentication implementation.
- Token fingerprinting and raw-secret redaction.
- System command allowlist.
- API schema sanitization.
- VM service file/env permissions.
- Browser verification that raw token values are not visible.

## T03 Rework Security Evidence - Agent Registry Token Fingerprints

Scope: `honcho-memory-console-t03-agent-registry-and-token-fingerprint`.

Findings addressed:

- Fleet registry supplied `token_fingerprint` values are now accepted only when they match the canonical non-secret format `^sha256:[0-9a-f]{16,64}$`.
- Invalid or raw-looking `token_fingerprint` values are converted to `None` plus `token_scope="unknown"` and `token_status="unknown"` before serialization.
- The alert emitted for this condition uses code `fleet_registry_token_fingerprint_invalid` and a fixed sanitized message; it never includes the rejected value.
- Raw-token derivation from `token`, `api_token`, `honcho_api_token`, `bearer_token`, or `authorization` remains intact and returns a derived SHA-256 fingerprint only.

Verification:

- `uv run --frozen pytest console/backend/tests/test_agent_registry.py::test_fleet_registry_rejects_noncanonical_token_fingerprint_without_leaking_it -q` -> RED failed before fix, then GREEN `1 passed in 4.06s`.
- `uv run --frozen pytest console/backend/tests -q` -> `13 passed in 4.15s`.
- `uv run --frozen ruff check console/backend` -> `All checks passed!`.
- `uv run --frozen basedpyright console/backend` -> `0 errors, 0 warnings, 0 notes`.
- `search_files` over `console/backend` for raw JWT/API key/private key markers -> `total_count: 0`.

## T03 Rework Security Evidence - Fleet Registry Alert Text

Scope: `honcho-memory-console-t03-agent-registry-and-token-fingerprint` rework after security gate 594.

Findings addressed:

- Fleet registry supplied `alerts` values are now treated as untrusted input and cannot author browser-facing text directly.
- Free-form alert strings are converted to a fixed `fleet_registry_alert_suppressed` alert with console-authored message and `source="fleet_registry"`.
- Mapping alerts keep only allowlisted `code` values and normalized severity; external `message` and `source` fields are ignored/replaced by canonical console text.
- Unknown mapping codes are suppressed instead of serialized, preventing attacker-controlled markers or secret-like text from reaching `/api/agents` or `/api/agents/{agent_id}`.

Verification:

- RED regression check: `uv run --frozen pytest console/backend/tests/test_agent_registry.py::test_fleet_registry_alert_strings_are_suppressed_without_leaking_text console/backend/tests/test_agent_registry.py::test_fleet_registry_alert_mapping_messages_are_replaced_by_canonical_text -q` -> `2 failed in 4.19s` before the fix because raw fleet alert text reached responses.
- GREEN regression check: same command -> `2 passed in 4.14s`.
- `uv run --frozen pytest console/backend/tests/test_agent_registry.py -q` -> `8 passed in 4.39s`.
- `uv run --frozen pytest console/backend/tests -q` -> `15 passed in 4.40s`.
- `uv run --frozen ruff check console/backend` -> `All checks passed!`.
- `uv run --frozen basedpyright console/backend` -> `0 errors, 0 warnings, 0 notes`.
- Secret/marker API response scan over `/api/agents` and `/api/agents/scan-agent` -> `marker_leaks: []`, status codes `[200, 200]`.

Pending by phase contract:

- Browser/deployed verification that raw tokens are not visible remains for sandbox/deploy/QA tasks T10/T11/T11B.
- Service file/env permissions remain for deployment/security review phases.
