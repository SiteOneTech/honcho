import inspect
import json
from datetime import UTC, datetime, timedelta

import jwt
from pydantic import SecretStr

from console.backend.app.observability import AuditTrail, TelemetryRecorder


def _secret(label: str) -> str:
    return f"factory-generated-{label}-credential"


SIGNING_SECRET = _secret("jwt-signing")
RAW_TOKEN = jwt.encode({"t": "", "w": "hermes", "p": "Zeus"}, SIGNING_SECRET, algorithm="HS256")


def _serialized(value: object) -> str:
    return json.dumps(value, sort_keys=True, default=str)


class MutableClock:
    def __init__(self, now: datetime) -> None:
        self.now: datetime = now

    def __call__(self) -> datetime:
        return self.now

    def advance(self, delta: timedelta) -> None:
        self.now = self.now + delta


def test_telemetry_recorder_aggregates_windows_without_storing_raw_token_values():
    clock = MutableClock(datetime(2026, 6, 19, 16, 0, tzinfo=UTC))
    recorder = TelemetryRecorder(
        token=SecretStr(RAW_TOKEN),
        expected_workspace="hermes",
        signing_secret=SIGNING_SECRET,
        max_samples=10,
        clock=clock,
    )

    recorder.record(method="GET", route="/api/settings", status_code=200, latency_ms=18.0)
    recorder.record(method="GET", route="/api/settings", status_code=500, latency_ms=122.0)
    clock.advance(timedelta(hours=2))
    recorder.record(method="POST", route="/api/agents", status_code=201, latency_ms=44.0)

    snapshot = recorder.snapshot()

    assert snapshot.token_fingerprint is not None
    assert snapshot.token_fingerprint.startswith("sha256:")
    assert snapshot.token_scope == "peer:hermes/Zeus"
    assert snapshot.totals.requests_1h == 1
    assert snapshot.totals.requests_24h == 3
    assert snapshot.totals.error_rate == 1 / 3
    assert snapshot.totals.p95_latency_ms == 122.0
    assert {route.route for route in snapshot.routes} == {"/api/settings", "/api/agents"}
    assert RAW_TOKEN not in _serialized(snapshot.model_dump(mode="json"))
    assert SIGNING_SECRET not in _serialized(snapshot.model_dump(mode="json"))


def test_telemetry_recorder_is_bounded_and_exposes_fingerprint_scope_only():
    recorder = TelemetryRecorder(
        token=RAW_TOKEN,
        expected_workspace="hermes",
        signing_secret=SIGNING_SECRET,
        max_samples=2,
        clock=lambda: datetime(2026, 6, 19, 16, 0, tzinfo=UTC),
    )

    recorder.record(method="GET", route="/api/one", status_code=200, latency_ms=1.0)
    recorder.record(method="GET", route="/api/two", status_code=200, latency_ms=2.0)
    recorder.record(method="GET", route="/api/three", status_code=404, latency_ms=3.0)

    snapshot = recorder.snapshot()

    assert snapshot.totals.requests_24h == 2
    assert [route.route for route in snapshot.routes] == ["/api/two", "/api/three"]
    assert snapshot.token_scope == "peer:hermes/Zeus"
    serialized = _serialized(snapshot.model_dump(mode="json"))
    assert RAW_TOKEN not in serialized
    assert "authorization" not in serialized.lower()
    assert "body" not in serialized.lower()


def test_audit_trail_records_console_operations_without_body_or_secret_fields():
    trail = AuditTrail(
        token_fingerprint="sha256:abc123def4567890",
        token_scope="workspace:hermes",
        max_events=3,
        clock=lambda: datetime(2026, 6, 19, 16, 0, tzinfo=UTC),
    )

    signature = inspect.signature(trail.record)
    disallowed_parameters = {"body", "request_body", "response_body", "headers", "authorization", "token", "secret"}
    assert disallowed_parameters.isdisjoint(signature.parameters)

    trail.record(actor="operator", action="view.settings", outcome="ok", route="/api/settings", method="GET", status_code=200)
    trail.record(actor="unknown", action="view.agents", outcome="denied", route="/api/agents", method="GET", status_code=401)
    trail.record(actor="operator", action="view.telemetry", outcome="ok", route="/api/telemetry", method="GET", status_code=200)
    trail.record(actor="operator", action="view.audit", outcome="ok", route="/api/audit/events", method="GET", status_code=200)

    snapshot = trail.snapshot()

    assert snapshot.total == 3
    assert [event.action for event in snapshot.events] == ["view.audit", "view.telemetry", "view.agents"]
    assert [event.outcome for event in snapshot.events] == ["ok", "ok", "denied"]
    serialized = _serialized(snapshot.model_dump(mode="json"))
    assert RAW_TOKEN not in serialized
    assert SIGNING_SECRET not in serialized
    assert "response_body" not in serialized
    assert "request_body" not in serialized
    assert "authorization" not in serialized.lower()
    for event in snapshot.events:
        assert event.token_fingerprint == "sha256:abc123def4567890"
        assert event.token_scope == "workspace:hermes"
