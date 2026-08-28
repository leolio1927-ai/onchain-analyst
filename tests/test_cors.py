"""CORS is env-allowlist opt-in: no CORS_ALLOW_ORIGINS → no middleware, no
CORS headers; allowlisted origin → preflight OK; others → no headers."""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from webapp import server


def _fresh_app() -> FastAPI:
    app = FastAPI()

    @app.get("/ping")
    def ping() -> dict:
        return {"ok": True}
    return app


def test_cors_disabled_by_default(monkeypatch):
    monkeypatch.delenv("CORS_ALLOW_ORIGINS", raising=False)
    app = _fresh_app()
    server._apply_cors(app)
    r = TestClient(app).options("/ping", headers={
        "Origin": "https://evil.example.com",
        "Access-Control-Request-Method": "POST",
    })
    assert "access-control-allow-origin" not in {k.lower() for k in r.headers}


def test_cors_allowlisted_origin_preflight_ok(monkeypatch):
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "https://alpha.example.com, https://alpha.pages.dev")
    app = _fresh_app()
    server._apply_cors(app)
    c = TestClient(app)
    r = c.options("/ping", headers={
        "Origin": "https://alpha.example.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
    })
    assert r.headers["access-control-allow-origin"] == "https://alpha.example.com"
    assert "POST" in r.headers["access-control-allow-methods"]
    # the second entry also gets through
    r2 = c.options("/ping", headers={
        "Origin": "https://alpha.pages.dev",
        "Access-Control-Request-Method": "GET",
    })
    assert r2.headers["access-control-allow-origin"] == "https://alpha.pages.dev"


def test_cors_non_allowlisted_origin_denied(monkeypatch):
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "https://alpha.example.com")
    app = _fresh_app()
    server._apply_cors(app)
    r = TestClient(app).options("/ping", headers={
        "Origin": "https://evil.example.com",
        "Access-Control-Request-Method": "POST",
    })
    assert "access-control-allow-origin" not in {k.lower() for k in r.headers}


def test_live_app_has_no_cors_headers_by_default():
    # the module-level app must stay same-origin unless the env is set
    r = TestClient(server.app).get("/api/health", headers={"Origin": "https://evil.example.com"})
    assert r.status_code == 200
    assert "access-control-allow-origin" not in {k.lower() for k in r.headers}
