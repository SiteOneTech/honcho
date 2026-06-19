import base64
import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from pydantic import SecretStr

from console.backend.app.adapters.local_services import (
    CommandResult,
    LocalServiceHealthAdapter,
    parse_docker_compose_ps,
    parse_proc_meminfo,
    parse_systemctl_show,
    parse_tailscale_status,
)
from console.backend.app.main import create_app
from console.backend.app.models import HealthCheck, ServiceHealthResponse
from console.backend.app.settings import ConsoleSettings

BASIC_PASSWORD = "factory-generated-basic-auth-credential"
HONCHO_TOKEN = "factory-generated-honcho-api-token-credential"
DATABASE_URL = "postgresql://honcho:factory-db-password@db.internal:5432/honcho"
REDIS_URL = "redis://:factory-redis-password@redis.internal:6379/0"
PROVIDER_KEY = "factory-generated-provider-key-credential"


def _basic_auth(username: str = "operator", password: str = BASIC_PASSWORD) -> dict[str, str]:
    encoded = base64.b64encode(f"{username}:{password}".encode()).decode()
    return {"Authorization": f"Basic {encoded}"}


def _settings(**overrides: Any) -> ConsoleSettings:
    values: dict[str, Any] = {
        "basic_auth_username": "operator",
        "basic_auth_password": SecretStr(BASIC_PASSWORD),
        "honcho_api_url": "http://127.0.0.1:8000",
        "honcho_api_token": SecretStr(HONCHO_TOKEN),
        "database_url": SecretStr(DATABASE_URL),
        "redis_url": SecretStr(REDIS_URL),
        "provider_api_keys": {"openai": SecretStr(PROVIDER_KEY), "anthropic": None},
    }
    values.update(overrides)
    return ConsoleSettings(**values)


def _assert_not_serialized(payload: object, *values: str) -> None:
    serialized = json.dumps(payload, sort_keys=True, default=str)
    for value in values:
        assert value not in serialized


class RecordingRunner:
    def __init__(
        self,
        responses: dict[tuple[str, ...], CommandResult] | None = None,
        exc: Exception | None = None,
    ) -> None:
        self.responses: dict[tuple[str, ...], CommandResult] = responses or {}
        self.exc: Exception | None = exc
        self.commands: list[tuple[str, ...]] = []
        self.cwd_values: list[Path | None] = []

    def run(
        self,
        command: Sequence[str],
        *,
        timeout_seconds: float,
        cwd: Path | None = None,
    ) -> CommandResult:
        _ = timeout_seconds
        self.commands.append(tuple(command))
        self.cwd_values.append(cwd)
        if self.exc is not None:
            raise self.exc
        return self.responses.get(
            tuple(command),
            CommandResult(args=tuple(command), returncode=1, stdout="", stderr="unavailable"),
        )


def _raise_probe(*_args: Any, **_kwargs: Any) -> Any:
    raise RuntimeError("synthetic failure containing secret factory-db-password")


def test_local_service_parsers_normalize_systemd_compose_tailscale_and_memory() -> None:
    systemd = parse_systemctl_show(
        "ActiveState=active\nSubState=running\nResult=success\nMainPID=123\n"
    )
    assert systemd == {
        "ActiveState": "active",
        "SubState": "running",
        "Result": "success",
        "MainPID": "123",
    }

    compose = parse_docker_compose_ps(
        '\n'.join(
            [
                '{"Service":"api","Name":"honcho-api-1","State":"running","Health":"healthy"}',
                '{"Service":"redis","Name":"honcho-redis-1","State":"exited","ExitCode":1}',
            ]
        )
    )
    assert compose["api"]["state"] == "running"
    assert compose["api"]["health"] == "healthy"
    assert compose["redis"]["state"] == "exited"
    assert compose["redis"]["exit_code"] == 1

    tailscale = parse_tailscale_status(
        '{"Self":{"HostName":"honcho-memory-prod","Online":true,"TailscaleIPs":["100.71.144.114"]}}'
    )
    assert tailscale == {
        "hostname": "honcho-memory-prod",
        "online": True,
        "ips": ["100.71.144.114"],
    }

    memory = parse_proc_meminfo("MemTotal: 1000 kB\nMemAvailable: 250 kB\n")
    assert memory["total_bytes"] == 1_024_000
    assert memory["available_bytes"] == 256_000
    assert memory["used_percent"] == 75.0


def test_health_adapter_degrades_unavailable_services_without_leaking_secrets() -> None:
    runner = RecordingRunner(exc=FileNotFoundError("system binary missing"))
    adapter = LocalServiceHealthAdapter(
        _settings(),
        command_runner=runner,
        honcho_api_probe=_raise_probe,
        postgres_probe=_raise_probe,
        redis_probe=_raise_probe,
        disk_usage_probe=lambda _path: (_ for _ in ()).throw(OSError("disk unavailable")),
        meminfo_reader=lambda: (_ for _ in ()).throw(OSError("meminfo unavailable")),
        loadavg_probe=lambda: (_ for _ in ()).throw(OSError("loadavg unavailable")),
    )

    response = adapter.collect()
    payload = response.model_dump(mode="json")
    checks = {check["id"]: check for check in payload["checks"]}

    assert payload["status"] == "degraded"
    assert checks["systemd:honcho.service"]["status"] == "unknown"
    assert checks["docker-compose"]["status"] == "unknown"
    assert checks["honcho-api"]["status"] == "degraded"
    assert checks["postgres"]["status"] == "degraded"
    assert checks["redis"]["status"] == "degraded"
    assert checks["disk:/"]["status"] == "unknown"
    assert checks["memory"]["status"] == "unknown"
    assert checks["cpu"]["status"] == "unknown"
    assert checks["tailscale"]["status"] == "unknown"
    assert checks["systemd:honcho-update.timer"]["status"] == "unknown"
    assert checks["provider-config"]["status"] == "healthy"
    assert checks["provider-config"]["evidence"] == {
        "provider_keys_configured": {"anthropic": False, "openai": True},
        "configured_count": 1,
    }
    _assert_not_serialized(
        payload,
        BASIC_PASSWORD,
        HONCHO_TOKEN,
        DATABASE_URL,
        REDIS_URL,
        PROVIDER_KEY,
        "factory-db-password",
    )


def test_health_adapter_uses_only_allowlisted_argument_vectors_for_local_commands() -> None:
    runner = RecordingRunner(
        {
            ("systemctl", "show", "honcho.service", "--property", "ActiveState", "--property", "SubState", "--property", "Result", "--property", "MainPID", "--property", "UnitFileState", "--no-pager"): CommandResult(
                args=("systemctl", "show", "honcho.service"),
                returncode=0,
                stdout="ActiveState=active\nSubState=running\nResult=success\nMainPID=123\nUnitFileState=enabled\n",
                stderr="",
            ),
            ("systemctl", "show", "honcho-admin.service", "--property", "ActiveState", "--property", "SubState", "--property", "Result", "--property", "MainPID", "--property", "UnitFileState", "--no-pager"): CommandResult(
                args=("systemctl", "show", "honcho-admin.service"),
                returncode=0,
                stdout="ActiveState=inactive\nSubState=dead\nResult=success\nMainPID=0\nUnitFileState=enabled\n",
                stderr="",
            ),
            ("systemctl", "show", "honcho-update.timer", "--property", "ActiveState", "--property", "SubState", "--property", "Result", "--property", "LastTriggerUSec", "--property", "NextElapseUSecRealtime", "--property", "UnitFileState", "--no-pager"): CommandResult(
                args=("systemctl", "show", "honcho-update.timer"),
                returncode=0,
                stdout="ActiveState=active\nSubState=waiting\nResult=success\nLastTriggerUSec=Fri 2026-06-19 10:00:00 UTC\nNextElapseUSecRealtime=Fri 2026-06-19 11:00:00 UTC\nUnitFileState=enabled\n",
                stderr="",
            ),
            ("docker", "compose", "ps", "--format", "json"): CommandResult(
                args=("docker", "compose", "ps", "--format", "json"),
                returncode=0,
                stdout='{"Service":"api","State":"running","Health":"healthy"}\n',
                stderr="",
            ),
            ("tailscale", "status", "--json"): CommandResult(
                args=("tailscale", "status", "--json"),
                returncode=0,
                stdout='{"Self":{"Online":true,"TailscaleIPs":["100.71.144.114"]}}',
                stderr="",
            ),
        }
    )
    adapter = LocalServiceHealthAdapter(
        _settings(database_url=None, redis_url=None),
        command_runner=runner,
        honcho_api_probe=lambda *_args, **_kwargs: {
            "ok": True,
            "latency_ms": 12.0,
            "evidence": {"http_status": 200},
        },
        disk_usage_probe=lambda _path: (100, 50, 50),
        meminfo_reader=lambda: "MemTotal: 1000 kB\nMemAvailable: 500 kB\n",
        loadavg_probe=lambda: (0.5, 0.4, 0.3),
        cpu_count_probe=lambda: 2,
    )

    response = adapter.collect()

    assert response.status == "degraded"  # honcho-admin is inactive and compose services are incomplete.
    assert runner.commands
    assert all(command[0] in {"systemctl", "docker", "tailscale"} for command in runner.commands)
    assert all(isinstance(part, str) for command in runner.commands for part in command)
    assert all(";" not in part and "$" not in part and "`" not in part for command in runner.commands for part in command)


def test_health_services_endpoint_is_authenticated_and_sanitized() -> None:
    class FakeHealthAdapter:
        def collect(self) -> ServiceHealthResponse:
            return ServiceHealthResponse(
                status="ok",
                checks=[
                    HealthCheck(
                        id="provider-config",
                        label="Provider configuration",
                        layer="config",
                        status="healthy",
                        summary="Provider configuration is present without exposing key values.",
                        evidence={"provider_keys_configured": {"openai": True}},
                    )
                ],
            )

    client = TestClient(create_app(_settings(), local_health_adapter=FakeHealthAdapter()))

    unauthenticated = client.get("/api/health/services")
    assert unauthenticated.status_code == 401
    _assert_not_serialized(unauthenticated.text, BASIC_PASSWORD, HONCHO_TOKEN, PROVIDER_KEY)

    response = client.get("/api/health/services", headers=_basic_auth())
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["checks"][0]["id"] == "provider-config"
    _assert_not_serialized(body, BASIC_PASSWORD, HONCHO_TOKEN, DATABASE_URL, REDIS_URL, PROVIDER_KEY)
