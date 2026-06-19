# pyright: reportUnusedFunction=false
"""FastAPI application factory for the Honcho Memory Console backend.

This is an intentionally thin scaffold. Every browser-facing endpoint returns only
sanitized data — booleans, plain URLs, and non-reversible fingerprints — produced
via :meth:`ConsoleSettings.public_config` and passed through
:func:`redact_sensitive` as a defense-in-depth backstop. No route returns a raw
token, JWT secret, provider key, Infisical value, or DB password.

Route map:

* ``GET /healthz``       — unauthenticated liveness probe.
* ``GET /api/settings``  — sanitized runtime configuration (auth required).
* ``GET /api/overview``  — scaffold operational overview (auth required).
* ``GET /api/agents``    — sanitized agent/token registry (auth required).
* ``GET /api/agents/{agent_id}`` — sanitized agent detail (auth required).
* ``GET /api/health/services`` — sanitized local service health (auth required).
* ``GET /api/audit/events`` — scaffold audit feed (auth required).
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException

from console.backend.app.adapters.agent_registry import AgentRegistryService
from console.backend.app.adapters.fleet_registry import FleetRegistryClient
from console.backend.app.adapters.local_services import LocalServiceHealthAdapter
from console.backend.app.auth import BasicAuthMiddleware
from console.backend.app.models import (
    AgentDetailResponse,
    AgentRegistrySummaryResponse,
    ServiceHealthResponse,
)
from console.backend.app.redaction import redact_sensitive
from console.backend.app.settings import ConsoleSettings

__all__ = ["create_app", "app"]


def create_app(
    settings: ConsoleSettings | None = None,
    *,
    fleet_registry_adapter: FleetRegistryClient | None = None,
    local_health_adapter: Any | None = None,
) -> FastAPI:
    """Build a console backend application.

    Args:
        settings: explicit configuration. When ``None``, settings are loaded from
            the environment (``HONCHO_CONSOLE__*``) with safe defaults.
        fleet_registry_adapter: optional read-only fleet adapter override used by
            tests and future composition code. When omitted, the default Postgres
            adapter is created from settings.
        local_health_adapter: optional local health adapter override used by tests.
            When omitted, the default safe adapter is created from settings.

    Returns:
        A configured :class:`fastapi.FastAPI` instance with Basic Auth enforced on
        all ``/api`` routes.
    """

    settings = settings or ConsoleSettings()

    application = FastAPI(
        title="Honcho Memory Console",
        version="0.1.0",
        description="Operator console for inspecting Honcho memory state.",
    )
    application.state.settings = settings
    application.state.agent_registry = AgentRegistryService(
        settings,
        fleet_registry_adapter=fleet_registry_adapter,
    )
    application.state.local_health = local_health_adapter or LocalServiceHealthAdapter(
        settings
    )
    application.add_middleware(BasicAuthMiddleware, settings=settings)

    @application.get("/healthz", tags=["health"])
    def healthz() -> dict[str, str]:
        """Unauthenticated liveness probe."""

        return {"status": "ok", "service": "honcho-memory-console"}

    @application.get("/api/settings", tags=["console"])
    def get_settings() -> dict[str, Any]:
        """Return the sanitized, browser-safe runtime configuration."""

        return redact_sensitive(settings.public_config())

    @application.get("/api/overview", tags=["console"])
    def get_overview() -> dict[str, Any]:
        """Return a scaffold operational overview (no live data yet)."""

        public = settings.public_config()
        payload: dict[str, Any] = {
            "service": "honcho-memory-console",
            "status": "scaffold",
            "auth": public["auth"],
            "honcho_api": {
                "url": public["honcho_api"]["url"],
                "token_configured": public["honcho_api"]["token_configured"],
            },
            "metrics": {
                "workspaces": None,
                "peers": None,
                "sessions": None,
                "queue_depth": None,
            },
        }
        return redact_sensitive(payload)

    @application.get("/api/agents", tags=["console"])
    def get_agents() -> dict[str, Any]:
        """Return sanitized agent registry rows for the Agents table."""

        result = application.state.agent_registry.list_agents()
        response = AgentRegistrySummaryResponse(
            status="degraded" if result.alerts else "ok",
            total=len(result.agents),
            agents=result.agents,
            alerts=result.alerts,
        )
        return redact_sensitive(response.model_dump(mode="json"))

    @application.get("/api/agents/{agent_id}", tags=["console"])
    def get_agent(agent_id: str) -> dict[str, Any]:
        """Return one sanitized agent registry row by stable agent id."""

        result = application.state.agent_registry.list_agents()
        agent = next((item for item in result.agents if item.agent_id == agent_id), None)
        if agent is None:
            raise HTTPException(status_code=404, detail="Agent not found.")
        response = AgentDetailResponse(
            status="degraded" if result.alerts else "ok",
            agent=agent,
            alerts=result.alerts,
        )
        return redact_sensitive(response.model_dump(mode="json"))

    @application.get("/api/health/services", tags=["health"])
    def get_service_health() -> dict[str, Any]:
        """Return sanitized local service and VM health checks."""

        response: ServiceHealthResponse = application.state.local_health.collect()
        return redact_sensitive(response.model_dump(mode="json"))

    @application.get("/api/audit/events", tags=["console"])
    def get_audit_events() -> dict[str, Any]:
        """Return a scaffold audit-event feed (no events recorded yet)."""

        payload: dict[str, Any] = {
            "service": "honcho-memory-console",
            "status": "scaffold",
            "events": [],
            "total": 0,
        }
        return redact_sensitive(payload)

    return application


#: Module-level application singleton for ASGI servers (``uvicorn ... :app``).
app = create_app()
