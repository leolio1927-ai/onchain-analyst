"""PROMPT-V market surface (ohlcv · socials · detect) — offline contract
tests: upstreams monkeypatched, zero network. Canned shapes mirror the
2026-08-30 probes (GT ohlcv_list newest-first [ts,o,h,l,c,v]; DS token-pairs
info websites/socials; DS search pairs spread across chainIds)."""
import pytest
from fastapi.testclient import TestClient

from providers import market
from webapp import server


@pytest.fixture(autouse=True)
def _clean():
    market._ohlcv_cache.clear()
    market._socials_cache.clear()
    market._detect_cache.clear()
    yield
    market._ohlcv_cache.clear()
    market._socials_cache.clear()
    market._detect_cache.clear()


@pytest.fixture
def client():
    return TestClient(server.app)


def _gt(rows):
    return {"data": {"attributes": {"ohlcv_list": rows}},
            "meta": {"base": {"symbol": "TST", "name": "Test", "address": "A1"}}}


# ── /api/v1/market/ohlcv ─────────────────────────────────────────────────

def test_ohlcv_reorders_oldest_first_and_carries_provenance(client, monkeypatch):
    calls = []

    def fake(path):
        calls.append(path)
        return _gt([[2000, 2, 2, 1, 1.5, 10], [1000, 1, 1, 0.5, 1, 5]])

    monkeypatch.setattr(market, "_fetch_gt", fake)
    r = client.get("/api/v1/market/ohlcv?chain=sol&pair=PoolX&resolution=15m")
    assert r.status_code == 200
    body = r.json()
    ts = [c["ts"] for c in body["candles"]]
    assert ts == sorted(ts), "chart order = oldest → newest"
    assert "aggregate=15" in calls[0] and "/ohlcv/minute" in calls[0]
    p = body["provenance"]
    assert p["source"] == "geckoterminal"
    assert p["host"] == "api.geckoterminal.com"
    assert p["degraded"] is None
    assert p["cache"]["cached"] is False
    assert body["sources"] == ["geckoterminal"]
    assert body["candles"][0] == {"ts": 1000, "o": 1, "h": 1, "l": 0.5, "c": 1, "v": 5}


def test_ohlcv_second_hit_is_cached(client, monkeypatch):
    calls = []

    def fake(path):
        calls.append(path)
        return _gt([[1000, 1, 1, 0.5, 1, 5]])

    monkeypatch.setattr(market, "_fetch_gt", fake)
    client.get("/api/v1/market/ohlcv?chain=sol&pair=PoolX&resolution=1h")
    r2 = client.get("/api/v1/market/ohlcv?chain=sol&pair=poolx&resolution=1h")
    assert len(calls) == 1, "pair key is case-insensitive"
    assert r2.json()["provenance"]["cache"]["cached"] is True


def test_ohlcv_empty_list_ships_degraded_reason(client, monkeypatch):
    monkeypatch.setattr(market, "_fetch_gt", lambda path: _gt([]))
    r = client.get("/api/v1/market/ohlcv?chain=sol&pair=PoolX&resolution=1h")
    assert r.status_code == 200
    body = r.json()
    assert body["candles"] == []
    assert "no candles" in body["provenance"]["degraded"]


def test_ohlcv_validation_400(client):
    assert client.get("/api/v1/market/ohlcv?chain=sol&pair=P&resolution=6m").status_code == 400
    assert client.get("/api/v1/market/ohlcv?chain=doge&pair=P&resolution=1h").status_code == 400
    assert client.get("/api/v1/market/ohlcv?chain=sol&pair=&resolution=1h").status_code == 400


# ── /api/v1/socials ───────────────────────────────────────────────────────

def _ds_pair(**over):
    p = {"chainId": "solana", "pairAddress": "P1", "dexId": "orca",
         "liquidity": {"usd": 1234.5},
         "info": {"imageUrl": "https://img/x.png",
                  "websites": [{"url": "https://bonkcoin.com", "label": "Website"}],
                  "socials": [{"url": "https://twitter.com/bonk_inu", "type": "twitter"},
                              {"url": "https://t.me/Official_Bonk_Inu", "type": "telegram"}]}}
    p.update(over)
    return p


def test_socials_fields_verbatim_with_provenance(client, monkeypatch):
    monkeypatch.setattr(market, "_fetch_ds", lambda path: [_ds_pair()])
    r = client.get("/api/v1/socials?chain=sol&token=TokA")
    assert r.status_code == 200
    body = r.json()
    assert body["websites"] == [{"url": "https://bonkcoin.com", "label": "Website"}]
    assert body["links"][0]["type"] == "twitter"
    assert body["image_url"] == "https://img/x.png"
    assert body["provenance"]["source"] == "dexscreener"
    assert body["provenance"]["degraded"] is None


def test_socials_no_pair_degraded_never_invented(client, monkeypatch):
    monkeypatch.setattr(market, "_fetch_ds", lambda path: [])
    r = client.get("/api/v1/socials?chain=sol&token=TokA")
    body = r.json()
    assert body["websites"] == [] and body["links"] == []
    assert "no pair found" in body["provenance"]["degraded"]


def test_socials_picks_deepest_pair_on_chain(client, monkeypatch):
    monkeypatch.setattr(market, "_fetch_ds",
                        lambda path: [_ds_pair(liquidity={"usd": 10}),
                                      _ds_pair(liquidity={"usd": 9999})])
    body = client.get("/api/v1/socials?chain=sol&token=TokA").json()
    assert body["liquidity_usd"] == 9999


def test_socials_bad_chain_400(client):
    assert client.get("/api/v1/socials?chain=doge&token=x").status_code == 400
    assert client.get("/api/v1/socials?chain=sol&token=").status_code == 400


# ── /api/v1/detect ────────────────────────────────────────────────────────

def _search_pair(cid, addr, liq, symbol="TST"):
    return {"chainId": cid, "pairAddress": f"P-{cid}-{liq}", "dexId": "dex",
            "url": f"https://dexscreener.com/{cid}",
            "baseToken": {"address": addr, "symbol": symbol, "name": f"{symbol} token"},
            "quoteToken": {"address": "Q", "symbol": "W"},
            "liquidity": {"usd": liq}, "priceUsd": "0.001"}


def test_detect_address_one_candidate_per_chain_liq_sorted(client, monkeypatch):
    addr = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"

    def fake(path):
        assert path.startswith("/latest/dex/tokens/")
        return {"pairs": [
            _search_pair("bsc", addr, 100),
            _search_pair("bsc", addr, 50),          # duplicate chain → deepest kept
            _search_pair("base", addr, 500),
            _search_pair("solana", addr, 900),
            _search_pair("ethereum", addr, 99999),  # not a founder chain → dropped
        ]}

    monkeypatch.setattr(market, "_fetch_ds", fake)
    r = client.get(f"/api/v1/detect?address={addr}")
    body = r.json()
    assert body["kind"] == "evm-ambiguous"
    chains = [c["chain"] for c in body["candidates"]]
    assert chains == ["sol", "base", "bnb"], "liquidity desc, founder keys"
    assert all(c["token_address"] == addr for c in body["candidates"])
    assert body["candidates"][0]["liquidity_usd"] == 900
    assert body["provenance"]["source"] == "dexscreener"


def test_detect_ticker_uses_search_path(client, monkeypatch):
    seen = {}

    def fake(path):
        seen["path"] = path
        return {"pairs": [_search_pair("solana", "BONKADDR", 12, "BONK")]}

    monkeypatch.setattr(market, "_fetch_ds", fake)
    body = client.get("/api/v1/detect?address=BONK").json()
    assert seen["path"] == "/latest/dex/search?q=BONK"
    assert body["kind"] == "ticker"
    assert [c["chain"] for c in body["candidates"]] == ["sol"]


def test_detect_zero_candidates_degraded(client, monkeypatch):
    monkeypatch.setattr(market, "_fetch_ds", lambda path: {"pairs": []})
    body = client.get("/api/v1/detect?address=SoMeThinG1234").json()
    assert body["candidates"] == []
    assert "no pair found" in body["provenance"]["degraded"]


def test_detect_invalid_query_400(client):
    assert client.get("/api/v1/detect?address=x!!").status_code == 400


def test_detect_single_hit_is_cached(client, monkeypatch):
    calls = []

    def fake(path):
        calls.append(path)
        return {"pairs": [_search_pair("solana", "BONKADDR", 12, "BONK")]}

    monkeypatch.setattr(market, "_fetch_ds", fake)
    client.get("/api/v1/detect?address=BONK")
    body = client.get("/api/v1/detect?address=BONK").json()
    assert len(calls) == 1
    assert body["provenance"]["cache"]["cached"] is True
