# Requirements Analysis - Honcho Memory Console

Project: `honcho-memory-console`
Owner: Jean García / SitioUno
Created: 2026-06-19T01:26:24-04:00
Validated: yes
Reviewed: yes
Reviewer: Zeus Factory orchestrator bootstrap pass
Status: G1 ready for autonomous Factory execution

## Functional Requirements

### FR1 - Authentication and Access Control

- The console must remain private to Tailscale and protected by application auth.
- Initial auth may reuse Basic Auth, but the delivered system must have a clean auth boundary in the console service.
- Raw API keys, JWT signing secrets, Infisical tokens, provider keys, and database passwords must never be shown in the UI or logs.
- Token display must use fingerprint format only, for example `sha256:abcd1234...wxyz`.

### FR2 - Multi-Agent / Tenant Registry

The console must include an Agents table listing every known Honcho consumer.

Required columns:

| Column | Meaning |
|---|---|
| Agent | Display name, for example Zeus, Bael, future derived agents |
| Tenant | Tenant/company/user context |
| Runtime VM | VM name and environment |
| Tailnet IP | Tailscale IP or private reachable host |
| Honcho workspace | Workspace ID used by that agent |
| AI peer | Assistant/agent peer ID |
| Human peer | User/customer peer ID when applicable |
| Token fingerprint | Hashed token identifier, never raw token |
| Token scope | admin, workspace, peer, session, read-only, write |
| Auth status | valid, expired, mis-scoped, unknown |
| Last write | last memory write timestamp |
| Queue | pending/in-progress/completed/errors |
| Memory size | sessions, messages, documents, conclusions, peer-card entries |
| API activity | requests in 1h/24h, error rate, p95 latency if telemetry exists |
| VM health | online/offline, CPU, RAM, disk, service state |
| Alerts | concise operational warnings |

### FR3 - Agent Detail View

Each row must open a detail drawer/page with:

- identity and registry metadata;
- Honcho workspace and peers;
- peer card and representation preview;
- conclusions search and filters;
- recent sessions/messages metadata with content redaction controls;
- queue status and derivation status;
- token audit summary without secrets;
- VM service health scoped to the agent if available;
- actions limited to safe read-only operations in v1.

### FR4 - Memory Explorer

Provide navigable views for:

- workspaces;
- peers;
- peer cards;
- peer context/representation;
- sessions;
- messages;
- conclusions;
- queue status.

The UI must avoid dumping raw private conversation data by default. Show summaries and counts first; require explicit click for message content, and mark content views as sensitive.

### FR5 - Server and Service Health View

Create a health cockpit with these checks:

- `honcho.service` systemd state;
- `honcho-admin` or new console service state;
- `honcho-update.timer` and last update run;
- docker compose service states for `api`, `deriver`, `database`, `redis`, and console;
- Honcho API `/health`;
- Postgres `SELECT 1` and table counts;
- Redis `PING`;
- queue pending/in-progress/completed/error counts;
- disk usage for `/`, `/opt/honcho`, Docker volumes;
- memory and CPU load;
- Tailscale status and advertised IP;
- provider configuration status without provider secret values;
- optional Prometheus metrics if enabled.

### FR6 - Metrics

At minimum, show current point-in-time metrics from Honcho and the VM. If per-token request telemetry is not available upstream, implement a sanitized SiteOneTech fork extension:

- hash bearer token/JWT or token subject to a non-reversible fingerprint;
- record path, method, workspace, peer/session scope where known, status code, latency, timestamp;
- do not record raw request/response bodies;
- expose aggregated counts to the console.

### FR7 - Premium UX/UI

The console must be a polished product surface:

- responsive desktop-first admin UI with clear mobile fallback;
- premium dark and light modes, with one coherent theme at page level;
- strong information hierarchy for dense tables;
- high-quality empty/loading/error states;
- accessible contrast and keyboard navigation;
- refined micro-interactions, not generic template cards;
- no raw JSON as primary UX except in developer expandable panels;
- visual quality must be browser-QAed.

### FR8 - Deployment

The result must be deployable to `honcho-memory-prod` using repo-managed scripts or compose changes. No manual-only `/opt/honcho-admin/server.py` drift.

## Non-Functional Requirements

- Security: no public exposure; no raw secrets; least-privilege JWTs; audit logs for actions.
- Reliability: console must degrade gracefully if fleet registry or metrics endpoints are unavailable.
- Performance: initial dashboard under 2.5s on Tailscale; table operations responsive for at least 200 agents.
- Maintainability: code lives in repo with tests and docs; no orphan files on VM.
- Observability: errors surfaced in UI and service logs with safe redaction.
- Accessibility: WCAG AA contrast, focus states, keyboard navigable tables and detail panels.

## Acceptance Criteria

1. Agents table shows Zeus and any discoverable agents without exposing raw tokens.
2. Server health view reports real service/VM status from `honcho-memory-prod`.
3. Memory explorer can inspect `hermes` workspace peer card/conclusions and queue state.
4. Console deploys from the repo and survives restart.
5. Playwright/browser QA captures UI screenshots or trace evidence.
6. Security review confirms no secrets are rendered or logged.
