import base64
import json

from fastapi.testclient import TestClient
from pydantic import SecretStr

from console.backend.app.main import create_app
from console.backend.app.settings import ConsoleSettings

RAW_SECRETS = (
    "basic-auth-secret",
    "honcho-api-token-raw",
    "console-jwt-secret-raw",
    "db-password-raw",
    "infisical-token-raw",
    "openai-provider-key-raw",
    "anthropic-provider-key-raw",
)


def _basic_auth(username: str = "operator", password: str = "basic-auth-secret") -> dict[str, str]:
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def _assert_no_raw_secrets(value: object) -> None:
    serialized = json.dumps(value, sort_keys=True, default=str)
    for secret in RAW_SECRETS:
        assert secret not in serialized


def _settings() -> ConsoleSettings:
    return ConsoleSettings(
        basic_auth_username="operator",
        basic_auth_password=SecretStr("basic-auth-secret"),
        honcho_api_url="http://127.0.0.1:8000",
        honcho_api_token=SecretStr("honcho-api-token-raw"),
        jwt_secret=SecretStr("console-jwt-secret-raw"),
        database_url=SecretStr(
            "postgresql://honcho:db-password-raw@db.internal:5432/honcho"
        ),
        infisical_token=SecretStr("infisical-token-raw"),
        provider_api_keys={
            "openai": SecretStr("openai-provider-key-raw"),
            "anthropic": SecretStr("anthropic-provider-key-raw"),
        },
    )


def test_console_api_requires_basic_auth_before_returning_settings():
    client = TestClient(create_app(_settings()))

    response = client.get("/api/settings")

    assert response.status_code == 401
    assert response.headers["www-authenticate"].startswith("Basic")
    _assert_no_raw_secrets(response.text)


def test_console_settings_endpoint_returns_only_sanitized_configuration():
    client = TestClient(create_app(_settings()))

    response = client.get("/api/settings", headers=_basic_auth())

    assert response.status_code == 200
    body = response.json()
    _assert_no_raw_secrets(body)
    assert body["auth"]["enabled"] is True
    assert body["auth"]["configured"] is True
    assert body["honcho_api"]["url"] == "http://127.0.0.1:8000"
    assert body["honcho_api"]["token_fingerprint"].startswith("sha256:")
    assert body["secrets"]["database_url_configured"] is True
    assert body["secrets"]["infisical_token_configured"] is True
    assert body["secrets"]["provider_keys_configured"] == {
        "anthropic": True,
        "openai": True,
    }


def test_scaffold_browser_api_endpoints_never_return_raw_runtime_secrets():
    client = TestClient(create_app(_settings()))

    for path in ("/api/overview", "/api/audit/events"):
        response = client.get(path, headers=_basic_auth())
        assert response.status_code == 200
        _assert_no_raw_secrets(response.json())


def test_wrong_basic_auth_is_denied_without_echoing_submitted_credentials():
    client = TestClient(create_app(_settings()))

    response = client.get(
        "/api/settings",
        headers=_basic_auth(password="wrong-password-that-must-not-leak"),
    )

    assert response.status_code == 401
    assert "wrong-password-that-must-not-leak" not in response.text
    _assert_no_raw_secrets(response.text)
