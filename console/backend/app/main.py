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
* ``GET /api/memory/*``  — sanitized Honcho memory explorer data (auth required).
* ``GET /api/agents``    — sanitized agent/token registry (auth required).
* ``GET /api/agents/{agent_id}`` — sanitized agent detail (auth required).
* ``GET /api/health/services`` — sanitized local service health (auth required).
* ``GET /api/telemetry`` — token-safe fallback API telemetry (auth required).
* ``GET /api/audit/events`` — sanitized audit-event feed (auth required).
"""

from __future__ import annotations

from typing import Any, cast

from fastapi import FastAPI, HTTPException
from starlette.responses import JSONResponse

from console.backend.app.adapters.agent_registry import AgentRegistryService
from console.backend.app.adapters.fleet_registry import FleetRegistryClient
from console.backend.app.adapters.honcho_api import (
    ConclusionSummary,
    HonchoAPIAdapter,
    HonchoAPIUnavailable,
    HonchoAPIUpstreamError,
    HonchoHealth,
    MessageSummary,
    PeerCard,
    PeerContext,
    PeerRepresentation,
    PeerSummary,
    QueueStatus,
    SanitizedPage,
    SessionSummary,
    WorkspaceSummary,
)
from console.backend.app.adapters.local_services import LocalServiceHealthAdapter
from console.backend.app.auth import BasicAuthMiddleware
from console.backend.app.models import (
    AgentDetailResponse,
    AgentRegistrySummaryResponse,
    ServiceHealthResponse,
)
from console.backend.app.observability import (
    AuditTrail,
    RequestObservabilityMiddleware,
    TelemetryRecorder,
)
from console.backend.app.redaction import redact_sensitive
from console.backend.app.settings import ConsoleSettings

__all__ = ["create_app", "app"]


def create_app(
    settings: ConsoleSettings | None = None,
    *,
    honcho_api_adapter: HonchoAPIAdapter | None = None,
    fleet_registry_adapter: FleetRegistryClient | None = None,
    local_health_adapter: Any | None = None,
    telemetry_recorder: TelemetryRecorder | None = None,
    audit_trail: AuditTrail | None = None,
) -> FastAPI:
    """Build a console backend application.

    Args:
        settings: explicit configuration. When ``None``, settings are loaded from
            the environment (``HONCHO_CONSOLE__*``) with safe defaults.
        honcho_api_adapter: optional adapter override used by tests to inject a
            mock local Honcho API client.
        fleet_registry_adapter: optional read-only fleet adapter override used by
            tests and future composition code. When omitted, the default Postgres
            adapter is created from settings.
        local_health_adapter: optional local health adapter override used by tests.
            When omitted, the default safe adapter is created from settings.
        telemetry_recorder: optional token-safe telemetry recorder override for
            tests or future persistent implementations.
        audit_trail: optional audit trail override for tests or future persistent
            implementations.

    Returns:
        A configured :class:`fastapi.FastAPI` instance with Basic Auth enforced on
        all ``/api`` routes.
    """

    settings = settings or ConsoleSettings()
    adapter = honcho_api_adapter or HonchoAPIAdapter(settings)

    application = FastAPI(
        title="Honcho Memory Console",
        version="0.1.0",
        description="Operator console for inspecting Honcho memory state.",
    )
    application.state.settings = settings
    application.state.honcho_api_adapter = adapter
    application.state.agent_registry = AgentRegistryService(
        settings,
        fleet_registry_adapter=fleet_registry_adapter,
    )
    application.state.local_health = local_health_adapter or LocalServiceHealthAdapter(
        settings
    )
    application.state.telemetry = telemetry_recorder or TelemetryRecorder(
        token=settings.honcho_api_token,
        expected_workspace=settings.honcho_workspace,
        signing_secret=_secret_or_none(settings.jwt_secret),
    )
    application.state.audit_trail = audit_trail or AuditTrail(
        token_fingerprint=application.state.telemetry.token_fingerprint,
        token_scope=application.state.telemetry.token_scope,
    )
    application.add_middleware(BasicAuthMiddleware, settings=settings)
    application.add_middleware(
        RequestObservabilityMiddleware,
        telemetry=application.state.telemetry,
        audit_trail=application.state.audit_trail,
    )

    @application.exception_handler(HonchoAPIUnavailable)
    async def honcho_api_unavailable_handler(
        _request: Any,
        _exc: HonchoAPIUnavailable,
    ) -> JSONResponse:
        """Return a sanitized 503 when the local Honcho API is unreachable."""

        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "honcho_api_unavailable",
                    "message": "Honcho API is unavailable.",
                }
            },
        )

    @application.exception_handler(HonchoAPIUpstreamError)
    async def honcho_api_error_handler(
        _request: Any,
        exc: HonchoAPIUpstreamError,
    ) -> JSONResponse:
        """Return a sanitized 502 for upstream Honcho HTTP failures."""

        return JSONResponse(
            status_code=502,
            content={
                "error": {
                    "code": "honcho_api_error",
                    "message": "Honcho API returned an upstream error.",
                    "upstream_status": exc.upstream_status,
                }
            },
        )

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

    @application.get(
        "/api/memory/health",
        response_model=HonchoHealth,
        tags=["memory"],
    )
    async def get_memory_health() -> HonchoHealth:
        """Return sanitized local Honcho API health."""

        return await adapter.health()

    @application.get(
        "/api/memory/workspaces",
        response_model=SanitizedPage[WorkspaceSummary],
        tags=["memory"],
    )
    async def list_memory_workspaces() -> SanitizedPage[WorkspaceSummary]:
        """Return sanitized Honcho workspaces."""

        return await adapter.list_workspaces()

    @application.get(
        "/api/memory/workspaces/{workspace_id}/queue",
        response_model=QueueStatus,
        tags=["memory"],
    )
    async def get_memory_queue(workspace_id: str) -> QueueStatus:
        """Return sanitized queue counters for a workspace."""

        return await adapter.get_queue_status(workspace_id)

    @application.get(
        "/api/memory/workspaces/{workspace_id}/peers",
        response_model=SanitizedPage[PeerSummary],
        tags=["memory"],
    )
    async def list_memory_peers(workspace_id: str) -> SanitizedPage[PeerSummary]:
        """Return sanitized peers for a workspace."""

        return await adapter.list_peers(workspace_id)

    @application.get(
        "/api/memory/workspaces/{workspace_id}/peers/{peer_id}/card",
        response_model=PeerCard,
        tags=["memory"],
    )
    async def get_memory_peer_card(
        workspace_id: str,
        peer_id: str,
        target: str | None = None,
    ) -> PeerCard:
        """Return a redacted peer-card view."""

        return await adapter.get_peer_card(workspace_id, peer_id, target=target)

    @application.get(
        "/api/memory/workspaces/{workspace_id}/peers/{peer_id}/representation",
        response_model=PeerRepresentation,
        tags=["memory"],
    )
    async def get_memory_peer_representation(
        workspace_id: str,
        peer_id: str,
        target: str | None = None,
    ) -> PeerRepresentation:
        """Return a redacted peer representation."""

        return await adapter.get_peer_representation(
            workspace_id,
            peer_id,
            target=target,
        )

    @application.get(
        "/api/memory/workspaces/{workspace_id}/peers/{peer_id}/context",
        response_model=PeerContext,
        tags=["memory"],
    )
    async def get_memory_peer_context(
        workspace_id: str,
        peer_id: str,
        target: str | None = None,
    ) -> PeerContext:
        """Return a redacted peer context."""

        return await adapter.get_peer_context(workspace_id, peer_id, target=target)

    @application.get(
        "/api/memory/workspaces/{workspace_id}/sessions",
        response_model=SanitizedPage[SessionSummary],
        tags=["memory"],
    )
    async def list_memory_sessions(
        workspace_id: str,
    ) -> SanitizedPage[SessionSummary]:
        """Return sanitized session metadata for a workspace."""

        return await adapter.list_sessions(workspace_id)

    @application.get(
        "/api/memory/workspaces/{workspace_id}/sessions/{session_id}/messages",
        response_model=SanitizedPage[MessageSummary],
        tags=["memory"],
    )
    async def list_memory_messages(
        workspace_id: str,
        session_id: str,
    ) -> SanitizedPage[MessageSummary]:
        """Return sanitized message metadata with raw content hidden."""

        return await adapter.list_messages(workspace_id, session_id)

    @application.get(
        "/api/memory/workspaces/{workspace_id}/conclusions",
        response_model=SanitizedPage[ConclusionSummary],
        tags=["memory"],
    )
    async def list_memory_conclusions(
        workspace_id: str,
        query: str | None = None,
        observer_id: str | None = None,
        observed_id: str | None = None,
    ) -> SanitizedPage[ConclusionSummary]:
        """Return sanitized conclusion metadata and redacted previews."""

        filters = {
            key: value
            for key, value in {
                "observer_id": observer_id,
                "observed_id": observed_id,
            }.items()
            if value is not None
        }
        if query:
            return await adapter.query_conclusions(
                workspace_id,
                query=query,
                filters=filters,
            )
        return await adapter.list_conclusions(workspace_id, filters=filters)

    @application.post(
        "/api/memory/workspaces/{workspace_id}/conclusions/query",
        response_model=SanitizedPage[ConclusionSummary],
        tags=["memory"],
    )
    async def query_memory_conclusions(
        workspace_id: str,
        body: dict[str, Any],
    ) -> SanitizedPage[ConclusionSummary]:
        """Return sanitized semantic conclusion search results."""

        query = str(body.get("query") or "")
        raw_filters = body.get("filters")
        filters: dict[str, Any] = (
            cast(dict[str, Any], raw_filters) if isinstance(raw_filters, dict) else {}
        )
        raw_top_k = body.get("top_k")
        top_k = raw_top_k if isinstance(raw_top_k, int) else 10
        return await adapter.query_conclusions(
            workspace_id,
            query=query,
            filters=filters,
            top_k=top_k,
        )

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

    @application.get("/api/telemetry", tags=["console"])
    def get_telemetry() -> dict[str, Any]:
        """Return token-safe fallback API telemetry aggregates."""

        response = application.state.telemetry.snapshot()
        return redact_sensitive(response.model_dump(mode="json"))

    @application.get("/api/audit/events", tags=["console"])
    def get_audit_events() -> dict[str, Any]:
        """Return sanitized console operation audit events."""

        response = application.state.audit_trail.snapshot()
        return redact_sensitive(response.model_dump(mode="json"))

    return application


def _secret_or_none(value: Any) -> str | None:
    """Return a server-side secret value for local derivation, never serialization."""

    if value is None:
        return None
    get_secret_value = getattr(value, "get_secret_value", None)
    raw = get_secret_value() if callable(get_secret_value) else value
    text = str(raw or "")
    return text or None


#: Module-level application singleton for ASGI servers (``uvicorn ... :app``).
app = create_app()
