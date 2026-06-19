import base64
import json

from fastapi.testclient import TestClient
from pydantic import SecretStr

from console.backend.app.main import create_app
from console.backend.app.settings import ConsoleSettings


def _secret(label: str) -> str:
    return f"factory-generated-{label}-credential"


BASIC_PASSWORD = _secret("basic-auth")
RAW_SECRETS = tuple(
    _secret(label)
    for label in (
        "basic-auth",
        "honcho-api-token",
        "console-jwt",
        "database-password",
        "infisical-token",
        "openai-provider-key",
        "anthropic-provider-key",
    )
)


def _basic_auth(username: str = "operator", password: str = BASIC_PASSWORD) -> dict[str, str]:
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def _assert_no_raw_secrets(value: object) -> None:
    serialized = json.dumps(value, sort_keys=True, default=str)
    for secret in RAW_SECRETS:
        assert secret not in serialized


def _settings() -> ConsoleSettings:
    return ConsoleSettings(
        basic_auth_username="operator",
        basic_auth_password=SecretStr(BASIC_PASSWORD),
        honcho_api_url="http://127.0.0.1:8000",
        honcho_api_token=SecretStr(_secret("honcho-api-token")),
        jwt_secret=SecretStr(_secret("console-jwt")),
        database_url=SecretStr("postgresql://honcho:***@db.internal:5432/honcho"),
        infisical_token=SecretStr(_secret("infisical-token")),
        provider_api_keys={
            "openai": SecretStr(_secret("openai-provider-key")),
            "anthropic": SecretStr(_secret("anthropic-provider-key")),
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
    assert body["agent_registry"]["fleet_registry_configured"] is False
    assert body["secrets"]["database_url_configured"] is True
    assert body["secrets"]["infisical_token_configured"] is True
    assert body["secrets"]["provider_keys_configured"] == {
        "anthropic": True,
        "openai": True,
    }


def test_scaffold_browser_api_endpoints_never_return_raw_runtime_secrets():
    client = TestClient(create_app(_settings()))

    for path in ("/api/overview", "/api/agents", "/api/audit/events"):
        response = client.get(path, headers=_basic_auth())
        assert response.status_code == 200
        _assert_no_raw_secrets(response.json())


def test_wrong_basic_auth_is_denied_without_echoing_submitted_credentials():
    client = TestClient(create_app(_settings()))
    wrong_password = _secret("wrong-basic-auth")

    response = client.get(
        "/api/settings",
        headers=_basic_auth(password=wrong_password),
    )

    assert response.status_code == 401
    assert wrong_password not in response.text
    _assert_no_raw_secrets(response.text)
