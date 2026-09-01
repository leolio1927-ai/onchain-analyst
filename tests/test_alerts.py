"""P1-C — alert engine laws (real providers only, honest events).

1. rule create: valid kinds only, duplicates and cap are 400s
2. liquidity_below: provider data drives the event; insufficient data and
   provider failure become EVENTS, never invented numbers
3. dedup + cooldown: the same rule+kind inside the window does not re-fire
4. read/unread: unread computed from the store, mark-read works
5. risk_level_changed: baseline first (no event), change fires once
"""
import json

import pytest
from fastapi.testclient import TestClient

from webapp import alerts as A
from webapp import server

TOKEN = "So11111111111111111111111111111111111111112"


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(A, "STATE_PATH", tmp_path / "alerts.json")
    return TestClient(server.app)


def _add(client, kind="liquidity_below", token=TOKEN, params=None):
    return client.post("/api/v1/alerts/rules", json={
        "chain": "sol", "token": token, "kind": kind,
        "params": params or {"min_usd": 50000}})


def test_rule_validation_and_duplicates(client):
    assert _add(client).status_code == 200
    assert _add(client).status_code == 400                      # duplicate token+kind
    assert _add(client, kind="not_a_kind").status_code == 400
    assert _add(client, token="").status_code == 400
    r = client.post("/api/v1/alerts/rules", json={"chain": "mars", "token": TOKEN, "kind": "liquidity_below"})
    assert r.status_code == 400                                 # unknown chain


def test_liquidity_below_fires_from_provider_data(client, monkeypatch):
    _add(client)
    from providers import dexscreener
    monkeypatch.setattr(dexscreener, "fetch_pair",
                        lambda chain, address: {"pairAddress": "PAIR1", "liquidity": {"usd": 12345.0}})
    out = client.post("/api/v1/alerts/evaluate").json()
    assert out["evaluated"] == 1 and out["results"][0]["events"] == 1
    st = client.get("/api/v1/alerts").json()
    ev = st["events"][0]
    assert ev["kind"] == "liquidity_below" and ev["severity"] == "HIGH"
    assert ev["evidence"]["liquidity_usd"] == 12345.0
    assert st["unread"] == 1                                    # computed from store


def test_insufficient_data_and_provider_error_are_events(client, monkeypatch):
    _add(client)
    from providers import dexscreener
    monkeypatch.setattr(dexscreener, "fetch_pair", lambda chain, address: None)
    out = client.post("/api/v1/alerts/evaluate").json()
    assert out["results"][0]["status"] == "insufficient_data"
    monkeypatch.setattr(dexscreener, "fetch_pair",
                        lambda chain, address: (_ for _ in ()).throw(OSError("boom")))
    out = client.post("/api/v1/alerts/evaluate").json()
    assert out["results"][0]["status"] == "provider_error"
    st = client.get("/api/v1/alerts").json()
    kinds = [e["kind"] for e in st["events"]]
    assert "insufficient_data" in kinds and "provider_error" in kinds
    assert not any(e["kind"] == "liquidity_below" for e in st["events"])  # no invented numbers


def test_dedup_and_cooldown(client, monkeypatch):
    _add(client)
    from providers import dexscreener
    monkeypatch.setattr(dexscreener, "fetch_pair",
                        lambda chain, address: {"pairAddress": "PAIR1", "liquidity": {"usd": 10.0}})
    client.post("/api/v1/alerts/evaluate")
    st1 = client.get("/api/v1/alerts").json()
    n1 = len(st1["events"])
    client.post("/api/v1/alerts/evaluate")                      # same rule+kind inside cooldown
    st2 = client.get("/api/v1/alerts").json()
    assert len(st2["events"]) == n1                             # deduped


def test_mark_read_and_unread_count(client, monkeypatch):
    _add(client)
    from providers import dexscreener
    monkeypatch.setattr(dexscreener, "fetch_pair",
                        lambda chain, address: {"pairAddress": "PAIR1", "liquidity": {"usd": 10.0}})
    client.post("/api/v1/alerts/evaluate")
    assert client.get("/api/v1/alerts").json()["unread"] == 1
    r = client.post("/api/v1/alerts/read", json={"all": True})
    assert r.json()["marked"] == 1
    assert client.get("/api/v1/alerts").json()["unread"] == 0


def test_risk_level_changed_baseline_then_fire(client, monkeypatch):
    _add(client, kind="risk_level_changed")
    levels = iter(["low", "low", "high"])

    async def fake_scan(chain, address):
        return {"assessment": {"level": next(levels), "score": 30},
                "clustering": {}, "sources": [], "ts": "t"}

    monkeypatch.setattr(server, "_scan_chain", fake_scan)
    out = client.post("/api/v1/alerts/evaluate").json()
    assert out["results"][0]["events"] == 0                     # baseline, no event
    client.post("/api/v1/alerts/evaluate")
    out = client.post("/api/v1/alerts/evaluate").json()
    assert out["results"][0]["events"] == 1                     # low → high fires once
    st = client.get("/api/v1/alerts").json()
    ev = st["events"][0]
    assert ev["kind"] == "risk_level_changed" and ev["evidence"]["from"] == "low"


def test_whale_is_never_called_a_fact(client):
    st = client.get("/api/v1/alerts").json()
    assert "whale" not in json.dumps(st).lower()                # v1 kinds carry no whale claim
