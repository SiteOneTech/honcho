# Changelog - Honcho Memory Console

Project: `honcho-memory-console`
Owner: Jean García / SitioUno
Created: 2026-06-19T01:26:24-04:00
Validated: yes
Reviewed: yes
Reviewer: Zeus Factory orchestrator bootstrap pass
Status: G1 ready for autonomous Factory execution

## 2026-06-19

- Created G1 Factory documentation pack from Jean request.
- Defined multi-agent/tenant Agents table requirement.
- Defined server/service health cockpit requirement.
- Defined premium UX mandate and secure deployment constraints.
- Normalized task graph with explicit implementation, quality review, security review, private sandbox deploy, post-deploy verification, and delivery-report phase coverage.
- T01: Added repo-managed `console/backend` FastAPI scaffold with mandatory Basic Auth middleware, `HONCHO_CONSOLE__*` settings, recursive redaction utilities, sanitized settings/overview/audit endpoints, and unit tests for Authorization header and secret-like field redaction.
- T03: Added sanitized agent registry and token fingerprint model: fleet registry adapter when configured, Honcho/config fallback, `/api/agents` and `/api/agents/{agent_id}` API contracts, token scope/status derivation, memory/queue/API/VM placeholder models, no-raw-token tests, and backend README runtime settings.
- T03 rework: Validated fleet-registry supplied `token_fingerprint` values against canonical `sha256:` format, rejected raw-looking/non-canonical fingerprints with sanitized alerts, and added list/detail endpoint regression coverage proving the rejected sentinel is not serialized.
- T03 rework: Sanitized fleet registry `alerts` input by replacing free-form strings and mapping `message`/`source` fields with allowlisted console-authored alerts; added `/api/agents` and `/api/agents/{agent_id}` regressions plus marker scan evidence.
- T07: Added Health cockpit backend integration in the React console: live `/api/health/services` fetch/normalization, canonical API/Deriver/Storage/Network/LLM/Update/Host grouping, timestamp/evidence display, degraded/offline/error states, Playwright health smoke with desktop/mobile screenshots, and frontend `src/lib` tracking exception for the repo root `lib/` ignore rule.
- T09: Added token-safe fallback API telemetry and audit trail: `/api/telemetry`, live `/api/audit/events`, in-memory bounded request/event recorders, Basic Auth-aware observability middleware, fingerprint/scope-only token attribution, no request/response body/header storage, backend security regressions, and README fallback documentation.
