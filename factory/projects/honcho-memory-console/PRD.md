# PRD - Honcho Memory Console

Project: `honcho-memory-console`
Owner: Jean García / SitioUno
Created: 2026-06-19T01:26:24-04:00
Validated: yes
Reviewed: yes
Reviewer: Zeus Factory orchestrator bootstrap pass
Status: G1 ready for autonomous Factory execution

## Product Name

Honcho Memory Console

## Problem

The self-hosted Honcho server is operational but lacks a polished UI for multi-agent operations. The SaaS has an app dashboard, but our self-hosted deployment exposes mostly API/Swagger and a minimal custom update panel. As SitioUno adds derived agents, Zeus needs a first-party console to see who consumes memory, which VM/token is responsible, and whether the memory service is healthy.

## Users

- Jean: business owner/operator who needs confidence and high-level visibility.
- Zeus/operator agents: need safe operational inspection and troubleshooting.
- Future Factory/devops agents: need health and deployment evidence.

## Core Jobs

1. See the health of the Honcho memory server in one glance.
2. See every agent/tenant consuming Honcho and whether each one is healthy.
3. Inspect memory state by workspace, peer, session, conclusions, and peer card.
4. Diagnose deriver queue or service failures.
5. Verify token scope and activity without exposing secrets.

## MVP Scope

### Overview Page

- global health score;
- active agents count;
- workspaces count;
- queue pending/in-progress/errors;
- API/deriver/storage health;
- recent alerts.

### Agents Page

- table of agent instances/tenants;
- token fingerprint and scope;
- VM/service health;
- memory object counts;
- queue state;
- API usage summary if telemetry exists;
- detail drawer.

### Memory Page

- workspace selector;
- peers and peer cards;
- representation/context preview;
- conclusions list/search;
- sessions/messages metadata with sensitive content disclosure.

### Health Page

- systemd states;
- docker compose states;
- API/DB/Redis checks;
- disk/memory/CPU;
- Tailscale/network;
- update timer status;
- provider configuration status with secrets redacted.

### Settings / Operations Page

- safe read-only configuration display;
- force update action only if explicitly gated by auth and audit;
- links to runbook/docs;
- audit log.

## UX Bar

The console should feel like a premium internal control plane:

- calm, dense, legible, and fast;
- better visual polish than the SaaS for our use case;
- visible SitioUno quality without over-branding;
- dark and light modes;
- no generic AI-purple dashboard template;
- no raw JSON unless expanded by an operator.

## Metrics and KPIs

- Time to verify server health under 10 seconds.
- Time to identify a broken agent under 30 seconds.
- Zero raw secret leaks in UI/logs.
- Playwright smoke passes on deployed console.
- Console restart recovers automatically.

## Launch Criteria

- Deployed on `honcho-memory-prod` port `8080` or documented replacement port.
- Auth protected.
- Shows real data from current self-hosted Honcho.
- Browser QA evidence captured.
- Security review passed.
- Delivery report includes URLs, commands, commit, and rollback notes.
