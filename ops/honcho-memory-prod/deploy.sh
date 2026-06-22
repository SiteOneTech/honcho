#!/usr/bin/env bash
# Deploy Honcho Memory Console to the private honcho-memory-prod Tailscale sandbox.
#
# Secret policy:
# - No credential values are printed.
# - Runtime secrets live only in /etc/honcho-memory-console/runtime.env (0600).
# - First deploy bootstraps that file from the existing local Honcho/admin runtime
#   without committing or echoing secrets.

set -euo pipefail

PROJECT_ID="honcho-memory-console"
REMOTE_REPO_URL="${REMOTE_REPO_URL:-https://github.com/SiteOneTech/honcho.git}"
DEFAULT_BRANCH="factory/honcho-memory-console/inc-110-t10-deployment-packaging-for-hon"
BRANCH="${BRANCH:-$DEFAULT_BRANCH}"
PROJECT_DIR="${PROJECT_DIR:-/srv/factory/projects/${PROJECT_ID}}"
REPO_DIR="${REPO_DIR:-${PROJECT_DIR}/repo}"
ARTIFACT_ROOT="${ARTIFACT_ROOT:-/srv/factory/artifacts/${PROJECT_ID}}"
RUNTIME_ENV="${HONCHO_CONSOLE_RUNTIME_ENV:-/etc/honcho-memory-console/runtime.env}"
DEPLOY_ENV="${HONCHO_CONSOLE_DEPLOY_ENV:-/etc/honcho-memory-console/deploy.env}"
UNIT_SOURCE_REL="ops/honcho-memory-prod/honcho-console.service"
UNIT_TARGET="/etc/systemd/system/honcho-console.service"
COMPOSE_FILE_REL="ops/honcho-memory-prod/docker-compose.yml"
RUN_ID="${RUN_ID:-run-$(date -u +%Y%m%dT%H%M%SZ)}"
ARTIFACT_DIR="${ARTIFACT_ROOT}/${RUN_ID}"
WORKSPACE_ID="${HONCHO_CONSOLE_WORKSPACE:-hermes}"

usage() {
  cat <<USAGE
Usage: $0 [--branch BRANCH] [--repo-dir PATH] [--run-id RUN_ID]

Deploys the repo-managed Honcho Memory Console compose/systemd package to
honcho-memory-prod. The console is bound to the VM Tailscale IP by default.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      BRANCH="$2"; shift 2 ;;
    --repo-dir)
      REPO_DIR="$2"; PROJECT_DIR="$(dirname "$2")"; shift 2 ;;
    --run-id)
      RUN_ID="$2"; ARTIFACT_DIR="${ARTIFACT_ROOT}/${RUN_ID}"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

require_root() {
  if [[ "$(id -u)" != "0" ]]; then
    echo "ERROR: deploy must run as root on honcho-memory-prod." >&2
    exit 1
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: required command not found: $1" >&2
    exit 1
  }
}

detect_tailnet_ip() {
  local detected=""
  if command -v tailscale >/dev/null 2>&1; then
    detected="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
  fi
  if [[ -z "$detected" ]]; then
    detected="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi
  printf '%s' "${HONCHO_CONSOLE_BIND_ADDRESS:-${detected:-127.0.0.1}}"
}

sync_repo() {
  install -d -m 0755 "$PROJECT_DIR"
  if [[ ! -d "$REPO_DIR/.git" ]]; then
    git clone "$REMOTE_REPO_URL" "$REPO_DIR"
  fi
  cd "$REPO_DIR"
  if [[ -n "$(git status --porcelain=v1)" && "${HONCHO_CONSOLE_FORCE:-0}" != "1" ]]; then
    echo "ERROR: ${REPO_DIR} has local modifications; set HONCHO_CONSOLE_FORCE=1 to overwrite." >&2
    git status --short >&2
    exit 1
  fi
  git fetch origin --prune
  git checkout -B "$BRANCH" "origin/$BRANCH"
  git reset --hard "origin/$BRANCH" >/dev/null
}

write_deploy_env() {
  local bind_address="$1"
  install -d -m 0750 "$(dirname "$DEPLOY_ENV")"
  umask 077
  cat >"$DEPLOY_ENV" <<EOF_ENV
HONCHO_CONSOLE_BIND_ADDRESS=${bind_address}
HONCHO_CONSOLE_RUNTIME_ENV=${RUNTIME_ENV}
COMPOSE_PROJECT_NAME=honcho-memory-console
EOF_ENV
  chmod 0640 "$DEPLOY_ENV"
}

generate_honcho_token() {
  local token=""
  if [[ -d /opt/honcho ]]; then
    token="$(cd /opt/honcho && docker compose exec -T api python scripts/generate_jwt.py --workspace "$WORKSPACE_ID" --expires 30d --print-only 2>/dev/null || true)"
  fi
  printf '%s' "$token"
}

bootstrap_runtime_env() {
  local bind_address="$1"
  if [[ -f "$RUNTIME_ENV" ]]; then
    chmod 0600 "$RUNTIME_ENV"
    return
  fi

  local honcho_token
  honcho_token="$(generate_honcho_token)"
  install -d -m 0750 "$(dirname "$RUNTIME_ENV")"
  HONCHO_CONSOLE_BOOTSTRAP_TOKEN="$honcho_token" python3 - "$RUNTIME_ENV" "$bind_address" "$WORKSPACE_ID" <<'PY'
import ast
import os
import re
import secrets
import shlex
import sys
from pathlib import Path

runtime_env = Path(sys.argv[1])
bind_address = sys.argv[2]
workspace_id = sys.argv[3]
admin_password_path = Path('/opt/honcho-admin/admin_password')
admin_server_path = Path('/opt/honcho-admin/server.py')

def parse_admin_username() -> str:
    if not admin_server_path.exists():
        return 'operator'
    try:
        tree = ast.parse(admin_server_path.read_text(encoding='utf-8'))
    except Exception:
        return 'operator'
    for node in ast.walk(tree):
        if isinstance(node, ast.Compare) and len(node.ops) == 1 and isinstance(node.ops[0], ast.Eq):
            values = [node.left, *node.comparators]
            names = [item.id for item in values if isinstance(item, ast.Name)]
            constants = [item.value for item in values if isinstance(item, ast.Constant) and isinstance(item.value, str)]
            if 'user' in names and constants:
                return constants[0]
    return 'operator'

def read_admin_password() -> str:
    if admin_password_path.exists():
        password = admin_password_path.read_text(encoding='utf-8').strip()
        if password:
            return password
    return secrets.token_urlsafe(24)

def env_quote(value: str) -> str:
    if re.fullmatch(r'[A-Za-z0-9_./:@%+=,\-]+', value):
        return value
    return shlex.quote(value)

values = {
    'HONCHO_CONSOLE__BASIC_AUTH_USERNAME': parse_admin_username(),
    'HONCHO_CONSOLE__BASIC_AUTH_PASSWORD': read_admin_password(),
    'HONCHO_CONSOLE__HONCHO_API_URL': 'http://127.0.0.1:8000',
    'HONCHO_CONSOLE__AGENT_ID': 'zeus',
    'HONCHO_CONSOLE__AGENT_DISPLAY_NAME': 'Zeus',
    'HONCHO_CONSOLE__TENANT_ID': 'sitiouno-jean',
    'HONCHO_CONSOLE__RUNTIME_VM': 'honcho-memory-prod',
    'HONCHO_CONSOLE__TAILNET_IP': bind_address,
    'HONCHO_CONSOLE__ENVIRONMENT': 'private-tailscale-sandbox',
    'HONCHO_CONSOLE__HONCHO_WORKSPACE': workspace_id,
    'HONCHO_CONSOLE__AI_PEER': 'Zeus',
    'HONCHO_CONSOLE__HUMAN_PEER': 'Jean-Garcia',
}
token = os.environ.get('HONCHO_CONSOLE_BOOTSTRAP_TOKEN', '').strip()
if token:
    values['HONCHO_CONSOLE__HONCHO_API_TOKEN'] = token

content = ''.join(f'{key}={env_quote(value)}\n' for key, value in values.items())
runtime_env.write_text(content, encoding='utf-8')
os.chmod(runtime_env, 0o600)
PY
}

validate_runtime_env() {
  local missing=0
  for key in HONCHO_CONSOLE__BASIC_AUTH_USERNAME HONCHO_CONSOLE__BASIC_AUTH_PASSWORD HONCHO_CONSOLE__HONCHO_API_URL; do
    if ! grep -q "^${key}=" "$RUNTIME_ENV"; then
      echo "ERROR: missing ${key} in ${RUNTIME_ENV}" >&2
      missing=1
    fi
  done
  if [[ "$missing" == "1" ]]; then
    exit 1
  fi
}

install_unit() {
  install -m 0644 "${REPO_DIR}/${UNIT_SOURCE_REL}" "$UNIT_TARGET"
  systemctl daemon-reload
  systemctl enable honcho-console.service >/dev/null
}

start_console() {
  # Avoid `systemctl restart` here: the unit intentionally restores the
  # legacy honcho-admin.service in ExecStopPost for manual rollback safety.
  # A restart transaction can therefore cancel the new start job when the
  # conflicting admin unit is re-started during the stop phase. A sequential
  # stop/start keeps rollback semantics and lets the start transaction stop
  # honcho-admin.service through the unit Conflicts/ExecStartPre directives.
  if systemctl is-active --quiet honcho-console.service; then
    systemctl stop honcho-console.service
  fi
  systemctl start honcho-console.service
}

http_code() {
  local url="$1"
  curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$url" || true
}

wait_for_console() {
  local bind_address="$1"
  local code=""
  for _ in $(seq 1 45); do
    code="$(http_code "http://${bind_address}:8080/healthz")"
    if [[ "$code" == "200" ]]; then
      return 0
    fi
    sleep 2
  done
  echo "ERROR: honcho-console did not become healthy at /healthz; last_http_code=${code:-000}" >&2
  (cd "$REPO_DIR" && docker compose -f "$COMPOSE_FILE_REL" ps console) >&2 || true
  return 1
}

authenticated_code() {
  local path="$1"
  python3 - "$RUNTIME_ENV" "$path" <<'PY'
import base64
import shlex
import sys
import urllib.error
import urllib.request
from pathlib import Path

env_path = Path(sys.argv[1])
url = sys.argv[2]
values = {}
for raw in env_path.read_text(encoding='utf-8').splitlines():
    if not raw or raw.lstrip().startswith('#') or '=' not in raw:
        continue
    key, value = raw.split('=', 1)
    try:
        parsed = shlex.split(value)
        value = parsed[0] if parsed else ''
    except ValueError:
        pass
    values[key] = value
user = values.get('HONCHO_CONSOLE__BASIC_AUTH_USERNAME', '')
password = values.get('HONCHO_CONSOLE__BASIC_AUTH_PASSWORD', '')
token = base64.b64encode(f'{user}:{password}'.encode()).decode()
request = urllib.request.Request(url, headers={'Authorization': f'Basic {token}'})
try:
    with urllib.request.urlopen(request, timeout=8) as response:
        print(response.status)
except urllib.error.HTTPError as exc:
    print(exc.code)
except Exception:
    print('000')
PY
}

record_artifact() {
  local bind_address="$1"
  local commit="$2"
  install -d -m 0755 "$ARTIFACT_DIR"
  {
    echo "project=${PROJECT_ID}"
    echo "run_id=${RUN_ID}"
    echo "repo_dir=${REPO_DIR}"
    echo "branch=${BRANCH}"
    echo "commit=${commit}"
    echo "tailscale_url=http://${bind_address}:8080/"
    echo "runtime_env=${RUNTIME_ENV} (values redacted; mode $(stat -c '%a' "$RUNTIME_ENV"))"
    echo "deploy_env=${DEPLOY_ENV}"
    echo "unit=${UNIT_TARGET}"
    echo
    echo "systemd:"
    systemctl is-active honcho.service honcho-console.service honcho-update.timer || true
    echo
    echo "docker compose console:"
    (cd "$REPO_DIR" && docker compose -f "$COMPOSE_FILE_REL" ps console) || true
    echo
    echo "honcho core compose:"
    (cd /opt/honcho && docker compose ps) || true
    echo
    echo "http_healthz=$(http_code "http://${bind_address}:8080/healthz")"
    echo "http_root_unauth=$(http_code "http://${bind_address}:8080/")"
    echo "http_settings_auth=$(authenticated_code "http://${bind_address}:8080/api/settings")"
    echo "honcho_api_health=$(http_code http://127.0.0.1:8000/health)"
  } >"${ARTIFACT_DIR}/deploy-summary.txt"
  chmod 0644 "${ARTIFACT_DIR}/deploy-summary.txt"
}

print_summary() {
  local bind_address="$1"
  local commit="$2"
  echo "Deploy complete for ${PROJECT_ID}"
  echo "branch=${BRANCH}"
  echo "commit=${commit}"
  echo "tailscale_url=http://${bind_address}:8080/"
  echo "artifact=${ARTIFACT_DIR}/deploy-summary.txt"
  echo "runtime_env=${RUNTIME_ENV} (secret values redacted)"
}

main() {
  require_root
  require_command git
  require_command docker
  require_command systemctl
  require_command curl
  require_command python3

  local bind_address
  bind_address="$(detect_tailnet_ip)"

  sync_repo
  local commit
  commit="$(git -C "$REPO_DIR" rev-parse HEAD)"

  write_deploy_env "$bind_address"
  bootstrap_runtime_env "$bind_address"
  validate_runtime_env
  install_unit
  start_console
  wait_for_console "$bind_address"
  record_artifact "$bind_address" "$commit"
  print_summary "$bind_address" "$commit"
}

main "$@"
