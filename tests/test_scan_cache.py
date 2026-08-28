"""Scan cache contract: TTL hits, refresh bypass, and bounded memory
(eviction cap — the cache used to grow without bound)."""
import asyncio

from webapp import server


def _run(coro):
    return asyncio.run(coro)


def setup_function(_):
    server._scan_cache.clear()


def _patch_scan_chain(monkeypatch, counter):
    async def fake_scan(chain_key, address):
        counter.append((chain_key, address))
        return {"pair": {}, "assessment": {}, "clustering": {}, "sources": [], "ts": "t"}
    monkeypatch.setattr(server, "_scan_chain", fake_scan)


def test_ttl_hit_within_window(monkeypatch):
    counter: list = []
    _patch_scan_chain(monkeypatch, counter)
    r1 = _run(server._get_scan("sol", "A"))
    r2 = _run(server._get_scan("sol", "A"))
    assert len(counter) == 1 and r1 is r2  # served from cache, no refetch


def test_expired_entry_refetches(monkeypatch):
    counter: list = []
    _patch_scan_chain(monkeypatch, counter)
    _run(server._get_scan("sol", "A"))
    key = ("sol", "A")
    at, res = server._scan_cache[key]
    server._scan_cache[key] = (at - server.CACHE_TTL_S, res)  # age the entry out
    _run(server._get_scan("sol", "A"))
    assert len(counter) == 2


def test_refresh_bypasses_cache(monkeypatch):
    counter: list = []
    _patch_scan_chain(monkeypatch, counter)
    _run(server._get_scan("sol", "A"))
    _run(server._get_scan("sol", "A", refresh=True))
    assert len(counter) == 2


def test_eviction_keeps_cache_bounded(monkeypatch):
    counter: list = []
    _patch_scan_chain(monkeypatch, counter)
    monkeypatch.setattr(server, "SCAN_CACHE_MAX", 3)
    for i in range(5):
        _run(server._get_scan("sol", f"ADDR{i}"))
    assert len(server._scan_cache) <= 3  # cap holds — no unbounded growth
    assert ("sol", "ADDR4") in server._scan_cache  # newest survives
    assert ("sol", "ADDR0") not in server._scan_cache  # oldest was evicted
