"""Secure configuration for the Honcho Memory Console backend.

All secret-bearing fields are typed as :class:`pydantic.SecretStr` so they never
serialize their raw value by accident (``repr``, logging, ``model_dump`` all show
``'**********'``). The only sanctioned way to surface configuration to a browser is
:meth:`ConsoleSettings.public_config`, which emits booleans and non-reversible
fingerprints exclusively — never a raw token, secret, key, or DB password.
"""

from __future__ import annotations

from typing import Any, ClassVar

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from console.backend.app.redaction import fingerprint_secret

__all__ = ["ConsoleSettings"]


class ConsoleSettings(BaseSettings):
    """Runtime configuration for the console backend.

    Populated (in precedence order) from explicit constructor arguments, then
    environment variables prefixed with ``HONCHO_CONSOLE__``. Secret fields use
    :class:`SecretStr`; the URL/username fields are non-secret.
    """

    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(
        env_prefix="HONCHO_CONSOLE__",
        env_nested_delimiter="__",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Operator Basic Auth -------------------------------------------------
    # Application auth is mandatory for every browser-facing /api route. There is
    # intentionally no disable flag; if the password is unset the app fails closed.
    basic_auth_username: str = "operator"
    basic_auth_password: SecretStr | None = None

    # --- Upstream Honcho API -------------------------------------------------
    honcho_api_url: str = "http://127.0.0.1:8000"
    honcho_api_token: SecretStr | None = None

    # --- Console-issued JWTs / session signing -------------------------------
    jwt_secret: SecretStr | None = None

    # --- Backing stores / secret managers ------------------------------------
    database_url: SecretStr | None = None
    infisical_token: SecretStr | None = None

    # --- Agent registry / fleet discovery ------------------------------------
    # Fleet registry credentials stay server-side. The browser sees only whether
    # the adapter is configured plus a fingerprint for operational correlation.
    fleet_registry_database_url: SecretStr | None = None
    fleet_registry_connect_timeout_seconds: int = 2
    fleet_registry_agent_query: str = """
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

    # Honcho/config fallback identity for deployments without fleet registry.
    agent_id: str = "zeus"
    agent_display_name: str = "Zeus"
    tenant_id: str = "sitiouno-jean"
    runtime_vm: str = "honcho-memory-prod"
    tailnet_ip: str | None = None
    environment: str = "production"
    honcho_workspace: str = "hermes"
    ai_peer: str | None = "Zeus"
    human_peer: str | None = "Jean-Garcia"

    # --- Downstream LLM provider keys ----------------------------------------
    provider_api_keys: dict[str, SecretStr | None] = Field(default_factory=dict)

    @property
    def auth_configured(self) -> bool:
        """Whether a Basic Auth password is set (auth can actually be enforced)."""

        return bool(
            self.basic_auth_password
            and self.basic_auth_password.get_secret_value()
        )

    def public_config(self) -> dict[str, Any]:
        """Return a browser-safe view of the configuration.

        Contains only booleans, plain URLs, and ``sha256:`` fingerprints. It is
        constructed to never include a raw secret value, so it is safe to return
        from an authenticated browser endpoint or embed in an audit record.
        """

        token = self.honcho_api_token
        return {
            "auth": {
                "enabled": True,
                "configured": self.auth_configured,
                "username_configured": bool(self.basic_auth_username),
            },
            "honcho_api": {
                "url": self.honcho_api_url,
                "token_configured": token is not None,
                "token_fingerprint": (
                    fingerprint_secret(token) if token is not None else None
                ),
            },
            "agent_registry": {
                "agent_id": self.agent_id,
                "display_name": self.agent_display_name,
                "tenant_id": self.tenant_id,
                "runtime_vm": self.runtime_vm,
                "tailnet_ip": self.tailnet_ip,
                "environment": self.environment,
                "honcho_workspace": self.honcho_workspace,
                "ai_peer": self.ai_peer,
                "human_peer": self.human_peer,
                "fleet_registry_configured": self.fleet_registry_database_url is not None,
                "fleet_registry_fingerprint": (
                    fingerprint_secret(self.fleet_registry_database_url)
                    if self.fleet_registry_database_url is not None
                    else None
                ),
            },
            "secrets": {
                "jwt_secret_configured": self.jwt_secret is not None,
                "database_url_configured": self.database_url is not None,
                "infisical_token_configured": self.infisical_token is not None,
                "provider_keys_configured": {
                    name: value is not None
                    for name, value in sorted(self.provider_api_keys.items())
                },
            },
        }
