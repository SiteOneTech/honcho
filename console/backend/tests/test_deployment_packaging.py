from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OPS = ROOT / "ops" / "honcho-memory-prod"


def _read(name: str) -> str:
    return (OPS / name).read_text(encoding="utf-8")


def test_honcho_memory_prod_deploy_pack_has_required_repo_managed_files() -> None:
    required = [
        "console.Dockerfile",
        "docker-compose.yml",
        "honcho-console.service",
        "deploy.sh",
        "rollback.sh",
        "README.md",
        "runtime.env.example",
    ]
    missing = [name for name in required if not (OPS / name).is_file()]
    assert missing == []


def test_repo_gitignore_allows_the_ops_compose_file_to_be_tracked() -> None:
    gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    assert "docker-compose.yml" in gitignore
    assert "!ops/honcho-memory-prod/docker-compose.yml" in gitignore


def test_compose_uses_runtime_env_without_baking_or_mounting_secrets() -> None:
    compose = _read("docker-compose.yml")
    assert "HONCHO_CONSOLE_RUNTIME_ENV" in compose
    assert "/etc/honcho-memory-console/runtime.env" in compose
    assert "network_mode: host" in compose
    assert "HONCHO_CONSOLE_BIND_ADDRESS" in compose
    assert "/var/run/docker.sock" not in compose
    assert "BASIC_AUTH_PASSWORD:" not in compose
    assert "HONCHO_API_TOKEN:" not in compose


def test_systemd_unit_uses_factory_sandbox_path_and_restores_legacy_admin_on_stop() -> None:
    unit = _read("honcho-console.service")
    assert "/srv/factory/projects/honcho-memory-console/repo" in unit
    assert "Conflicts=honcho-admin.service" in unit
    assert "ExecStartPre=/usr/bin/systemctl stop honcho-admin.service" in unit
    assert "ExecStopPost=/usr/bin/systemctl start honcho-admin.service" in unit
    assert "docker compose" in unit


def test_deploy_and_rollback_scripts_document_verification_and_secret_hygiene() -> None:
    deploy = _read("deploy.sh")
    rollback = _read("rollback.sh")
    assert "set -euo pipefail" in deploy
    assert "deploy-summary.txt" in deploy
    assert "http_settings_auth" in deploy
    assert "chmod 0600" in deploy
    assert "HONCHO_CONSOLE_BOOTSTRAP_TOKEN" in deploy
    assert "print(response.status)" in deploy
    assert "echo \"$honcho_token\"" not in deploy
    assert "honcho-admin.service" in rollback
    assert "disable --now honcho-console.service" in rollback
