import base64
import json
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from console.backend.app.adapters.honcho_api import HonchoAPIAdapter
from console.backend.app.main import create_app
from console.backend.app.settings import ConsoleSettings

RAW_TOKEN = "honcho-api-token-raw"
BASIC_PASSWORD = "basic-auth-secret"
JWT_SECRET = "console-jwt-secret-raw"


def _basic_auth(username: str = "operator", password: str = BASIC_PASSWORD) -> dict[str, str]:
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def _settings() -> ConsoleSettings:
    return ConsoleSettings(
        basic_auth_username="operator",
        basic_auth_password=SecretStr(BASIC_PASSWORD),
        honcho_api_url="http://honcho.local",
        honcho_api_token=SecretStr(RAW_TOKEN),
        jwt_secret=SecretStr(JWT_SECRET),
        database_url=SecretStr("postgresql://honcho:db-password-raw@db:5432/honcho"),
        infisical_token=SecretStr("infisical-token-raw"),
    )


def _page(items: list[dict[str, Any]]) -> dict[str, Any]:
    return {"items": items, "total": len(items), "page": 1, "size": 50, "pages": 1}


def _assert_no_raw_secrets(value: object) -> None:
    serialized = json.dumps(value, sort_keys=True, default=str)
    for raw in (
        RAW_TOKEN,
        BASIC_PASSWORD,
        JWT_SECRET,
        "db-password-raw",
        "infisical-token-raw",
        "Authorization: Bearer",
    ):
        assert raw not in serialized


@pytest.mark.asyncio
async def test_honcho_api_adapter_fetches_memory_surfaces_and_sanitizes_data():
    seen_authorizations: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen_authorizations.append(request.headers.get("authorization"))
        path = request.url.path
        if request.method == "GET" and path == "/health":
            return httpx.Response(200, json={"status": "ok"})
        if request.method == "POST" and path == "/v3/workspaces/list":
            return httpx.Response(
                200,
                json=_page(
                    [
                        {
                            "id": "hermes",
                            "metadata": {"owner": "Jean", "token": RAW_TOKEN},
                            "configuration": {"deriver": {"enabled": True}},
                            "created_at": "2026-06-19T00:00:00Z",
                        }
                    ]
                ),
            )
        if request.method == "GET" and path == "/v3/workspaces/hermes/queue/status":
            return httpx.Response(
                200,
                json={
                    "total_work_units": 3,
                    "completed_work_units": 1,
                    "in_progress_work_units": 1,
                    "pending_work_units": 1,
                    "sessions": {
                        "session-a": {
                            "total_work_units": 3,
                            "completed_work_units": 1,
                            "in_progress_work_units": 1,
                            "pending_work_units": 1,
                        }
                    },
                },
            )
        if request.method == "POST" and path == "/v3/workspaces/hermes/peers/list":
            return httpx.Response(
                200,
                json=_page(
                    [
                        {
                            "id": "Zeus",
                            "workspace_id": "hermes",
                            "metadata": {"role": "orchestrator"},
                            "configuration": {"secret": RAW_TOKEN},
                            "created_at": "2026-06-19T00:01:00Z",
                        }
                    ]
                ),
            )
        if request.method == "GET" and path == "/v3/workspaces/hermes/peers/Zeus/card":
            return httpx.Response(
                200,
                json={"peer_card": ["Jean prefers concise ops", f"never show {RAW_TOKEN}"]},
            )
        if request.method == "POST" and path == "/v3/workspaces/hermes/peers/Zeus/representation":
            return httpx.Response(
                200,
                json={"representation": f"operator memory includes {RAW_TOKEN}"},
            )
        if request.method == "GET" and path == "/v3/workspaces/hermes/peers/Zeus/context":
            return httpx.Response(
                200,
                json={
                    "peer_id": "Zeus",
                    "target_id": "Jean",
                    "representation": f"context contains {RAW_TOKEN}",
                    "peer_card": ["trusted operator"],
                },
            )
        if request.method == "POST" and path == "/v3/workspaces/hermes/sessions/list":
            return httpx.Response(
                200,
                json=_page(
                    [
                        {
                            "id": "session-a",
                            "workspace_id": "hermes",
                            "is_active": True,
                            "metadata": {"topic": "ops"},
                            "configuration": {"summary": {"enabled": True}},
                            "created_at": "2026-06-19T00:02:00Z",
                        }
                    ]
                ),
            )
        if request.method == "POST" and path == "/v3/workspaces/hermes/sessions/session-a/messages/list":
            return httpx.Response(
                200,
                json=_page(
                    [
                        {
                            "id": "msg-1",
                            "workspace_id": "hermes",
                            "session_id": "session-a",
                            "peer_id": "Jean",
                            "content": f"private message with {RAW_TOKEN}",
                            "metadata": {"authorization": f"Bearer {RAW_TOKEN}"},
                            "created_at": "2026-06-19T00:03:00Z",
                            "token_count": 5,
                        }
                    ]
                ),
            )
        if request.method == "POST" and path == "/v3/workspaces/hermes/conclusions/list":
            return httpx.Response(
                200,
                json=_page(
                    [
                        {
                            "id": "conclusion-1",
                            "content": f"Jean owns SitioUno and {RAW_TOKEN}",
                            "observer_id": "Zeus",
                            "observed_id": "Jean",
                            "session_id": "session-a",
                            "created_at": "2026-06-19T00:04:00Z",
                        }
                    ]
                ),
            )
        if request.method == "POST" and path == "/v3/workspaces/hermes/conclusions/query":
            body = json.loads(request.content.decode())
            assert body == {
                "query": "SitioUno",
                "top_k": 3,
                "filters": {"observer_id": "Zeus"},
            }
            return httpx.Response(
                200,
                json=[
                    {
                        "id": "query-conclusion-1",
                        "content": f"semantic result includes {RAW_TOKEN}",
                        "observer_id": "Zeus",
                        "observed_id": "Jean",
                        "session_id": "session-a",
                        "created_at": "2026-06-19T00:05:00Z",
                    }
                ],
            )
        raise AssertionError(f"unexpected request: {request.method} {path}")

    client = httpx.AsyncClient(
        base_url="http://honcho.local",
        transport=httpx.MockTransport(handler),
    )
    adapter = HonchoAPIAdapter(_settings(), client=client)

    health = await adapter.health()
    workspaces = await adapter.list_workspaces()
    queue = await adapter.get_queue_status("hermes")
    peers = await adapter.list_peers("hermes")
    peer_card = await adapter.get_peer_card("hermes", "Zeus", target="Jean")
    representation = await adapter.get_peer_representation("hermes", "Zeus", target="Jean")
    context = await adapter.get_peer_context("hermes", "Zeus", target="Jean")
    sessions = await adapter.list_sessions("hermes")
    messages = await adapter.list_messages("hermes", "session-a")
    conclusions = await adapter.list_conclusions("hermes")
    queried_conclusions = await adapter.query_conclusions(
        "hermes",
        query="SitioUno",
        filters={"observer_id": "Zeus"},
        top_k=3,
    )

    assert health.status == "healthy"
    assert workspaces.items[0].id == "hermes"
    assert workspaces.items[0].metadata["token"] == "[REDACTED]"
    assert queue.pending_work_units == 1
    assert peers.items[0].configuration_keys == ["secret"]
    assert peer_card.entries[1].text == "never show [REDACTED]"
    assert representation.sensitive is True
    assert representation.representation == "operator memory includes [REDACTED]"
    assert context.representation == "context contains [REDACTED]"
    assert sessions.items[0].id == "session-a"
    assert messages.items[0].content_hidden is True
    assert messages.items[0].content_preview is None
    assert messages.items[0].metadata["authorization"] == "[REDACTED]"
    assert conclusions.items[0].content_preview == "Jean owns SitioUno and [REDACTED]"
    assert queried_conclusions.total == 1
    assert queried_conclusions.items[0].content_preview == "semantic result includes [REDACTED]"
    assert all(header == f"Bearer {RAW_TOKEN}" for header in seen_authorizations)
    _assert_no_raw_secrets(
        [
            health.model_dump(mode="json"),
            workspaces.model_dump(mode="json"),
            queue.model_dump(mode="json"),
            peers.model_dump(mode="json"),
            peer_card.model_dump(mode="json"),
            representation.model_dump(mode="json"),
            context.model_dump(mode="json"),
            sessions.model_dump(mode="json"),
            messages.model_dump(mode="json"),
            conclusions.model_dump(mode="json"),
            queried_conclusions.model_dump(mode="json"),
        ]
    )

    await client.aclose()


def test_console_memory_endpoints_return_typed_sanitized_payloads():
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if request.method == "GET" and path == "/health":
            return httpx.Response(200, json={"status": "ok"})
        if request.method == "POST" and path == "/v3/workspaces/list":
            return httpx.Response(200, json=_page([{"id": "hermes", "created_at": "2026-06-19T00:00:00Z"}]))
        if request.method == "GET" and path == "/v3/workspaces/hermes/queue/status":
            return httpx.Response(200, json={"total_work_units": 0, "completed_work_units": 0, "in_progress_work_units": 0, "pending_work_units": 0})
        if request.method == "POST" and path == "/v3/workspaces/hermes/peers/list":
            return httpx.Response(200, json=_page([{"id": "Zeus", "workspace_id": "hermes", "created_at": "2026-06-19T00:01:00Z"}]))
        if request.method == "GET" and path == "/v3/workspaces/hermes/peers/Zeus/card":
            return httpx.Response(200, json={"peer_card": [f"card {RAW_TOKEN}"]})
        if request.method == "POST" and path == "/v3/workspaces/hermes/peers/Zeus/representation":
            return httpx.Response(200, json={"representation": f"representation {RAW_TOKEN}"})
        if request.method == "GET" and path == "/v3/workspaces/hermes/peers/Zeus/context":
            return httpx.Response(200, json={"peer_id": "Zeus", "target_id": "Jean", "representation": f"context {RAW_TOKEN}", "peer_card": []})
        if request.method == "POST" and path == "/v3/workspaces/hermes/sessions/list":
            return httpx.Response(200, json=_page([{"id": "session-a", "workspace_id": "hermes", "is_active": True, "created_at": "2026-06-19T00:02:00Z"}]))
        if request.method == "POST" and path == "/v3/workspaces/hermes/sessions/session-a/messages/list":
            return httpx.Response(200, json=_page([{"id": "msg-1", "workspace_id": "hermes", "session_id": "session-a", "peer_id": "Jean", "content": f"private {RAW_TOKEN}", "created_at": "2026-06-19T00:03:00Z", "token_count": 7}]))
        if request.method == "POST" and path == "/v3/workspaces/hermes/conclusions/list":
            return httpx.Response(200, json=_page([{"id": "conclusion-1", "content": f"conclusion {RAW_TOKEN}", "observer_id": "Zeus", "observed_id": "Jean", "created_at": "2026-06-19T00:04:00Z"}]))
        if request.method == "POST" and path == "/v3/workspaces/hermes/conclusions/query":
            body = json.loads(request.content.decode())
            assert body == {
                "query": "SitioUno",
                "top_k": 2,
                "filters": {"observed_id": "Jean"},
            }
            return httpx.Response(200, json=_page([{"id": "query-conclusion-1", "content": f"query result {RAW_TOKEN}", "observer_id": "Zeus", "observed_id": "Jean", "created_at": "2026-06-19T00:05:00Z"}]))
        raise AssertionError(f"unexpected request: {request.method} {path}")

    upstream_client = httpx.AsyncClient(
        base_url="http://honcho.local",
        transport=httpx.MockTransport(handler),
    )
    adapter = HonchoAPIAdapter(_settings(), client=upstream_client)
    client = TestClient(create_app(_settings(), honcho_api_adapter=adapter))

    responses = [
        client.get("/api/memory/health", headers=_basic_auth()),
        client.get("/api/memory/workspaces", headers=_basic_auth()),
        client.get("/api/memory/workspaces/hermes/queue", headers=_basic_auth()),
        client.get("/api/memory/workspaces/hermes/peers", headers=_basic_auth()),
        client.get("/api/memory/workspaces/hermes/peers/Zeus/card?target=Jean", headers=_basic_auth()),
        client.get("/api/memory/workspaces/hermes/peers/Zeus/representation?target=Jean", headers=_basic_auth()),
        client.get("/api/memory/workspaces/hermes/peers/Zeus/context?target=Jean", headers=_basic_auth()),
        client.get("/api/memory/workspaces/hermes/sessions", headers=_basic_auth()),
        client.get("/api/memory/workspaces/hermes/sessions/session-a/messages", headers=_basic_auth()),
        client.get("/api/memory/workspaces/hermes/conclusions", headers=_basic_auth()),
        client.post(
            "/api/memory/workspaces/hermes/conclusions/query",
            headers=_basic_auth(),
            json={
                "query": "SitioUno",
                "filters": {"observed_id": "Jean"},
                "top_k": 2,
            },
        ),
    ]

    assert [response.status_code for response in responses] == [200] * len(responses)
    bodies = [response.json() for response in responses]
    assert bodies[1]["items"][0]["id"] == "hermes"
    assert bodies[4]["entries"][0]["text"] == "card [REDACTED]"
    assert bodies[8]["items"][0]["content_hidden"] is True
    assert bodies[8]["items"][0]["content_preview"] is None
    assert bodies[9]["items"][0]["content_preview"] == "conclusion [REDACTED]"
    assert bodies[10]["items"][0]["content_preview"] == "query result [REDACTED]"
    _assert_no_raw_secrets(bodies)


def test_unavailable_honcho_api_returns_503_without_leaking_token_or_url_details():
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(
            f"cannot connect with Authorization: Bearer {RAW_TOKEN}"
        )

    upstream_client = httpx.AsyncClient(
        base_url="http://honcho.local",
        transport=httpx.MockTransport(handler),
    )
    adapter = HonchoAPIAdapter(_settings(), client=upstream_client)
    client = TestClient(create_app(_settings(), honcho_api_adapter=adapter))

    response = client.get("/api/memory/workspaces", headers=_basic_auth())

    assert response.status_code == 503
    body = response.json()
    assert body["error"]["code"] == "honcho_api_unavailable"
    assert body["error"]["message"] == "Honcho API is unavailable."
    _assert_no_raw_secrets(body)


def test_upstream_honcho_error_is_sanitized_before_reaching_console_client():
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            500,
            json={
                "detail": f"upstream exploded after seeing Authorization: Bearer {RAW_TOKEN}",
            },
        )

    upstream_client = httpx.AsyncClient(
        base_url="http://honcho.local",
        transport=httpx.MockTransport(handler),
    )
    adapter = HonchoAPIAdapter(_settings(), client=upstream_client)
    client = TestClient(create_app(_settings(), honcho_api_adapter=adapter))

    response = client.get("/api/memory/workspaces", headers=_basic_auth())

    assert response.status_code == 502
    body = response.json()
    assert body["error"]["code"] == "honcho_api_error"
    assert body["error"]["upstream_status"] == 500
    assert "upstream exploded" not in json.dumps(body)
    _assert_no_raw_secrets(body)
