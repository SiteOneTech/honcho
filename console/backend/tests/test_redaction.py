import json

from console.backend.app.redaction import (
    SECRET_REDACTION,
    fingerprint_secret,
    redact_sensitive,
)


def _serialized(value: object) -> str:
    return json.dumps(value, sort_keys=True, default=str)


def test_authorization_headers_are_redacted_without_touching_safe_headers():
    payload = {
        "headers": {
            "Authorization": "Bearer bearer-token-raw",
            "authorization": "Basic base64-secret-raw",
            "X-Api-Key": "api-key-raw",
            "Content-Type": "application/json",
        },
        "method": "GET",
    }

    redacted = redact_sensitive(payload)

    assert redacted["headers"]["Authorization"] == SECRET_REDACTION
    assert redacted["headers"]["authorization"] == SECRET_REDACTION
    assert redacted["headers"]["X-Api-Key"] == SECRET_REDACTION
    assert redacted["headers"]["Content-Type"] == "application/json"
    serialized = _serialized(redacted)
    assert "bearer-token-raw" not in serialized
    assert "base64-secret-raw" not in serialized
    assert "api-key-raw" not in serialized


def test_nested_secret_like_fields_are_redacted_recursively():
    payload = {
        "jwt_secret": "jwt-secret-raw",
        "database_url": "postgresql://honcho:db-password-raw@db.internal:5432/honcho",
        "config": {
            "infisical_token": "infisical-token-raw",
            "provider": {
                "api_key": "openai-provider-key-raw",
                "safe_name": "Honcho Memory Console",
            },
        },
        "items": [
            {"password": "pass-raw", "safe_status": "healthy"},
            {"token_fingerprint": "sha256:already-safe", "scope": "read-only"},
        ],
    }

    redacted = redact_sensitive(payload)

    assert redacted["jwt_secret"] == SECRET_REDACTION
    assert redacted["database_url"] == SECRET_REDACTION
    assert redacted["config"]["infisical_token"] == SECRET_REDACTION
    assert redacted["config"]["provider"]["api_key"] == SECRET_REDACTION
    assert redacted["config"]["provider"]["safe_name"] == "Honcho Memory Console"
    assert redacted["items"][0]["password"] == SECRET_REDACTION
    assert redacted["items"][0]["safe_status"] == "healthy"
    assert redacted["items"][1]["token_fingerprint"] == "sha256:already-safe"

    serialized = _serialized(redacted)
    for raw_secret in (
        "jwt-secret-raw",
        "db-password-raw",
        "infisical-token-raw",
        "openai-provider-key-raw",
        "pass-raw",
    ):
        assert raw_secret not in serialized


def test_fingerprint_secret_is_stable_and_does_not_include_raw_secret():
    first = fingerprint_secret("honcho-api-token-raw")
    second = fingerprint_secret("honcho-api-token-raw")

    assert first == second
    assert first.startswith("sha256:")
    assert "honcho-api-token-raw" not in first
    assert len(first) < 80
