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
