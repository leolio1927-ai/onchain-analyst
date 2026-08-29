"""G.7 live feed — offline contract tests (gt._get monkeypatched, zero network).

Canned payloads mirror the Stage-0-verified GT shape (include=base_token,
transactions.h24 buys/sells, dex under relationships). Covers: field
contract, limit clamp, alpha determinism + stable ties + zero-extra-calls,
LAUNCHPAD mapping with unknown→None, TTL cache warm/stale paths, and the
route contract (200/404/400/502 + live:false mechanism)."""
import time
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from providers import geckoterminal as gt
from providers import live
from webapp import server


@pytest.fixture(autouse=True)
def _clean():
    live._feed_cache.clear()
    yield
    live._feed_cache.clear()


@pytest.fixture
def client():
    return TestClient(server.app)


def _pool(i, *, dex="pump-fun", vol="1000", liq="5000", buys=10, sells=5,
          symbol="TST", logo="https://img.example/x.png",
          age="2026-08-29T00:00:00Z"):
    tok_id = f"solana_TOK{i}"
    e = {"id": f"solana_POOL{i}", "type": "pool",
         "attributes": {"address": f"POOL{i}", "name": f"TEST{i} / SOL",
                        "base_token_price_usd": "0.001",
                        "volume_usd": {"h24": vol},
                        "price_change_percentage": {"h24": "1.5"},
                        "reserve_in_usd": liq, "fdv_usd": "9000",
                        "pool_created_at": age,
                        "transactions": {"h24": {"buys": buys, "sells": sells}}},
         "relationships": {"base_token": {"data": {"id": tok_id}},
                           "dex": {"data": {"id": dex}}}}
    tok = {"id": tok_id, "type": "token",
           "attributes": {"symbol": symbol, "name": f"Test {i}", "image_url": logo}}
    return e, tok


def _raw(n=3, with_included=True):
    pairs = [_pool(i) for i in range(n)]
    out = {"data": [e for e, _ in pairs]}
    if with_included:
        out["included"] = [t for _, t in pairs]
    return out


def _patch(monkeypatch, payload=None, calls=None):
    def fake_get(path):
        if calls is not None:
            calls.append(path)
        return payload if payload is not None else _raw()

    monkeypatch.setattr(gt, "_get", fake_get)


# ── provider: item contract ──────────────────────────────────────────────

def test_field_contract_exact(monkeypatch):
    _patch(monkeypatch)
    items, meta = live.get_feed("sol", "new", 20)
    assert meta == {"cached": False, "stale": False}
    assert len(items) == 3
    assert set(items[0]) == set(live.FIELDS)
    assert items[0] == {
        "pool_address": "POOL0", "token_symbol": "TST", "token_name": "Test 0",
        "pair": "TEST0 / SOL", "logo": "https://img.example/x.png",
        "price_usd": "0.001", "volume_24h": "1000", "change_24h": "1.5",
        "liquidity_usd": "5000", "txns_24h": 15, "fdv_usd": "9000",
        "created_at": "2026-08-29T00:00:00Z", "dex_id": "pump-fun",
        "launchpad": "pump.fun"}


def test_absent_stays_absent(monkeypatch):
    # no included[] → token identity honestly unknown, never guessed
    _patch(monkeypatch, {"data": [_pool(1)[0]]})
    items, _ = live.get_feed("sol", "new", 20)
    assert items[0]["token_symbol"] is None
    assert items[0]["token_name"] is None
    assert items[0]["logo"] is None
    assert items[0]["pair"] == "TEST1 / SOL"  # pool-level fields still copied

    # unmapped dex → launchpad None, dex_id verbatim; missing txns → None
    e, _ = _pool(2, dex="brand-new-dex")
    del e["attributes"]["transactions"]
    live._feed_cache.clear()  # part one warmed the (sol, new) entry
    _patch(monkeypatch, {"data": [e], "included": []})
    items, _ = live.get_feed("sol", "new", 20)
    assert items[0]["dex_id"] == "brand-new-dex"
    assert items[0]["launchpad"] is None
    assert items[0]["txns_24h"] is None


def test_limit_clamped_both_sides(monkeypatch):
    _patch(monkeypatch)
    assert len(live.get_feed("sol", "new", 0)[0]) == 1
    assert len(live.get_feed("sol", "new", -7)[0]) == 1
    assert len(live.get_feed("sol", "new", 2)[0]) == 2
    assert len(live.get_feed("sol", "new", 10 ** 9)[0]) == 3  # caps at payload


def test_mode_paths_and_alpha_shares_volume_source(monkeypatch):
    calls: list = []
    _patch(monkeypatch, calls=calls)
    for mode in ("new", "trending", "volume", "alpha"):
        live._feed_cache.clear()
        live.get_feed("sol", mode, 20)
    assert calls == [
        "/networks/solana/new_pools?include=base_token",
        "/networks/solana/trending_pools?include=base_token",
        "/networks/solana/pools?sort=h24_volume_usd_desc&include=base_token",
        # alpha = re-ranked volume feed — same upstream path, no extra call
        "/networks/solana/pools?sort=h24_volume_usd_desc&include=base_token",
    ]


# ── provider: cache + alpha ──────────────────────────────────────────────

def test_alpha_zero_extra_calls_and_warm_cache(monkeypatch):
    calls: list = []
    _patch(monkeypatch, calls=calls)
    live.get_feed("sol", "volume", 20)
    items, meta = live.get_feed("sol", "alpha", 20)
    assert len(calls) == 1  # alpha reused the volume cache entry
    assert meta == {"cached": True, "stale": False}
    assert items  # still a full ranked feed


def test_cache_warm_hit(monkeypatch):
    calls: list = []
    _patch(monkeypatch, calls=calls)
    live.get_feed("sol", "new", 20)
    items, meta = live.get_feed("sol", "new", 20)
    assert len(calls) == 1 and meta == {"cached": True, "stale": False}
    assert len(items) == 3


def test_stale_serve_on_upstream_fail(monkeypatch):
    _patch(monkeypatch)
    live.get_feed("sol", "new", 20)
    key = ("sol", "new")
    live._feed_cache[key] = (time.monotonic() - 9_999, live._feed_cache[key][1])

    import urllib.error

    def boom(path):
        raise urllib.error.URLError("conn refused")

    monkeypatch.setattr(gt, "_get", boom)
    items, meta = live.get_feed("sol", "new", 20)
    assert meta == {"cached": True, "stale": True}
    assert len(items) == 3  # expired-but-real data, flagged honestly


def test_upstream_fail_without_cache_raises(monkeypatch):
    import urllib.error

    def boom(path):
        raise urllib.error.URLError("conn refused")

    monkeypatch.setattr(gt, "_get", boom)
    with pytest.raises(urllib.error.URLError):
        live.get_feed("sol", "new", 20)


def test_unknown_and_notlive_chain_raise(monkeypatch):
    with pytest.raises(ValueError, match="unknown chain"):
        live.get_feed("moon", "new")
    with monkeypatch.context() as m:
        m.setitem(live.CHAINS, "hood", {"network_id": None, "live": False})
        with pytest.raises(ValueError, match="no GeckoTerminal network"):
            live.get_feed("hood", "new")


# ── alpha ranking ────────────────────────────────────────────────────────

def test_alpha_weights_documented():
    assert set(live.ALPHA_WEIGHTS) == {"volume", "txns", "liquidity", "age"}
    assert sum(live.ALPHA_WEIGHTS.values()) == pytest.approx(1.0)


def test_alpha_ranking_differs_from_volume_order_and_is_deterministic(monkeypatch):
    # A: big volume but old, illiquid, near-dead txns. B: smaller volume,
    # healthy liquidity + txns + fresh. Alpha must rank B above A even though
    # the volume-sorted source puts A first.
    a, _ = _pool(1, vol="5000000", liq="100", buys=1, sells=0,
                 age="2026-08-01T00:00:00Z")
    b, _ = _pool(2, vol="100000", liq="90000", buys=1500, sells=500,
                 age="2026-08-29T00:00:00Z")
    _patch(monkeypatch, {"data": [a, b], "included": []})
    r1, _ = live.get_feed("sol", "alpha", 20)
    r2, _ = live.get_feed("sol", "alpha", 20)
    assert [i["pool_address"] for i in r1] == ["POOL2", "POOL1"]
    assert [i["pool_address"] for i in r2] == ["POOL2", "POOL1"]  # deterministic

    now = datetime(2026, 8, 29, 12, 0, tzinfo=UTC)  # pure: injectable clock
    assert live._alpha_score(r1[0], now) == live._alpha_score(r1[0], now)


def test_alpha_stable_tie(monkeypatch):
    # identical attributes → identical score and volume → source order kept
    a, _ = _pool(1)
    b, _ = _pool(2)
    _patch(monkeypatch, {"data": [a, b], "included": []})
    items, _ = live.get_feed("sol", "alpha", 20)
    assert [i["pool_address"] for i in items] == ["POOL1", "POOL2"]


def test_alpha_pure_score_components(monkeypatch):
    now = datetime(2026, 8, 29, 12, 0, tzinfo=UTC)
    full, _ = _pool(1, vol="100000000", liq="100000", buys=1000, sells=0,
                    age="2026-08-29T11:30:00Z")
    bare = {"pair": "X / SOL", "volume_24h": None, "txns_24h": None,
            "liquidity_usd": None, "created_at": None}
    s_full = live._alpha_score(live._normalize({"data": [full]}, 50)[0], now)
    assert 0.99 < s_full <= 1.0  # everything present and maximal → ~1
    assert live._alpha_score(bare, now) == 0.0  # absent components contribute 0


# ── route ────────────────────────────────────────────────────────────────

def test_route_ok_shape(client, monkeypatch):
    _patch(monkeypatch)
    r = client.get("/api/v1/live/sol", params={"mode": "alpha", "limit": 5})
    assert r.status_code == 200
    j = r.json()
    assert set(j) == {"chain", "network_id", "live", "generated_at",
                      "cached", "stale", "items"}
    assert j["chain"] == "sol" and j["network_id"] == "solana" and j["live"] is True
    assert j["cached"] is False and j["stale"] is False
    assert len(j["items"]) == 3


def test_route_404_unknown_chain(client):
    r = client.get("/api/v1/live/polygon")
    assert r.status_code == 404
    assert "polygon" in r.json()["detail"]


def test_route_400_bad_mode_and_limit(client):
    assert client.get("/api/v1/live/sol", params={"mode": "hot"}).status_code == 400
    assert client.get("/api/v1/live/sol", params={"limit": 0}).status_code == 400
    assert client.get("/api/v1/live/sol", params={"limit": 51}).status_code == 400


def test_route_502_upstream_without_cache(client, monkeypatch):
    import urllib.error

    def boom(path):
        raise urllib.error.HTTPError("u", 429, "rate", None, None)

    monkeypatch.setattr(gt, "_get", boom)
    r = client.get("/api/v1/live/sol")
    assert r.status_code == 502 and "429" in r.json()["detail"]


def test_route_stale_after_expired_cache(client, monkeypatch):
    _patch(monkeypatch)
    client.get("/api/v1/live/sol")  # prime
    live._feed_cache[("sol", "new")] = (time.monotonic() - 9_999,
                                        live._feed_cache[("sol", "new")][1])

    import urllib.error

    def boom(path):
        raise urllib.error.URLError("down")

    monkeypatch.setattr(gt, "_get", boom)
    r = client.get("/api/v1/live/sol")
    assert r.status_code == 200
    j = r.json()
    assert j["stale"] is True and j["cached"] is True and j["items"]


def test_route_hood_live_on_robinhood(client, monkeypatch):
    _patch(monkeypatch)
    r = client.get("/api/v1/live/hood", params={"mode": "volume"})
    assert r.status_code == 200
    j = r.json()
    assert j["live"] is True and j["network_id"] == "robinhood"
    assert client.get("/api/v1/live/hype").json()["network_id"] == "hyperevm"


def test_route_notlive_mechanism_serves_empty_honestly(client, monkeypatch):
    calls: list = []
    _patch(monkeypatch, calls=calls)
    with monkeypatch.context() as m:
        m.setitem(live.CHAINS, "hood", {"network_id": None, "live": False})
        r = client.get("/api/v1/live/hood")
    assert r.status_code == 200
    j = r.json()
    assert j["live"] is False and j["network_id"] is None
    assert j["items"] == [] and j["stale"] is False
    assert calls == []  # zero upstream calls for a not-live chain
