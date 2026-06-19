# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false
"""Safe local server/service health adapter for Honcho Memory Console.

The adapter intentionally exposes only point-in-time, browser-safe health metadata.
Local command execution is restricted to allowlisted argument vectors and always uses
``subprocess.run(..., shell=False)``. No request parameter is ever interpolated into
a shell command, and exception text is not serialized because runtime errors can
contain DSNs, tokens, or host-specific secrets.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol, cast

import httpx
import psycopg
import redis as redis_lib
from psycopg import sql
from pydantic import SecretStr

from console.backend.app.models import (
    HealthCheck,
    HealthLayer,
    HealthStatus,
    ServiceHealthResponse,
)
from console.backend.app.settings import ConsoleSettings

__all__ = [
    "CommandResult",
    "CommandRunner",
    "LocalServiceHealthAdapter",
    "SubprocessCommandRunner",
    "parse_docker_compose_ps",
    "parse_proc_meminfo",
    "parse_systemctl_show",
    "parse_tailscale_status",
]

_ALLOWED_EXECUTABLES = frozenset({"systemctl", "docker", "tailscale"})
_ALLOWED_SYSTEMD_UNITS = frozenset(
    {
        "honcho.service",
        "honcho-admin.service",
        "honcho-console.service",
        "honcho-update.timer",
    }
)
_ALLOWED_DOCKER_SERVICES = frozenset({"api", "deriver", "database", "redis", "console"})
_ALLOWED_DISK_PATHS = frozenset({"/", "/opt/honcho", "/var/lib/docker/volumes"})
_SYSTEMD_SERVICE_PROPERTIES = (
    "ActiveState",
    "SubState",
    "Result",
    "MainPID",
    "UnitFileState",
)
_SYSTEMD_TIMER_PROPERTIES = (
    "ActiveState",
    "SubState",
    "Result",
    "LastTriggerUSec",
    "NextElapseUSecRealtime",
    "UnitFileState",
)
_POSTGRES_COUNT_TABLES = ("workspaces", "peers", "sessions", "messages")


@dataclass(frozen=True)
class CommandResult:
    """Captured result for a safe, non-shell command invocation."""

    args: tuple[str, ...]
    returncode: int
    stdout: str
    stderr: str


class CommandRunner(Protocol):
    """Protocol for injectable command execution in tests."""

    def run(
        self,
        command: Sequence[str],
        *,
        timeout_seconds: float,
        cwd: Path | None = None,
    ) -> CommandResult:
        """Run an allowlisted command vector without a shell."""
        ...


class SubprocessCommandRunner:
    """Default runner: allowlisted executables, list args, never shell=True."""

    def run(
        self,
        command: Sequence[str],
        *,
        timeout_seconds: float,
        cwd: Path | None = None,
    ) -> CommandResult:
        args = tuple(str(part) for part in command)
        if not args or args[0] not in _ALLOWED_EXECUTABLES:
            raise ValueError("Command is not allowlisted for health checks.")

        completed = subprocess.run(  # noqa: S603 - executable is allowlisted above.
            args,
            cwd=cwd,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            shell=False,
        )
        return CommandResult(
            args=args,
            returncode=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
        )


ProbeResult = Mapping[str, Any]
HealthProbe = Callable[..., ProbeResult]
DiskUsageProbe = Callable[[str], tuple[int, int, int]]
MeminfoReader = Callable[[], str]
LoadAverageProbe = Callable[[], tuple[float, float, float]]
CpuCountProbe = Callable[[], int | None]


class LocalServiceHealthAdapter:
    """Collect safe local service health checks for the private console API."""

    def __init__(
        self,
        settings: ConsoleSettings,
        *,
        command_runner: CommandRunner | None = None,
        honcho_api_probe: HealthProbe | None = None,
        postgres_probe: HealthProbe | None = None,
        redis_probe: HealthProbe | None = None,
        disk_usage_probe: DiskUsageProbe | None = None,
        meminfo_reader: MeminfoReader | None = None,
        loadavg_probe: LoadAverageProbe | None = None,
        cpu_count_probe: CpuCountProbe | None = None,
    ) -> None:
        self._settings: ConsoleSettings = settings
        self._runner: CommandRunner = command_runner or SubprocessCommandRunner()
        self._honcho_api_probe: HealthProbe = honcho_api_probe or probe_honcho_api
        self._postgres_probe: HealthProbe = postgres_probe or probe_postgres
        self._redis_probe: HealthProbe = redis_probe or probe_redis
        self._disk_usage_probe: DiskUsageProbe = disk_usage_probe or _disk_usage
        self._meminfo_reader: MeminfoReader = meminfo_reader or _read_proc_meminfo
        self._loadavg_probe: LoadAverageProbe = loadavg_probe or os.getloadavg
        self._cpu_count_probe: CpuCountProbe = cpu_count_probe or os.cpu_count

    def collect(self) -> ServiceHealthResponse:
        """Return all required health checks without raising adapter failures."""

        checks: list[HealthCheck] = []
        checks.extend(self._systemd_service_checks())
        checks.append(self._docker_compose_check())
        checks.append(self._honcho_api_check())
        checks.append(self._postgres_check())
        checks.append(self._redis_check())
        checks.extend(self._disk_checks())
        checks.append(self._memory_check())
        checks.append(self._cpu_check())
        checks.append(self._tailscale_check())
        checks.append(self._update_timer_check())
        checks.append(self._provider_config_check())

        overall = "ok" if all(check.status == "healthy" for check in checks) else "degraded"
        return ServiceHealthResponse(status=overall, checks=checks)

    def _systemd_service_checks(self) -> list[HealthCheck]:
        return [
            self._systemd_unit_check(
                unit=unit,
                label=f"systemd {unit}",
                layer="service",
                properties=_SYSTEMD_SERVICE_PROPERTIES,
            )
            for unit in self._settings.local_health_systemd_units
        ]

    def _systemd_unit_check(
        self,
        *,
        unit: str,
        label: str,
        layer: HealthLayer,
        properties: tuple[str, ...],
    ) -> HealthCheck:
        try:
            command = _systemctl_show_command(unit, properties)
            result = self._runner.run(
                command,
                timeout_seconds=self._settings.local_health_command_timeout_seconds,
            )
        except Exception as exc:
            return _check(
                id=f"systemd:{unit}",
                label=label,
                layer=layer,
                status="unknown",
                summary=f"{unit} could not be checked safely.",
                evidence={"error_type": type(exc).__name__},
            )

        if result.returncode != 0:
            return _check(
                id=f"systemd:{unit}",
                label=label,
                layer=layer,
                status="unknown",
                summary=f"{unit} state is unavailable.",
                evidence={"returncode": result.returncode},
            )

        props = parse_systemctl_show(result.stdout)
        active_state = props.get("ActiveState") or "unknown"
        sub_state = props.get("SubState") or "unknown"
        status = _systemd_status(active_state)
        return _check(
            id=f"systemd:{unit}",
            label=label,
            layer=layer,
            status=status,
            summary=f"{unit} is {active_state}/{sub_state}.",
            evidence={key: props[key] for key in props if key in properties},
        )

    def _docker_compose_check(self) -> HealthCheck:
        cwd = _compose_cwd(self._settings.local_health_docker_compose_directory)
        try:
            result = self._runner.run(
                ("docker", "compose", "ps", "--format", "json"),
                timeout_seconds=self._settings.local_health_command_timeout_seconds,
                cwd=cwd,
            )
        except Exception as exc:
            return _check(
                id="docker-compose",
                label="Docker compose services",
                layer="service",
                status="unknown",
                summary="Docker compose state could not be checked safely.",
                evidence={"error_type": type(exc).__name__},
            )

        if result.returncode != 0:
            return _check(
                id="docker-compose",
                label="Docker compose services",
                layer="service",
                status="unknown",
                summary="Docker compose did not return service state.",
                evidence={"returncode": result.returncode},
            )

        services = parse_docker_compose_ps(result.stdout)
        if not services:
            return _check(
                id="docker-compose",
                label="Docker compose services",
                layer="service",
                status="unknown",
                summary="Docker compose returned no service rows.",
                evidence={"services": {}},
            )

        expected = tuple(
            service
            for service in self._settings.local_health_docker_services
            if service in _ALLOWED_DOCKER_SERVICES
        )
        service_states: dict[str, dict[str, Any]] = {}
        statuses: list[HealthStatus] = []
        for service in expected:
            state = services.get(service)
            if state is None:
                service_status: HealthStatus = "unknown"
                service_states[service] = {"status": service_status, "present": False}
            else:
                service_status = _compose_service_status(state)
                service_states[service] = {**state, "status": service_status, "present": True}
            statuses.append(service_status)

        aggregate = _aggregate_status(statuses)
        return _check(
            id="docker-compose",
            label="Docker compose services",
            layer="service",
            status=aggregate,
            summary=_compose_summary(aggregate),
            evidence={"services": service_states},
        )

    def _honcho_api_check(self) -> HealthCheck:
        try:
            started = time.perf_counter()
            result = self._honcho_api_probe(
                self._settings.honcho_api_url,
                self._settings.honcho_api_token,
                self._settings.local_health_http_timeout_seconds,
            )
            latency_ms = _float_or_none(result.get("latency_ms"))
            if latency_ms is None:
                latency_ms = round((time.perf_counter() - started) * 1000, 2)
            ok = bool(result.get("ok"))
            return _check(
                id="honcho-api",
                label="Honcho API /health",
                layer="service",
                status="healthy" if ok else "degraded",
                summary=(
                    "Honcho API health endpoint responded successfully."
                    if ok
                    else "Honcho API health endpoint returned a degraded result."
                ),
                latency_ms=latency_ms,
                evidence=_safe_mapping(result.get("evidence")),
            )
        except Exception as exc:
            return _check(
                id="honcho-api",
                label="Honcho API /health",
                layer="service",
                status="degraded",
                summary="Honcho API health endpoint is unavailable.",
                evidence={"error_type": type(exc).__name__},
            )

    def _postgres_check(self) -> HealthCheck:
        database_url = _secret_value(self._settings.database_url)
        if database_url is None:
            return _check(
                id="postgres",
                label="Postgres",
                layer="storage",
                status="unknown",
                summary="Postgres URL is not configured for the console.",
                evidence={"configured": False},
            )

        try:
            result = self._postgres_probe(
                database_url,
                self._settings.local_health_postgres_connect_timeout_seconds,
            )
            ok = bool(result.get("ok"))
            return _check(
                id="postgres",
                label="Postgres",
                layer="storage",
                status="healthy" if ok else "degraded",
                summary=(
                    "Postgres SELECT 1 succeeded."
                    if ok
                    else "Postgres check returned a degraded result."
                ),
                latency_ms=_float_or_none(result.get("latency_ms")),
                evidence=_safe_mapping(result.get("evidence")),
            )
        except Exception as exc:
            return _check(
                id="postgres",
                label="Postgres",
                layer="storage",
                status="degraded",
                summary="Postgres health check failed without exposing connection details.",
                evidence={"configured": True, "error_type": type(exc).__name__},
            )

    def _redis_check(self) -> HealthCheck:
        redis_url = _secret_value(self._settings.redis_url)
        if redis_url is None:
            return _check(
                id="redis",
                label="Redis",
                layer="storage",
                status="unknown",
                summary="Redis URL is not configured for the console.",
                evidence={"configured": False},
            )

        try:
            result = self._redis_probe(
                redis_url,
                self._settings.local_health_redis_socket_timeout_seconds,
            )
            ok = bool(result.get("ok"))
            return _check(
                id="redis",
                label="Redis",
                layer="storage",
                status="healthy" if ok else "degraded",
                summary="Redis PING succeeded." if ok else "Redis PING returned a degraded result.",
                latency_ms=_float_or_none(result.get("latency_ms")),
                evidence=_safe_mapping(result.get("evidence")),
            )
        except Exception as exc:
            return _check(
                id="redis",
                label="Redis",
                layer="storage",
                status="degraded",
                summary="Redis health check failed without exposing connection details.",
                evidence={"configured": True, "error_type": type(exc).__name__},
            )

    def _disk_checks(self) -> list[HealthCheck]:
        checks: list[HealthCheck] = []
        for path in self._settings.local_health_disk_paths:
            if path not in _ALLOWED_DISK_PATHS:
                continue
            try:
                total, used, free = self._disk_usage_probe(path)
                used_percent = round((used / total) * 100, 2) if total else None
                status = _usage_status(used_percent)
                checks.append(
                    _check(
                        id=f"disk:{path}",
                        label=f"Disk {path}",
                        layer="resource",
                        status=status,
                        summary=f"Disk {path} is {used_percent}% used."
                        if used_percent is not None
                        else f"Disk {path} usage is unknown.",
                        evidence={
                            "path": path,
                            "total_bytes": total,
                            "used_bytes": used,
                            "free_bytes": free,
                            "used_percent": used_percent,
                        },
                    )
                )
            except Exception as exc:
                checks.append(
                    _check(
                        id=f"disk:{path}",
                        label=f"Disk {path}",
                        layer="resource",
                        status="unknown",
                        summary=f"Disk {path} usage could not be read.",
                        evidence={"path": path, "error_type": type(exc).__name__},
                    )
                )
        return checks

    def _memory_check(self) -> HealthCheck:
        try:
            memory = parse_proc_meminfo(self._meminfo_reader())
            used_percent = _float_or_none(memory.get("used_percent"))
            return _check(
                id="memory",
                label="Memory",
                layer="resource",
                status=_usage_status(used_percent),
                summary=f"Memory is {used_percent}% used."
                if used_percent is not None
                else "Memory usage is unknown.",
                evidence=memory,
            )
        except Exception as exc:
            return _check(
                id="memory",
                label="Memory",
                layer="resource",
                status="unknown",
                summary="Memory usage could not be read from /proc/meminfo.",
                evidence={"error_type": type(exc).__name__},
            )

    def _cpu_check(self) -> HealthCheck:
        try:
            load_1m, load_5m, load_15m = self._loadavg_probe()
            cpu_count = self._cpu_count_probe() or 1
            load_percent = round((load_1m / cpu_count) * 100, 2)
            return _check(
                id="cpu",
                label="CPU load",
                layer="resource",
                status=_usage_status(load_percent),
                summary=f"CPU 1m load is {load_percent}% of {cpu_count} cores.",
                evidence={
                    "load_1m": load_1m,
                    "load_5m": load_5m,
                    "load_15m": load_15m,
                    "cpu_count": cpu_count,
                    "load_percent": load_percent,
                },
            )
        except Exception as exc:
            return _check(
                id="cpu",
                label="CPU load",
                layer="resource",
                status="unknown",
                summary="CPU load average could not be read.",
                evidence={"error_type": type(exc).__name__},
            )

    def _tailscale_check(self) -> HealthCheck:
        try:
            result = self._runner.run(
                ("tailscale", "status", "--json"),
                timeout_seconds=self._settings.local_health_command_timeout_seconds,
            )
        except Exception as exc:
            return _check(
                id="tailscale",
                label="Tailscale",
                layer="network",
                status="unknown",
                summary="Tailscale status could not be checked safely.",
                evidence={"error_type": type(exc).__name__},
            )

        if result.returncode != 0:
            return _check(
                id="tailscale",
                label="Tailscale",
                layer="network",
                status="unknown",
                summary="Tailscale status did not return JSON state.",
                evidence={"returncode": result.returncode},
            )

        parsed = parse_tailscale_status(result.stdout)
        online = parsed.get("online") is True
        ips = cast(list[str], parsed.get("ips") or [])
        status: HealthStatus = "healthy" if online and ips else "degraded"
        return _check(
            id="tailscale",
            label="Tailscale",
            layer="network",
            status=status,
            summary="Tailscale is online." if status == "healthy" else "Tailscale is degraded.",
            evidence=parsed,
        )

    def _update_timer_check(self) -> HealthCheck:
        return self._systemd_unit_check(
            unit=self._settings.local_health_update_timer_unit,
            label="Honcho update timer",
            layer="update",
            properties=_SYSTEMD_TIMER_PROPERTIES,
        )

    def _provider_config_check(self) -> HealthCheck:
        configured = {
            name: value is not None
            for name, value in sorted(self._settings.provider_api_keys.items())
        }
        configured_count = sum(1 for value in configured.values() if value)
        status: HealthStatus = "healthy" if configured_count else "degraded"
        return _check(
            id="provider-config",
            label="Provider configuration",
            layer="config",
            status=status,
            summary=(
                "Provider configuration is present without exposing key values."
                if configured_count
                else "No provider API keys are configured."
            ),
            evidence={
                "provider_keys_configured": configured,
                "configured_count": configured_count,
            },
        )


def probe_honcho_api(
    honcho_api_url: str,
    honcho_api_token: SecretStr | None,
    timeout_seconds: float,
) -> ProbeResult:
    """Probe Honcho ``/health`` without exposing Authorization."""

    started = time.perf_counter()
    url = f"{honcho_api_url.rstrip('/')}/health"
    headers: dict[str, str] = {}
    token = _secret_value(honcho_api_token)
    if token:
        headers["Authorization"] = f"Bearer {token}"

    with httpx.Client(timeout=timeout_seconds) as client:
        response = client.get(url, headers=headers)

    body_status: str | None = None
    try:
        body = response.json()
    except ValueError:
        body = None
    if isinstance(body, Mapping):
        body_status = _str_or_none(body.get("status")) or _str_or_none(body.get("state"))

    return {
        "ok": response.status_code == 200,
        "latency_ms": round((time.perf_counter() - started) * 1000, 2),
        "evidence": {"http_status": response.status_code, "body_status": body_status},
    }


def probe_postgres(database_url: str, connect_timeout_seconds: int) -> ProbeResult:
    """Probe Postgres with SELECT 1 and best-effort allowlisted table counts."""

    started = time.perf_counter()
    table_counts: dict[str, int] = {}
    with psycopg.connect(database_url, connect_timeout=connect_timeout_seconds) as connection:
        connection.autocommit = True
        connection.read_only = True
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            select_ok = cursor.fetchone() == (1,)
            existing_tables = _existing_public_tables(cursor, _POSTGRES_COUNT_TABLES)
            for table in existing_tables:
                cursor.execute(sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(table)))
                row = cursor.fetchone()
                table_counts[table] = int(row[0]) if row else 0

    return {
        "ok": select_ok,
        "latency_ms": round((time.perf_counter() - started) * 1000, 2),
        "evidence": {"select_1": select_ok, "table_counts": table_counts},
    }


def probe_redis(redis_url: str, socket_timeout_seconds: float) -> ProbeResult:
    """Probe Redis with PING without serializing the URL."""

    started = time.perf_counter()
    client = redis_lib.Redis.from_url(
        redis_url,
        socket_connect_timeout=socket_timeout_seconds,
        socket_timeout=socket_timeout_seconds,
        decode_responses=True,
    )
    try:
        pong = bool(client.ping())
    finally:
        client.close()
    return {
        "ok": pong,
        "latency_ms": round((time.perf_counter() - started) * 1000, 2),
        "evidence": {"ping": pong},
    }


def parse_systemctl_show(output: str) -> dict[str, str]:
    """Parse ``systemctl show`` key/value output."""

    parsed: dict[str, str] = {}
    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key:
            parsed[key] = value
    return parsed


def parse_docker_compose_ps(output: str) -> dict[str, dict[str, Any]]:
    """Parse Docker Compose JSON output from list or JSON-lines formats."""

    text = output.strip()
    if not text:
        return {}

    rows: list[Mapping[str, Any]] = []
    try:
        loaded = json.loads(text)
        if isinstance(loaded, list):
            rows.extend(item for item in loaded if isinstance(item, Mapping))
        elif isinstance(loaded, Mapping):
            rows.append(loaded)
    except ValueError:
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            try:
                item = json.loads(stripped)
            except ValueError:
                continue
            if isinstance(item, Mapping):
                rows.append(item)

    services: dict[str, dict[str, Any]] = {}
    for row in rows:
        service = _str_or_none(row.get("Service")) or _str_or_none(row.get("service"))
        if service is None:
            continue
        state = _str_or_none(row.get("State")) or _str_or_none(row.get("state"))
        health = _str_or_none(row.get("Health")) or _str_or_none(row.get("health"))
        name = _str_or_none(row.get("Name")) or _str_or_none(row.get("name"))
        services[service] = {
            "name": name,
            "state": state.lower() if state else None,
            "health": health.lower() if health else None,
            "exit_code": _int_or_none(row.get("ExitCode") or row.get("exit_code")),
        }
    return services


def parse_tailscale_status(output: str) -> dict[str, Any]:
    """Parse ``tailscale status --json`` into safe summary fields."""

    data = json.loads(output or "{}")
    if not isinstance(data, Mapping):
        return {"hostname": None, "online": None, "ips": []}
    self_node_raw = data.get("Self")
    if not isinstance(self_node_raw, Mapping):
        return {"hostname": None, "online": None, "ips": []}
    self_node = cast(Mapping[str, Any], self_node_raw)

    raw_ips_value = self_node.get("TailscaleIPs")
    raw_ips = raw_ips_value if isinstance(raw_ips_value, list) else []
    ips = [str(item) for item in raw_ips if item]
    return {
        "hostname": _str_or_none(self_node.get("HostName")),
        "online": self_node.get("Online") if isinstance(self_node.get("Online"), bool) else None,
        "ips": ips,
    }


def parse_proc_meminfo(output: str) -> dict[str, Any]:
    """Parse Linux ``/proc/meminfo`` and calculate used percentage."""

    values: dict[str, int] = {}
    for line in output.splitlines():
        if ":" not in line:
            continue
        key, rest = line.split(":", 1)
        parts = rest.strip().split()
        if not parts:
            continue
        try:
            amount = int(parts[0])
        except ValueError:
            continue
        unit = parts[1].lower() if len(parts) > 1 else "kb"
        multiplier = 1024 if unit == "kb" else 1
        values[key] = amount * multiplier

    total = values.get("MemTotal")
    available = values.get("MemAvailable") or values.get("MemFree")
    used_percent = None
    if total and available is not None:
        used_percent = round(((total - available) / total) * 100, 2)
    return {
        "total_bytes": total,
        "available_bytes": available,
        "used_percent": used_percent,
    }


def _systemctl_show_command(unit: str, properties: tuple[str, ...]) -> tuple[str, ...]:
    if unit not in _ALLOWED_SYSTEMD_UNITS:
        raise ValueError("Systemd unit is not allowlisted for health checks.")
    command: list[str] = ["systemctl", "show", unit]
    for prop in properties:
        command.extend(("--property", prop))
    command.append("--no-pager")
    return tuple(command)


def _systemd_status(active_state: str) -> HealthStatus:
    if active_state == "active":
        return "healthy"
    if active_state in {"activating", "reloading", "deactivating"}:
        return "degraded"
    if active_state in {"inactive", "failed"}:
        return "down"
    return "unknown"


def _compose_service_status(service: Mapping[str, Any]) -> HealthStatus:
    state = _str_or_none(service.get("state"))
    health = _str_or_none(service.get("health"))
    if state == "running" and health in {None, "", "healthy", "starting"}:
        return "healthy" if health != "starting" else "degraded"
    if state == "running":
        return "degraded"
    if state in {"exited", "dead", "removing"}:
        return "down"
    return "unknown"


def _aggregate_status(statuses: Sequence[HealthStatus]) -> HealthStatus:
    if not statuses:
        return "unknown"
    if any(status == "down" for status in statuses):
        return "down"
    if any(status == "degraded" for status in statuses):
        return "degraded"
    if any(status == "unknown" for status in statuses):
        return "degraded"
    return "healthy"


def _compose_summary(status: HealthStatus) -> str:
    if status == "healthy":
        return "All allowlisted Docker compose services are running."
    if status == "down":
        return "One or more allowlisted Docker compose services are down."
    if status == "degraded":
        return "Docker compose services are degraded or incomplete."
    return "Docker compose service health is unknown."


def _usage_status(value: float | None) -> HealthStatus:
    if value is None:
        return "unknown"
    if value >= 95:
        return "down"
    if value >= 85:
        return "degraded"
    return "healthy"


def _check(
    *,
    id: str,
    label: str,
    layer: HealthLayer,
    status: HealthStatus,
    summary: str,
    latency_ms: float | None = None,
    evidence: Mapping[str, Any] | None = None,
) -> HealthCheck:
    return HealthCheck(
        id=id,
        label=label,
        layer=layer,
        status=status,
        summary=summary,
        latency_ms=latency_ms,
        evidence=dict(evidence or {}),
        safe_to_show=True,
    )


def _safe_mapping(value: Any) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        return {}
    return {str(key): item for key, item in value.items() if _safe_evidence_value(item)}


def _safe_evidence_value(value: Any) -> bool:
    return isinstance(value, (str, int, float, bool, type(None), dict, list, tuple))


def _compose_cwd(value: str | None) -> Path | None:
    if value is None or not value.strip():
        return None
    return Path(value).expanduser()


def _secret_value(value: SecretStr | None) -> str | None:
    if value is None:
        return None
    raw = value.get_secret_value()
    return raw or None


def _str_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _int_or_none(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _float_or_none(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _disk_usage(path: str) -> tuple[int, int, int]:
    usage = shutil.disk_usage(path)
    return usage.total, usage.used, usage.free


def _read_proc_meminfo() -> str:
    return Path("/proc/meminfo").read_text(encoding="utf-8")


def _existing_public_tables(cursor: Any, table_names: tuple[str, ...]) -> set[str]:
    cursor.execute(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY(%s)
        """,
        (list(table_names),),
    )
    return {str(row[0]) for row in cursor.fetchall()}
