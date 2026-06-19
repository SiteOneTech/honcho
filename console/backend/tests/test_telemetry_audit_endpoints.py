import base64
import json
from typing import Any

import jwt
from fastapi.testclient import TestClient
from pydantic import SecretStr

from console.backend.app.main import create_app
from console.backend.app.settings import ConsoleSettings


def _secret(label: str) -> str:
    return f"factory-generated-{label}-credential"


SIGNING_SECRET = _secret("jwt-signing")
BASIC_PASSWORD = _secret("basic-auth")
RAW_TOKEN = jwt.encode({"t": "", "w": "hermes", "p": "Zeus"}, SIGNING_SECRET, algorithm="HS256")


def _basic_auth(username: str = "operator", password: str = BASIC_PASSWORD) -> dict[str, str]:
    encoded = base64.b64encode(f"{username}:{password}".encode()).decode()
    return {"Authorization": f"Basic {encoded}"}


def _settings(**overrides: Any) -> ConsoleSettings:
    values: dict[str, Any] = {
        "basic_auth_username": "operator",
        "basic_auth_password": SecretStr(BASIC_PASSWORD),
        "honcho_api_url": "http://127.0.0.1:8000",
        "honcho_api_token": SecretStr(RAW_TOKEN),
        "jwt_secret": SecretStr(SIGNING_SECRET),
        "honcho_workspace": "hermes",
    }
    values.update(overrides)
    return ConsoleSettings(**values)


def _serialized(value: object) -> str:
    return json.dumps(value, sort_keys=True, default=str)


def _assert_not_serialized(payload: object, *values: str) -> None:
    serialized = _serialized(payload)
    for value in values:
        assert value not in serialized


def test_telemetry_endpoint_requires_auth_and_reports_fingerprint_scope_only():
    client = TestClient(create_app(_settings()))

    denied = client.get("/api/telemetry")
    assert denied.status_code == 401
    _assert_not_serialized(denied.text, RAW_TOKEN, BASIC_PASSWORD, SIGNING_SECRET)

    assert client.get("/api/settings", headers=_basic_auth()).status_code == 200
    assert client.get("/api/agents", headers=_basic_auth()).status_code == 200

    response = client.get("/api/telemetry", headers=_basic_auth())

    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "honcho-memory-console"
    assert body["status"] == "ok"
    assert body["token_fingerprint"].startswith("sha256:")
    assert body["token_scope"] == "peer:hermes/Zeus"
    assert body["totals"]["requests_24h"] >= 3
    assert body["totals"]["requests_1h"] >= 3
    assert body["routes"]
    assert all("fingerprint" not in route for route in body["routes"])
    serialized = _serialized(body)
    assert "authorization" not in serialized.lower()
    assert "request_body" not in serialized
    assert "response_body" not in serialized
    _assert_not_serialized(body, RAW_TOKEN, BASIC_PASSWORD, SIGNING_SECRET)


def test_audit_events_endpoint_records_ok_and_denied_operations_without_bodies_or_secrets():
    client = TestClient(create_app(_settings()))

    assert client.get("/api/settings").status_code == 401
    assert client.get("/api/settings", headers=_basic_auth()).status_code == 200
    assert client.get("/api/telemetry", headers=_basic_auth()).status_code == 200

    response = client.get("/api/audit/events", headers=_basic_auth())

    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "honcho-memory-console"
    assert body["status"] == "ok"
    assert body["total"] >= 3
    assert body["events"]
    outcomes = {event["outcome"] for event in body["events"]}
    assert "denied" in outcomes
    assert "ok" in outcomes
    for event in body["events"]:
        assert event["id"].startswith("audit_")
        assert event["actor"] in {"operator", "unknown"}
        assert event["method"] == "GET"
        assert event["route"].startswith("/api/")
        assert event["token_fingerprint"].startswith("sha256:")
        assert event["token_scope"] == "peer:hermes/Zeus"
        assert "request_body" not in event
        assert "response_body" not in event
        assert "headers" not in event
        assert "authorization" not in _serialized(event).lower()

    _assert_not_serialized(body, RAW_TOKEN, BASIC_PASSWORD, SIGNING_SECRET)


def test_unmatched_api_paths_are_collapsed_before_telemetry_or_audit_persistence():
    client = TestClient(create_app(_settings()))
    raw_path = f"/api/not-found/{RAW_TOKEN}"
    raw_query_secret = f"{SIGNING_SECRET}-{BASIC_PASSWORD}"

    denied = client.get(f"{raw_path}?token={RAW_TOKEN}&secret={raw_query_secret}")
    assert denied.status_code == 401

    missing = client.get(f"{raw_path}?token={RAW_TOKEN}", headers=_basic_auth())
    assert missing.status_code == 404

    telemetry = client.get("/api/telemetry", headers=_basic_auth()).json()
    audit = client.get("/api/audit/events", headers=_basic_auth()).json()
    serialized = _serialized({"telemetry": telemetry, "audit": audit})

    _assert_not_serialized(
        serialized,
        RAW_TOKEN,
        SIGNING_SECRET,
        BASIC_PASSWORD,
        raw_query_secret,
        raw_path,
    )
    assert "/api/unmatched" in {route["route"] for route in telemetry["routes"]}
    unmatched_events = [event for event in audit["events"] if event["route"] == "/api/unmatched"]
    assert unmatched_events
    assert {event["outcome"] for event in unmatched_events} >= {"denied", "error"}
    assert {event["action"] for event in unmatched_events} == {"view.unmatched"}


def test_token_like_path_params_use_route_templates_not_raw_path_values():
    client = TestClient(create_app(_settings()))
    token_like_agent_id = RAW_TOKEN

    response = client.get(f"/api/agents/{token_like_agent_id}", headers=_basic_auth())
    assert response.status_code == 404

    telemetry = client.get("/api/telemetry", headers=_basic_auth()).json()
    audit = client.get("/api/audit/events", headers=_basic_auth()).json()
    serialized = _serialized({"telemetry": telemetry, "audit": audit})

    _assert_not_serialized(serialized, token_like_agent_id, SIGNING_SECRET, BASIC_PASSWORD)
    assert "/api/agents/{agent_id}" in {route["route"] for route in telemetry["routes"]}
    templated_events = [
        event for event in audit["events"] if event["route"] == "/api/agents/{agent_id}"
    ]
    assert templated_events
    assert {event["action"] for event in templated_events} == {"view.agents.agent_id"}
