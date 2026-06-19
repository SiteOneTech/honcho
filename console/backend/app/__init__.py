"""Console backend application package.

Secure settings and redaction primitives for the Honcho Memory Console backend.
Import `console.backend.app.main:create_app` or `console.backend.app.main:app` when an
ASGI application is needed.
"""

from console.backend.app.redaction import (
    SECRET_REDACTION,
    fingerprint_secret,
    redact_sensitive,
)
from console.backend.app.settings import ConsoleSettings

__all__ = [
    "ConsoleSettings",
    "SECRET_REDACTION",
    "fingerprint_secret",
    "redact_sensitive",
]
