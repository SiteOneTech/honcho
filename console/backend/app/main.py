# pyright: reportUnusedFunction=false
"""FastAPI application factory for the Honcho Memory Console backend.

This is an intentionally thin scaffold. Every browser-facing endpoint returns only
sanitized data — booleans, plain URLs, and non-reversible fingerprints — produced
via :meth:`ConsoleSettings.public_config` and passed through
:func:`redact_sensitive` as a defense-in-depth backstop. No route returns a raw
token, JWT secret, provider key, Infisical value, or DB password.

Route map:

* ``GET /healthz``       — unauthenticated liveness probe.
* ``GET /api/settings``  — sanitized runtime configuration (auth required).
* ``GET /api/overview``  — scaffold operational overview (auth required).
* ``GET /api/audit/events`` — scaffold audit feed (auth required).
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from console.backend.app.auth import BasicAuthMiddleware
from console.backend.app.redaction import redact_sensitive
from console.backend.app.settings import ConsoleSettings

__all__ = ["create_app", "app"]


def create_app(settings: ConsoleSettings | None = None) -> FastAPI:
    """Build a console backend application.

    Args:
        settings: explicit configuration. When ``None``, settings are loaded from
            the environment (``HONCHO_CONSOLE__*``) with safe defaults.

    Returns:
        A configured :class:`fastapi.FastAPI` instance with Basic Auth enforced on
        all ``/api`` routes.
    """

    settings = settings or ConsoleSettings()

    application = FastAPI(
        title="Honcho Memory Console",
        version="0.1.0",
        description="Operator console for inspecting Honcho memory state.",
    )
    application.state.settings = settings
    application.add_middleware(BasicAuthMiddleware, settings=settings)

    @application.get("/healthz", tags=["health"])
    def healthz() -> dict[str, str]:
        """Unauthenticated liveness probe."""

        return {"status": "ok", "service": "honcho-memory-console"}

    @application.get("/api/settings", tags=["console"])
    def get_settings() -> dict[str, Any]:
        """Return the sanitized, browser-safe runtime configuration."""

        return redact_sensitive(settings.public_config())

    @application.get("/api/overview", tags=["console"])
    def get_overview() -> dict[str, Any]:
        """Return a scaffold operational overview (no live data yet)."""

        public = settings.public_config()
        payload: dict[str, Any] = {
            "service": "honcho-memory-console",
            "status": "scaffold",
            "auth": public["auth"],
            "honcho_api": {
                "url": public["honcho_api"]["url"],
                "token_configured": public["honcho_api"]["token_configured"],
            },
            "metrics": {
                "workspaces": None,
                "peers": None,
                "sessions": None,
                "queue_depth": None,
            },
        }
        return redact_sensitive(payload)

    @application.get("/api/audit/events", tags=["console"])
    def get_audit_events() -> dict[str, Any]:
        """Return a scaffold audit-event feed (no events recorded yet)."""

        payload: dict[str, Any] = {
            "service": "honcho-memory-console",
            "status": "scaffold",
            "events": [],
            "total": 0,
        }
        return redact_sensitive(payload)

    return application


#: Module-level application singleton for ASGI servers (``uvicorn ... :app``).
app = create_app()
