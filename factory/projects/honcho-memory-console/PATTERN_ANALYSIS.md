# Pattern Analysis - Honcho Memory Console

Project: `honcho-memory-console`
Owner: Jean García / SitioUno
Created: 2026-06-19T01:26:24-04:00
Validated: yes
Reviewed: yes
Reviewer: Zeus Factory orchestrator bootstrap pass
Status: G1 ready for autonomous Factory execution

## Existing Honcho Capabilities

Honcho upstream provides:

- FastAPI API server;
- Python and TypeScript SDKs;
- workspaces, peers, sessions, messages, conclusions, peer cards, context, queue status;
- Prometheus metrics support in recent versions;
- structured LLM deriver and summary workflows;
- JWT/API auth.

Observed self-hosted deployment:

- API: `http://100.71.144.114:8000`, local `127.0.0.1:8000` on VM;
- admin panel: `:8080`, currently a minimal custom Basic Auth Python service;
- docker services: `api`, `deriver`, `database`, `redis`;
- systemd units: `honcho.service`, `honcho-admin.service`, `honcho-update.timer`;
- repo: `SiteOneTech/honcho`.

## Relevant API Endpoints

Workers should verify exact routes from OpenAPI, but expected v3 routes include:

- `GET /health`
- `POST /v3/workspaces`
- `POST /v3/workspaces/{workspace}/peers`
- `GET/PUT /v3/workspaces/{workspace}/peers/{peer}/card`
- `POST /v3/workspaces/{workspace}/peers/{peer}/representation`
- `GET /v3/workspaces/{workspace}/queue/status`
- `POST /v3/workspaces/{workspace}/conclusions/list`
- `POST /v3/workspaces/{workspace}/conclusions/query`
- sessions/messages endpoints under `/v3/workspaces/{workspace}/sessions`

## Design System Direction

Reading this as: private enterprise memory/observability console for technical operators, with a premium dark-tech product language, leaning toward a custom SitioUno dashboard system using React, Tailwind, Radix primitives, TanStack Table, Recharts, Phosphor icons, and Motion.

Design dials:

- DESIGN_VARIANCE: 6 for a polished but operational dashboard.
- MOTION_INTENSITY: 4 for subtle feedback, table detail transitions, and load states.
- VISUAL_DENSITY: 7 for dense metrics without cockpit clutter.

Dashboard caveat: marketing-page skills do not directly apply to dense data UI. Workers must use their anti-slop principles while prioritizing dashboard accessibility, tables, state handling, and observability clarity.

## UI Patterns to Use

- Top-level command/search bar for workspace, peer, agent, or token fingerprint.
- Agents data table with sticky header, column visibility, search, and status chips.
- Detail drawer/page with tabs: Overview, Memory, Token, VM Health, Events.
- Service health cards grouped by layer: API, Deriver, Storage, Network, LLM, Update.
- Trend sparklines for requests/errors/queue if telemetry exists.
- Progressive disclosure for sensitive content.
- Explicit empty/loading/error states.

## UI Anti-Patterns to Avoid

- Raw Swagger/OpenAPI as the main experience.
- Fake metrics or fake agents.
- Exposing JWTs, provider keys, Infisical values, DB passwords, or raw Authorization headers.
- Generic three-card dashboard landing.
- Unlabeled colored dots; every status marker must have text and meaning.
- Dense JSON blobs as default view.
- Div-based fake screenshots in the product itself.

## Data Integration Pattern

Preferred aggregator design:

1. Console backend runs on the Honcho VM.
2. Backend calls local Honcho API with a scoped server-side token.
3. Backend reads VM service health locally via safe command adapters.
4. Backend queries fleet registry through a configured read-only adapter when available.
5. Backend exposes sanitized JSON to the frontend.
6. Frontend never receives raw secrets or unrestricted Honcho admin tokens.

## Deployment Pattern

Recommended structure:

```text
console/
  backend/
    app/
    tests/
  frontend/
    src/
    tests/
  docker/
  README.md
ops/
  honcho-console.service or compose snippets
```

The current `/opt/honcho-admin` panel should be replaced by repo-managed deployment, or kept only as a compatibility redirect during cutover.
