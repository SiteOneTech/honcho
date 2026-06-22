# T10 Deployment Packaging Evidence - Honcho Memory Console

Project: honcho-memory-console
Task: honcho-memory-console-t10-deployment-packaging-for-honcho-memo
Run: run-1782095965-30c0fb8f
Evidence captured: 2026-06-22T02:47:22Z

## Scope

Private Tailscale sandbox deploy packaging for honcho-memory-prod using repo-managed Docker Compose, systemd, deploy, rollback, and runtime-env files. No secret values are recorded here.

## Repo-managed deployment pack

Tracked files:

- ops/honcho-memory-prod/README.md
- ops/honcho-memory-prod/console.Dockerfile
- ops/honcho-memory-prod/deploy.sh
- ops/honcho-memory-prod/docker-compose.yml
- ops/honcho-memory-prod/honcho-console.service
- ops/honcho-memory-prod/rollback.sh
- ops/honcho-memory-prod/runtime.env.example

## Local verification

Commands run from the assigned worktree `/home/jean/Projects/.worktrees/honcho-memory-console/inc-110-t10-deployment-packaging-for-hon`:

- `bash -n ops/honcho-memory-prod/deploy.sh ops/honcho-memory-prod/rollback.sh` -> `bash_syntax=ok`.
- `uv run pytest console/backend/tests/test_deployment_packaging.py -q` -> `5 passed in 2.34s`.
- `git diff --check` -> exit 0.

## Deployment command

Executed on `honcho-memory-prod` over Tailscale SSH as root:

```bash
RUN_ID=run-1782095965-30c0fb8f \
  /srv/factory/projects/honcho-memory-console/repo/ops/honcho-memory-prod/deploy.sh \
  --branch factory/honcho-memory-console/inc-110-t10-deployment-packaging-for-hon \
  --run-id run-1782095965-30c0fb8f
```

The script fetches `https://github.com/SiteOneTech/honcho`, resets `/srv/factory/projects/honcho-memory-console/repo` to the assigned branch, installs `/etc/systemd/system/honcho-console.service`, uses `/etc/honcho-memory-console/runtime.env` without printing values, starts the compose-managed console, waits for HTTP and Docker health, and records a redacted artifact.

## Runtime evidence

Post-deploy verification output:

```text
host=honcho-memory-prod
repo_head=3c7f8e567c883f09f06be6852c27b4f716bfd60d
repo_status_lines=0
systemd_active=active
active
inactive
active
active
unit_state=success 0 active exited
listener_8080=LISTEN 0      2048   100.71.144.114:8080 0.0.0.0:* users:(("uvicorn",pid=2496464,fd=11))
compose_console={"Name":"honcho-memory-console","State":"running","Health":"healthy","Status":"Up 30 seconds (healthy)","Networks":"host"}
http_healthz=200
http_root_unauth=401
honcho_api_health=200
runtime_env_mode=600 root:root
```

Notes:

- `systemd_active` order: `honcho.service`, `honcho-console.service`, `honcho-admin.service`, `honcho-update.timer`, `docker`.
- `honcho-admin.service` is intentionally inactive while `honcho-console.service` owns port 8080.
- Runtime env path is `/etc/honcho-memory-console/runtime.env`; only mode/owner was recorded.

## Redacted deploy artifact on VM

Remote artifact path:

```text
/srv/factory/artifacts/honcho-memory-console/run-1782095965-30c0fb8f/deploy-summary.txt
```

Redacted artifact summary verified:

```text
project=honcho-memory-console
run_id=run-1782095965-30c0fb8f
repo_dir=/srv/factory/projects/honcho-memory-console/repo
branch=factory/honcho-memory-console/inc-110-t10-deployment-packaging-for-hon
runtime_env=/etc/honcho-memory-console/runtime.env (values redacted; mode 600)
deploy_env=/etc/honcho-memory-console/deploy.env
unit=/etc/systemd/system/honcho-console.service
http_healthz=200
http_root_unauth=401
http_settings_auth=200
honcho_api_health=200
```

## Rollback evidence

Rollback is repo-managed and documented in `ops/honcho-memory-prod/README.md` and `ops/honcho-memory-prod/rollback.sh`.

Default rollback command on `honcho-memory-prod`:

```bash
/srv/factory/projects/honcho-memory-console/repo/ops/honcho-memory-prod/rollback.sh
```

Manual equivalent documented:

```bash
systemctl disable --now honcho-console.service
cd /srv/factory/projects/honcho-memory-console/repo && docker compose -f ops/honcho-memory-prod/docker-compose.yml stop console
systemctl start honcho-admin.service
systemctl is-active honcho-admin.service
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/
```

Rollback was not executed because the acceptance criteria require the sandbox deploy/staged deployment to remain live for T11/T11B QA.

## Security notes

- No raw secrets, Basic Auth credentials, Honcho JWTs, database credentials, Infisical tokens, or Authorization headers are recorded.
- The console is bound to the Tailscale address on port 8080 and is not published to a public `kidu.app` URL in T10.
- `/healthz` returns 200 unauthenticated; `/` returns 401 unauthenticated; authenticated `/api/settings` returned 200 in the redacted deploy artifact.
