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

from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

from fastapi import FastAPI, HTTPException
from starlette.responses import JSONResponse
from starlette.staticfiles import StaticFiles

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
    async def get_overview() -> dict[str, Any]:
        """Return live operational overview or explicit unavailable states."""

        public = settings.public_config()
        alerts: list[dict[str, Any]] = []
        sources: list[str] = [
            "/api/agents",
            "/api/health/services",
            "/api/telemetry",
            "/api/audit/events",
            "/api/settings",
        ]

        agent_result = application.state.agent_registry.list_agents()
        alerts.extend(_overview_alerts_from_models(agent_result.alerts))

        health_response = application.state.local_health.collect()
        health_counts = _overview_health_counts(health_response.checks)
        health_status = _overview_health_status(health_response.checks)

        telemetry = application.state.telemetry.snapshot()
        audit = application.state.audit_trail.snapshot()

        honcho_api: dict[str, Any] = {
            "url": public["honcho_api"]["url"],
            "token_configured": public["honcho_api"]["token_configured"],
            "available": False,
            "status": "unknown",
            "summary": "Honcho API health has not been checked yet.",
            "upstream_status": None,
            "latency_ms": None,
        }
        workspaces_total: int | None = None
        queue_total: int | None = None
        queue_pending: int | None = None
        queue_in_progress: int | None = None
        queue_errors: int | None = None

        try:
            upstream_health = await adapter.health()
        except HonchoAPIUnavailable:
            alerts.append(
                _overview_alert(
                    "honcho_api_unavailable",
                    "Honcho API is unavailable; memory metrics are shown as unavailable.",
                    severity="critical",
                    source="honcho_api",
                )
            )
            honcho_api.update(
                {
                    "status": "unavailable",
                    "summary": "Honcho API could not be reached from the console backend.",
                }
            )
        except HonchoAPIUpstreamError as exc:
            alerts.append(
                _overview_alert(
                    "honcho_api_error",
                    "Honcho API returned an upstream error; memory metrics are shown as unavailable.",
                    severity="warning",
                    source="honcho_api",
                )
            )
            honcho_api.update(
                {
                    "status": "degraded",
                    "summary": "Honcho API returned an upstream error.",
                    "upstream_status": exc.upstream_status,
                }
            )
        else:
            sources.append("/api/memory/health")
            honcho_api.update(
                {
                    "available": True,
                    "status": upstream_health.status,
                    "summary": upstream_health.summary,
                    "upstream_status": upstream_health.upstream_status,
                    "latency_ms": upstream_health.latency_ms,
                }
            )
            try:
                workspaces = await adapter.list_workspaces()
            except (HonchoAPIUnavailable, HonchoAPIUpstreamError):
                alerts.append(
                    _overview_alert(
                        "honcho_workspaces_unavailable",
                        "Workspace inventory could not be read from Honcho.",
                        source="honcho_api",
                    )
                )
            else:
                sources.append("/api/memory/workspaces")
                workspaces_total = workspaces.total

            if settings.honcho_workspace:
                try:
                    queue = await adapter.get_queue_status(settings.honcho_workspace)
                except (HonchoAPIUnavailable, HonchoAPIUpstreamError):
                    alerts.append(
                        _overview_alert(
                            "honcho_queue_unavailable",
                            "Queue counters could not be read for the configured workspace.",
                            source="honcho_api",
                        )
                    )
                else:
                    sources.append("/api/memory/workspaces/{workspace_id}/queue")
                    queue_total = queue.total_work_units
                    queue_pending = queue.pending_work_units
                    queue_in_progress = queue.in_progress_work_units
                    queue_errors = max(
                        queue.total_work_units
                        - queue.completed_work_units
                        - queue.in_progress_work_units
                        - queue.pending_work_units,
                        0,
                    )

        memory_total = _overview_memory_total(agent_result.agents)
        layers = [
            _overview_layer(
                "api",
                "Honcho API",
                _overview_api_status(honcho_api),
                str(honcho_api["summary"]),
            ),
            _overview_layer(
                "agents",
                "Agent registry",
                "degraded" if agent_result.alerts else "healthy",
                f"{len(agent_result.agents)} agent rows returned by the registry service.",
            ),
            _overview_layer(
                "memory",
                "Memory inventory",
                "healthy" if workspaces_total is not None else "unknown",
                (
                    f"{workspaces_total} workspaces and queue counters returned by Honcho."
                    if workspaces_total is not None
                    else "Honcho memory inventory is unavailable from this overview snapshot."
                ),
            ),
            _overview_layer(
                "health",
                "Service health",
                health_status,
                f"{health_counts['total']} local checks; {health_counts['degraded']} degraded, {health_counts['down']} down, {health_counts['unknown']} unknown.",
            ),
            _overview_layer(
                "telemetry",
                "Telemetry",
                "healthy",
                f"{telemetry.totals.requests_24h or 0} console API requests retained in the 24h telemetry window.",
            ),
            _overview_layer(
                "audit",
                "Audit trail",
                "healthy",
                f"{audit.total} audit events retained in memory.",
            ),
        ]
        status = "ok" if all(layer["status"] == "healthy" for layer in layers) else "degraded"
        payload: dict[str, Any] = {
            "service": "honcho-memory-console",
            "status": status,
            "generated_at": _utc_now_iso(),
            "privacy_boundary": {
                "mode": "private_tailscale_internal",
                "public_internet_url_required": False,
                "public_internet_url_configured": False,
                "evidence_hint": "Use the private Tailscale/internal console address for QA evidence.",
            },
            "auth": public["auth"],
            "honcho_api": honcho_api,
            "metrics": {
                "active_agents": len(agent_result.agents),
                "workspaces": workspaces_total,
                "memory_items": memory_total,
                "queue_total": queue_total,
                "queue_pending": queue_pending,
                "queue_in_progress": queue_in_progress,
                "queue_errors": queue_errors,
                "requests_1h": telemetry.totals.requests_1h,
                "requests_24h": telemetry.totals.requests_24h,
                "error_rate": telemetry.totals.error_rate,
                "p95_latency_ms": telemetry.totals.p95_latency_ms,
                "audit_events": audit.total,
                **health_counts,
            },
            "layers": layers,
            "alerts": alerts,
            "sources": sources,
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

    _mount_frontend_static(application, settings)
    return application


def _utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _overview_alert(
    code: str,
    message: str,
    *,
    severity: str = "warning",
    source: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "code": code,
        "message": message,
        "severity": severity,
    }
    if source:
        payload["source"] = source
    return payload


def _overview_alerts_from_models(alerts: list[Any]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for alert in alerts:
        model_dump = getattr(alert, "model_dump", None)
        if callable(model_dump):
            normalized.append(cast(dict[str, Any], model_dump(mode="json")))
        elif isinstance(alert, dict):
            normalized.append(cast(dict[str, Any], alert))
        elif isinstance(alert, str):
            normalized.append(_overview_alert(alert, alert, source="agent_registry"))
    return normalized


def _overview_memory_total(agents: list[Any]) -> int | None:
    total = 0
    found = False
    for agent in agents:
        counts = getattr(agent, "memory_counts", None)
        if counts is None:
            continue
        for field in (
            "sessions",
            "messages",
            "documents",
            "conclusions",
            "peer_card_entries",
        ):
            value = getattr(counts, field, None)
            if isinstance(value, int):
                total += value
                found = True
    return total if found else None


def _overview_health_counts(checks: list[Any]) -> dict[str, int]:
    counts = {"total": len(checks), "degraded": 0, "down": 0, "unknown": 0}
    for check in checks:
        status = getattr(check, "status", "unknown")
        if status == "degraded":
            counts["degraded"] += 1
        elif status == "down":
            counts["down"] += 1
        elif status == "unknown":
            counts["unknown"] += 1
    return counts


def _overview_health_status(checks: list[Any]) -> str:
    statuses = {str(getattr(check, "status", "unknown")) for check in checks}
    if "down" in statuses:
        return "down"
    if "degraded" in statuses:
        return "degraded"
    if "unknown" in statuses:
        return "unknown"
    return "healthy"


def _overview_api_status(honcho_api: dict[str, Any]) -> str:
    if honcho_api.get("available") is False and honcho_api.get("status") == "unavailable":
        return "down"
    status = honcho_api.get("status")
    if status in {"healthy", "degraded", "down", "unknown"}:
        return str(status)
    if status in {"ok", "up", "pass"}:
        return "healthy"
    if status == "unavailable":
        return "down"
    return "unknown"


def _overview_layer(
    layer_id: str,
    label: str,
    status: str,
    summary: str,
) -> dict[str, str]:
    if status not in {"healthy", "degraded", "down", "unknown"}:
        status = "unknown"
    return {"id": layer_id, "label": label, "status": status, "summary": summary}


def _secret_or_none(value: Any) -> str | None:
    """Return a server-side secret value for local derivation, never serialization."""

    if value is None:
        return None
    get_secret_value = getattr(value, "get_secret_value", None)
    raw = get_secret_value() if callable(get_secret_value) else value
    text = str(raw or "")
    return text or None


def _mount_frontend_static(application: FastAPI, settings: ConsoleSettings) -> None:
    """Serve the production Vite bundle when it exists.

    The BasicAuthMiddleware protects this mount because only liveness probes are
    public. The mount is intentionally optional so backend unit tests and API-only
    development do not need a built frontend bundle.
    """

    configured = settings.frontend_static_dir
    static_dir = (
        Path(configured).expanduser()
        if configured
        else Path(__file__).resolve().parents[2] / "frontend" / "dist"
    )
    index_file = static_dir / "index.html"
    if not index_file.is_file():
        return

    application.mount(
        "/",
        StaticFiles(directory=static_dir, html=True),
        name="frontend",
    )


#: Module-level application singleton for ASGI servers (``uvicorn ... :app``).
app = create_app()
