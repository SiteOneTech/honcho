"""Sanitized adapter for the local Honcho API.

The console backend is the only component allowed to hold the upstream Honcho
bearer token. This module keeps that token server-side, maps Honcho's v3 memory
surfaces into browser-safe Pydantic models, and strips secret-like keys and known
secret values from every payload before routes return it to the UI.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any, Generic, TypeVar, cast
from urllib.parse import urlsplit

import httpx
from pydantic import BaseModel, Field, SecretStr

from console.backend.app.redaction import (
    SECRET_REDACTION,
    redact_secret_text,
    redact_sensitive,
)
from console.backend.app.settings import ConsoleSettings

__all__ = [
    "ConclusionSummary",
    "HonchoAPIAdapter",
    "HonchoAPIError",
    "HonchoAPIUnavailable",
    "HonchoAPIUpstreamError",
    "HonchoHealth",
    "MessageSummary",
    "PeerCard",
    "PeerCardEntry",
    "PeerContext",
    "PeerRepresentation",
    "PeerSummary",
    "QueueSessionStatus",
    "QueueStatus",
    "SanitizedPage",
    "SessionSummary",
    "WorkspaceSummary",
]

T = TypeVar("T", bound=BaseModel)
JsonObject = dict[str, Any]


class HonchoAPIError(Exception):
    """Base class for sanitized Honcho adapter failures."""


class HonchoAPIUnavailable(HonchoAPIError):
    """Raised when the local Honcho API cannot be reached."""


class HonchoAPIUpstreamError(HonchoAPIError):
    """Raised when Honcho responds with an HTTP error status."""

    def __init__(self, upstream_status: int) -> None:
        super().__init__("Honcho API returned an upstream error.")
        self.upstream_status: int = upstream_status


class SanitizedPage(BaseModel, Generic[T]):
    """Browser-safe page shape for console list endpoints."""

    items: list[T]
    total: int
    page: int = 1
    size: int = 50
    pages: int = 1


class HonchoHealth(BaseModel):
    """Sanitized health status for the upstream Honcho API."""

    status: str
    upstream_status: int | None = None
    latency_ms: int | None = None
    summary: str


class WorkspaceSummary(BaseModel):
    """Sanitized workspace metadata for memory explorer views."""

    id: str
    metadata: JsonObject = Field(default_factory=dict)
    configuration_keys: list[str] = Field(default_factory=list)
    created_at: str | None = None


class PeerSummary(BaseModel):
    """Sanitized peer metadata for memory explorer views."""

    id: str
    workspace_id: str | None = None
    metadata: JsonObject = Field(default_factory=dict)
    configuration_keys: list[str] = Field(default_factory=list)
    created_at: str | None = None


class QueueSessionStatus(BaseModel):
    """Per-session queue counts."""

    total_work_units: int = 0
    completed_work_units: int = 0
    in_progress_work_units: int = 0
    pending_work_units: int = 0


class QueueStatus(QueueSessionStatus):
    """Workspace queue counts with optional per-session breakdown."""

    sessions: dict[str, QueueSessionStatus] = Field(default_factory=dict)


class PeerCardEntry(BaseModel):
    """One redacted peer-card entry."""

    index: int
    text: str
    sensitive: bool = False


class PeerCard(BaseModel):
    """Redacted peer-card payload."""

    entries: list[PeerCardEntry]
    total: int


class PeerRepresentation(BaseModel):
    """Redacted peer representation payload."""

    representation: str | None = None
    sensitive: bool = False


class PeerContext(BaseModel):
    """Redacted peer context payload."""

    peer_id: str | None = None
    target_id: str | None = None
    representation: str | None = None
    peer_card: list[PeerCardEntry] = Field(default_factory=list)
    sensitive: bool = False


class SessionSummary(BaseModel):
    """Sanitized session metadata for memory explorer views."""

    id: str
    workspace_id: str | None = None
    is_active: bool | None = None
    metadata: JsonObject = Field(default_factory=dict)
    configuration_keys: list[str] = Field(default_factory=list)
    created_at: str | None = None


class MessageSummary(BaseModel):
    """Message metadata with content hidden by default."""

    id: str
    workspace_id: str | None = None
    session_id: str | None = None
    peer_id: str | None = None
    metadata: JsonObject = Field(default_factory=dict)
    created_at: str | None = None
    token_count: int | None = None
    content_hidden: bool = True
    content_preview: str | None = None
    sensitive: bool = True


class ConclusionSummary(BaseModel):
    """Conclusion metadata with redacted preview text."""

    id: str
    observer_id: str | None = None
    observed_id: str | None = None
    session_id: str | None = None
    created_at: str | None = None
    content_preview: str | None = None
    sensitive: bool = False


class _SecretScrubber:
    """Scrub known runtime secret values from arbitrary payloads."""

    def __init__(self, settings: ConsoleSettings) -> None:
        secrets: list[str] = []
        for secret in (
            settings.basic_auth_password,
            settings.honcho_api_token,
            settings.jwt_secret,
            settings.database_url,
            settings.infisical_token,
        ):
            self._add_secret(secrets, secret)
        for secret in settings.provider_api_keys.values():
            self._add_secret(secrets, secret)

        # Longest first prevents partial replacements from hiding a longer match.
        self._secrets: tuple[str, ...] = tuple(
            sorted(set(secrets), key=len, reverse=True)
        )

    def scrub(self, value: Any) -> tuple[Any, bool]:
        """Return ``(sanitized_value, changed)`` for JSON-like data."""

        key_redacted = redact_sensitive(value)
        changed_by_key = key_redacted != value
        scrubbed, changed_by_value = self._scrub_known_values(key_redacted)
        return scrubbed, changed_by_key or changed_by_value

    def scrub_text(self, value: str | None) -> tuple[str | None, bool]:
        """Return redacted free text while preserving ``None``."""

        if value is None:
            return None, False
        scrubbed, changed = self._scrub_text(value)
        return scrubbed, changed

    def _add_secret(self, secrets: list[str], secret: SecretStr | None) -> None:
        if secret is None:
            return
        raw = secret.get_secret_value()
        if not raw:
            return
        self._add_raw_secret(secrets, raw)

    def _add_raw_secret(self, secrets: list[str], raw: str) -> None:
        if len(raw) < 4 or raw == SECRET_REDACTION:
            return
        secrets.append(raw)
        with_password = urlsplit(raw)
        if with_password.password:
            secrets.append(with_password.password)

    def _scrub_known_values(self, value: Any) -> tuple[Any, bool]:
        if isinstance(value, dict):
            changed = False
            sanitized: dict[Any, Any] = {}
            for key, item in cast(dict[Any, Any], value).items():
                sanitized_item, item_changed = self._scrub_known_values(item)
                sanitized[key] = sanitized_item
                changed = changed or item_changed
            return sanitized, changed

        if isinstance(value, (list, tuple)):
            changed = False
            sanitized_items: list[Any] = []
            for item in cast(list[Any] | tuple[Any, ...], value):
                sanitized_item, item_changed = self._scrub_known_values(item)
                sanitized_items.append(sanitized_item)
                changed = changed or item_changed
            return sanitized_items, changed

        if isinstance(value, str):
            return self._scrub_text(value)

        return value, False

    def _scrub_text(self, value: str) -> tuple[str, bool]:
        sanitized = redact_secret_text(value)
        for secret in self._secrets:
            sanitized = sanitized.replace(secret, SECRET_REDACTION)
        return sanitized, sanitized != value


class HonchoAPIAdapter:
    """Read-only local Honcho API client for console memory views."""

    def __init__(
        self,
        settings: ConsoleSettings,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._settings: ConsoleSettings = settings
        self._client: httpx.AsyncClient = client or httpx.AsyncClient(
            base_url=settings.honcho_api_url.rstrip("/"),
            timeout=10.0,
        )
        self._scrubber: _SecretScrubber = _SecretScrubber(settings)

    async def health(self) -> HonchoHealth:
        """Return sanitized local Honcho API health."""

        started = time.perf_counter()
        payload, upstream_status = await self._request("GET", "/health")
        latency_ms = int((time.perf_counter() - started) * 1000)
        raw_status = str(payload.get("status", "unknown")).lower()
        healthy = raw_status in {"ok", "healthy", "pass", "up"}
        status = "healthy" if healthy else "degraded"
        return HonchoHealth(
            status=status,
            upstream_status=upstream_status,
            latency_ms=latency_ms,
            summary="GET /health returned successfully." if healthy else "GET /health returned a non-ok status.",
        )

    async def list_workspaces(
        self,
        *,
        filters: JsonObject | None = None,
    ) -> SanitizedPage[WorkspaceSummary]:
        payload, _ = await self._request(
            "POST",
            "/v3/workspaces/list",
            json_body=self._filters_body(filters),
        )
        return self._page(payload, self._workspace_from_payload)

    async def get_queue_status(self, workspace_id: str) -> QueueStatus:
        payload, _ = await self._request(
            "GET",
            f"/v3/workspaces/{workspace_id}/queue/status",
        )
        sessions: dict[str, QueueSessionStatus] = {}
        for session_id, counts in self._dict(payload.get("sessions")).items():
            sessions[str(session_id)] = self._queue_session_from_payload(
                self._dict(counts)
            )
        return QueueStatus(
            total_work_units=self._int(payload, "total_work_units", "total"),
            completed_work_units=self._int(
                payload, "completed_work_units", "completed"
            ),
            in_progress_work_units=self._int(
                payload, "in_progress_work_units", "in_progress"
            ),
            pending_work_units=self._int(payload, "pending_work_units", "pending"),
            sessions=sessions,
        )

    async def list_peers(
        self,
        workspace_id: str,
        *,
        filters: JsonObject | None = None,
    ) -> SanitizedPage[PeerSummary]:
        payload, _ = await self._request(
            "POST",
            f"/v3/workspaces/{workspace_id}/peers/list",
            json_body=self._filters_body(filters),
        )
        return self._page(payload, self._peer_from_payload)

    async def get_peer_card(
        self,
        workspace_id: str,
        peer_id: str,
        *,
        target: str | None = None,
    ) -> PeerCard:
        payload, _ = await self._request(
            "GET",
            f"/v3/workspaces/{workspace_id}/peers/{peer_id}/card",
            params=self._optional_params(target=target),
        )
        raw_entries: Any = payload.get("peer_card") or []
        entries = self._peer_card_entries(raw_entries)
        return PeerCard(entries=entries, total=len(entries))

    async def get_peer_representation(
        self,
        workspace_id: str,
        peer_id: str,
        *,
        target: str | None = None,
    ) -> PeerRepresentation:
        payload, _ = await self._request(
            "POST",
            f"/v3/workspaces/{workspace_id}/peers/{peer_id}/representation",
            json_body=self._optional_params(target=target),
        )
        representation, sensitive = self._scrubber.scrub_text(
            self._optional_str(payload.get("representation"))
        )
        return PeerRepresentation(
            representation=representation,
            sensitive=sensitive,
        )

    async def get_peer_context(
        self,
        workspace_id: str,
        peer_id: str,
        *,
        target: str | None = None,
    ) -> PeerContext:
        payload, _ = await self._request(
            "GET",
            f"/v3/workspaces/{workspace_id}/peers/{peer_id}/context",
            params=self._optional_params(target=target),
        )
        representation, representation_sensitive = self._scrubber.scrub_text(
            self._optional_str(payload.get("representation"))
        )
        entries = self._peer_card_entries(payload.get("peer_card") or [])
        return PeerContext(
            peer_id=self._optional_str(payload.get("peer_id")),
            target_id=self._optional_str(payload.get("target_id")),
            representation=representation,
            peer_card=entries,
            sensitive=representation_sensitive or any(entry.sensitive for entry in entries),
        )

    async def list_sessions(
        self,
        workspace_id: str,
        *,
        filters: JsonObject | None = None,
    ) -> SanitizedPage[SessionSummary]:
        payload, _ = await self._request(
            "POST",
            f"/v3/workspaces/{workspace_id}/sessions/list",
            json_body=self._filters_body(filters),
        )
        return self._page(payload, self._session_from_payload)

    async def list_messages(
        self,
        workspace_id: str,
        session_id: str,
        *,
        filters: JsonObject | None = None,
    ) -> SanitizedPage[MessageSummary]:
        payload, _ = await self._request(
            "POST",
            f"/v3/workspaces/{workspace_id}/sessions/{session_id}/messages/list",
            json_body=self._filters_body(filters),
        )
        return self._page(payload, self._message_from_payload)

    async def list_conclusions(
        self,
        workspace_id: str,
        *,
        filters: JsonObject | None = None,
    ) -> SanitizedPage[ConclusionSummary]:
        payload, _ = await self._request(
            "POST",
            f"/v3/workspaces/{workspace_id}/conclusions/list",
            json_body=self._filters_body(filters),
        )
        return self._page(payload, self._conclusion_from_payload)

    async def query_conclusions(
        self,
        workspace_id: str,
        *,
        query: str,
        filters: JsonObject | None = None,
        top_k: int = 10,
    ) -> SanitizedPage[ConclusionSummary]:
        payload, _ = await self._request(
            "POST",
            f"/v3/workspaces/{workspace_id}/conclusions/query",
            json_body={"query": query, "top_k": top_k, "filters": filters or {}},
        )
        if isinstance(payload, list):
            items = [self._conclusion_from_payload(self._dict(item)) for item in payload]
            return SanitizedPage[ConclusionSummary](
                items=items,
                total=len(items),
                size=len(items) or 50,
                pages=1,
            )
        return self._page(payload, self._conclusion_from_payload)

    async def aclose(self) -> None:
        """Close the underlying HTTP client."""

        await self._client.aclose()

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: JsonObject | None = None,
        params: JsonObject | None = None,
    ) -> tuple[JsonObject, int]:
        try:
            response = await self._client.request(
                method,
                path,
                headers=self._headers(),
                json=json_body,
                params=params,
            )
        except httpx.RequestError as exc:
            raise HonchoAPIUnavailable from exc

        if response.status_code >= 400:
            raise HonchoAPIUpstreamError(response.status_code)

        try:
            payload = response.json()
        except ValueError:
            payload = {}

        if not isinstance(payload, dict):
            return cast(JsonObject, payload), response.status_code
        return cast(JsonObject, payload), response.status_code

    def _headers(self) -> dict[str, str]:
        token = self._settings.honcho_api_token
        if token is None or not token.get_secret_value():
            return {}
        return {"Authorization": f"Bearer {token.get_secret_value()}"}

    def _filters_body(self, filters: JsonObject | None) -> JsonObject:
        return {"filters": filters or {}}

    def _page(
        self,
        payload: JsonObject,
        item_factory: Callable[[JsonObject], T],
    ) -> SanitizedPage[T]:
        raw_items_any: Any = payload.get("items", [])
        raw_items = cast(list[Any], raw_items_any) if isinstance(raw_items_any, list) else []
        items = [item_factory(self._dict(item)) for item in raw_items]
        total = self._int(payload, "total", default=len(items))
        size = self._int(payload, "size", default=len(items) or 50)
        return SanitizedPage[T](
            items=items,
            total=total,
            page=self._int(payload, "page", default=1),
            size=size,
            pages=self._int(payload, "pages", default=1),
        )

    def _workspace_from_payload(self, raw: JsonObject) -> WorkspaceSummary:
        metadata, _ = self._scrubber.scrub(self._metadata(raw))
        return WorkspaceSummary(
            id=self._required_id(raw),
            metadata=cast(JsonObject, metadata),
            configuration_keys=self._configuration_keys(raw),
            created_at=self._optional_str(raw.get("created_at")),
        )

    def _peer_from_payload(self, raw: JsonObject) -> PeerSummary:
        metadata, _ = self._scrubber.scrub(self._metadata(raw))
        return PeerSummary(
            id=self._required_id(raw),
            workspace_id=self._optional_str(
                raw.get("workspace_id") or raw.get("workspace_name")
            ),
            metadata=cast(JsonObject, metadata),
            configuration_keys=self._configuration_keys(raw),
            created_at=self._optional_str(raw.get("created_at")),
        )

    def _session_from_payload(self, raw: JsonObject) -> SessionSummary:
        metadata, _ = self._scrubber.scrub(self._metadata(raw))
        return SessionSummary(
            id=self._required_id(raw),
            workspace_id=self._optional_str(
                raw.get("workspace_id") or raw.get("workspace_name")
            ),
            is_active=raw.get("is_active") if isinstance(raw.get("is_active"), bool) else None,
            metadata=cast(JsonObject, metadata),
            configuration_keys=self._configuration_keys(raw),
            created_at=self._optional_str(raw.get("created_at")),
        )

    def _message_from_payload(self, raw: JsonObject) -> MessageSummary:
        metadata, _ = self._scrubber.scrub(self._metadata(raw))
        return MessageSummary(
            id=self._required_id(raw),
            workspace_id=self._optional_str(
                raw.get("workspace_id") or raw.get("workspace_name")
            ),
            session_id=self._optional_str(
                raw.get("session_id") or raw.get("session_name")
            ),
            peer_id=self._optional_str(raw.get("peer_id") or raw.get("peer_name")),
            metadata=cast(JsonObject, metadata),
            created_at=self._optional_str(raw.get("created_at")),
            token_count=self._optional_int(raw.get("token_count")),
            content_hidden=True,
            content_preview=None,
            sensitive=True,
        )

    def _conclusion_from_payload(self, raw: JsonObject) -> ConclusionSummary:
        preview, sensitive = self._scrubber.scrub_text(
            self._optional_str(raw.get("content"))
        )
        return ConclusionSummary(
            id=self._required_id(raw),
            observer_id=self._optional_str(raw.get("observer_id") or raw.get("observer")),
            observed_id=self._optional_str(raw.get("observed_id") or raw.get("observed")),
            session_id=self._optional_str(raw.get("session_id") or raw.get("session_name")),
            created_at=self._optional_str(raw.get("created_at")),
            content_preview=preview,
            sensitive=sensitive,
        )

    def _queue_session_from_payload(self, raw: JsonObject) -> QueueSessionStatus:
        return QueueSessionStatus(
            total_work_units=self._int(raw, "total_work_units", "total"),
            completed_work_units=self._int(raw, "completed_work_units", "completed"),
            in_progress_work_units=self._int(raw, "in_progress_work_units", "in_progress"),
            pending_work_units=self._int(raw, "pending_work_units", "pending"),
        )

    def _peer_card_entries(self, raw_entries: Any) -> list[PeerCardEntry]:
        if not isinstance(raw_entries, list):
            return []
        entries: list[PeerCardEntry] = []
        for index, raw_entry in enumerate(cast(list[Any], raw_entries)):
            text, sensitive = self._scrubber.scrub_text(str(raw_entry))
            entries.append(
                PeerCardEntry(index=index, text=text or "", sensitive=sensitive)
            )
        return entries

    def _metadata(self, raw: JsonObject) -> JsonObject:
        return self._dict(raw.get("metadata") or raw.get("h_metadata") or {})

    def _configuration_keys(self, raw: JsonObject) -> list[str]:
        configuration = self._dict(raw.get("configuration"))
        return sorted(str(key) for key in configuration)

    def _required_id(self, raw: JsonObject) -> str:
        return str(raw.get("id") or raw.get("name") or raw.get("public_id") or "")

    def _optional_params(self, **values: Any) -> JsonObject:
        return {key: value for key, value in values.items() if value is not None}

    def _dict(self, value: Any) -> JsonObject:
        if isinstance(value, dict):
            return cast(JsonObject, value)
        return {}

    def _optional_str(self, value: Any) -> str | None:
        if value is None:
            return None
        return str(value)

    def _optional_int(self, value: Any) -> int | None:
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _int(self, payload: JsonObject, *keys: str, default: int = 0) -> int:
        for key in keys:
            value = payload.get(key)
            parsed = self._optional_int(value)
            if parsed is not None:
                return parsed
        return default
