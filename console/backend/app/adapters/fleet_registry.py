"""Read-only fleet registry adapter for the console agent inventory.

The production fleet registry schema is owned outside this console. This adapter is
therefore intentionally thin and best-effort: when a read-only database URL is
configured it executes a configurable SELECT and returns dictionaries; any failure
is surfaced to the assembler, which degrades to Honcho/config discovery.
"""

from __future__ import annotations

import logging
from typing import Any, Protocol, cast

import psycopg

from console.backend.app.settings import ConsoleSettings

__all__ = [
    "DEFAULT_FLEET_REGISTRY_AGENT_QUERY",
    "FleetRegistryAdapter",
    "FleetRegistryClient",
]

logger = logging.getLogger(__name__)

DEFAULT_FLEET_REGISTRY_AGENT_QUERY = """
SELECT
    agent_id,
    display_name,
    tenant_id,
    runtime_vm,
    tailnet_ip,
    environment,
    honcho_workspace,
    ai_peer,
    human_peer,
    token_fingerprint,
    token_scope,
    token_status,
    last_write_at,
    memory_counts,
    queue_state,
    api_activity,
    vm_health,
    alerts
FROM factory.agent_registry
WHERE active IS DISTINCT FROM false
ORDER BY agent_id
""".strip()


class FleetRegistryClient(Protocol):
    """Small sync protocol used by ``AgentRegistryService`` and tests."""

    def list_agents(self) -> list[dict[str, Any]]:
        """Return raw registry rows. Values are sanitized by the assembler."""
        ...


class FleetRegistryAdapter:
    """Read-only adapter backed by the configured fleet registry Postgres URL."""

    def __init__(self, settings: ConsoleSettings) -> None:
        self._settings: ConsoleSettings = settings

    def list_agents(self) -> list[dict[str, Any]]:
        database_url = self._settings.fleet_registry_database_url
        if database_url is None or not database_url.get_secret_value():
            return []

        try:
            with psycopg.connect(
                database_url.get_secret_value(),
                connect_timeout=self._settings.fleet_registry_connect_timeout_seconds,
            ) as connection:
                connection.autocommit = True
                connection.read_only = True
                with connection.cursor() as cursor:
                    cursor.execute(cast(Any, self._settings.fleet_registry_agent_query))
                    column_names = [
                        column.name for column in (cursor.description or [])
                    ]
                    raw_rows = cursor.fetchall()
        except Exception as exc:
            # Do not include exception text; connection failures may include DSNs.
            logger.warning(
                "Fleet registry read failed; falling back to Honcho/config discovery",
                extra={"error_type": type(exc).__name__},
            )
            raise

        return [
            dict(zip(column_names, row, strict=False))
            for row in raw_rows
        ]
