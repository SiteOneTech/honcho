# ADRs - Honcho Memory Console

Project: `honcho-memory-console`
Owner: Jean García / SitioUno
Created: 2026-06-19T01:26:24-04:00
Validated: yes
Reviewed: yes
Reviewer: Zeus Factory orchestrator bootstrap pass
Status: G1 ready for autonomous Factory execution

## ADR-001 - Implement as repo-managed console in SiteOneTech/honcho

Status: accepted

Decision: Build the console inside the `SiteOneTech/honcho` fork under `console/`, with deployment scripts or compose config in the same repo.

Rationale: The existing `/opt/honcho-admin` panel is useful but ad-hoc. A repo-managed console avoids drift, enables review, tests, and reproducible deployment.

Consequences:

- Workers must not make manual-only changes on the VM.
- Deployment must pull from the repo and restart managed services.

## ADR-002 - Use a backend aggregator, not direct browser-to-Honcho admin token

Status: accepted

Decision: The browser frontend calls a console backend. The backend calls Honcho API, local service checks, registry adapters, and telemetry stores.

Rationale: Browser must never receive raw admin JWTs, DB credentials, or unrestricted API tokens.

Consequences:

- Backend must sanitize every response.
- Frontend can be fully static except for calls to the console API.

## ADR-003 - Use hashed token fingerprints for token visibility

Status: accepted

Decision: The UI shows token fingerprints/scope/status only, never raw token values.

Rationale: Operators need to identify which token/agent is active, but raw tokens are credentials.

Consequences:

- Implement fingerprinting using SHA-256 or a stable JWT claim hash.
- Redact all Authorization headers in logs.

## ADR-004 - Native console first, Grafana optional later

Status: accepted

Decision: Build native health and metrics views in the console. Prometheus/Grafana can be added later as an advanced observability layer.

Rationale: Jean requested a product-quality UI, not only a metrics dashboard. Native console can combine memory semantics, agents, tokens, and service health in one UX.

## ADR-005 - Read-only memory operations in v1

Status: accepted

Decision: v1 should inspect memory and health. Mutating memory operations are out of scope except safe update/restart actions already present in admin tooling, and only with audit/auth.

Rationale: Memory deletion/editing is high-risk and should receive a separate write-action design and security gate.

## ADR-006 - UI stack

Status: accepted

Decision: Use a modern React frontend with Tailwind/Radix/TanStack/Recharts/Phosphor/Motion unless implementation research finds a better fit.

Rationale: We need a premium dashboard with high-quality tables, charts, accessibility primitives, and motion. Avoid default shadcn or generic dashboard templates.

## ADR-007 - Fleet registry preferred for agent inventory

Status: accepted

Decision: Agent VM identity should come from fleet registry when reachable. Honcho workspaces/peers are a secondary discovery signal.

Rationale: Honcho knows memory workspaces; fleet registry knows actual VM/agent tenancy. The console needs both.
