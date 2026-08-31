"""/ws/tape additive delta channel (offline): pinned-pool dedup, follow-mode
over the scan cache, error frames, and auth/cap parity with /ws/snap."""
import time

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from webapp import server


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.setenv("ALPHA_TAPE_INTERVAL_S", "0.2")
    monkeypatch.delenv("WS_AUTH_TOKEN", raising=False)
    server._scan_cache.clear()
    server._WS_CLIENTS.clear()
    server._ws_open_warning_shown = False
    yield
    server._WS_CLIENTS.clear()
    server._ws_open_warning_shown = False


def _trade(w, ts, kind="buy", usd="10.0"):
    return {"wallet": w, "kind": kind, "ts": ts, "usd": float(usd), "base_token": "BASE1"}


def _scripted_feed(*batches):
    """fetch_trades returns batch[i] on call i, repeating the last batch."""
    calls = {"n": 0}

    def fake(chain, pool):
        b = batches[min(calls["n"], len(batches) - 1)]
        calls["n"] += 1
        return list(b)

    return fake


def test_tape_first_frame_full_then_delta(monkeypatch):
    b1 = [_trade("W1", "2026-08-28T06:00:01Z"), _trade("W2", "2026-08-28T06:00:02Z")]
    b2 = b1 + [_trade("W3", "2026-08-28T06:00:03Z"), _trade("W4", "2026-08-28T06:00:04Z")]
    monkeypatch.setattr("providers.geckoterminal.fetch_trades", _scripted_feed(b1, b2))
    with (TestClient(server.app) as client,
          client.websocket_connect("/ws/tape?chain=sol&pool=POOLX") as ws):
        f1 = ws.receive_json()
        assert f1["type"] == "tape" and f1["chain"] == "sol" and f1["pool"] == "POOLX"
        assert [t["wallet"] for t in f1["trades"]] == ["W1", "W2"]
        assert set(f1["trades"][0]) == {"wallet", "kind", "ts", "usd", "base_token"}
        f2 = ws.receive_json()
        assert [t["wallet"] for t in f2["trades"]] == ["W3", "W4"]  # additive delta only


def test_tape_follows_latest_scan_pool(monkeypatch):
    monkeypatch.setattr("providers.geckoterminal.fetch_trades",
                        _scripted_feed([_trade("W9", "2026-08-28T06:00:09Z")]))
    server._scan_cache[("sol", "TOK1")] = (
        time.monotonic(), {"pair": {"pairAddress": "POOLY", "baseToken": {"symbol": "Y"}}})
    with TestClient(server.app) as client, client.websocket_connect("/ws/tape") as ws:
        f = ws.receive_json()
        assert f["pool"] == "POOLY" and f["chain"] == "sol" and f["trades"][0]["wallet"] == "W9"


def test_tape_no_active_pool_heartbeat(monkeypatch):
    # empty scan cache + no pinned pool → honest empty frame, no invention
    with TestClient(server.app) as client, client.websocket_connect("/ws/tape") as ws:
        f = ws.receive_json()
        assert f["type"] == "tape" and f["pool"] is None and f["trades"] == []


def test_tape_error_frame_on_upstream_fail(monkeypatch):
    import urllib.error

    def boom(chain, pool):
        raise urllib.error.HTTPError("u", 429, "rate", None, None)

    monkeypatch.setattr("providers.geckoterminal.fetch_trades", boom)
    with (TestClient(server.app) as client,
          client.websocket_connect("/ws/tape?chain=sol&pool=POOLX") as ws):
        f = ws.receive_json()
        assert f["trades"] == [] and "429" in f["error"]


def test_tape_pinned_params_need_both(monkeypatch):
    for bad in ("/ws/tape?chain=sol", "/ws/tape?pool=POOLX",
                "/ws/tape?chain=avax&pool=POOLX"):  # avax: parked, not on GT
        with (TestClient(server.app) as client,
              client.websocket_connect(bad) as ws,
              pytest.raises(WebSocketDisconnect) as ei):
            ws.receive_json()
        assert ei.value.code == 4400


def test_tape_auth_and_cap_parity_with_snap(monkeypatch):
    monkeypatch.setenv("WS_AUTH_TOKEN", "sekrit")
    with (TestClient(server.app) as client,
          client.websocket_connect("/ws/tape?chain=sol&pool=P") as ws,
          pytest.raises(WebSocketDisconnect) as ei):
        ws.receive_json()
    assert ei.value.code == 4401

    with TestClient(server.app) as client, \
            client.websocket_connect("/ws/tape?chain=sol&pool=P&token=sekrit") as ws:
        assert ws.receive_json()["type"] == "tape"

    # shared client cap: snap takes the only slot, tape must be rejected too
    monkeypatch.delenv("WS_AUTH_TOKEN", raising=False)
    monkeypatch.setenv("MAX_WS_CLIENTS", "1")
    with TestClient(server.app) as client, client.websocket_connect("/ws/snap") as ws1:
        ws1.receive_json()
        with (pytest.raises(WebSocketDisconnect) as ei,
              client.websocket_connect("/ws/tape?chain=sol&pool=P") as ws2):
            ws2.receive_json()
        assert ei.value.code == 4429
