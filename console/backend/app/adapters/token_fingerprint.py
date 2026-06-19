"""Token fingerprint and scope derivation helpers.

The functions in this module may inspect token claims server-side, but they never
return the raw token or any signature material. The browser receives only a stable
``sha256:`` fingerprint plus coarse scope/status metadata.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

import jwt

from console.backend.app.models import TokenInfo, TokenStatus
from console.backend.app.redaction import fingerprint_secret

__all__ = ["derive_token_info", "is_canonical_fingerprint"]

_CANONICAL_FINGERPRINT = re.compile(r"^sha256:[0-9a-f]{16,64}$")


def derive_token_info(
    token: Any,
    *,
    expected_workspace: str | None = None,
    signing_secret: str | None = None,
) -> TokenInfo:
    """Return non-secret metadata for a Honcho token.

    Args:
        token: Raw token value kept server-side only. ``SecretStr``-like objects are
            accepted and unwrapped locally for hashing/claim inspection.
        expected_workspace: Workspace that this token should address. A decoded
            workspace claim that differs from this value is reported as
            ``mis-scoped``.
        signing_secret: Optional HS256 secret. When present we try a verified
            decode first; if unavailable or invalid we still attempt an unverified
            claim decode because scope/status are observability hints, not an auth
            decision.
    """

    raw = _secret_value(token)
    if not raw:
        return TokenInfo()

    fingerprint = fingerprint_secret(raw)
    claims = _decode_claims(raw, signing_secret=signing_secret)
    if claims is None:
        return TokenInfo(fingerprint=fingerprint)

    scope = _scope_from_claims(claims)
    status = _status_from_claims(claims, expected_workspace=expected_workspace)
    return TokenInfo(fingerprint=fingerprint, scope=scope, status=status)


def is_canonical_fingerprint(value: Any) -> bool:
    """Return ``True`` only for browser-safe canonical SHA-256 fingerprints."""

    if not isinstance(value, str):
        return False
    return _CANONICAL_FINGERPRINT.fullmatch(value) is not None


def _secret_value(value: Any) -> str:
    get_secret_value = getattr(value, "get_secret_value", None)
    if callable(get_secret_value):
        value = get_secret_value()
    return value.decode("utf-8") if isinstance(value, bytes) else str(value or "")


def _decode_claims(token: str, *, signing_secret: str | None) -> dict[str, Any] | None:
    if signing_secret:
        try:
            decoded = jwt.decode(
                token,
                signing_secret.encode("utf-8"),
                algorithms=["HS256"],
                options={"verify_exp": False},
            )
            return dict(decoded)
        except jwt.PyJWTError:
            # Fall through to an unverified decode for non-authoritative display.
            pass

    try:
        decoded = jwt.decode(
            token,
            options={"verify_signature": False, "verify_exp": False},
            algorithms=["HS256"],
        )
    except jwt.PyJWTError:
        return None
    return dict(decoded)


def _scope_from_claims(claims: dict[str, Any]) -> str:
    workspace = _string_claim(claims.get("w"))
    peer = _string_claim(claims.get("p"))
    session = _string_claim(claims.get("s"))

    if bool(claims.get("ad")):
        return "admin"
    if workspace and peer:
        return f"peer:{workspace}/{peer}"
    if workspace and session:
        return f"session:{workspace}/{session}"
    if workspace:
        return f"workspace:{workspace}"
    if peer:
        return f"peer:{peer}"
    if session:
        return f"session:{session}"
    return "unknown"


def _status_from_claims(
    claims: dict[str, Any], *, expected_workspace: str | None
) -> TokenStatus:
    if _is_expired(claims.get("exp")):
        return "expired"

    workspace = _string_claim(claims.get("w"))
    if expected_workspace and workspace and workspace != expected_workspace:
        return "mis-scoped"

    return "valid"


def _string_claim(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _is_expired(value: Any) -> bool:
    if value is None:
        return False

    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), UTC) < datetime.now(UTC)

    text = str(value).strip()
    if not text:
        return False

    if text.isdigit():
        return datetime.fromtimestamp(float(text), UTC) < datetime.now(UTC)

    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return False
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC) < datetime.now(UTC)
