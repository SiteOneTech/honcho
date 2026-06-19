# Security Gates - Honcho Memory Console

Project: `honcho-memory-console`
Owner: Jean García / SitioUno
Created: 2026-06-19T01:26:24-04:00
Validated: yes
Reviewed: yes
Reviewer: Zeus Factory orchestrator bootstrap pass
Status: G1 ready for autonomous Factory execution

## Security Requirements

- Console is private to Tailscale/private network.
- Authentication is mandatory.
- No raw secrets or tokens in UI, API responses, logs, tests, screenshots, or docs.
- Token identity is represented only as fingerprint and scope.
- Backend uses allowlisted system commands for health checks.
- No shell interpolation with request parameters.
- Any write/operation action requires audit log and explicit auth gate.
- Browser frontend never receives Honcho admin JWT or DB credentials.
- Fleet registry credentials stay in Infisical/runtime env.
- Error responses redact Authorization headers and secret-like fields.

## Threats

| Threat | Mitigation |
|---|---|
| Token leak in UI | Fingerprint only, schema redaction tests |
| Command injection through health endpoints | Allowlist commands, no shell user interpolation |
| Unauthorized access over Tailnet | App auth plus Tailscale network boundary |
| Excessive memory content exposure | Summary/counts by default, explicit sensitive-content disclosure |
| Raw logs leaking headers | Logging filter/redaction middleware |
| Mis-scoped admin JWT in browser | Backend-only token, never serialized |
| Destructive memory mutations | Out of scope v1 |

## Required Security Evidence

- Redaction unit tests pass.
- Security reviewer inspects API response schemas.
- Deployed browser QA confirms no raw token values visible.
- Service file/env permissions checked on VM.
- Rollback path documented.
