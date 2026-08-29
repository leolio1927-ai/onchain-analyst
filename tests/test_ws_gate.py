"""/ws/snap access control: token auth (?token= vs WS_AUTH_TOKEN) and the
MAX_WS_CLIENTS cap (reject code 4429)."""
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from webapp import server


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    server._scan_cache.clear()
    server._WS_CLIENTS.clear()
    server._ws_open_warning_shown = False
    yield
    server._WS_CLIENTS.clear()
    server._ws_open_warning_shown = False


def test_ws_open_when_no_token_env(monkeypatch):
    monkeypatch.delenv("WS_AUTH_TOKEN", raising=False)
    with TestClient(server.app) as client, client.websocket_connect("/ws/snap") as ws:
        snap = ws.receive_json()
        assert snap["clients"] >= 1 and "ticks" in snap  # dev mode works


def test_ws_rejects_wrong_token(monkeypatch):
    monkeypatch.setenv("WS_AUTH_TOKEN", "sekrit")
    # handshake completes (accept-then-close) — the 4401 close frame
    # surfaces on the first receive
    with (TestClient(server.app) as client,
          client.websocket_connect("/ws/snap?token=WRONG") as ws,
          pytest.raises(WebSocketDisconnect) as ei):
        ws.receive_json()
    assert ei.value.code == 4401


def test_ws_accepts_right_token(monkeypatch):
    monkeypatch.setenv("WS_AUTH_TOKEN", "sekrit")
    with TestClient(server.app) as client, client.websocket_connect("/ws/snap?token=sekrit") as ws:
        snap = ws.receive_json()
        assert snap["clients"] >= 1


def test_ws_cap_rejects_overflow(monkeypatch):
    monkeypatch.delenv("WS_AUTH_TOKEN", raising=False)
    monkeypatch.setenv("MAX_WS_CLIENTS", "1")
    with TestClient(server.app) as client, client.websocket_connect("/ws/snap") as ws1:
        ws1.receive_json()  # slot taken
        with (pytest.raises(WebSocketDisconnect) as ei,
              client.websocket_connect("/ws/snap") as ws2):
            ws2.receive_json()
        assert ei.value.code == 4429
