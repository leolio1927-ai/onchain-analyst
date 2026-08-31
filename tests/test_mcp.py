"""PROMPT-V2B P6 — machine surfaces (offline contract tests).
MCP rev 2026-07-28 over stdlib JSON-RPC: initialize/tools-list/tools-call,
plus the RFC 9727 /.well-known/api-catalog linkset. Providers monkeypatched
— zero network."""
import json

import pytest
from fastapi.testclient import TestClient

from providers import live as live_mod
from webapp import mcp, server

CAKE = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"
BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"


@pytest.fixture
def client():
    return TestClient(server.app)


def rpc(client, method, params=None, id_=1):
    return client.post("/mcp", json={"jsonrpc": "2.0", "id": id_,
                                     "method": method, "params": params or {}})


def test_initialize_announces_protocol_revision(client):
    b = rpc(client, "initialize").json()
    assert b["result"]["protocolVersion"] == mcp.PROTOCOL_VERSION == "2026-07-28"
    assert b["result"]["serverInfo"]["name"] == "vilmei-read-only"
    assert "tools" in b["result"]["capabilities"]


def test_tools_list_is_the_catalog(client):
    b = rpc(client, "tools/list").json()
    names = {t["name"] for t in b["result"]["tools"]}
    assert names == {"trending", "scan", "rug", "whale_windows"}
    for t in b["result"]["tools"]:
        assert t["inputSchema"]["type"] == "object"


def test_tools_call_rug_bnb_verbatim(client, monkeypatch):
    import providers.goplus as goplus
    monkeypatch.setattr(goplus, "token_security", lambda c, t: (
        {"token_symbol": "Cake", "is_honeypot": 0, "is_open_source": 1,
         "buy_tax": None, "sell_tax": None, "is_mintable": 1,
         "is_freezable": None, "holder_count": 1909528,
         "contract_creator": "0xdead"}, None))
    b = rpc(client, "tools/call",
            {"name": "rug", "arguments": {"chain": "bnb", "address": CAKE}}).json()
    assert b["result"]["isError"] is False
    payload = json.loads(b["result"]["content"][0]["text"])
    assert payload["chain_id"] == 56
    assert {r["field"]: r["value"] for r in payload["rows"]}["holder_count"] == 1909528


def test_tools_call_rug_hype_is_honest_partial(client):
    b = rpc(client, "tools/call",
            {"name": "rug", "arguments": {"chain": "hype", "address": "0x" + "1" * 40}}).json()
    payload = json.loads(b["result"]["content"][0]["text"])
    assert payload["coverage"] == "partial"
    assert "does not index" in payload["reason"]


def test_tools_call_whale_windows_declared_null(client, monkeypatch):
    from providers import whales as whales_mod
    monkeypatch.setattr(whales_mod, "whales",
                        lambda *a: (None, "no $0 trade feed — probed reason"))
    b = rpc(client, "tools/call",
            {"name": "whale_windows", "arguments": {"chain": "bnb", "token": CAKE}}).json()
    payload = json.loads(b["result"]["content"][0]["text"])
    assert payload["data_mode"] == "unwired"
    assert payload["transfers"] == []


def test_tools_call_trending_live_passthrough(client, monkeypatch):
    monkeypatch.setattr(live_mod, "get_feed",
                        lambda chain, mode, limit: (
                            [{"symbol": "TEST", "price_usd": 1.0}],
                            {"cached": False, "stale": False}))
    b = rpc(client, "tools/call",
            {"name": "trending", "arguments": {"chain": "sol", "mode": "trending"}}).json()
    payload = json.loads(b["result"]["content"][0]["text"])
    assert payload["live"] is True and payload["items"][0]["symbol"] == "TEST"


def test_tools_call_scan_reuses_scan_pipeline(client, monkeypatch):
    async def fake_scan(chain, address, refresh=False):
        return {"chain": chain, "address": address, "score": 42}
    monkeypatch.setattr(server, "_get_scan", fake_scan)
    b = rpc(client, "tools/call",
            {"name": "scan", "arguments": {"chain": "sol", "address": BONK}}).json()
    assert json.loads(b["result"]["content"][0]["text"])["score"] == 42


def test_unknown_method_and_tool_are_jsonrpc_errors(client):
    assert rpc(client, "nope/method").json()["error"]["code"] == -32601
    b = rpc(client, "tools/call", {"name": "launch_rocket"}).json()
    assert b["error"]["code"] == -32602


def test_notification_gets_no_body(client):
    r = client.post("/mcp", json={"jsonrpc": "2.0",
                                  "method": "notifications/initialized"})
    assert r.status_code == 202 and r.content == b""


def test_api_catalog_is_rfc9727_linkset(client):
    r = client.get("/.well-known/api-catalog")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/linkset+json")
    ls = r.json()["linkset"]
    assert ls[0]["item"][0]["href"].endswith("/openapi.json")
    assert ls[1]["service-desc"][0]["href"].endswith("/openapi.json")
