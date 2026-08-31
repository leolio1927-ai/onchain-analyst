"""PROMPT-V3 R2 — whale windows on the GT tape (offline, canned transports).

Laws under test: a whale is a LABELLED HEURISTIC (one tape trade ≥ the chain
threshold), never an on-chain label; net flow = Σ whale buys − Σ whale sells
per window; no pool for the contract is an honest sentence, not an error;
hype/hood thresholds derive from the LIVE native price and fall back to $30K
with a sentence when the price is unobtainable; AUTO resolves the best pool
per chain + trending candidates, and every miss ships as a sentence.
"""

import json
import threading
import time
import urllib.error
from datetime import UTC, datetime
from email.message import Message

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
    gt._pools_cache.clear()
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
    # M1: the surface contract ships even when the tape is silent
    assert j["top_below_threshold"] == [] and j["pools_walked"] == 1
    assert sum(j["volume_hist"]["buckets"]) == 0.0
    assert sum(j["volume_hist"]["whale_buckets"]) == 0.0


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


# ── PROMPT-V4 M1: the page never stares at an empty floor ────────────────

def _h429(retry_after: str | None = None):
    """A genuine GT 429 — headers may carry Retry-After."""
    hdrs = Message()
    if retry_after is not None:
        hdrs["Retry-After"] = retry_after
    return urllib.error.HTTPError("https://api.geckoterminal.com", 429,
                                  "Too Many Requests", hdrs, None)


def test_m1_surface_fields(client, monkeypatch):
    monkeypatch.setattr(gt, "fetch_pools", lambda c, a: [_pool_row("solana", "POOLA", "900000")])
    tape = _tape([
        (1800, "buy", 60_000.0, "W1"),          # whale (≥ $50K) — current hour
        (600, "buy", 45_000.0, "W3"),           # below threshold — current hour
        (3600 * 2 + 60, "sell", 40_000.0, "W2"),  # below threshold — 3 buckets back
    ])
    monkeypatch.setattr(gt, "fetch_trades_window",
                        lambda c, p, within_s=86400.0, max_pages=3: (tape, 1))
    j = client.get("/api/v1/whale/windows", params={"chain": "sol", "ca": _CA}).json()
    assert j["pools_walked"] == 1
    below = j["top_below_threshold"]
    assert [t["wallet"] for t in below] == ["W3", "W2"]    # ranked by size, whale excluded
    assert below[0]["usd"] == 45_000.0 and below[1]["usd"] == 40_000.0
    vh = j["volume_hist"]
    assert vh["bucket_s"] == 3600.0
    assert len(vh["buckets"]) == 24 and len(vh["whale_buckets"]) == 24
    assert sum(vh["buckets"]) == pytest.approx(145_000.0)      # ALL trades
    assert sum(vh["whale_buckets"]) == pytest.approx(60_000.0)  # whale share only
    assert vh["buckets"][23] == pytest.approx(105_000.0)        # current hour
    assert vh["whale_buckets"][23] == pytest.approx(60_000.0)
    assert vh["buckets"][21] == pytest.approx(40_000.0)


def test_m1_top_below_threshold_caps_at_five(client, monkeypatch):
    monkeypatch.setattr(gt, "fetch_pools", lambda c, a: [_pool_row("solana", "P", "1")])
    tape = _tape([(60 * (i + 1), "buy", 100.0 * (i + 1), f"W{i}")
                  for i in range(7)])                       # 7 dust trades, all under $50K
    monkeypatch.setattr(gt, "fetch_trades_window",
                        lambda c, p, within_s=86400.0, max_pages=3: (tape, 1))
    j = client.get("/api/v1/whale/windows", params={"chain": "sol", "ca": _CA}).json()
    assert j["tape"] == []                                  # no whale crossed the line
    assert len(j["top_below_threshold"]) == ww.TOP_BELOW_THRESHOLD == 5
    usds = [t["usd"] for t in j["top_below_threshold"]]
    assert usds == sorted(usds, reverse=True)               # ranked by size


def test_tape_429_is_a_rate_limited_note(client, monkeypatch):
    monkeypatch.setattr(gt, "fetch_pools", lambda c, a: [_pool_row("bsc", "PB", "1")])
    def boom(c, p, within_s=86400.0, max_pages=3):
        raise _h429()
    monkeypatch.setattr(gt, "fetch_trades_window", boom)
    j = client.get("/api/v1/whale/windows",
                   params={"chain": "bnb", "ca": "0xdead"}).json()
    assert j["data_mode"] == "unwired" and "rate_limited" in j["data_sources"][0]
    assert "tape_failed" not in j["data_sources"][0]        # genuine 429 ≠ generic failure


def test_pool_lookup_429_is_a_rate_limited_note(client, monkeypatch):
    def boom(c, a):
        raise _h429()
    monkeypatch.setattr(gt, "fetch_pools", boom)
    j = client.get("/api/v1/whale/windows",
                   params={"chain": "base", "ca": "0xdead"}).json()
    assert j["data_mode"] == "unwired" and "rate_limited" in j["data_sources"][0]


def test_auto_aggregates_rate_limited_chains(client, monkeypatch):
    """ONE structured list for the banner — never stacked yellow rows."""
    monkeypatch.setattr(gt, "search_pools", lambda q: [
        {"chain": "sol", "network": "solana", "pool": "P1", "name": "OK",
         "liquidity_usd": 9.0, "volume_24h": 1.0, "price_usd": 1.0},
        {"chain": "bnb", "network": "bsc", "pool": "PB", "name": "RL",
         "liquidity_usd": 9.0, "volume_24h": 1.0, "price_usd": 1.0},
    ])
    def tape(c, p, within_s=86400.0, max_pages=3):
        if c == "bnb":
            raise _h429()
        return ([], 1)
    monkeypatch.setattr(gt, "fetch_trades_window", tape)
    monkeypatch.setattr(gt, "fetch_trending", lambda c, include_tokens=False: {"data": []})
    j = client.get("/api/v1/whale/auto", params={"ca": _CA}).json()
    assert j["rate_limited"] == ["bnb"]
    assert j["retry_after_s"] == ww.RETRY_AFTER_S
    assert j["pools_walked"] == 2
    assert {x["chain"] for x in j["results"]} == {"sol"}
    assert any("rate_limited" in s for s in j["data_sources"])


def test_auto_search_429_marks_search(client, monkeypatch):
    def boom(q):
        raise _h429()
    monkeypatch.setattr(gt, "search_pools", boom)
    monkeypatch.setattr(gt, "fetch_trending", lambda c, include_tokens=False: {"data": []})
    j = client.get("/api/v1/whale/auto", params={"ca": _CA}).json()
    assert j["rate_limited"] == ["search"] and j["results"] == []
    assert j["pools_walked"] == 0 and j["retry_after_s"] == ww.RETRY_AFTER_S
    assert any("rate-limited" in s for s in j["data_sources"])


# ── M1 GT governance: single-flight + capped backoff ────────────────────

def test_single_flight_shares_one_upstream_call(monkeypatch):
    gt._pools_cache.clear()
    calls: list[str] = []

    def fake_get(path):
        calls.append(path)
        time.sleep(0.05)                     # widen the concurrency window
        return {"data": [{"id": "solana_P1", "attributes": {}}]}

    monkeypatch.setattr(gt, "_get", fake_get)
    results: list = []
    errs: list = []

    def worker():
        try:
            results.append(gt.fetch_pools("sol", "TOKSF"))
        except Exception as e:  # noqa: BLE001
            errs.append(e)

    ts = [threading.Thread(target=worker) for _ in range(6)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    assert not errs and len(calls) == 1      # one burst-free upstream call
    assert all(len(r) == 1 for r in results)


def test_single_flight_waiters_reraise_the_leaders_real_429(monkeypatch):
    gt._pools_cache.clear()

    def fake_get(path):
        time.sleep(0.05)
        raise _h429()

    monkeypatch.setattr(gt, "_get", fake_get)
    errs: list = []

    def worker():
        try:
            gt.fetch_pools("sol", "TOKRL")
        except Exception as e:  # noqa: BLE001
            errs.append(e)

    ts = [threading.Thread(target=worker) for _ in range(2)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    assert len(errs) == 2
    assert all(gt.is_rate_limited(e) for e in errs)   # genuine 429s, no synthetic raise


def test_get_url_backoff_honors_retry_after_then_exponential(monkeypatch):
    sleeps: list[float] = []
    monkeypatch.setattr(gt.time, "sleep", lambda s: sleeps.append(s))
    attempts = {"n": 0}

    class _Resp:
        def __init__(self, payload):
            self._b = json.dumps(payload).encode()
        def __enter__(self):
            return self
        def __exit__(self, *a):
            return False
        def read(self):
            return self._b

    def fake_urlopen(req, timeout=12):
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise _h429(retry_after="3")     # Retry-After honored (capped ≤5s)
        if attempts["n"] == 2:
            raise _h429()                    # no header → exponential 2^(attempt-1)
        return _Resp({"data": []})

    monkeypatch.setattr(gt.urllib.request, "urlopen", fake_urlopen)
    out = gt._get_url("https://api.geckoterminal.com/api/v2/networks")
    assert out == {"data": []} and attempts["n"] == 3
    assert sleeps == [3.0, 2.0]


def test_get_url_gives_up_after_three_429s(monkeypatch):
    monkeypatch.setattr(gt.time, "sleep", lambda s: None)
    monkeypatch.setattr(gt.urllib.request, "urlopen",
                        lambda req, timeout=12: (_ for _ in ()).throw(_h429()))
    with pytest.raises(urllib.error.HTTPError) as ei:
        gt._get_url("https://api.geckoterminal.com/api/v2/networks")
    assert gt.is_rate_limited(ei.value)      # the real 429 survives to callers
