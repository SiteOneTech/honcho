import base64
from pathlib import Path

from fastapi.testclient import TestClient
from pydantic import SecretStr

from console.backend.app.main import create_app
from console.backend.app.settings import ConsoleSettings

BASIC_PASSWORD = "factory-generated-basic-auth-credential"


def _basic_auth(username: str = "operator", password: str = BASIC_PASSWORD) -> dict[str, str]:
    encoded = base64.b64encode(f"{username}:{password}".encode()).decode()
    return {"Authorization": f"Basic {encoded}"}


def test_frontend_static_bundle_is_served_behind_basic_auth(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)
    (dist / "index.html").write_text(
        "<html><body><div id='root'>Honcho Memory Console</div></body></html>",
        encoding="utf-8",
    )
    (assets / "app.js").write_text("console.log('bundle loaded')", encoding="utf-8")
    settings = ConsoleSettings(
        basic_auth_username="operator",
        basic_auth_password=SecretStr(BASIC_PASSWORD),
        frontend_static_dir=str(dist),
    )
    client = TestClient(create_app(settings))

    unauthenticated = client.get("/")
    assert unauthenticated.status_code == 401
    assert unauthenticated.headers["www-authenticate"].startswith("Basic")

    health = client.get("/healthz")
    assert health.status_code == 200
    assert health.json() == {"status": "ok", "service": "honcho-memory-console"}

    index = client.get("/", headers=_basic_auth())
    assert index.status_code == 200
    assert "Honcho Memory Console" in index.text

    asset = client.get("/assets/app.js", headers=_basic_auth())
    assert asset.status_code == 200
    assert "bundle loaded" in asset.text
