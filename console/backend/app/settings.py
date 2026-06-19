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
