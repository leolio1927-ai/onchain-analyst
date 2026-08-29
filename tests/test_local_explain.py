"""G.5 local tier: deterministic local_explain narrative + /api/explain
provider='local' (no key, no rate slot), and the 503 hint for keyless LLM
providers. Offline — providers are monkeypatched, no LLM is ever called."""
import time

import pytest
from fastapi.testclient import TestClient

import ai_analyst
from heuristics import rug_check
from webapp import server

ADDR = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"


@pytest.fixture
def client():
    return TestClient(server.app)


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    server._scan_cache.clear()
    server._ai_hits.clear()
    yield


def _pair():
    return {
        "pairAddress": "PAIR1", "chainId": "solana", "dexId": "raydium",
        "baseToken": {"address": "T1", "symbol": "TEST", "name": "Test"},
        "quoteToken": {"symbol": "SOL"}, "priceUsd": "0.001",
        "liquidity": {"usd": 1_500}, "fdv": 2_000_000,
        "volume": {"h24": 300_000}, "priceChange": {"h24": 2.0},
        "txns": {"h24": {"buys": 500, "sells": 60}},
        "pairCreatedAt": int(time.time() * 1000) - 3 * 3_600_000,
    }


def _cl():
    return {"wallets": 12, "buys": 30, "severity": 0.8,
            "evidence": "12 wallets · 30 buys · 60s burst max 10 (5.0x average)"}


def test_local_explain_deterministic_and_verbatim():
    a = rug_check.assess(_pair(), _cl())
    out1 = ai_analyst.local_explain(_pair(), a, _cl())
    out2 = ai_analyst.local_explain(_pair(), a, _cl())
    assert out1 == out2  # same evidence → same narrative, byte for byte
    assert out1["parse_ok"] is True
    assert len(out1["key_signals"]) == 3
    labels = {s["label"] for s in a["signals"]}
    evidences = {s["evidence"] for s in a["signals"]}
    assert all(k["label"] in labels for k in out1["key_signals"])
    assert all(k["evidence"] in evidences for k in out1["key_signals"])  # verbatim
    assert "[LOCAL" in out1["summary"] and a["level_label"] in out1["summary"]
    assert "no LLM" in out1["limitations"]
    # scored signals rank first by weight (liquidity carries the top weight)
    sig = {s["label"]: s for s in a["signals"]}
    assert sig[out1["key_signals"][0]["label"]]["severity"] is not None


def test_local_explain_nodata_stays_honest():
    empty = {"pairAddress": None, "liquidity": None, "fdv": None, "volume": None,
             "txns": None, "pairCreatedAt": None}
    a = rug_check.assess(empty, None)
    assert a["level"] == "nodata" and a["score"] is None
    out = ai_analyst.local_explain(empty, a)
    assert "no score" in out["summary"]
    assert all(k["evidence"] for k in out["key_signals"])  # only real evidence quoted


def test_local_explain_uses_clustering_arg_when_assessment_lacks_it():
    a = rug_check.assess(_pair())  # 5 signals — clustering not embedded
    out = ai_analyst.local_explain(_pair(), a, _cl())
    assert any(k["label"] == "Wallet coordination" and
               k["evidence"] == _cl()["evidence"] for k in out["key_signals"])


def _patch_scan_providers(monkeypatch):
    monkeypatch.setattr("providers.dexscreener.fetch_pairs", lambda c, a: [_pair()])
    monkeypatch.setattr("providers.geckoterminal.fetch_trades",
                        lambda c, p: [{"wallet": f"W{i}", "kind": "buy",
                                       "ts": f"2026-08-28T06:00:{i:02d}Z",
                                       "usd": 10.0 + i, "base_token": "T1"}
                                      for i in range(2)])


def test_endpoint_provider_local_needs_no_key(client, monkeypatch):
    for k in ("ANTHROPIC_API_KEY", "GLM_API_KEY", "KIMI_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    _patch_scan_providers(monkeypatch)
    r = client.post("/api/explain", json={"chain": "sol", "address": ADDR, "provider": "local"})
    assert r.status_code == 200
    j = r.json()
    assert j["provider"] == "local" and j["tier"] == "local" and j["parse_ok"] is True
    assert "[LOCAL" in j["summary"] and j["key_signals"]


def test_endpoint_local_not_rate_limited_unknown_provider_still_400(client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    _patch_scan_providers(monkeypatch)
    for _ in range(3):  # no founder-money slot involved — never throttled
        assert client.post("/api/explain",
                           json={"chain": "sol", "address": ADDR, "provider": "local"}
                           ).status_code == 200
    r = client.post("/api/explain", json={"chain": "sol", "address": ADDR, "provider": "gpt4"})
    assert r.status_code == 400 and "local" in r.json()["detail"]


def test_endpoint_keyless_llm_503_hints_local(client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    _patch_scan_providers(monkeypatch)
    r = client.post("/api/explain", json={"chain": "sol", "address": ADDR, "provider": "claude"})
    assert r.status_code == 503
    detail = r.json()["detail"]
    assert "ANTHROPIC_API_KEY" in detail and "provider='local'" in detail
