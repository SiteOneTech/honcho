"""Agent registry assembly for the Honcho Memory Console.

Precedence is intentionally explicit:

1. Fleet registry rows when the registry is configured and returns data.
2. Honcho/config fallback for the local Zeus/Honcho consumer when fleet data is
   missing or unavailable.

Every output is a typed Pydantic model and is passed through the central redactor
at the route boundary, so accidental raw token fields from a registry row cannot
reach the browser.
"""

# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal

from pydantic import ValidationError

from console.backend.app.adapters.fleet_registry import (
    FleetRegistryAdapter,
    FleetRegistryClient,
)
from console.backend.app.adapters.token_fingerprint import derive_token_info
from console.backend.app.models import (
    AgentApiActivity,
    AgentRegistryEntry,
    AgentRegistryResult,
    AgentVmHealth,
    AlertValue,
    MemoryCounts,
    QueueState,
    RegistryAlert,
    TokenInfo,
    TokenStatus,
)
from console.backend.app.settings import ConsoleSettings

__all__ = ["AgentRegistryService"]

QueueStatusValue = Literal["healthy", "pending", "degraded", "error", "unknown"]
VmStatusValue = Literal["online", "offline", "degraded", "unknown"]
AlertSeverity = Literal["info", "warning", "critical"]

_TOKEN_VALUE_KEYS = (
    "token",
    "api_token",
    "honcho_api_token",
    "bearer_token",
    "authorization",
    "Authorization",
)


class AgentRegistryService:
    """Build sanitized agent rows from fleet registry and Honcho/config fallback."""

    def __init__(
        self,
        settings: ConsoleSettings,
        *,
        fleet_registry_adapter: FleetRegistryClient | None = None,
    ) -> None:
        self._settings: ConsoleSettings = settings
        self._fleet_registry_adapter: FleetRegistryClient = (
            fleet_registry_adapter or FleetRegistryAdapter(settings)
        )

    def list_agents(self) -> AgentRegistryResult:
        """Return sanitized agents and any non-secret adapter alerts."""

        alerts: list[RegistryAlert] = []
        fleet_rows: list[dict[str, Any]] = []

        if self._fleet_registry_configured:
            try:
                fleet_rows = self._fleet_registry_adapter.list_agents()
            except Exception:
                alerts.append(_fleet_unavailable_alert())

        if fleet_rows:
            agents, mapping_alerts = self._map_fleet_rows(fleet_rows)
            alerts.extend(mapping_alerts)
            if agents:
                return AgentRegistryResult(agents=agents, alerts=alerts)

        fallback = self._config_fallback_entry()
        if alerts:
            fallback.alerts.extend(alerts)
        return AgentRegistryResult(agents=[fallback], alerts=alerts)

    def get_agent(self, agent_id: str) -> AgentRegistryEntry | None:
        """Return one agent by stable ``agent_id`` or ``None`` when not found."""

        for agent in self.list_agents().agents:
            if agent.agent_id == agent_id:
                return agent
        return None

    @property
    def _fleet_registry_configured(self) -> bool:
        database_url = self._settings.fleet_registry_database_url
        return bool(database_url and database_url.get_secret_value())

    def _map_fleet_rows(
        self, rows: list[dict[str, Any]]
    ) -> tuple[list[AgentRegistryEntry], list[RegistryAlert]]:
        agents: list[AgentRegistryEntry] = []
        alerts: list[RegistryAlert] = []
        seen: set[str] = set()

        for index, row in enumerate(rows):
            try:
                agent = self._fleet_row_to_entry(row)
            except (TypeError, ValueError, ValidationError):
                alerts.append(
                    RegistryAlert(
                        code="fleet_registry_row_invalid",
                        message=f"Fleet registry row {index} was skipped because it did not match the console schema.",
                        source="fleet_registry",
                    )
                )
                continue

            if agent.agent_id in seen:
                alerts.append(
                    RegistryAlert(
                        code="fleet_registry_duplicate_agent",
                        message=f"Duplicate fleet registry agent_id '{agent.agent_id}' was ignored.",
                        source="fleet_registry",
                    )
                )
                continue
            seen.add(agent.agent_id)
            agents.append(agent)

        return agents, alerts

    def _fleet_row_to_entry(self, row: Mapping[str, Any]) -> AgentRegistryEntry:
        workspace = _as_str(row.get("honcho_workspace")) or self._settings.honcho_workspace
        token_info = _token_info_from_registry_row(
            row,
            expected_workspace=workspace,
            signing_secret=_secret_or_none(self._settings.jwt_secret),
        )

        return AgentRegistryEntry(
            agent_id=_required_str(row, "agent_id"),
            display_name=_as_str(row.get("display_name")) or _required_str(row, "agent_id"),
            tenant_id=_as_str(row.get("tenant_id")),
            runtime_vm=_as_str(row.get("runtime_vm")),
            tailnet_ip=_as_str(row.get("tailnet_ip")),
            environment=_as_str(row.get("environment")),
            honcho_workspace=workspace,
            ai_peer=_as_str(row.get("ai_peer")),
            human_peer=_as_str(row.get("human_peer")),
            token_fingerprint=token_info.fingerprint,
            token_scope=token_info.scope,
            token_status=token_info.status,
            last_write_at=_as_str(row.get("last_write_at")),
            memory_counts=_memory_counts(row),
            queue_state=_queue_state(row),
            api_activity=_api_activity(row),
            vm_health=_vm_health(row),
            alerts=_alerts(row.get("alerts")),
            sources=["fleet_registry"],
        )

    def _config_fallback_entry(self) -> AgentRegistryEntry:
        token_info = derive_token_info(
            self._settings.honcho_api_token,
            expected_workspace=self._settings.honcho_workspace,
            signing_secret=_secret_or_none(self._settings.jwt_secret),
        )
        alerts: list[AlertValue] = []
        if token_info.fingerprint is None:
            alerts.append("honcho_api_token_not_configured")

        return AgentRegistryEntry(
            agent_id=self._settings.agent_id,
            display_name=self._settings.agent_display_name,
            tenant_id=self._settings.tenant_id,
            runtime_vm=self._settings.runtime_vm,
            tailnet_ip=self._settings.tailnet_ip,
            environment=self._settings.environment,
            honcho_workspace=self._settings.honcho_workspace,
            ai_peer=self._settings.ai_peer,
            human_peer=self._settings.human_peer,
            token_fingerprint=token_info.fingerprint,
            token_scope=token_info.scope,
            token_status=token_info.status,
            memory_counts=MemoryCounts(),
            queue_state=QueueState(),
            api_activity=AgentApiActivity(),
            vm_health=AgentVmHealth(),
            alerts=alerts,
            sources=["honcho_config"],
        )


def _fleet_unavailable_alert() -> RegistryAlert:
    return RegistryAlert(
        code="fleet_registry_unavailable",
        message="Fleet registry could not be read; using Honcho/config discovery fallback.",
        source="fleet_registry",
    )


def _token_info_from_registry_row(
    row: Mapping[str, Any], *, expected_workspace: str | None, signing_secret: str | None
) -> TokenInfo:
    raw_token = next((row.get(key) for key in _TOKEN_VALUE_KEYS if row.get(key)), None)
    if raw_token:
        return derive_token_info(
            raw_token,
            expected_workspace=expected_workspace,
            signing_secret=signing_secret,
        )

    return TokenInfo(
        fingerprint=_as_str(row.get("token_fingerprint")),
        scope=_as_str(row.get("token_scope")) or "unknown",
        status=_token_status_or_unknown(row.get("token_status")),
    )


def _memory_counts(row: Mapping[str, Any]) -> MemoryCounts:
    value = row.get("memory_counts")
    if isinstance(value, Mapping):
        return MemoryCounts(
            sessions=_int_or_none(value.get("sessions")),
            messages=_int_or_none(value.get("messages")),
            documents=_int_or_none(value.get("documents")),
            conclusions=_int_or_none(value.get("conclusions")),
            peer_card_entries=_int_or_none(value.get("peer_card_entries")),
        )
    return MemoryCounts(
        sessions=_int_or_none(row.get("sessions")),
        messages=_int_or_none(row.get("messages")),
        documents=_int_or_none(row.get("documents")),
        conclusions=_int_or_none(row.get("conclusions")),
        peer_card_entries=_int_or_none(row.get("peer_card_entries")),
    )


def _queue_state(row: Mapping[str, Any]) -> QueueState:
    value = row.get("queue_state") or row.get("queue")
    if isinstance(value, Mapping):
        return QueueState(
            pending=_int_or_none(value.get("pending")),
            in_progress=_int_or_none(value.get("in_progress")),
            completed=_int_or_none(value.get("completed")),
            errors=_int_or_none(value.get("errors")),
            status=_queue_status_or_unknown(value.get("status")),
        )
    return QueueState(
        pending=_int_or_none(row.get("queue_pending")),
        in_progress=_int_or_none(row.get("queue_in_progress")),
        completed=_int_or_none(row.get("queue_completed")),
        errors=_int_or_none(row.get("queue_errors")),
        status=_queue_status_or_unknown(row.get("queue_status")),
    )


def _api_activity(row: Mapping[str, Any]) -> AgentApiActivity:
    value = row.get("api_activity")
    if isinstance(value, Mapping):
        return AgentApiActivity(
            requests_1h=_int_or_none(value.get("requests_1h")),
            requests_24h=_int_or_none(value.get("requests_24h")),
            error_rate=_float_or_none(value.get("error_rate")),
            p95_latency_ms=_float_or_none(value.get("p95_latency_ms")),
        )
    return AgentApiActivity(
        requests_1h=_int_or_none(row.get("requests_1h")),
        requests_24h=_int_or_none(row.get("requests_24h")),
        error_rate=_float_or_none(row.get("error_rate")),
        p95_latency_ms=_float_or_none(row.get("p95_latency_ms")),
    )


def _vm_health(row: Mapping[str, Any]) -> AgentVmHealth:
    value = row.get("vm_health")
    if isinstance(value, Mapping):
        return AgentVmHealth(
            status=_vm_status_or_unknown(value.get("status")),
            cpu_percent=_float_or_none(value.get("cpu_percent")),
            memory_percent=_float_or_none(value.get("memory_percent")),
            disk_percent=_float_or_none(value.get("disk_percent")),
            service_state=_as_str(value.get("service_state")),
        )
    return AgentVmHealth(
        status=_vm_status_or_unknown(row.get("vm_health_status")),
        cpu_percent=_float_or_none(row.get("cpu_percent")),
        memory_percent=_float_or_none(row.get("memory_percent")),
        disk_percent=_float_or_none(row.get("disk_percent")),
        service_state=_as_str(row.get("service_state")),
    )


def _alerts(value: Any) -> list[str | RegistryAlert]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        alerts: list[str | RegistryAlert] = []
        for item in value:
            if isinstance(item, str):
                alerts.append(item)
            elif isinstance(item, Mapping):
                alerts.append(
                    RegistryAlert(
                        code=_as_str(item.get("code")) or "registry_alert",
                        message=_as_str(item.get("message")) or "Registry alert.",
                        severity=_severity_or_warning(item.get("severity")),
                        source=_as_str(item.get("source")),
                    )
                )
        return alerts
    return []


def _required_str(row: Mapping[str, Any], key: str) -> str:
    value = _as_str(row.get(key))
    if not value:
        raise ValueError(f"Missing required registry field: {key}")
    return value


def _as_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _int_or_none(value: Any) -> int | None:
    if value is None or value == "":
        return None
    return int(value)


def _float_or_none(value: Any) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def _secret_or_none(value: Any) -> str | None:
    if value is None:
        return None
    get_secret_value = getattr(value, "get_secret_value", None)
    raw = get_secret_value() if callable(get_secret_value) else value
    text = str(raw or "")
    return text or None


def _token_status_or_unknown(value: Any) -> TokenStatus:
    text = _as_str(value)
    if text == "valid":
        return "valid"
    if text == "expired":
        return "expired"
    if text == "mis-scoped":
        return "mis-scoped"
    return "unknown"


def _queue_status_or_unknown(value: Any) -> QueueStatusValue:
    text = _as_str(value)
    if text == "healthy":
        return "healthy"
    if text == "pending":
        return "pending"
    if text == "degraded":
        return "degraded"
    if text == "error":
        return "error"
    return "unknown"


def _vm_status_or_unknown(value: Any) -> VmStatusValue:
    text = _as_str(value)
    if text == "online":
        return "online"
    if text == "offline":
        return "offline"
    if text == "degraded":
        return "degraded"
    return "unknown"


def _severity_or_warning(value: Any) -> AlertSeverity:
    text = _as_str(value)
    if text == "info":
        return "info"
    if text == "critical":
        return "critical"
    return "warning"
