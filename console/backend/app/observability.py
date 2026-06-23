"""Token-safe request telemetry and audit trail primitives.

The console observes its own browser-facing API as a fallback when upstream Honcho
per-token metrics are unavailable. The implementation deliberately stores only
request metadata that is safe for operators to see: method, route template, status,
latency, token fingerprint, and token scope. It never reads or persists request
bodies, response bodies, Authorization headers, raw tokens, or secret values.
"""

from __future__ import annotations

import math
import re
import time
from collections import defaultdict, deque
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from threading import RLock
from typing import Any, Literal, cast
from urllib.parse import unquote

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import Match
from starlette.types import ASGIApp

from console.backend.app.adapters.token_fingerprint import derive_token_info
from console.backend.app.models import (
    AgentApiActivity,
    AuditEvent,
    AuditEventsResponse,
    AuditOutcome,
    TelemetryResponse,
    TelemetryRouteStat,
)

__all__ = ["AuditTrail", "RequestObservabilityMiddleware", "TelemetryRecorder"]

Clock = Callable[[], datetime]
_REDACTED_ROUTE_SEGMENT = "[REDACTED]"
_UNMATCHED_API_ROUTE = "/api/unmatched"
_JWT_LIKE_RE = re.compile(r"^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$")
_HEX_DIGEST_RE = re.compile(r"^[0-9a-fA-F]{32,}$")
_LONG_BASE64URL_RE = re.compile(r"^[A-Za-z0-9_-]{32,}={0,2}$")
_SECRET_PREFIXES = (
    "bearer",
    "ghp_",
    "gho_",
    "ghu_",
    "ghs_",
    "glpat-",
    "hf_",
    "sk-",
    "xoxb-",
    "xoxp-",
)


@dataclass(frozen=True)
class _TelemetrySample:
    at: datetime
    method: str
    route: str
    status_code: int
    latency_ms: float


class TelemetryRecorder:
    """Bounded in-memory fallback telemetry tagged by token fingerprint/scope.

    The raw token is accepted only long enough to derive a non-reversible
    fingerprint and coarse scope. It is not assigned to an instance attribute and
    therefore is not retained by the recorder.
    """

    def __init__(
        self,
        *,
        token: object | None,
        expected_workspace: str | None,
        signing_secret: str | None,
        max_samples: int = 10_000,
        clock: Clock | None = None,
    ) -> None:
        token_info = derive_token_info(
            token,
            expected_workspace=expected_workspace,
            signing_secret=signing_secret,
        )
        self._token_fingerprint: str | None = token_info.fingerprint
        self._token_scope: str = token_info.scope
        self._clock: Clock = clock or _utc_now
        self._samples: deque[_TelemetrySample] = deque(maxlen=max(1, max_samples))
        self._lock: Any = RLock()

    @property
    def token_fingerprint(self) -> str | None:
        """Return the configured token fingerprint, never the raw token."""

        return self._token_fingerprint

    @property
    def token_scope(self) -> str:
        """Return the configured token scope or ``unknown``."""

        return self._token_scope

    def record(
        self,
        *,
        method: str,
        route: str,
        status_code: int,
        latency_ms: float,
    ) -> None:
        """Record safe request metadata.

        No parameter accepts request/response bodies, headers, Authorization
        values, raw tokens, or other secret-bearing material.
        """

        sample = _TelemetrySample(
            at=_ensure_utc(self._clock()),
            method=method.upper(),
            route=_safe_route(route),
            status_code=int(status_code),
            latency_ms=max(float(latency_ms), 0.0),
        )
        with self._lock:
            self._samples.append(sample)

    def snapshot(self) -> TelemetryResponse:
        """Return current 1h/24h aggregates and per-route fallback metrics."""

        now = _ensure_utc(self._clock())
        one_hour_ago = now - timedelta(hours=1)
        one_day_ago = now - timedelta(hours=24)
        with self._lock:
            samples = list(self._samples)

        samples_24h = [sample for sample in samples if sample.at >= one_day_ago]
        samples_1h = [sample for sample in samples_24h if sample.at >= one_hour_ago]
        routes: dict[str, list[_TelemetrySample]] = defaultdict(list)
        for sample in samples_24h:
            routes[sample.route].append(sample)

        return TelemetryResponse(
            status="ok",
            generated_at=now.replace(microsecond=0).isoformat(),
            token_fingerprint=self._token_fingerprint,
            token_scope=self._token_scope,
            totals=AgentApiActivity(
                requests_1h=len(samples_1h),
                requests_24h=len(samples_24h),
                error_rate=_error_rate(samples_24h),
                p95_latency_ms=_p95_latency_ms(samples_24h),
            ),
            routes=[
                TelemetryRouteStat(
                    route=route,
                    requests=len(route_samples),
                    errors=_error_count(route_samples),
                    error_rate=_error_rate(route_samples),
                    p95_latency_ms=_p95_latency_ms(route_samples),
                )
                for route, route_samples in routes.items()
            ],
        )


class AuditTrail:
    """Bounded in-memory audit trail for console operations.

    The recording API is intentionally narrow so callers cannot pass raw request
    or response bodies, headers, raw tokens, or secret-bearing payloads.
    """

    def __init__(
        self,
        *,
        token_fingerprint: str | None,
        token_scope: str,
        max_events: int = 1_000,
        clock: Clock | None = None,
    ) -> None:
        self._token_fingerprint: str | None = token_fingerprint
        self._token_scope: str = token_scope
        self._clock: Clock = clock or _utc_now
        self._events: deque[AuditEvent] = deque(maxlen=max(1, max_events))
        self._lock: Any = RLock()
        self._sequence: int = 0

    def record(
        self,
        *,
        actor: Literal["operator", "unknown"],
        action: str,
        outcome: AuditOutcome,
        route: str,
        method: str,
        status_code: int,
    ) -> None:
        """Append one sanitized audit event."""

        at = _ensure_utc(self._clock()).replace(microsecond=0)
        with self._lock:
            self._sequence += 1
            event_id = f"audit_{at.strftime('%Y%m%dT%H%M%SZ')}_{self._sequence:06d}"
            self._events.append(
                AuditEvent(
                    id=event_id,
                    at=at.isoformat(),
                    actor=actor,
                    action=_safe_action(action),
                    outcome=outcome,
                    route=_safe_route(route),
                    method=method.upper(),
                    status_code=int(status_code),
                    token_fingerprint=self._token_fingerprint,
                    token_scope=self._token_scope,
                )
            )

    def snapshot(self) -> AuditEventsResponse:
        """Return newest-first retained audit events."""

        with self._lock:
            events = list(reversed(self._events))
        return AuditEventsResponse(status="ok", total=len(events), events=events)


class RequestObservabilityMiddleware(BaseHTTPMiddleware):
    """Record sanitized telemetry and audit events for browser-facing API calls."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        telemetry: TelemetryRecorder,
        audit_trail: AuditTrail,
    ) -> None:
        super().__init__(app)
        self._telemetry: TelemetryRecorder = telemetry
        self._audit_trail: AuditTrail = audit_trail

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        if not _is_console_api_path(request.url.path):
            return await call_next(request)

        started = time.perf_counter()
        status_code = 500
        route = _request_route_template_or_unmatched(request)
        try:
            response = await call_next(request)
            status_code = response.status_code
            route = _route_template(request) or route
            return response
        except Exception:
            route = _route_template(request) or route
            raise
        finally:
            latency_ms = (time.perf_counter() - started) * 1000
            outcome = _outcome_from_status(status_code)
            actor: Literal["operator", "unknown"] = (
                "unknown" if outcome == "denied" else "operator"
            )
            safe_route = _safe_route(route)
            self._telemetry.record(
                method=request.method,
                route=safe_route,
                status_code=status_code,
                latency_ms=latency_ms,
            )
            self._audit_trail.record(
                actor=actor,
                action=_action_from_route(request.method, safe_route),
                outcome=outcome,
                route=safe_route,
                method=request.method,
                status_code=status_code,
            )


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _route_template(request: Request) -> str | None:
    route = request.scope.get("route")
    path = getattr(route, "path", None)
    return path if isinstance(path, str) else None


def _request_route_template_or_unmatched(request: Request) -> str:
    """Resolve a route template without persisting the raw request path.

    Auth middleware can deny a request before FastAPI writes ``scope["route"]``.
    In that case, inspect the app route table to recover a safe template for
    matched API routes. If the request does not match any route, collapse it to a
    fixed sentinel instead of recording attacker-controlled path segments.
    """

    template = _route_template(request) or _matched_route_template(request)
    return _safe_route(template) if template is not None else _UNMATCHED_API_ROUTE


def _matched_route_template(request: Request) -> str | None:
    routes = getattr(getattr(request, "app", None), "routes", ())
    for route in routes:
        matches = getattr(route, "matches", None)
        if not callable(matches):
            continue
        try:
            match_result: Any = matches(request.scope)
        except Exception:
            continue
        match: Match | None = None
        if isinstance(match_result, tuple) and match_result:
            candidate: object = cast(tuple[object, ...], match_result)[0]
            match = candidate if isinstance(candidate, Match) else None
        if match == Match.FULL:
            path = getattr(route, "path", None)
            return path if isinstance(path, str) else None
    return None


def _is_console_api_path(path: str) -> bool:
    return path == "/api" or path.startswith("/api/")


def _safe_route(route: str | None) -> str:
    path = str(route or _UNMATCHED_API_ROUTE).split("?", 1)[0].split("#", 1)[0].strip()
    if not path or path == "/api/unknown":
        path = _UNMATCHED_API_ROUTE
    if not path.startswith("/"):
        path = f"/{path}"
    segments = [_safe_route_segment(segment) for segment in path.split("/")]
    sanitized = "/".join(segments)
    return sanitized or _UNMATCHED_API_ROUTE


def _safe_route_segment(segment: str) -> str:
    if not segment:
        return segment
    if segment.startswith("{") and segment.endswith("}"):
        return segment
    decoded = unquote(segment).strip()
    return _REDACTED_ROUTE_SEGMENT if _is_secret_like_segment(decoded) else segment


def _is_secret_like_segment(segment: str) -> bool:
    lowered = segment.lower()
    if _JWT_LIKE_RE.match(segment):
        return True
    if _HEX_DIGEST_RE.match(segment):
        return True
    if _LONG_BASE64URL_RE.match(segment):
        return True
    return len(segment) >= 16 and lowered.startswith(_SECRET_PREFIXES)


def _safe_action(action: str) -> str:
    text = action.strip()
    return text if text else "api.unknown"


def _action_from_route(method: str, route: str) -> str:
    normalized = route.removeprefix("/api").strip("/") or "root"
    normalized = normalized.replace("/", ".").replace("{", "").replace("}", "")
    prefix = "view" if method.upper() == "GET" else method.lower()
    return f"{prefix}.{normalized}"


def _outcome_from_status(status_code: int) -> AuditOutcome:
    if status_code in {401, 403}:
        return "denied"
    if status_code >= 400:
        return "error"
    return "ok"


def _error_count(samples: list[_TelemetrySample]) -> int:
    return sum(1 for sample in samples if sample.status_code >= 400)


def _error_rate(samples: list[_TelemetrySample]) -> float | None:
    if not samples:
        return None
    return _error_count(samples) / len(samples)


def _p95_latency_ms(samples: list[_TelemetrySample]) -> float | None:
    if not samples:
        return None
    values = sorted(sample.latency_ms for sample in samples)
    index = min(len(values) - 1, max(0, math.ceil(len(values) * 0.95) - 1))
    return values[index]
