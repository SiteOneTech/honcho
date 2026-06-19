"""Secret redaction utilities for the Honcho Memory Console.

This module is the single source of truth for keeping runtime secrets out of any
payload the console hands back to a browser client or writes to a log. It is kept
dependency-light on purpose so it can be imported anywhere (routes, settings,
audit log formatting) without pulling in framework code.

Two complementary primitives are provided:

* :func:`redact_sensitive` walks an arbitrary JSON-like structure and replaces the
  values of secret-like keys (``Authorization`` headers, ``*_token``, ``password``,
  ``api_key``, ``database_url``, ...) with :data:`SECRET_REDACTION`. Safe keys such
  as ``Content-Type`` or anything already carrying a non-reversible
  ``*_fingerprint`` are passed through untouched.
* :func:`fingerprint_secret` produces a short, stable, non-reversible identifier so
  the UI can show "this secret is set / changed" without ever revealing the value.
"""

from __future__ import annotations

import hashlib
from typing import Any, cast

__all__ = [
    "SECRET_REDACTION",
    "fingerprint_secret",
    "redact_sensitive",
    "is_sensitive_key",
]

#: Placeholder substituted for any redacted secret value.
SECRET_REDACTION = "[REDACTED]"

#: Number of hex characters retained from the digest. Short enough to keep payloads
#: compact while remaining collision-resistant for "did this value change?" checks.
_FINGERPRINT_HEX_LEN = 16

#: Lower-cased substrings that mark a key as carrying a secret value. Matching is by
#: substring so ``honcho_api_token`` and ``x-api-key`` are both caught.
_SENSITIVE_KEY_PARTS: tuple[str, ...] = (
    "authorization",
    "password",
    "passwd",
    "secret",
    "token",
    "jwt",
    "api_key",
    "api-key",
    "apikey",
    "provider_key",
    "provider-key",
    "private_key",
    "private-key",
    "access_key",
    "credential",
    "infisical",
    "database_url",
    "db_url",
    "dsn",
)

#: Lower-cased exact container/status keys that are safe even if they include a
#: sensitive substring. Nested values are still processed recursively.
_SAFE_EXACT_KEYS: frozenset[str] = frozenset({"secrets"})

#: Lower-cased substrings that make a key safe even if it also matches a sensitive
#: part above. ``token_fingerprint`` matches ``token`` but is a non-reversible
#: digest; ``database_url_configured`` matches ``database_url`` but is a boolean.
_SAFE_KEY_PARTS: tuple[str, ...] = (
    "fingerprint",
    "configured",
    "enabled",
    "redacted",
    "safe_",
    "_safe",
)


def is_sensitive_key(key: str) -> bool:
    """Return ``True`` when *key* names a value that must be redacted.

    A key is sensitive when it contains a known secret-bearing substring and does
    not contain a safe override substring (e.g. ``fingerprint`` / ``configured``).
    """

    lowered = key.lower()
    if lowered in _SAFE_EXACT_KEYS:
        return False
    if any(safe in lowered for safe in _SAFE_KEY_PARTS):
        return False
    return any(part in lowered for part in _SENSITIVE_KEY_PARTS)


def fingerprint_secret(secret: Any) -> str:
    """Return a short, stable, non-reversible fingerprint for *secret*.

    The result is prefixed with ``sha256:`` and contains only the leading hex of the
    digest — never the raw secret. The same input always yields the same output, so
    the console can detect whether a configured secret has changed without exposing
    it.

    Accepts ``str``/``bytes`` as well as ``pydantic.SecretStr``-like objects that
    expose ``get_secret_value()``.
    """

    raw = secret
    get_secret_value = getattr(secret, "get_secret_value", None)
    if callable(get_secret_value):
        raw = get_secret_value()

    data = raw if isinstance(raw, bytes) else str(raw).encode("utf-8")

    digest = hashlib.sha256(data).hexdigest()[:_FINGERPRINT_HEX_LEN]
    return f"sha256:{digest}"


def redact_sensitive(value: Any) -> Any:
    """Recursively redact secret-like values in *value*.

    * ``dict`` — each entry is examined; values under sensitive keys are replaced
      with :data:`SECRET_REDACTION`, all other values are redacted recursively so
      nested secrets are caught regardless of depth.
    * ``list``/``tuple`` — each element is redacted recursively (tuples become
      lists so the result is JSON-serializable).
    * any ``SecretStr``-like object — replaced with :data:`SECRET_REDACTION`.
    * scalars — returned unchanged.

    The input is never mutated; a sanitized copy is returned.
    """

    if isinstance(value, dict):
        sanitized: dict[Any, Any] = {}
        for key, item in cast(dict[Any, Any], value).items():
            if isinstance(key, str) and is_sensitive_key(key):
                sanitized[key] = SECRET_REDACTION
            else:
                sanitized[key] = redact_sensitive(item)
        return sanitized

    if isinstance(value, (list, tuple)):
        return [redact_sensitive(item) for item in cast(list[Any] | tuple[Any, ...], value)]

    # Pydantic SecretStr / SecretBytes and any look-alike: never serialize the value.
    if callable(getattr(value, "get_secret_value", None)):
        return SECRET_REDACTION

    return value
