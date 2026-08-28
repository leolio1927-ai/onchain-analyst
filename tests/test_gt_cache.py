"""GeckoTerminal rate budget: TTL trade cache (warm scan = 1 upstream call)
and the no-fallback-when-primary-succeeded rule in webapp._scan_chain."""
import asyncio

from providers import geckoterminal
from webapp import server


def setup_function(_):
    geckoterminal._trade_cache.clear()


def _stub_get(payload: dict, calls: list):
    def _fake(path: str) -> dict:
        calls.append(path)
        return payload
    return _fake


def _trades_payload(n=2):
    return {"data": [
        {"attributes": {"tx_from_address": f"W{i}", "kind": "buy",
                        "block_timestamp": "2026-08-28T06:00:00Z",
                        "volume_in_usd": "10"}}
        for i in range(n)
    ]}


def test_warm_scan_hits_cache_once(monkeypatch):
    calls: list = []
    monkeypatch.setattr(geckoterminal, "_get", _stub_get(_trades_payload(), calls))
    t1 = geckoterminal.fetch_trades("sol", "POOL1")
    t2 = geckoterminal.fetch_trades("sol", "POOL1")
    assert len(t1) == 2 and t2 == t1
    assert len(calls) == 1  # second call served from the TTL cache


def test_expired_entry_refetches(monkeypatch):
    calls: list = []
    monkeypatch.setattr(geckoterminal, "_get", _stub_get(_trades_payload(), calls))
    geckoterminal.fetch_trades("sol", "POOL1")
    key = ("sol", "POOL1")
    at, trades = geckoterminal._trade_cache[key]
    geckoterminal._trade_cache[key] = (at - geckoterminal.TRADE_CACHE_TTL_S, trades)
    geckoterminal.fetch_trades("sol", "POOL1")
    assert len(calls) == 2  # aged past TTL → fresh upstream fetch


def test_cache_kept_bounded(monkeypatch):
    calls: list = []
    monkeypatch.setattr(geckoterminal, "_get", _stub_get(_trades_payload(), calls))
    monkeypatch.setattr(geckoterminal, "TRADE_CACHE_MAX", 3)
    for i in range(5):
        geckoterminal.fetch_trades("sol", f"POOL{i}")
    assert len(geckoterminal._trade_cache) <= 3  # cap holds — no unbounded growth


def test_fallback_skipped_when_primary_pool_succeeds(monkeypatch):
    """A successful primary trades fetch (even with zero trades) must NOT spend
    the extra fetch_pools round-trip — GT free tier is ~10 calls/min."""
    calls = {"trades": 0, "pools": 0}

    def _pair():
        return {"pairAddress": "POOL1", "chainId": "solana", "dexId": "raydium",
                "baseToken": {"address": "T1", "symbol": "TEST", "name": "Test"},
                "liquidity": {"usd": 500_000}}

    def fake_trades(chain, pool):
        calls["trades"] += 1
        return []  # successful fetch, honestly empty

    def fake_pools(chain, token):
        calls["pools"] += 1
        return []

    monkeypatch.setattr("providers.dexscreener.fetch_pairs", lambda c, a: [_pair()])
    monkeypatch.setattr("providers.geckoterminal.fetch_trades", fake_trades)
    monkeypatch.setattr("providers.geckoterminal.fetch_pools", fake_pools)

    out = asyncio.run(server._scan_chain("sol", "ADDR"))
    assert calls == {"trades": 1, "pools": 0}  # cold scan = single GT call
    assert out["clustering"]["buys"] == 0
