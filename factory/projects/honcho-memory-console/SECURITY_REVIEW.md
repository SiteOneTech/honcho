# Security Review - Honcho Memory Console

Project: `honcho-memory-console`
Owner: Jean García / SitioUno
Created: 2026-06-19T01:26:24-04:00
Validated: yes
Reviewed: yes
Reviewer: Zeus Factory orchestrator bootstrap pass
Status: G1 ready for autonomous Factory execution

Status: T09S repo-level security review passed for auth, token display, telemetry/audit storage, and command allowlist; deployed/browser security review remains pending later phases.

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

## T09 Security Evidence - Token/API Telemetry and Audit Trail

Scope: `honcho-memory-console-t09-token-api-telemetry-and-audit-trail`.
Evidence updated: `2026-06-19T13:54:55Z`.

Findings addressed:

- `/api/telemetry` implements a documented fallback aggregation when upstream Honcho lacks per-token request metrics, tagged only with the configured Honcho token fingerprint and scope.
- The telemetry recorder stores only safe request metadata: method, sanitized route, status code, latency, and timestamp. It does not retain raw tokens, request bodies, response bodies, or headers.
- `/api/audit/events` now returns actual retained console operations. The `AuditTrail.record()` signature intentionally has no body/header/authorization/token/secret parameters, preventing accidental storage of sensitive payloads.
- Observability middleware records denied Basic Auth attempts as sanitized `denied` audit events without reading or logging the submitted Authorization header.
- All telemetry/audit response models inherit the existing `extra="forbid"` console model policy and route responses still pass through `redact_sensitive()` defense-in-depth.

Verification:

- RED regression check: `uv run pytest console/backend/tests/test_observability.py console/backend/tests/test_telemetry_audit_endpoints.py -q` -> failed before implementation with missing observability module and `/api/telemetry` `404`.
- GREEN targeted check: same command -> `5 passed in 5.56s`; final frozen rerun `uv run --frozen pytest console/backend/tests/test_observability.py console/backend/tests/test_telemetry_audit_endpoints.py -q` -> `5 passed in 5.27s`.
- `uv run --frozen pytest console/backend/tests -q` -> `28 passed in 5.21s`.
- `uv run --frozen ruff check console/backend` -> `All checks passed!`.
- `uv run --frozen basedpyright console/backend` -> `0 errors, 0 warnings, 0 notes`.

Pending by phase contract:

- Browser/deployed verification that raw tokens are not visible remains for sandbox/deploy/QA tasks T10/T11/T11B.
- Service file/env permissions remain for deployment/security review phases.

## T09 Rework Security Evidence - Raw Path Sanitization

Scope: `honcho-memory-console-t09-token-api-telemetry-and-audit-trail` rework after security gate 612.
Evidence updated: `2026-06-19T16:49:47Z`.

Findings addressed:

- Security gate 612 found that unmatched `/api/not-found/<synthetic-jwt>` requests could serialize the raw path segment through telemetry/audit route/action fields.
- Observability middleware no longer persists `request.url.path` directly. It resolves matched API route templates via `scope["route"]` or the app route table, and collapses unmatched API requests to fixed `/api/unmatched`.
- Recorder-level `_safe_route()` now strips query/fragment data and redacts JWT-like, long hex digest, and base64/base64url-like path segments before telemetry or audit storage.
- Audit action derivation uses the already-sanitized route, so action strings cannot inherit token-like path segments.

Verification:

- RED regression check: `uv run --frozen pytest console/backend/tests/test_observability.py::test_recorders_redact_secret_like_route_segments_even_when_given_raw_paths console/backend/tests/test_telemetry_audit_endpoints.py::test_unmatched_api_paths_are_collapsed_before_telemetry_or_audit_persistence console/backend/tests/test_telemetry_audit_endpoints.py::test_token_like_path_params_use_route_templates_not_raw_path_values -q` -> `2 failed, 1 passed in 5.21s` before the fix because raw JWT-like path segments reached telemetry/audit serialization.
- GREEN targeted check: same command -> `3 passed in 5.28s`.
- `uv run --frozen pytest console/backend/tests/test_observability.py console/backend/tests/test_telemetry_audit_endpoints.py -q` -> `8 passed in 5.32s`.
- `uv run --frozen pytest console/backend/tests -q` -> `31 passed in 5.79s`.
- `uv run --frozen ruff check console/backend` -> `All checks passed!`.
- `uv run --frozen basedpyright console/backend` -> `0 errors, 0 warnings, 0 notes`.

Pending by phase contract:

- Browser/deployed verification that raw tokens are not visible remains for sandbox/deploy/QA tasks T10/T11/T11B.
- Service file/env permissions remain for deployment/security review phases.

## T09S Security Review - Auth, Tokens, Telemetry, and Commands

Scope: `honcho-memory-console-t09s-security-review-for-auth-tokens-tel`.
Evidence updated: `2026-06-19T17:43:13Z`.
Reviewer: `security-reviewer`.

Verdict: PASS for repo-level security review. Deployment remains gated by later sandbox/browser checks because this task did not deploy or inspect VM service-file permissions.

Findings reviewed:

- Auth boundary: `console/backend/app/auth.py` enforces Basic Auth on all non-liveness paths, fails closed when no password is configured, uses constant-time comparison, and does not echo submitted credentials. `create_app()` wires the middleware before browser-facing `/api/*` handlers.
- Backend-only Honcho tokens: `ConsoleSettings` keeps Honcho/API/JWT/DB/Redis/Infisical/provider values as `SecretStr`; `HonchoAPIAdapter._headers()` only sends the upstream token server-side; `/api/settings` exposes booleans and fingerprints only.
- Fingerprint-only token display: `token_fingerprint`, `token_scope`, and `token_status` are the only token identity fields in public schemas/models. Fleet-provided raw token values are hashed server-side; non-canonical `token_fingerprint` values are rejected.
- Telemetry/audit storage: `TelemetryRecorder` and `AuditTrail` store method, sanitized route template, status, latency, token fingerprint, and scope only. Their record signatures do not accept headers, bodies, raw authorization values, raw tokens, or secrets.
- Service command allowlist: `LocalServiceHealthAdapter` restricts command execution to allowlisted `systemctl`, `docker`, and `tailscale` argument vectors and uses `subprocess.run(..., shell=False)`. Unit/service/path lists are allowlisted before use.
- API schema inspection: FastAPI OpenAPI schema contains no runtime secret values or secret-bearing config field names (`honcho_api_token`, `jwt_secret`, `database_url`, `infisical_token`, `basic_auth_password`).
- Rework applied during review: free-text redaction now covers common browser-facing raw credential patterns in otherwise safe string fields (JWT-like values, common provider/GitHub/GitLab/HuggingFace/Slack token prefixes, and Authorization header text) while preserving `sha256:` fingerprints. This closes a RED probe where synthetic token-shaped text in memory conclusion/peer-card content reached the API response.

Files changed in this review:

- `console/backend/app/redaction.py` — added `redact_secret_text()` and scalar-string credential pattern redaction.
- `console/backend/app/adapters/honcho_api.py` — routes memory free-text scrubbing through the central free-text redactor, then applies known runtime-secret replacement.
- `console/backend/tests/test_redaction.py` — added regression coverage for free-text token-shaped values without redacting fingerprints.
- `console/backend/tests/test_honcho_memory_adapters.py` — added API-boundary regression coverage for generic token-shaped memory/peer-card content.
- `factory/projects/honcho-memory-console/SECURITY_REVIEW.md` — recorded T09S evidence.

Verification:

- RED probe before mitigation: synthetic memory conclusion and peer-card responses containing token-shaped free text returned `generic_secret_probe_leaks` with the synthetic JWT-like/provider-key markers; this would have violated the deployment block rule.
- GREEN targeted regression: `uv run --frozen pytest console/backend/tests/test_redaction.py::test_free_text_secret_patterns_are_redacted_without_touching_fingerprints console/backend/tests/test_honcho_memory_adapters.py::test_memory_free_text_redacts_generic_token_shapes_at_api_boundary -q` -> `2 passed in 6.20s`.
- GREEN dynamic response scan: synthetic `/api/memory/workspaces/hermes/conclusions` and `/api/memory/workspaces/hermes/peers/Zeus/card` responses -> `generic_secret_probe_leaks: []`, `redaction_markers: 3`.
- Full backend tests: `uv run --frozen pytest console/backend/tests -q` -> `33 passed in 6.39s`.
- Lint: `uv run --frozen ruff check console/backend` -> `All checks passed!`.
- Typecheck: `uv run --frozen basedpyright console/backend` -> `0 errors, 0 warnings, 0 notes`.
- API schema scan: custom `create_app().openapi()` assertion -> `runtime_secret_value_leaks: 0`, `secret_field_name_leaks: 0`, `schema_paths: 19`.

Deployment blockers from this review: none for repo-level T09S. Remaining gated evidence for T10/T11/T11B: sandbox/browser proof that no raw token values render in deployed UI, plus VM service/env permission checks.
