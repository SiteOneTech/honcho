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
