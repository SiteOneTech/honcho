import json

from console.backend.app.redaction import (
    SECRET_REDACTION,
    fingerprint_secret,
    redact_secret_text,
    redact_sensitive,
)


def _secret(label: str) -> str:
    return f"factory-generated-{label}-credential"


def _serialized(value: object) -> str:
    return json.dumps(value, sort_keys=True, default=str)


def test_authorization_headers_are_redacted_without_touching_safe_headers():
    bearer_value = _secret("bearer")
    basic_value = _secret("basic-header")
    api_key_value = _secret("api-key")
    payload = {
        "headers": {
            "Authorization": f"Bearer {bearer_value}",
            "authorization": f"Basic {basic_value}",
            "X-Api-Key": api_key_value,
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
    assert bearer_value not in serialized
    assert basic_value not in serialized
    assert api_key_value not in serialized


def test_nested_secret_like_fields_are_redacted_recursively():
    hidden_values = {
        "jwt": _secret("jwt"),
        "database": _secret("database-password"),
        "infisical": _secret("infisical"),
        "provider": _secret("provider-key"),
        "password": _secret("password"),
    }
    payload = {
        "jwt_secret": hidden_values["jwt"],
        "database_url": "postgresql://honcho:***@db.internal:5432/honcho",
        "config": {
            "infisical_token": hidden_values["infisical"],
            "provider": {
                "api_key": hidden_values["provider"],
                "safe_name": "Honcho Memory Console",
            },
        },
        "items": [
            {"password": hidden_values["password"], "safe_status": "healthy"},
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
    assert redacted["items"][1]["scope"] == "read-only"

    serialized = _serialized(redacted)
    for secret in hidden_values.values():
        assert secret not in serialized


def test_free_text_secret_patterns_are_redacted_without_touching_fingerprints():
    jwt_like = "eyJhbGciOiJIUzI1NiJ9.eyJ3IjoiaGVybWVzIn0.signaturepart"
    prefixed = "sk-factory-secret-marker-abcdef"
    safe_fingerprint = "sha256:abcd1234ef567890"
    text = (
        f"Authorization: Bearer {jwt_like}; provider={prefixed}; "
        f"fingerprint={safe_fingerprint}"
    )

    redacted_text = redact_secret_text(text)
    redacted_payload = redact_sensitive({"message": text})
    serialized_payload = _serialized(redacted_payload)

    assert jwt_like not in redacted_text
    assert prefixed not in redacted_text
    assert safe_fingerprint in redacted_text
    assert SECRET_REDACTION in redacted_text
    assert jwt_like not in serialized_payload
    assert prefixed not in serialized_payload
    assert safe_fingerprint in serialized_payload


def test_fingerprint_secret_is_stable_and_does_not_include_secret_value():
    secret_value = _secret("honcho-api")
    first = fingerprint_secret(secret_value)
    second = fingerprint_secret(secret_value)

    assert first == second
    assert first.startswith("sha256:")
    assert secret_value not in first
    assert len(first) < 80
