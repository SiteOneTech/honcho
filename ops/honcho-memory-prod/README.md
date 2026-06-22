# Honcho Memory Console: honcho-memory-prod deploy pack

This directory packages the private Tailscale sandbox deployment for `honcho-memory-prod`.

Canonical target:

- VM: `honcho-memory-prod`
- Tailscale HTTP URL: `http://100.71.144.114:8080/` (detected at deploy time via `tailscale ip -4`)
- Sandbox project path: `/srv/factory/projects/honcho-memory-console/repo`
- Sandbox artifact path: `/srv/factory/artifacts/honcho-memory-console/<run-id>/`
- Runtime env: `/etc/honcho-memory-console/runtime.env` (0600, secret values not printed or committed)
- Systemd unit: `/etc/systemd/system/honcho-console.service`
- Compose file: `ops/honcho-memory-prod/docker-compose.yml`

## Files

- `console.Dockerfile` builds the React frontend and packages it with the FastAPI console backend.
- `docker-compose.yml` runs the console container on host networking, bound to the Tailscale IP by systemd/deploy env.
- `honcho-console.service` starts/stops the compose-managed console and conflicts with the legacy `honcho-admin.service` on port 8080.
- `deploy.sh` clones/fetches the assigned branch under `/srv/factory/projects`, bootstraps runtime env from the existing local Honcho/admin runtime without printing secret values, installs the unit, starts the console, and writes a non-secret deploy summary artifact.
- `rollback.sh` stops/disables the console and restores `honcho-admin.service`, or redeploys a supplied git ref.
- `runtime.env.example` documents required variable names only; do not put real values in the repo.

## Deploy

Run on `honcho-memory-prod` as root:

```bash
/srv/factory/projects/honcho-memory-console/repo/ops/honcho-memory-prod/deploy.sh \
  --branch factory/honcho-memory-console/inc-110-t10-deployment-packaging-for-hon \
  --run-id run-1782093890-2f894387
```

For first-time deployment, the script creates `/etc/honcho-memory-console/runtime.env` with mode `0600` if it does not already exist. It reuses the existing local admin Basic Auth material and generates a workspace-scoped Honcho JWT from the already-running Honcho API container. Values are never printed.

If Infisical/runtime sync later provides a canonical env file, replace `/etc/honcho-memory-console/runtime.env` atomically and rerun:

```bash
systemctl restart honcho-console.service
```

## Verification

Expected checks after deploy:

```bash
systemctl is-active honcho.service honcho-console.service honcho-update.timer
cd /srv/factory/projects/honcho-memory-console/repo && docker compose -f ops/honcho-memory-prod/docker-compose.yml ps console
cd /opt/honcho && docker compose ps
curl -fsS http://127.0.0.1:8000/health
curl -sS -o /dev/null -w '%{http_code}\n' http://100.71.144.114:8080/healthz
curl -sS -o /dev/null -w '%{http_code}\n' http://100.71.144.114:8080/
```

Expected HTTP:

- `/healthz` returns `200` without auth.
- `/` returns `401` without auth.
- `/api/settings` returns `200` with the configured Basic Auth credentials.
- Core Honcho `/health` remains `200`.

The deploy script records these checks in `/srv/factory/artifacts/honcho-memory-console/<run-id>/deploy-summary.txt` without exposing credential values.

## Rollback

Default rollback restores the legacy admin panel:

```bash
/srv/factory/projects/honcho-memory-console/repo/ops/honcho-memory-prod/rollback.sh
```

Manual equivalent:

```bash
systemctl disable --now honcho-console.service
cd /srv/factory/projects/honcho-memory-console/repo && docker compose -f ops/honcho-memory-prod/docker-compose.yml stop console
systemctl start honcho-admin.service
systemctl is-active honcho-admin.service
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/
```

To roll the console to a previous git ref while keeping the repo-managed console active:

```bash
/srv/factory/projects/honcho-memory-console/repo/ops/honcho-memory-prod/rollback.sh <previous-commit-or-tag>
```

## Security notes

- Do not commit `/etc/honcho-memory-console/runtime.env` or any copied values from it.
- The compose package does not mount `/var/run/docker.sock` into the project container.
- The console binds to the Tailnet address by default; it is not a public `kidu.app` delivery gate.
- Browser-facing routes are Basic Auth protected except `/healthz`/liveness.
- The backend serves only sanitized responses: token fingerprints/flags, no raw tokens or provider/database secrets.
