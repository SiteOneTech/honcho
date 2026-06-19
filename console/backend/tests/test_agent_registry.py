import base64
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from fastapi.testclient import TestClient
from pydantic import SecretStr

from console.backend.app.adapters.token_fingerprint import derive_token_info
from console.backend.app.main import create_app
from console.backend.app.settings import ConsoleSettings


def _secret(label: str) -> str:
    return f"factory-generated-{label}-credential"


SIGNING_SECRET = _secret("jwt-signing")
BASIC_PASSWORD = _secret("basic-auth")


def _jwt(claims: dict[str, Any]) -> str:
    return jwt.encode(claims, SIGNING_SECRET, algorithm="HS256")


def _workspace_jwt(workspace: str = "hermes") -> str:
    return _jwt({"t": "", "w": workspace})


def _basic_auth(username: str = "operator", password: str = BASIC_PASSWORD) -> dict[str, str]:
    encoded = base64.b64encode(f"{username}:{password}".encode()).decode()
    return {"Authorization": f"Basic {encoded}"}


def _settings(**overrides: Any) -> ConsoleSettings:
    values: dict[str, Any] = {
        "basic_auth_username": "operator",
        "basic_auth_password": SecretStr(BASIC_PASSWORD),
        "honcho_api_url": "http://127.0.0.1:8000",
        "honcho_api_token": SecretStr(_workspace_jwt("hermes")),
        "jwt_secret": SecretStr(SIGNING_SECRET),
        "agent_id": "zeus",
        "agent_display_name": "Zeus",
        "tenant_id": "sitiouno-jean",
        "runtime_vm": "honcho-memory-prod",
        "tailnet_ip": "100.71.144.114",
        "environment": "production",
        "honcho_workspace": "hermes",
        "ai_peer": "Zeus",
        "human_peer": "Jean-Garcia",
    }
    values.update(overrides)
    return ConsoleSettings(**values)


def _assert_not_serialized(payload: object, *values: str) -> None:
    serialized = json.dumps(payload, sort_keys=True, default=str)
    for value in values:
        assert value not in serialized


class FleetRegistryFixture:
    def __init__(
        self, rows: list[dict[str, Any]] | None = None, exc: Exception | None = None
    ) -> None:
        self.rows: list[dict[str, Any]] = rows or []
        self.exc: Exception | None = exc
        self.calls: int = 0

    def list_agents(self) -> list[dict[str, Any]]:
        self.calls += 1
        if self.exc is not None:
            raise self.exc
        return self.rows


def test_token_fingerprint_scope_status_matrix_without_returning_secret_values():
    admin = derive_token_info(
        _jwt({"t": "", "ad": True}),
        expected_workspace="hermes",
        signing_secret=SIGNING_SECRET,
    )
    peer = derive_token_info(
        _jwt({"t": "", "w": "hermes", "p": "Zeus"}),
        expected_workspace="hermes",
        signing_secret=SIGNING_SECRET,
    )
    session = derive_token_info(
        _jwt({"t": "", "w": "hermes", "s": "session-1"}),
        expected_workspace="hermes",
        signing_secret=SIGNING_SECRET,
    )
    expired = derive_token_info(
        _jwt({"t": "", "w": "hermes", "exp": (datetime.now(UTC) - timedelta(minutes=1)).isoformat()}),
        expected_workspace="hermes",
        signing_secret=SIGNING_SECRET,
    )
    mis_scoped = derive_token_info(
        _jwt({"t": "", "w": "other-workspace"}),
        expected_workspace="hermes",
        signing_secret=SIGNING_SECRET,
    )
    opaque = derive_token_info(
        _secret("opaque-honcho"),
        expected_workspace="hermes",
        signing_secret=SIGNING_SECRET,
    )

    assert admin.scope == "admin"
    assert admin.status == "valid"
    assert peer.scope == "peer:hermes/Zeus"
    assert peer.status == "valid"
    assert session.scope == "session:hermes/session-1"
    assert session.status == "valid"
    assert expired.scope == "workspace:hermes"
    assert expired.status == "expired"
    assert mis_scoped.scope == "workspace:other-workspace"
    assert mis_scoped.status == "mis-scoped"
    assert opaque.scope == "unknown"
    assert opaque.status == "unknown"
    assert admin.fingerprint is not None
    assert admin.fingerprint.startswith("sha256:")
    _assert_not_serialized(
        [admin.model_dump(), peer.model_dump(), session.model_dump(), expired.model_dump(), mis_scoped.model_dump(), opaque.model_dump()],
        SIGNING_SECRET,
        _secret("opaque-honcho"),
    )


def test_agents_endpoint_falls_back_to_honcho_config_with_required_operational_fields():
    api_token = _workspace_jwt("hermes")
    client = TestClient(create_app(_settings(honcho_api_token=SecretStr(api_token))))

    response = client.get("/api/agents", headers=_basic_auth())

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    agent = body["agents"][0]
    assert agent["agent_id"] == "zeus"
    assert agent["display_name"] == "Zeus"
    assert agent["tenant_id"] == "sitiouno-jean"
    assert agent["runtime_vm"] == "honcho-memory-prod"
    assert agent["tailnet_ip"] == "100.71.144.114"
    assert agent["environment"] == "production"
    assert agent["honcho_workspace"] == "hermes"
    assert agent["ai_peer"] == "Zeus"
    assert agent["human_peer"] == "Jean-Garcia"
    assert agent["token_fingerprint"].startswith("sha256:")
    assert agent["token_scope"] == "workspace:hermes"
    assert agent["token_status"] == "valid"
    assert agent["memory_counts"] == {
        "sessions": None,
        "messages": None,
        "documents": None,
        "conclusions": None,
        "peer_card_entries": None,
    }
    assert agent["queue_state"] == {
        "pending": None,
        "in_progress": None,
        "completed": None,
        "errors": None,
        "status": "unknown",
    }
    assert agent["api_activity"]["requests_1h"] is None
    assert agent["vm_health"]["status"] == "unknown"
    assert agent["alerts"] == []
    assert agent["sources"] == ["honcho_config"]
    _assert_not_serialized(body, api_token, BASIC_PASSWORD, SIGNING_SECRET)


def test_fleet_registry_entries_take_precedence_and_sanitize_registry_tokens():
    registry_token = _jwt({"t": "", "w": "agent-workspace", "p": "worker-peer"})
    fleet = FleetRegistryFixture(
        rows=[
            {
                "agent_id": "worker-alpha",
                "display_name": "Worker Alpha",
                "tenant_id": "sitiouno",
                "runtime_vm": "worker-vm-01",
                "tailnet_ip": "100.64.0.55",
                "environment": "production",
                "honcho_workspace": "agent-workspace",
                "ai_peer": "worker-peer",
                "human_peer": "Jean-Garcia",
                "token": registry_token,
                "token_scope": "peer:agent-workspace/worker-peer",
                "memory_counts": {"sessions": 2, "messages": 7, "documents": 3, "conclusions": 4, "peer_card_entries": 1},
                "queue_state": {"pending": 1, "in_progress": 0, "completed": 8, "errors": 0, "status": "pending"},
                "alerts": ["queue_pending"],
            }
        ]
    )
    client = TestClient(
        create_app(
            _settings(fleet_registry_database_url=SecretStr(_secret("fleet-db-url"))),
            fleet_registry_adapter=fleet,
        )
    )

    response = client.get("/api/agents", headers=_basic_auth())

    assert response.status_code == 200
    body = response.json()
    assert fleet.calls == 1
    assert body["total"] == 1
    agent = body["agents"][0]
    assert agent["agent_id"] == "worker-alpha"
    assert agent["display_name"] == "Worker Alpha"
    assert agent["runtime_vm"] == "worker-vm-01"
    assert agent["token_fingerprint"].startswith("sha256:")
    assert agent["token_scope"] == "peer:agent-workspace/worker-peer"
    assert agent["token_status"] == "valid"
    assert agent["memory_counts"]["messages"] == 7
    assert agent["queue_state"]["pending"] == 1
    assert agent["alerts"] == [
        {
            "code": "queue_pending",
            "message": "Queue has pending derivation work.",
            "severity": "warning",
            "source": "fleet_registry",
        }
    ]
    assert agent["sources"] == ["fleet_registry"]
    _assert_not_serialized(body, registry_token, _secret("fleet-db-url"), BASIC_PASSWORD)


def test_fleet_registry_rejects_noncanonical_token_fingerprint_without_leaking_it():
    raw_looking_sentinel = _jwt({"t": "", "w": "agent-workspace"})
    fleet = FleetRegistryFixture(
        rows=[
            {
                "agent_id": "worker-alpha",
                "display_name": "Worker Alpha",
                "tenant_id": "sitiouno",
                "runtime_vm": "worker-vm-01",
                "honcho_workspace": "agent-workspace",
                "ai_peer": "worker-peer",
                "token_fingerprint": raw_looking_sentinel,
                "token_scope": "workspace:agent-workspace",
                "token_status": "valid",
            }
        ]
    )
    client = TestClient(
        create_app(
            _settings(fleet_registry_database_url=SecretStr(_secret("fleet-db-url"))),
            fleet_registry_adapter=fleet,
        )
    )

    list_response = client.get("/api/agents", headers=_basic_auth())
    detail_response = client.get("/api/agents/worker-alpha", headers=_basic_auth())

    assert list_response.status_code == 200
    list_body = list_response.json()
    list_agent = list_body["agents"][0]
    assert list_agent["token_fingerprint"] is None
    assert list_agent["token_scope"] == "unknown"
    assert list_agent["token_status"] == "unknown"
    assert any(
        alert["code"] == "fleet_registry_token_fingerprint_invalid"
        for alert in list_agent["alerts"]
    )
    _assert_not_serialized(list_body, raw_looking_sentinel, _secret("fleet-db-url"))

    assert detail_response.status_code == 200
    detail_body = detail_response.json()
    detail_agent = detail_body["agent"]
    assert detail_agent["token_fingerprint"] is None
    assert detail_agent["token_scope"] == "unknown"
    assert detail_agent["token_status"] == "unknown"
    assert any(
        alert["code"] == "fleet_registry_token_fingerprint_invalid"
        for alert in detail_agent["alerts"]
    )
    _assert_not_serialized(detail_body, raw_looking_sentinel, _secret("fleet-db-url"))


def test_fleet_registry_alert_strings_are_suppressed_without_leaking_text():
    alert_marker = "synthetic-alert-marker-string-6b72787d"
    fleet = FleetRegistryFixture(
        rows=[
            {
                "agent_id": "worker-alpha",
                "display_name": "Worker Alpha",
                "honcho_workspace": "agent-workspace",
                "alerts": [alert_marker],
            }
        ]
    )
    client = TestClient(
        create_app(
            _settings(fleet_registry_database_url=SecretStr(_secret("fleet-db-url"))),
            fleet_registry_adapter=fleet,
        )
    )

    list_response = client.get("/api/agents", headers=_basic_auth())
    detail_response = client.get("/api/agents/worker-alpha", headers=_basic_auth())

    assert list_response.status_code == 200
    assert detail_response.status_code == 200
    list_body = list_response.json()
    detail_body = detail_response.json()
    assert any(
        alert["code"] == "fleet_registry_alert_suppressed"
        for alert in list_body["agents"][0]["alerts"]
    )
    assert any(
        alert["code"] == "fleet_registry_alert_suppressed"
        for alert in detail_body["agent"]["alerts"]
    )
    _assert_not_serialized(list_body, alert_marker, _secret("fleet-db-url"))
    _assert_not_serialized(detail_body, alert_marker, _secret("fleet-db-url"))


def test_fleet_registry_alert_mapping_messages_are_replaced_by_canonical_text():
    alert_marker = "synthetic-alert-marker-mapping-c0ecf7bf"
    fleet = FleetRegistryFixture(
        rows=[
            {
                "agent_id": "worker-alpha",
                "display_name": "Worker Alpha",
                "honcho_workspace": "agent-workspace",
                "alerts": [
                    {
                        "code": "queue_pending",
                        "message": alert_marker,
                        "severity": "critical",
                        "source": alert_marker,
                    }
                ],
            }
        ]
    )
    client = TestClient(
        create_app(
            _settings(fleet_registry_database_url=SecretStr(_secret("fleet-db-url"))),
            fleet_registry_adapter=fleet,
        )
    )

    list_response = client.get("/api/agents", headers=_basic_auth())
    detail_response = client.get("/api/agents/worker-alpha", headers=_basic_auth())

    assert list_response.status_code == 200
    assert detail_response.status_code == 200
    list_body = list_response.json()
    detail_body = detail_response.json()
    assert list_body["agents"][0]["alerts"] == [
        {
            "code": "queue_pending",
            "message": "Queue has pending derivation work.",
            "severity": "critical",
            "source": "fleet_registry",
        }
    ]
    assert detail_body["agent"]["alerts"] == list_body["agents"][0]["alerts"]
    _assert_not_serialized(list_body, alert_marker, _secret("fleet-db-url"))
    _assert_not_serialized(detail_body, alert_marker, _secret("fleet-db-url"))


def test_fleet_registry_failure_degrades_to_config_discovery_fallback():
    fleet = FleetRegistryFixture(exc=RuntimeError("registry unavailable"))
    client = TestClient(
        create_app(
            _settings(fleet_registry_database_url=SecretStr(_secret("fleet-db-url"))),
            fleet_registry_adapter=fleet,
        )
    )

    response = client.get("/api/agents", headers=_basic_auth())

    assert response.status_code == 200
    body = response.json()
    assert fleet.calls == 1
    assert body["total"] == 1
    agent = body["agents"][0]
    assert agent["agent_id"] == "zeus"
    assert agent["sources"] == ["honcho_config"]
    assert any(alert["code"] == "fleet_registry_unavailable" for alert in body["alerts"])
    assert any(alert["code"] == "fleet_registry_unavailable" for alert in agent["alerts"])
    _assert_not_serialized(body, "registry unavailable", _secret("fleet-db-url"))


def test_agent_detail_route_is_authenticated_sanitized_and_returns_404_for_unknown_agent():
    api_token = _workspace_jwt("hermes")
    client = TestClient(create_app(_settings(honcho_api_token=SecretStr(api_token))))

    unauthenticated = client.get("/api/agents/zeus")
    assert unauthenticated.status_code == 401
    _assert_not_serialized(unauthenticated.text, BASIC_PASSWORD, api_token)

    detail = client.get("/api/agents/zeus", headers=_basic_auth())
    assert detail.status_code == 200
    assert detail.json()["agent"]["agent_id"] == "zeus"
    _assert_not_serialized(detail.json(), BASIC_PASSWORD, api_token, SIGNING_SECRET)

    missing = client.get("/api/agents/missing-agent", headers=_basic_auth())
    assert missing.status_code == 404
    _assert_not_serialized(missing.json(), BASIC_PASSWORD, api_token, SIGNING_SECRET)
