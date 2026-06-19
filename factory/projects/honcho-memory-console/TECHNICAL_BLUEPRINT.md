# Technical Blueprint - Honcho Memory Console

Project: `honcho-memory-console`
Owner: Jean García / SitioUno
Created: 2026-06-19T01:26:24-04:00
Validated: yes
Reviewed: yes
Reviewer: Zeus Factory orchestrator bootstrap pass
Status: G1 ready for autonomous Factory execution

## Target Architecture

```text
Browser over Tailscale
  -> Honcho Memory Console frontend
  -> Console backend API
       -> Honcho API local http://127.0.0.1:8000
       -> Honcho Postgres/Redis safe health checks
       -> systemd/docker local health adapters
       -> fleet_registry read-only adapter when configured
       -> optional sanitized token telemetry table
```

## Proposed Repo Structure

```text
console/
  backend/
    app/
      main.py
      auth.py
      settings.py
      adapters/
        honcho_api.py
        local_services.py
        fleet_registry.py
        token_telemetry.py
      models.py
    tests/
    pyproject.toml or use root uv workspace if appropriate
  frontend/
    src/
      app/
      components/
      routes/
      lib/
      styles/
    package.json
    vite.config.ts
    tailwind.config.ts
  docker/
    Dockerfile
  README.md
ops/
  honcho-console.service
  honcho-console.env.example
  deploy-console.sh
factory/projects/honcho-memory-console/
```

Implementation may adjust exact paths after repo research, but must keep console code repo-managed.

## Backend API Contract

### `GET /api/overview`

Returns global health and summary counts.

### `GET /api/agents`

Returns sanitized list of agent tenants with VM/token/memory metrics.

### `GET /api/agents/{agent_id}`

Returns detail object for one agent.

### `GET /api/health/services`

Returns systemd/docker/API/DB/Redis/Tailscale/update/provider health.

### `GET /api/memory/workspaces`

Returns workspace list and counts.

### `GET /api/memory/workspaces/{workspace}/peers`

Returns peers and peer-card summary.

### `GET /api/memory/workspaces/{workspace}/conclusions`

Returns paginated/searchable conclusions with content controls.

### `GET /api/audit/events`

Returns console audit events.

## Security Model

- App remains bound to private interface/Tailscale.
- Basic Auth is acceptable for bootstrap, but implementation should centralize auth middleware.
- Server-side Honcho token stays in env/Infisical/local root-readable env file only.
- Responses must be sanitized by Pydantic/typed schemas.
- CLI/system commands must use allowlisted commands only.
- No shell interpolation with user input.
- Audit sensitive operations.

## Agent Registry Model

Canonical fields:

```json
{
  "agent_id": "zeus",
  "display_name": "Zeus",
  "tenant_id": "sitiouno-jean",
  "runtime_vm": "zeus/sitiouno host",
  "tailnet_ip": "local",
  "environment": "production",
  "honcho_workspace": "hermes",
  "ai_peer": "Zeus",
  "human_peer": "Jean-Garcia",
  "token_fingerprint": "sha256:...",
  "token_scope": "workspace:hermes",
  "sources": ["fleet_registry", "honcho_config", "honcho_api"]
}
```

## Health Model

Each health check returns:

```json
{
  "id": "honcho-api",
  "label": "Honcho API",
  "layer": "service",
  "status": "healthy|degraded|down|unknown",
  "summary": "GET /health returned ok",
  "last_checked_at": "ISO-8601",
  "latency_ms": 12,
  "evidence": {"http_status": 200},
  "safe_to_show": true
}
```

## UI Blueprint

Main navigation:

1. Overview
2. Agents
3. Memory
4. Health
5. Telemetry
6. Audit
7. Settings

Design rules:

- No generic card grid as the only structure.
- Use strong data tables with row expansion and detail drawers.
- Use one accent color, SitioUno blue or a refined cyan/blue derivative.
- Use Phosphor icons or another approved single icon family.
- Support dark/light modes with tokenized colors.
- Provide skeletons, empty states, errors, and offline states.

## Deployment Blueprint

- Console service listens on `127.0.0.1:8080` or private interface as currently used.
- Existing `honcho-admin.service` is replaced or renamed after successful deployment.
- Add rollback command to restore previous panel if deployment fails.
- Verify with:
  - `systemctl is-active honcho.service honcho-console.service honcho-update.timer`
  - `docker compose ps`
  - `curl -fsS http://127.0.0.1:8000/health`
  - browser visit through Tailscale.
