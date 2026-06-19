"""HTTP Basic Auth middleware for the Honcho Memory Console backend.

The console is an operator-only surface, so every ``/api`` route is gated behind a
single Basic Auth credential. Design rules enforced here:

* Comparisons use :func:`hmac.compare_digest` (constant time) for both username and
  password, and both are always compared so a wrong username and a wrong password
  take the same time.
* Access is denied when the ``Authorization`` header is missing, malformed, uses a
  non-Basic scheme, or when no password is configured (fail closed).
* The submitted credentials are never echoed back in the response body or headers,
  and are never logged.
"""

from __future__ import annotations

import base64
import binascii
import hmac
from collections.abc import Iterable

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from console.backend.app.settings import ConsoleSettings

__all__ = ["BasicAuthMiddleware", "WWW_AUTHENTICATE_REALM"]

WWW_AUTHENTICATE_REALM = "Honcho Memory Console"

#: Paths that are always reachable without authentication (liveness/readiness).
_PUBLIC_PATHS: frozenset[str] = frozenset({"/healthz", "/livez", "/readyz"})


def _encode(value: str) -> bytes:
    return value.encode("utf-8")


class BasicAuthMiddleware(BaseHTTPMiddleware):
    """Enforce HTTP Basic Auth on protected paths.

    Args:
        app: the wrapped ASGI application.
        settings: console settings carrying the expected credentials.
        public_paths: paths exempt from auth (defaults to the liveness probes).
    """

    def __init__(
        self,
        app: ASGIApp,
        settings: ConsoleSettings,
        public_paths: Iterable[str] | None = None,
    ) -> None:
        super().__init__(app)
        self._settings: ConsoleSettings = settings
        self._public_paths: frozenset[str] = (
            frozenset(public_paths) if public_paths is not None else _PUBLIC_PATHS
        )

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if not self._requires_auth(request):
            return await call_next(request)
        if not self._is_authenticated(request):
            return self._unauthorized()
        return await call_next(request)

    def _requires_auth(self, request: Request) -> bool:
        return request.url.path not in self._public_paths

    def _is_authenticated(self, request: Request) -> bool:
        """Validate the Authorization header in constant time. Fail closed."""

        expected_password = self._settings.basic_auth_password
        expected_password_value = (
            expected_password.get_secret_value() if expected_password is not None else ""
        )
        if not expected_password_value:
            # No password configured: deny everything rather than allow open access.
            return False

        header = request.headers.get("Authorization")
        if not header:
            return False

        scheme, _, encoded = header.partition(" ")
        if scheme.lower() != "basic" or not encoded:
            return False

        try:
            decoded = base64.b64decode(encoded, validate=True).decode("utf-8")
        except (binascii.Error, ValueError, UnicodeDecodeError):
            return False

        username, sep, password = decoded.partition(":")
        if not sep:
            return False

        # Always run both comparisons (no short-circuit) to avoid leaking which
        # half was wrong via timing.
        username_ok = hmac.compare_digest(
            _encode(username), _encode(self._settings.basic_auth_username)
        )
        password_ok = hmac.compare_digest(
            _encode(password), _encode(expected_password_value)
        )
        return username_ok and password_ok

    def _unauthorized(self) -> JSONResponse:
        """Return a 401 that challenges for Basic Auth and leaks nothing."""

        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication required."},
            headers={
                "WWW-Authenticate": f'Basic realm="{WWW_AUTHENTICATE_REALM}"',
            },
        )
