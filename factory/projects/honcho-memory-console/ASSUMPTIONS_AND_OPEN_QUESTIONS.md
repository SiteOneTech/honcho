# Assumptions and Open Questions - Honcho Memory Console

Project: `honcho-memory-console`
Owner: Jean García / SitioUno
Created: 2026-06-19T01:26:24-04:00
Validated: yes
Reviewed: yes
Reviewer: Zeus Factory orchestrator bootstrap pass
Status: G1 ready for autonomous Factory execution

## Assumptions

- Jean wants Factory to proceed autonomously without another high-level approval prompt.
- The console is private/internal and stays behind Tailscale.
- The first deployment target is `honcho-memory-prod` at `100.71.144.114`.
- Implementation belongs in `SiteOneTech/honcho`, not as untracked files under `/opt/honcho-admin`.
- Fleet registry is the preferred source for agent VM metadata when available.
- Infisical remains the canonical secret vault.
- Raw token values must never be displayed.
- Per-token usage metrics may require a small Honcho fork extension if upstream does not already persist request telemetry by token fingerprint.

## Decisions Already Made

- Proceed with option C: custom internal dashboard/console.
- Include multi-agent/tenant table with VM/token/metrics.
- Include server and service health view.
- Design must be premium and better than SaaS for SitioUno internal use.
- Project should be opened in Factory and run autonomously.
- Delivery boundary is private Tailscale only. Jean explicitly does not want this console exposed to the public internet; a public `kidu.app` URL is not required for v1 acceptance.

## Open Questions That Should Not Block Initial Build

1. Exact list of all future derived agents. Start with registry discovery and make the UI support arbitrary agents.
2. Whether to integrate Grafana later. First delivery can implement native health cards and optional Prometheus ingestion.
3. Whether to allow write actions such as editing peer cards or deleting conclusions. Treat write actions as out of scope for v1 unless Jean later approves.
4. Whether this console eventually becomes part of the generic derived-agent runtime. V1 targets Zeus/SitioUno Honcho ops.

## Human Escalation Criteria

Factory should ask Jean only if:

- deployment requires a secret that is missing from Infisical;
- someone proposes changing the accepted private-only Tailscale boundary or exposing the console to the public internet;
- a destructive memory action is proposed;
- GitHub org permissions block creating/pushing required branches;
- fleet registry access is blocked and no safe fallback exists.
