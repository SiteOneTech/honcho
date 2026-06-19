# Tracker - Honcho Memory Console

Project: `honcho-memory-console`
Owner: Jean García / SitioUno
Created: 2026-06-19T01:26:24-04:00
Validated: yes
Reviewed: yes
Reviewer: Zeus Factory orchestrator bootstrap pass
Status: G1 ready for autonomous Factory execution

| Task | Status | Notes |
|---|---|---|
| T00 Validate G1 pack and repo/deployment baseline | done | Baseline validated 2026-06-19T05:35Z; evidence recorded below; no runtime changes performed |
| T00P Confirm canonical implementation plan and phase contract | todo | Required planning phase contract coverage |
| T01 Backend console scaffold and secure settings/auth | todo | Backend/API foundation |
| T02 Honcho API and memory adapters | todo | Real memory data |
| T03 Agent registry and token fingerprint model | todo | Multi-agent table source |
| T04 Local server/service health adapter | todo | Health view source |
| T05 Premium frontend shell and design system | todo | Better-than-SaaS UX foundation |
| T06 Agents table and agent detail UX | todo | Core tenant view |
| T07 Health cockpit UX and integration | todo | Option B health surface included |
| T08 Memory explorer UX and integration | todo | Workspace/peer/conclusion views |
| T09 Token/API telemetry and audit trail | todo | Per-token usage if needed |
| T09S Security review for auth, tokens, telemetry, and commands | todo | Security gate coverage |
| T10 Private Tailscale sandbox deploy packaging for honcho-memory-prod | todo | Repo-managed deploy to private Tailscale surface |
| T11 Browser QA, accessibility, and visual polish pass | todo | Playwright/browser evidence |
| T11Q Independent quality review of console UX/code | todo | Quality-review phase coverage |
| T11B Post-deploy browser/API health verification | todo | Post-sandbox verification coverage |
| T12 Final delivery report and runbook update | todo | Delivery closure |

## Current State

Project opened from Jean request, autonomous execution enabled, and task graph normalized to satisfy Factory's canonical UI/sandbox delivery phase contract. T00 baseline is complete; downstream implementation tasks must preserve the security/runtime constraints recorded in the evidence below.

## T00 Baseline Evidence - 2026-06-19T05:35Z

### G1 documentation reviewed

Read `DOCUMENTATION_INDEX.md` first, then every document referenced by the G1 pack:

- `factory/projects/honcho-memory-console/FACTORY_INTAKE.md`
- `factory/projects/honcho-memory-console/REQUIREMENTS_ANALYSIS.md`
- `factory/projects/honcho-memory-console/PATTERN_ANALYSIS.md`
- `factory/projects/honcho-memory-console/ASSUMPTIONS_AND_OPEN_QUESTIONS.md`
- `factory/projects/honcho-memory-console/PRD.md`
- `factory/projects/honcho-memory-console/ADRS.md`
- `factory/projects/honcho-memory-console/METHODOLOGY_PLAN.md`
- `factory/projects/honcho-memory-console/TECHNICAL_BLUEPRINT.md`
- `factory/projects/honcho-memory-console/SPRINT_PLAN.md`
- `factory/projects/honcho-memory-console/TASK_GRAPH.md`
- `factory/projects/honcho-memory-console/TRACKER.md`
- `factory/projects/honcho-memory-console/DOCUMENTATION_INDEX.md`
- `factory/projects/honcho-memory-console/QA_GATES.md`
- `factory/projects/honcho-memory-console/SECURITY_GATES.md`
- `factory/projects/honcho-memory-console/QA_REPORT.md`
- `factory/projects/honcho-memory-console/SECURITY_REVIEW.md`
- `factory/projects/honcho-memory-console/DELIVERY_REPORT.md`
- `factory/projects/honcho-memory-console/CHANGELOG.md`

### Repository baseline

Command evidence from the assigned worktree:

- `pwd`: `/home/jean/Projects/.worktrees/honcho-memory-console/inc-010-t00-validate-g1-pack-and-repo-de`
- `git rev-parse --show-toplevel`: same assigned worktree path
- `git branch --show-current`: `factory/honcho-memory-console/inc-010-t00-validate-g1-pack-and-repo-de`
- `git rev-parse HEAD`: `db1e6207cf8ff97b45360679f1dd867541c8a270`
- `git rev-parse --abbrev-ref --symbolic-full-name @{u}`: `origin/main`
- `git remote get-url origin`: `https://github.com/SiteOneTech/honcho.git`
- `git remote get-url --push origin`: `https://github.com/SiteOneTech/honcho.git`
- `git status --porcelain=v1 | wc -l`: `0` before T00 evidence edit

### Local operator VM snapshot

Read-only local system snapshot showed Docker and Tailscale available on the operator host:

- `systemctl list-units --type=service --state=running`: 33 running units including `docker.service` and `tailscaled.service`.
- `ss -ltnp`: local listeners present on Tailscale/local loopback; no Honcho runtime mutation performed.

### honcho-memory-prod baseline

Read-only SSH probe to `root@100.71.144.114` reported:

- Host: `honcho-memory-prod`; remote user: `root`; timestamp: `2026-06-19T05:35:37+00:00`.
- `systemctl is-active honcho.service honcho-admin.service honcho-update.timer`: `active`, `active`, `active`.
- `systemctl list-units 'honcho*' --all`: `honcho.service` active/exited, `honcho-admin.service` active/running, `honcho-update.timer` active/waiting, `honcho-update.service` inactive/dead.
- `systemctl list-timers 'honcho*' --all`: next `honcho-update.timer` run `Sat 2026-06-20 04:37:10 UTC`; last run `Fri 2026-06-19 04:48:44 UTC`.
- `docker ps`: `honcho-api-1` up and healthy on `0.0.0.0:8000->8000/tcp`; `honcho-deriver-1` up; `honcho-database-1` up healthy on `127.0.0.1:5432`; `honcho-redis-1` up healthy on `127.0.0.1:6379`.
- `cd /opt/honcho && docker compose ps`: services `api`, `deriver`, `database`, and `redis` running with the same health/port posture.
- VM resources: uptime 1h23m; memory 7939 MB total / 6623 MB available; root disk 49G total / 8.2G used / 17% used.

### Current admin panel behavior

Read-only local socket probe on `honcho-memory-prod` reported:

- Port `8000` path `/health`: `HTTP/1.1 200 OK`, server `uvicorn`, content type `application/json`.
- Port `8080` path `/` without credentials: `HTTP/1.0 401 Unauthorized`, `WWW-Authenticate: Basic realm="honcho-admin"`.
- Port `8080` path `/` with invalid Basic Auth: `HTTP/1.0 401 Unauthorized`, same Basic Auth realm.

Conclusion: the current admin panel is still the minimal Python `honcho-admin` Basic Auth surface; it is protected from unauthenticated access and has not yet been replaced by a repo-managed console.

### Guardrails observed

- No raw secrets, tokens, Authorization values, env files, or credential contents were read or recorded.
- No runtime services were restarted, deployed, stopped, or reconfigured.
- No packages were installed and no temporary helper files were written into the repo.
