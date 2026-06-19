# Honcho Memory Console Backend

Repo-managed FastAPI scaffold for the private Honcho Memory Console.

## Security boundary

- Every browser-facing `/api/*` endpoint is protected by HTTP Basic Auth middleware.
- If `HONCHO_CONSOLE__BASIC_AUTH_PASSWORD` is unset or empty, `/api/*` fails closed with `401`.
- `/healthz` is the only unauthenticated liveness endpoint and returns no runtime configuration.
- Raw bearer tokens, JWT secrets, provider keys, Infisical tokens, and database passwords must never be serialized to browser responses or logs.
- Browser-safe configuration is exposed only through `ConsoleSettings.public_config()`, which returns booleans and `sha256:` fingerprints.
- `redact_sensitive()` is the defense-in-depth sanitizer for Authorization headers and secret-like fields.

## Runtime settings

Environment variables use the `HONCHO_CONSOLE__` prefix and nested delimiter `__`.

Required for authenticated operator access:

- `HONCHO_CONSOLE__BASIC_AUTH_USERNAME`
- `HONCHO_CONSOLE__BASIC_AUTH_PASSWORD`

Optional server-side integrations for later increments:

- `HONCHO_CONSOLE__HONCHO_API_URL`
- `HONCHO_CONSOLE__HONCHO_API_TOKEN`
- `HONCHO_CONSOLE__JWT_SECRET`
- `HONCHO_CONSOLE__DATABASE_URL`
- `HONCHO_CONSOLE__INFISICAL_TOKEN`
- `HONCHO_CONSOLE__PROVIDER_API_KEYS__OPENAI`
- `HONCHO_CONSOLE__PROVIDER_API_KEYS__ANTHROPIC`

Do not commit actual values for any of those variables.

## Local verification

From the repository root:

```bash
uv run pytest console/backend/tests -q
uv run ruff check console/backend
```

Run locally for manual smoke testing:

```bash
HONCHO_CONSOLE__BASIC_AUTH_USERNAME=operator \
HONCHO_CONSOLE__BASIC_AUTH_PASSWORD='<set-from-secret-manager>' \
uv run uvicorn console.backend.app.main:app --host 127.0.0.1 --port 8080
```
