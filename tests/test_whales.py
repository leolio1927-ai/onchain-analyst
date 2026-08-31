"""BE-ALL-LIVE F3 — whale tracker tests (offline, canned helius transports).

Laws under test: threshold filtering happens ONLY when a price exists (a
price failure must not invent USD); netflow sums exactly the shown window;
a quiet token is data (live, empty); unwired chains carry the probe reason.
"""

import pytest
from fastapi.testclient import TestClient

from providers import helius
from webapp import server

_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"


def _helius_payload():
    return [
        {"signature": "SIG1", "timestamp": 1700000100,
         "tokenBalances": [{"userAccount": "W1", "mint": _MINT, "amount": "500.0"}]},
        {"signature": "SIG2", "timestamp": 1700000200,
         "tokenBalances": [{"userAccount": "W2", "mint": _MINT, "amount": "-1200.5"}]},
        {"signature": "SIG3", "timestamp": 1700000300,
         "tokenBalances": [{"userAccount": "W1", "mint": _MINT, "amount": "0.5"},
                           {"userAccount": "W9", "mint": "OTHERMINT", "amount": "99999"}]},
        {"signature": "SIG4", "timestamp": 1700000400,
         "tokenBalances": [{"userAccount": "W3", "mint": _MINT, "amount": "garbage"}]},
    ]


@pytest.fixture()
def client(monkeypatch):
    helius._cache.clear()
    whales_dexscreener_patch(monkeypatch, price="0.001")
    monkeypatch.setenv("HELIUS_API_KEY", "stub-key")
    monkeypatch.setattr(helius, "_call", lambda url, body=None: _helius_payload())
    return TestClient(server.app)


def whales_dexscreener_patch(monkeypatch, price):
    pair = {"priceUsd": price} if price is not None else {"priceUsd": None}
    monkeypatch.setattr(server.dexscreener, "fetch_pair", lambda c, t: pair)


def test_transfers_parse_and_direction(client):
    r = client.get(f"/api/v1/whales/sol/{_MINT}", params={"threshold_usd": 0})
    assert r.status_code == 200
    j = r.json()
    assert j["data_mode"] == "live" and j["window_txs"] == 4
    rows = {t["tx"]: t for t in j["transfers"]}   # per-tx rows, 3 parsed of 4 seen
    assert rows["SIG1"] == {"wallet": "W1", "amount": 500.0, "direction": "in",
                            "ts": 1700000100, "tx": "SIG1", "usd": 0.5,
                            "price_usd": 0.001}
    assert rows["SIG2"]["amount"] == -1200.5 and rows["SIG2"]["direction"] == "out"
    assert rows["SIG3"]["amount"] == 0.5          # W9 OTHERMINT row skipped; W3 garbage skipped


def test_threshold_uses_price_and_zero_price_is_honest(client, monkeypatch):
    whales_dexscreener_patch(monkeypatch, price="0.001")   # W2 1200.5 tok = $1.20
    r = client.get(f"/api/v1/whales/sol/{_MINT}", params={"threshold_usd": 10})
    j = r.json()
    assert j["transfers"] == []                  # every transfer is under $10
    whales_dexscreener_patch(monkeypatch, price=None)      # price absent → no USD filter
    r2 = client.get(f"/api/v1/whales/sol/{_MINT}", params={"threshold_usd": 10})
    j2 = r2.json()
    assert len(j2["transfers"]) == 3             # token amounts stand alone, usd null
    assert all(t["usd"] is None and t["price_usd"] is None for t in j2["transfers"])
    assert any("price absent" in s for s in j2["data_sources"])


def test_netflow_sums_the_window(client):
    j = client.get(f"/api/v1/whales/sol/{_MINT}", params={"threshold_usd": 0}).json()
    nf = {n["wallet"]: n for n in j["netflow"]}
    assert nf["W1"]["net_amount"] == pytest.approx(500.5)
    assert nf["W1"]["direction"] == "in"
    assert nf["W2"]["net_amount"] == pytest.approx(-1200.5)
    assert nf["W2"]["direction"] == "out"


def test_no_key_is_not_configured(client, monkeypatch):
    monkeypatch.delenv("HELIUS_API_KEY", raising=False)
    r = client.get(f"/api/v1/whales/sol/{_MINT}")
    j = r.json()
    assert r.status_code == 200
    # V5-G1 status-truth: the feed IS wired — a missing key reads "partial"
    # with the real reason, never "unwired" (that would claim no engine).
    assert j["data_mode"] == "partial" and j["transfers"] == []
    assert j["data_sources"] == ["helius:not_configured"]


def test_key_rejected_is_partial_not_unwired(client, monkeypatch):
    """V5-G1 offline-truth: a junk key that upstream 401s must read as a
    provider failure (partial), not as an unwired chain."""
    import urllib.error

    def boom(url, body=None):
        raise urllib.error.HTTPError(url, 401, "Unauthorized", {}, None)  # type: ignore[arg-type]

    monkeypatch.setattr(helius, "_call", boom)
    r = client.get(f"/api/v1/whales/sol/{_MINT}")
    j = r.json()
    assert r.status_code == 200
    assert j["data_mode"] == "partial" and j["transfers"] == []
    src = j["data_sources"][0]
    assert src.startswith(("helius:", "whales:failed"))  # the real reason, verbatim


def test_unwired_chain_carries_probe_reason(client):
    r = client.get("/api/v1/whales/bnb/0x" + "a" * 40)
    j = r.json()
    assert r.status_code == 200 and j["data_mode"] == "unwired"
    # PROMPT-V3 R2: non-sol note now points at the GT tape endpoint
    assert "/api/v1/whale/windows" in j["data_sources"][0]


def test_quiet_token_is_live_data(client, monkeypatch):
    monkeypatch.setattr(helius, "_call", lambda url, body=None: [])
    r = client.get(f"/api/v1/whales/sol/{_MINT}", params={"threshold_usd": 0})
    j = r.json()
    assert j["data_mode"] == "live" and j["transfers"] == []   # quiet ≠ absent
