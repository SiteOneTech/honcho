# Honcho Memory Console Backend

Repo-managed FastAPI scaffold for the private Honcho Memory Console.

## Security boundary

- Every browser-facing `/api/*` endpoint is protected by HTTP Basic Auth middleware.
- If `HONCHO_CONSOLE__BASIC_AUTH_PASSWORD` is unset or empty, `/api/*` fails closed with `401`.
- `/healthz` is the only unauthenticated liveness endpoint and returns no runtime configuration.
- Raw bearer tokens, JWT secrets, provider keys, Infisical tokens, fleet registry database URLs, and database passwords must never be serialized to browser responses or logs.
- Browser-safe configuration is exposed only through `ConsoleSettings.public_config()`, which returns booleans and `sha256:` fingerprints.
- `redact_sensitive()` is the defense-in-depth sanitizer for Authorization headers and secret-like fields; token `scope` and `status` are explicitly safe because they are metadata, not credentials.
- `GET /api/agents` and `GET /api/agents/{agent_id}` return only token fingerprints/scope/status — never raw token values.
- `GET /api/health/services` runs only fixed, allowlisted local checks and returns sanitized evidence; it never accepts command names or shell fragments from the browser.

## Runtime settings

Environment variables use the `HONCHO_CONSOLE__` prefix and nested delimiter `__`.

Required for authenticated operator access:

- `HONCHO_CONSOLE__BASIC_AUTH_USERNAME`
- `HONCHO_CONSOLE__BASIC_AUTH_PASSWORD`

Optional server-side integrations:

- `HONCHO_CONSOLE__HONCHO_API_URL`
- `HONCHO_CONSOLE__HONCHO_API_TOKEN`
- `HONCHO_CONSOLE__JWT_SECRET`
- `HONCHO_CONSOLE__DATABASE_URL`
- `HONCHO_CONSOLE__REDIS_URL`
- `HONCHO_CONSOLE__INFISICAL_TOKEN`
- `HONCHO_CONSOLE__FLEET_REGISTRY_DATABASE_URL`
- `HONCHO_CONSOLE__FLEET_REGISTRY_CONNECT_TIMEOUT_SECONDS`
- `HONCHO_CONSOLE__FLEET_REGISTRY_AGENT_QUERY` (read-only `SELECT`, defaults to `factory.agent_registry`)

Local health adapter knobs are allowlisted and should normally keep defaults:

- `HONCHO_CONSOLE__LOCAL_HEALTH_SYSTEMD_UNITS` (`honcho.service`, `honcho-admin.service`, `honcho-console.service`)
- `HONCHO_CONSOLE__LOCAL_HEALTH_UPDATE_TIMER_UNIT` (`honcho-update.timer`)
- `HONCHO_CONSOLE__LOCAL_HEALTH_DOCKER_COMPOSE_DIRECTORY`
- `HONCHO_CONSOLE__LOCAL_HEALTH_DOCKER_SERVICES` (`api`, `deriver`, `database`, `redis`, `console`)
- `HONCHO_CONSOLE__LOCAL_HEALTH_DISK_PATHS` (`/`, `/opt/honcho`, `/var/lib/docker/volumes`)

Agent fallback identity when fleet registry is unset or unavailable:

- `HONCHO_CONSOLE__AGENT_ID`
- `HONCHO_CONSOLE__AGENT_DISPLAY_NAME`
- `HONCHO_CONSOLE__TENANT_ID`
- `HONCHO_CONSOLE__RUNTIME_VM`
- `HONCHO_CONSOLE__TAILNET_IP`
- `HONCHO_CONSOLE__ENVIRONMENT`
- `HONCHO_CONSOLE__HONCHO_WORKSPACE`
- `HONCHO_CONSOLE__AI_PEER`
- `HONCHO_CONSOLE__HUMAN_PEER`

Optional provider-key presence flags:

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
