"""PROMPT-V4 M4 — portfolio snapshot gates.

The snapshot answers only public market facts for a watchlist: verbatim pool
attributes for tokens GT lists, honest sentences for the rest. Laws under
test: order preserved, absent stays null (never zero-filled), no_pool /
rate_limited are rows not errors, the 15 cap and the chain set are enforced
with honest 400/404 sentences, an empty watchlist is a fact, and the route
validates against the response schema.
"""
import urllib.error

import pytest
from fastapi.testclient import TestClient

from providers import geckoterminal as gt
from providers import portfolio
from webapp import schemas, server

BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"


def _pool(name="BONK / SOL", address="POOL1", price="0.00002",
          liq="900000.5", vol24="120000.25", chg24="-4.2"):
    return {"id": f"solana_{address}",
            "attributes": {"address": address, "name": name,
                           "base_token_price_usd": price,
                           "reserve_in_usd": liq,
                           "volume_usd": {"h24": vol24},
                           "price_change_percentage": {"h24": chg24}}}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(gt, "_pools_cache_get", lambda k: None)   # bypass cache
    return TestClient(server.app)


# ── provider contract ─────────────────────────────────────────────────────

def test_ok_row_carries_verbatim_pool_facts(monkeypatch):
    monkeypatch.setattr(gt, "fetch_pools", lambda c, t: [_pool()])
    out = portfolio.snapshot([("sol", BONK)])
    row = out["rows"][0]
    assert row["status"] == "ok" and out["pools_walked"] == 1
    assert row["pool"] == "POOL1" and row["pool_name"] == "BONK / SOL"
    assert row["price_usd"] == 0.00002
    assert row["liquidity_usd"] == 900000.5
    assert row["volume_24h"] == 120000.25
    assert row["change_24h"] == -4.2                     # a negative drop is data


def test_absent_attributes_stay_null_never_zero(monkeypatch):
    monkeypatch.setattr(gt, "fetch_pools", lambda c, t: [_pool(
        price=None, liq=None, vol24=None, chg24=None)])
    row = portfolio.snapshot([("sol", BONK)])["rows"][0]
    assert row["status"] == "ok"
    for k in ("price_usd", "liquidity_usd", "volume_24h", "change_24h"):
        assert row[k] is None


def test_no_pool_is_a_sentence_not_an_error(monkeypatch):
    monkeypatch.setattr(gt, "fetch_pools", lambda c, t: [])
    out = portfolio.snapshot([("bnb", BONK)])
    row = out["rows"][0]
    assert row["status"] == "no_pool"
    assert "portfolio:no_pool" in row["note"] and "fact, not an error" in row["note"]
    assert out["data_sources"] == [row["note"]]


def test_a_429_is_a_rate_limited_row(monkeypatch):
    def boom(c, t):
        raise urllib.error.HTTPError("u", 429, "Too Many Requests", {}, None)
    monkeypatch.setattr(gt, "fetch_pools", boom)
    out = portfolio.snapshot([("sol", BONK)])
    assert out["rows"][0]["status"] == "rate_limited"
    assert out["rate_limited"] == [f"sol:{BONK}"]


# ── the route ─────────────────────────────────────────────────────────────

def test_route_preserves_order_and_validates_schema(client, monkeypatch):
    monkeypatch.setattr(gt, "fetch_pools", lambda c, t: [_pool()] if c == "sol" else [])
    r = client.get(f"/api/v1/portfolio/snapshot?items=bnb:{BONK},sol:{BONK}")
    assert r.status_code == 200
    body = r.json()
    schemas.PortfolioSnapshotResponse.model_validate(body)
    assert [row["chain"] for row in body["rows"]] == ["bnb", "sol"]
    assert body["rows"][0]["status"] == "no_pool"
    assert body["rows"][1]["status"] == "ok"


def test_empty_watchlist_is_a_fact(client):
    body = client.get("/api/v1/portfolio/snapshot").json()
    assert body["rows"] == [] and body["pools_walked"] == 0


def test_the_15_cap_is_enforced(client):
    items = ",".join(f"sol:tok{i}" for i in range(16))
    r = client.get(f"/api/v1/portfolio/snapshot?items={items}")
    assert r.status_code == 400
    assert "watchlist cap is 15" in r.json()["detail"]


def test_unknown_chain_404_lists_the_allowed_set(client):
    r = client.get("/api/v1/portfolio/snapshot?items=avax:0x1")
    assert r.status_code == 404
    assert "pick sol|bnb|base|hype|hood" in r.json()["detail"]


def test_malformed_item_is_a_400_sentence(client):
    r = client.get("/api/v1/portfolio/snapshot?items=not-a-pair")
    assert r.status_code == 400
    assert "expected chain:token" in r.json()["detail"]
