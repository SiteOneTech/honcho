#!/usr/bin/env bash
# Roll back the Honcho Memory Console sandbox deployment.
#
# Default rollback disables/stops the repo-managed console container and restores
# the previous honcho-admin.service on port 8080. If a git ref is supplied, the
# script instead re-deploys that ref through the same console compose package.

set -euo pipefail

PROJECT_ID="honcho-memory-console"
REPO_DIR="${REPO_DIR:-/srv/factory/projects/${PROJECT_ID}/repo}"
COMPOSE_FILE="${COMPOSE_FILE:-${REPO_DIR}/ops/honcho-memory-prod/docker-compose.yml}"
DEPLOY_ENV="${HONCHO_CONSOLE_DEPLOY_ENV:-/etc/honcho-memory-console/deploy.env}"
ROLLBACK_REF="${1:-}"

if [[ "$(id -u)" != "0" ]]; then
  echo "ERROR: rollback must run as root on honcho-memory-prod." >&2
  exit 1
fi

if [[ -f "$DEPLOY_ENV" ]]; then
  # shellcheck disable=SC1090
  source "$DEPLOY_ENV"
fi

if [[ -n "$ROLLBACK_REF" ]]; then
  cd "$REPO_DIR"
  git fetch origin --prune
  git checkout --detach "$ROLLBACK_REF"
  docker compose -f "$COMPOSE_FILE" up -d --build console
  systemctl restart honcho-console.service
  echo "Rolled console forward/back to ref ${ROLLBACK_REF}."
  exit 0
fi

systemctl disable --now honcho-console.service >/dev/null 2>&1 || true
if [[ -f "$COMPOSE_FILE" ]]; then
  docker compose -f "$COMPOSE_FILE" stop console >/dev/null 2>&1 || true
fi
systemctl start honcho-admin.service

echo "Rollback complete: honcho-console stopped/disabled and honcho-admin.service restored."
echo "Verify with: systemctl is-active honcho-admin.service && curl -I http://127.0.0.1:8080/"
