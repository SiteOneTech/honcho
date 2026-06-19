# Factory Intake - Honcho Memory Console

Project: `honcho-memory-console`
Owner: Jean García / SitioUno
Created: 2026-06-19T01:26:24-04:00
Validated: yes
Reviewed: yes
Reviewer: Zeus Factory orchestrator bootstrap pass
Status: G1 ready for autonomous Factory execution

## User Request

Jean approved option C: build an internal, beautiful Honcho Memory Console for the self-hosted Honcho deployment at `honcho-memory-prod`.

The console must be better than the Honcho SaaS dashboard for our operational use. It must show multi-agent/tenant consumption, each agent VM/token, per-agent metrics and memory info, and a server/service health view similar to a lightweight observability cockpit.

## Business Outcome

Give Zeus/SitioUno a private control plane for self-hosted Honcho that makes memory operations visible, auditable, and safe across multiple derived agents.

## G0 Repository Strategy

- repo_scope: `existing_project_change`
- work_intent: `add_functionality`
- primary_repo: `SiteOneTech/honcho`
- primary_repo_path: `/home/jean/Projects/honcho`
- primary_repo_remote: `https://github.com/SiteOneTech/honcho.git`
- base_branch: `main`
- branch_prefix: `factory/honcho-memory-console`
- worktree_policy: one isolated worktree/branch per Factory increment
- deployment_target: `honcho-memory-prod` VM, Tailscale `100.71.144.114`
- existing runtime path: `/opt/honcho` from the SiteOneTech fork
- current ad-hoc admin panel: `/opt/honcho-admin`, port `8080`, Basic Auth protected

## In Scope

1. Repo-managed console application under `console/` in the Honcho fork.
2. Backend endpoints that aggregate Honcho API data, server health, service health, fleet/agent registry data, and per-token/per-agent usage telemetry.
3. Premium React UI with a polished dashboard experience, not a raw Swagger replacement.
4. Multi-agent tenant table: every agent/VM/token consuming Honcho, with metrics and health per agent.
5. Server/service health view: API, deriver, Postgres, Redis, systemd, disk, memory, CPU, Tailscale, update timer, queue, LLM/embedding provider status.
6. Secure deployment to `honcho-memory-prod` replacing or subsuming the current minimal `honcho-admin.service` panel.
7. Playwright/browser QA evidence, security review, and delivery report.

## Out of Scope for First Delivery

- Public internet exposure.
- Raw secret viewing or token download.
- Editing/deleting memories without a separate explicit approval gate.
- Full SaaS billing system.
- Bulk migration of historical Honcho SaaS data.

## Canonical Data Sources

- Honcho API at `http://127.0.0.1:8000` on the VM.
- Honcho Postgres/Redis via internal network only when API cannot expose needed metrics.
- `fleet_registry` for agent VM registry when reachable.
- Infisical for secrets, never plaintext committed config.
- Local systemd/docker status on the VM for service health.
- Optional new sanitized telemetry table in Honcho Postgres for hashed API token usage.

## Success Definition

The project is successful when Jean can open `http://100.71.144.114:8080/`, authenticate, and see:

- all Honcho-consuming agents/tenants in one table;
- per-agent memory usage, queue state, token fingerprint/scope, and VM health;
- a server health cockpit for Honcho services;
- memory explorer views for workspaces, peers, sessions, conclusions, and peer cards;
- no raw secrets exposed;
- verified browser QA evidence and deployment evidence.
