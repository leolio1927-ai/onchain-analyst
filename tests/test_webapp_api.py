"""Web backend: scan/explain/whale/health + honest degrade + anti-evidence-forgery."""
import time
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from webapp import server


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.setenv("ALPHA_AI_RATELIMIT_HOURLY", "5")
    monkeypatch.setenv("ALPHA_AI_RATELIMIT_DAILY", "30")
    server._scan_cache.clear()
    server._ai_hits.clear()
    yield


@pytest.fixture
def client():
    return TestClient(server.app)


def _pair():
    return {
        "pairAddress": "PAIR1", "chainId": "solana", "dexId": "raydium",
        "baseToken": {"address": "T1", "symbol": "TEST", "name": "Test"},
        "quoteToken": {"symbol": "SOL"}, "priceUsd": "0.001",
        "liquidity": {"usd": 500_000}, "fdv": 2_000_000, "marketCap": 2_000_000,
        "volume": {"h24": 300_000, "h6": 80_000, "h1": 20_000, "m5": 1_000},
        "priceChange": {"m5": 0.1, "h1": 0.5, "h6": 1.0, "h24": 2.0},
        "txns": {"h24": {"buys": 500, "sells": 480}},
        "pairCreatedAt": int(time.time() * 1000) - 90 * 24 * 3600 * 1000,
        "url": "https://dexscreener.com/x",
    }


def _trades(n=25):
    t0 = datetime.now(UTC).timestamp()
    return [{"wallet": f"W{i}", "kind": "buy", "ts": datetime.fromtimestamp(t0 + i * 2.5, tz=UTC).isoformat(),
             "usd": 100.0 + i, "base_token": "T1"} for i in range(n)]


def _patch_providers(monkeypatch, pair=None, trades=None):
    monkeypatch.setattr("providers.dexscreener.fetch_pairs",
                        lambda chain, addr: [pair] if pair is not None else [_pair()])
    monkeypatch.setattr("providers.geckoterminal.fetch_trades",
                        lambda chain, pool: trades if trades is not None else _trades())


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok" and "sol" in j["chains"] and j["tier"] == "free"


def test_scan_full_6_signals(client, monkeypatch):
    _patch_providers(monkeypatch)
    r = client.post("/api/scan", json={"chain": "sol", "address": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"})
    assert r.status_code == 200
    j = r.json()
    assert j["pair"]["baseToken"]["symbol"] == "TEST"
    assert len(j["assessment"]["signals"]) == 6
    assert j["assessment"]["score"] is not None
    assert "dexscreener" in j["sources"] and "geckoterminal" in j["sources"]


def test_scan_bad_input(client):
    assert client.post("/api/scan", json={"chain": "hype", "address": "x"}).status_code == 400
    assert client.post("/api/scan", json={"chain": "sol", "address": "../etc/passwd"}).status_code == 400
    assert client.post("/api/scan", json={"chain": "bnb", "address": "0xshort"}).status_code == 400


def test_scan_404_and_gt_degrade(client, monkeypatch):
    monkeypatch.setattr("providers.dexscreener.fetch_pairs", lambda c, a: [])
    assert client.post("/api/scan", json={"chain": "sol", "address": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"}).status_code == 404

    import urllib.error
    def boom(chain, pool):
        raise urllib.error.HTTPError("u", 429, "rate", None, None)
    monkeypatch.setattr("providers.dexscreener.fetch_pairs", lambda c, a: [_pair()])
    monkeypatch.setattr("providers.geckoterminal.fetch_trades", boom)
    r = client.post("/api/scan", json={"chain": "sol", "address": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"})
    assert r.status_code == 200
    cl = r.json()["clustering"]
    assert cl["severity"] is None and "unavailable" in cl["evidence"]


def test_explain_ok_and_server_refetches(client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    calls = {}
    _patch_providers(monkeypatch)

    def spy_fetch(chain, addr):
        calls["refetched"] = True
        return [_pair()]
    monkeypatch.setattr("providers.dexscreener.fetch_pairs", spy_fetch)
    monkeypatch.setattr(ai_analyst_module(), "_call", lambda *a, **k: (
        '{"summary": "s", "key_signals": [], "limitations": "l"}', "mock", {}))

    r = client.post("/api/explain", json={"chain": "sol", "address": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", "provider": "claude"})
    assert r.status_code == 200
    j = r.json()
    assert j["summary"] == "s" and j["parse_ok"] is True and j["tier"] == "free"
    assert calls["refetched"] is True  # server re-fetches — client cannot forge evidence


def ai_analyst_module():
    import ai_analyst
    return ai_analyst


def test_explain_503_without_key(client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    _patch_providers(monkeypatch)
    r = client.post("/api/explain", json={"chain": "sol", "address": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", "provider": "claude"})
    assert r.status_code == 503
    assert "ANTHROPIC_API_KEY" in r.json()["detail"]


def test_explain_rate_limited(client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setenv("ALPHA_AI_RATELIMIT_HOURLY", "1")
    _patch_providers(monkeypatch)
    monkeypatch.setattr(ai_analyst_module(), "_call", lambda *a, **k: ("{}", "m", {}))
    assert client.post("/api/explain", json={"chain": "sol", "address": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"}).status_code == 200
    r = client.post("/api/explain", json={"chain": "sol", "address": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"})
    assert r.status_code == 429
    assert "rate limit" in r.json()["detail"].lower()


def test_whale_503_without_key(client, monkeypatch):
    monkeypatch.delenv("HELIUS_API_KEY", raising=False)
    r = client.post("/api/whale", json={"address": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"})
    assert r.status_code == 503
    assert "HELIUS_API_KEY" in r.json()["detail"]


def test_pages_honest_without_dist(client, monkeypatch, tmp_path):
    monkeypatch.setenv("ALPHA_DIST_DIR", str(tmp_path / "nope"))
    assert client.get("/").status_code == 503
    assert "npm run build" in client.get("/").text
    assert client.get("/terminal").status_code == 503
    assert client.get("/assets/x.js").status_code == 404


def test_pages_serve_built_dist(client, monkeypatch, tmp_path):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>LANDING-OK</html>")
    (dist / "terminal.html").write_text("<html>TERMINAL-OK</html>")
    (dist / "assets" / "app.js").write_text("console.log(1)")
    monkeypatch.setenv("ALPHA_DIST_DIR", str(dist))
    assert "LANDING-OK" in client.get("/").text
    assert "TERMINAL-OK" in client.get("/terminal").text
    assert client.get("/assets/app.js").status_code == 200
    assert client.get("/assets/../../etc/passwd").status_code in (404, 400)  # traversal guard


def _gt_pool_payload():
    return {"data": [{"id": "solana_POOL1", "type": "pool",
                      "attributes": {"name": "A / SOL", "base_token_price_usd": "0.001",
                                     "volume_usd": {"h24": "42"}, "fdv_usd": "9000"},
                      "relationships": {"dex": {"data": {"id": "pump-fun"}}}}]}


def test_discovery_trending_and_new(client, monkeypatch):
    from providers import geckoterminal as gt
    calls: list[str] = []

    def fake_get(path):
        calls.append(path)
        return _gt_pool_payload()

    monkeypatch.setattr(gt, "_get", fake_get)
    r = client.get("/api/v1/discovery", params={"chain": "sol", "mode": "trending", "limit": 5})
    assert r.status_code == 200
    j = r.json()
    assert j["chain"] == "sol" and j["mode"] == "trending" and j["count"] == 1
    item = j["items"][0]
    assert item["pool_address"] == "POOL1" and item["dex"] == "pump-fun"
    assert item["volume_24h"] == "42" and item["change_24h"] is None  # absent stays absent
    assert calls == ["/networks/solana/trending_pools"]

    r2 = client.get("/api/v1/discovery", params={"chain": "base", "mode": "new"})
    assert r2.status_code == 200
    assert calls[-1] == "/networks/base/new_pools"


def test_discovery_bad_chain_and_mode(client):
    # R2 probe 2026-08-31: GT now serves hood (robinhood) + hype (hyperevm);
    # avax stays parked 2026-08-30 → it is the "not served" chain now
    r = client.get("/api/v1/discovery", params={"chain": "avax"})
    assert r.status_code == 400 and "not served" in r.json()["detail"]
    assert client.get("/api/v1/discovery", params={"mode": "hot"}).status_code == 400


def test_discovery_upstream_fail_is_502(client, monkeypatch):
    import urllib.error

    from providers import geckoterminal as gt

    def boom(path):
        raise urllib.error.HTTPError("u", 429, "rate", None, None)

    monkeypatch.setattr(gt, "_get", boom)
    r = client.get("/api/v1/discovery", params={"chain": "sol"})
    assert r.status_code == 502 and "429" in r.json()["detail"]

    def unreach(path):
        raise urllib.error.URLError("conn refused")

    monkeypatch.setattr(gt, "_get", unreach)
    assert client.get("/api/v1/discovery", params={"chain": "sol"}).status_code == 502


def test_version_and_metrics_real_values(client):
    j = client.get("/api/version").json()
    assert j["name"] == "VILMEI" and j["version"] == server.APP_VERSION
    assert j["python"].startswith("3.") and j["fastapi"]
    assert isinstance(j["uptime_s"], int) and j["uptime_s"] >= 0

    m = client.get("/api/metrics").json()
    assert {"scans", "uptime_s", "ws_clients", "scan_cache_entries",
            "gt_trade_cache_entries", "throttled_ips"} <= set(m)
    assert m["scan_cache_entries"] == len(server._scan_cache)  # measured, not invented


def test_openapi_premium_surface(client):
    spec = client.get("/openapi.json").json()
    assert spec["info"]["title"] == "VILMEI"
    assert spec["info"]["version"] == server.APP_VERSION
    assert spec["info"]["license"]["identifier"] == "MIT"
    assert spec["info"]["description"].startswith("Read-only multichain memecoin")
    tags = {t["name"] for t in spec["tags"]}
    assert {"market", "ai", "whale", "system"} <= tags
    for path, method in (("/api/scan", "post"), ("/api/explain", "post"),
                         ("/api/whale", "post"), ("/api/health", "get"),
                         ("/api/v1/discovery", "get"), ("/api/version", "get"),
                         ("/api/metrics", "get")):
        op = spec["paths"][path][method]
        assert op["tags"] and set(op["tags"]) <= tags
        assert op.get("description")  # every public op documents itself
    assert client.get("/api/docs").status_code == 200   # Swagger (moved off /docs)
    assert client.get("/api/redoc").status_code == 200
    assert client.get("/docs").status_code == 200       # human Docs page serves here
    assert "VILMEI" in client.get("/docs").text.upper()
