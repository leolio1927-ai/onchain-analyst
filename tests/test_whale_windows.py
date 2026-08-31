"""PROMPT-V3 R2 — whale windows on the GT tape (offline, canned transports).

Laws under test: a whale is a LABELLED HEURISTIC (one tape trade ≥ the chain
threshold), never an on-chain label; net flow = Σ whale buys − Σ whale sells
per window; no pool for the contract is an honest sentence, not an error;
hype/hood thresholds derive from the LIVE native price and fall back to $30K
with a sentence when the price is unobtainable; AUTO resolves the best pool
per chain + trending candidates, and every miss ships as a sentence.
"""

import time
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from providers import geckoterminal as gt
from providers import whale_windows as ww
from webapp import server

_CA = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"


@pytest.fixture()
def client(monkeypatch):
    gt._trade_cache.clear()
    gt._search_cache.clear()
    gt._trend_cache.clear()
    return TestClient(server.app)


def _tape(rows):
    """(age_s, kind, usd, wallet) → normalized GT trade rows at now-age."""
    now = time.time()
    return [{"wallet": w, "kind": k, "usd": usd, "tx": f"TX{i}",
             "ts": datetime.fromtimestamp(now - age, UTC).isoformat()}
            for i, (age, k, usd, w) in enumerate(rows)]


def _pool_row(net: str, pool: str, reserve: str, name: str = "TOK/SOL"):
    return {"id": f"{net}_{pool}",
            "attributes": {"reserve_in_usd": reserve, "name": name}}


# ── bucket math on a fixed-threshold chain ───────────────────────────────

def test_bucket_math_and_threshold_label(client, monkeypatch):
    monkeypatch.setattr(gt, "fetch_pools", lambda c, a: [_pool_row("solana", "POOLA", "900000")])
    tape = _tape([
        (1800, "buy", 60_000.0, "W1"),    # whale, inside 1h
        (7200, "sell", 80_000.0, "W2"),   # whale, inside 6h only
        (1800, "buy", 20_000.0, "W3"),    # under $50K — a trade, not a whale
        (90_000, "sell", 999_999.0, "W4"),  # outside 24h — ignored everywhere
    ])
    monkeypatch.setattr(gt, "fetch_trades_window",
                        lambda c, p, within_s=86400.0, max_pages=3: (tape, 1))
    r = client.get("/api/v1/whale/windows", params={"chain": "sol", "ca": _CA})
    assert r.status_code == 200
    j = r.json()
    assert j["data_mode"] == "live" and j["sources"] == ["geckoterminal"]
    assert j["pool"] == "POOLA" and j["threshold_usd"] == 50_000.0
    assert "fixed $50,000" in j["threshold_note"]
    w = j["windows"]
    assert w["1h"] == {"trades": 2, "whale_trades": 1, "buy_usd": 60_000.0,
                       "sell_usd": 0.0, "net_usd": 60_000.0}
    assert w["6h"]["trades"] == 3 and w["6h"]["whale_trades"] == 2
    assert w["6h"]["net_usd"] == pytest.approx(60_000.0 - 80_000.0)
    assert w["24h"]["trades"] == 3          # the 25h trade never counts
    assert w["24h"]["whale_trades"] == 2
    kinds = {(t["wallet"], t["usd"]) for t in j["tape"]}
    assert kinds == {("W1", 60_000.0), ("W2", 80_000.0)}   # whale rows only
    top = {t["wallet"]: t for t in j["top_wallets"]}
    assert top["W2"]["net_usd"] == pytest.approx(-80_000.0) and top["W2"]["sells"] == 1
    assert top["W1"]["net_usd"] == pytest.approx(60_000.0) and top["W1"]["buys"] == 1
    assert len(j["data_sources"]) == 2      # tape provenance + threshold sentence


def test_quiet_tape_is_live_data(client, monkeypatch):
    monkeypatch.setattr(gt, "fetch_pools", lambda c, a: [_pool_row("solana", "POOLA", "5")])
    monkeypatch.setattr(gt, "fetch_trades_window",
                        lambda c, p, within_s=86400.0, max_pages=3: ([], 1))
    j = client.get("/api/v1/whale/windows",
                   params={"chain": "sol", "ca": _CA}).json()
    assert j["data_mode"] == "live" and j["tape"] == []   # quiet ≠ absent
    assert all(j["windows"][k]["trades"] == 0 for k in ("1h", "6h", "24h"))
    assert j["tape_oldest_ts"] is None


# ── honest misses ────────────────────────────────────────────────────────

def test_no_pool_is_a_fact_not_an_error(client, monkeypatch):
    monkeypatch.setattr(gt, "fetch_pools", lambda c, a: [])
    r = client.get("/api/v1/whale/windows", params={"chain": "base", "ca": "0xdead"})
    j = r.json()
    assert r.status_code == 200 and j["data_mode"] == "unwired"
    assert "no_pool" in j["data_sources"][0] and "fact, not an error" in j["data_sources"][0]


def test_pool_lookup_failure_is_a_note(client, monkeypatch):
    def boom(c, a):
        raise RuntimeError("gt down")
    monkeypatch.setattr(gt, "fetch_pools", boom)
    j = client.get("/api/v1/whale/windows",
                   params={"chain": "bnb", "ca": "0xdead"}).json()
    assert j["data_mode"] == "unwired" and "pool_lookup_failed" in j["data_sources"][0]


def test_tape_failure_is_a_note(client, monkeypatch):
    monkeypatch.setattr(gt, "fetch_pools", lambda c, a: [_pool_row("bsc", "PB", "1")])
    def boom(c, p, within_s=86400.0, max_pages=3):
        raise RuntimeError("429 exhausted")
    monkeypatch.setattr(gt, "fetch_trades_window", boom)
    j = client.get("/api/v1/whale/windows",
                   params={"chain": "bnb", "ca": "0xdead"}).json()
    assert j["data_mode"] == "unwired" and "tape_failed" in j["data_sources"][0]


def test_unknown_chain_is_unsupported(client):
    j = client.get("/api/v1/whale/windows",
                   params={"chain": "avax", "ca": "0xdead"}).json()
    assert j["data_mode"] == "unwired" and "chain_unsupported" in j["data_sources"][0]


# ── the threshold resolver (provenance per path) ─────────────────────────

def test_threshold_fixed_chains():
    th, note = ww.threshold_usd("sol")
    assert th == 50_000.0 and "fixed $50,000" in note
    th, note = ww.threshold_usd("bnb")
    assert th == 30_000.0 and "fixed $30,000" in note


def test_threshold_native_price_and_fallback(monkeypatch):
    gt._trend_cache.clear()
    monkeypatch.setattr(gt, "native_price_usd", lambda c: 81.0)
    th, note = ww.threshold_usd("hype")
    assert th == pytest.approx(500 * 81.0)
    assert "500 native" in note and "live native price" in note
    monkeypatch.setattr(gt, "native_price_usd", lambda c: None)
    th, note = ww.threshold_usd("hype")
    assert th == ww.FALLBACK_THRESHOLD_USD and "fallback" in note
    th, note = ww.threshold_usd("mars")           # no rule at all
    assert th == ww.FALLBACK_THRESHOLD_USD and "no threshold rule" in note


# ── AUTO mode ────────────────────────────────────────────────────────────

def test_auto_resolves_best_pool_per_chain(client, monkeypatch):
    monkeypatch.setattr(gt, "search_pools", lambda q: [
        {"chain": "sol", "network": "solana", "pool": "P1", "name": "DEEP",
         "liquidity_usd": 1_000_000.0, "volume_24h": 5.0, "price_usd": 0.01},
        {"chain": "sol", "network": "solana", "pool": "P2", "name": "SHALLOW",
         "liquidity_usd": 500.0, "volume_24h": 1.0, "price_usd": 0.01},
        {"chain": "bnb", "network": "bsc", "pool": "PB", "name": "CAKE",
         "liquidity_usd": 7.0, "volume_24h": 2.0, "price_usd": 2.5},
    ])
    monkeypatch.setattr(gt, "fetch_trades_window",
                        lambda c, p, within_s=86400.0, max_pages=3: ([], 1))
    monkeypatch.setattr(gt, "fetch_trending", lambda c, include_tokens=False: {"data": []})
    r = client.get("/api/v1/whale/auto", params={"ca": _CA, "limit": 99})
    assert r.status_code == 200
    j = r.json()
    assert j["data_mode"] == "live"
    assert all(x["data_mode"] == "live" for x in j["results"])  # embedded payloads carry the mode
    pools = {x["pool"] for x in j["results"]}
    assert pools == {"P1", "PB"}                # deepest sol pool wins, P2 dropped
    cand = {c["chain"]: c for c in j["candidates"]}
    assert cand["sol"]["pool"] == "P1" and cand["sol"]["liquidity_usd"] == 1_000_000.0


def test_auto_no_hits_is_an_honest_sentence(client, monkeypatch):
    monkeypatch.setattr(gt, "search_pools", lambda q: [])
    def boom(c, include_tokens=False):
        raise RuntimeError("429")
    monkeypatch.setattr(gt, "fetch_trending", boom)
    j = client.get("/api/v1/whale/auto", params={"ca": "0xnothing"}).json()
    assert j["results"] == [] and j["trending"] == []
    assert any("found no pool" in s for s in j["data_sources"])
    assert any("trending" in s for s in j["data_sources"])   # rate-limits are sentences


def test_auto_trending_top1_per_chain(client, monkeypatch):
    monkeypatch.setattr(gt, "search_pools", lambda q: [])
    payload = {"data": [
        {"id": "solana_TP1", "attributes": {"name": "HOT/SOL",
                                             "reserve_in_usd": "777",
                                             "volume_usd": {"h24": "123"}}},
        {"id": "solana_TP2", "attributes": {"name": "SECOND",
                                            "reserve_in_usd": "1"}},
    ]}
    monkeypatch.setattr(gt, "fetch_trending", lambda c, include_tokens=False: payload)
    j = client.get("/api/v1/whale/auto", params={"ca": "0xnothing", "limit": 2}).json()
    assert len(j["trending"]) == 2              # top-1 per chain, limit 2 chains
    row = j["trending"][0]
    assert row["chain"] == "sol" and row["pool"] == "TP1"
    assert row["liquidity_usd"] == 777.0 and row["volume_24h"] == 123.0


# ── GT provider seams used by R2 ─────────────────────────────────────────

def test_search_pools_url_parsing(monkeypatch):
    gt._search_cache.clear()
    monkeypatch.setattr(gt, "_get_url", lambda url: {"data": [
        {"url": "https://www.geckoterminal.com/bsc/pools/0xabc", "name": "CAKE",
         "liquidity": "1234.5", "volume_24h": "99", "base_token_price_usd": "2.5"},
        {"url": "https://www.geckoterminal.com/eth/pools/0xdef"},   # foreign slug
        {"url": "https://www.geckoterminal.com/bsc/tokens/0xabc"},  # not a pool url
        {"url": None},
    ]})
    hits = gt.search_pools("CAKE")
    assert hits == [{"chain": "bnb", "network": "bsc", "pool": "0xabc", "name": "CAKE",
                     "liquidity_usd": 1234.5, "volume_24h": 99.0, "price_usd": 2.5}]


def test_fetch_trades_window_pagination_stops_at_edge(monkeypatch):
    gt._trade_cache.clear()
    page1 = _tape([(60 * i, "buy", 10.0, f"W{i}") for i in range(300)])  # full, fresh
    old_ts = datetime.fromtimestamp(time.time() - 100_000, UTC).isoformat()
    page2_raw = [{"attributes": {"tx_from_address": "OLD", "kind": "sell",
                                 "block_timestamp": old_ts, "volume_in_usd": "5",
                                 "tx_hash": "TXOLD"}}]          # past 24h
    calls: list[str] = []

    def fake_v2(path):
        calls.append(path)
        return {"data": page2_raw}

    monkeypatch.setattr(gt, "fetch_trades", lambda c, p: page1)
    monkeypatch.setattr(gt, "_get", fake_v2)
    trades, pages = gt.fetch_trades_window("sol", "POOLA")
    assert pages == 2 and len(calls) == 1       # walked one page past page 1, then stopped
    assert all(t["wallet"] != "OLD" for t in trades)
    assert len(trades) == 300

    short = _tape([(10, "buy", 1.0, "S")])
    monkeypatch.setattr(gt, "fetch_trades", lambda c, p: short)
    trades, pages = gt.fetch_trades_window("sol", "POOLB")
    assert pages == 1 and len(calls) == 1       # short page = tape exhausted, no page 2


def test_native_price_from_trending_quote(monkeypatch):
    gt._trend_cache.clear()
    payload = {
        "data": [{"id": "hyperevm_P", "attributes": {"quote_token_price_usd": "81.2"},
                  "relationships": {"quote_token": {"data": {"id": "hyperevm_WHYPE"}}}}],
        "included": [{"id": "hyperevm_WHYPE", "attributes": {"symbol": "WHYPE"}}],
    }
    monkeypatch.setattr(gt, "fetch_trending", lambda c, include_tokens=False: payload)
    assert gt.native_price_usd("hype") == pytest.approx(81.2)
    assert gt.native_price_usd("sol") is None   # no native-quote concept on sol
    monkeypatch.setattr(gt, "fetch_trending",
                        lambda c, include_tokens=False: (_ for _ in ()).throw(RuntimeError("429")))
    assert gt.native_price_usd("hype") is None  # a price failure is a None, never a raise
