"""Browser-safe response models for the Honcho Memory Console backend."""

from __future__ import annotations

from typing import ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field

__all__ = [
    "AgentApiActivity",
    "AgentDetailResponse",
    "AgentRegistryEntry",
    "AgentRegistryResult",
    "AgentRegistrySummaryResponse",
    "AgentVmHealth",
    "AlertValue",
    "MemoryCounts",
    "QueueState",
    "RegistryAlert",
    "TokenInfo",
]

TokenStatus = Literal["valid", "expired", "mis-scoped", "unknown"]


class ConsoleModel(BaseModel):
    """Base model that rejects accidental extra fields such as raw credentials."""

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")


class RegistryAlert(ConsoleModel):
    """Sanitized alert surfaced by an adapter or registry assembler."""

    code: str
    message: str
    severity: Literal["info", "warning", "critical"] = "warning"
    source: str | None = None


class TokenInfo(ConsoleModel):
    """Non-secret identity data for a Honcho API token."""

    fingerprint: str | None = None
    scope: str = "unknown"
    status: TokenStatus = "unknown"


class MemoryCounts(ConsoleModel):
    """Memory-size counters. ``None`` means not collected by this increment."""

    sessions: int | None = None
    messages: int | None = None
    documents: int | None = None
    conclusions: int | None = None
    peer_card_entries: int | None = None


class QueueState(ConsoleModel):
    """Queue state counters for an agent workspace."""

    pending: int | None = None
    in_progress: int | None = None
    completed: int | None = None
    errors: int | None = None
    status: Literal["healthy", "pending", "degraded", "error", "unknown"] = "unknown"


class AgentApiActivity(ConsoleModel):
    """Aggregated token/API telemetry counters when available."""

    requests_1h: int | None = None
    requests_24h: int | None = None
    error_rate: float | None = None
    p95_latency_ms: float | None = None


class AgentVmHealth(ConsoleModel):
    """VM/service health snapshot. T04 will enrich this with real values."""

    status: Literal["online", "offline", "degraded", "unknown"] = "unknown"
    cpu_percent: float | None = None
    memory_percent: float | None = None
    disk_percent: float | None = None
    service_state: str | None = None


AlertValue = str | RegistryAlert


class AgentRegistryEntry(ConsoleModel):
    """Canonical agent row returned by ``GET /api/agents``."""

    agent_id: str
    display_name: str
    tenant_id: str | None = None
    runtime_vm: str | None = None
    tailnet_ip: str | None = None
    environment: str | None = None
    honcho_workspace: str | None = None
    ai_peer: str | None = None
    human_peer: str | None = None
    token_fingerprint: str | None = None
    token_scope: str = "unknown"
    token_status: TokenStatus = "unknown"
    last_write_at: str | None = None
    memory_counts: MemoryCounts = Field(default_factory=MemoryCounts)
    queue_state: QueueState = Field(default_factory=QueueState)
    api_activity: AgentApiActivity = Field(default_factory=AgentApiActivity)
    vm_health: AgentVmHealth = Field(default_factory=AgentVmHealth)
    alerts: list[AlertValue] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)


class AgentRegistryResult(ConsoleModel):
    """Internal result from the registry service."""

    agents: list[AgentRegistryEntry]
    alerts: list[RegistryAlert] = Field(default_factory=list)


class AgentRegistrySummaryResponse(ConsoleModel):
    """Public response for ``GET /api/agents``."""

    service: str = "honcho-memory-console"
    status: Literal["ok", "degraded"] = "ok"
    total: int
    agents: list[AgentRegistryEntry]
    alerts: list[RegistryAlert] = Field(default_factory=list)


class AgentDetailResponse(ConsoleModel):
    """Public response for ``GET /api/agents/{agent_id}``."""

    service: str = "honcho-memory-console"
    status: Literal["ok", "degraded"] = "ok"
    agent: AgentRegistryEntry
    alerts: list[RegistryAlert] = Field(default_factory=list)
