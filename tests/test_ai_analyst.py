"""AI layer: evidence terkontrol, tanpa key → gagal jujur di SEMUA provider."""
import pytest

import ai_analyst
from ai_analyst import NoKeyError, _evidence, explain
from heuristics import rug_check


def _pair():
    return {
        "baseToken": {"address": "T1", "symbol": "TEST", "name": "Test"},
        "dexId": "raydium", "priceUsd": "0.001", "url": "https://dexscreener.com/rahasia",
        "liquidity": {"usd": 500_000}, "fdv": 2_000_000,
        "volume": {"h24": 300_000}, "txns": {"h24": {"buys": 500, "sells": 480}},
    }


def _assess():
    return {"level": "low", "score": 10.0, "signals": [], "notes": []}


def test_evidence_subset_terkontrol():
    p = _pair()
    ev = _evidence(p, rug_check.assess(p))
    assert ev["token"]["symbol"] == "TEST"
    assert "url" not in ev
    assert "chainId" not in ev


def test_registry_konsisten():
    for p in ai_analyst.PROVIDERS.values():
        assert p.kind in ("anthropic", "openai")
        assert p.env_key.endswith("_API_KEY")


def test_tanpa_key_gagal_jujur_semua_provider(monkeypatch):
    for env in ("ANTHROPIC_API_KEY", "GLM_API_KEY", "KIMI_API_KEY"):
        monkeypatch.delenv(env, raising=False)
    for name in ai_analyst.PROVIDERS:
        with pytest.raises(NoKeyError):
            explain(_pair(), _assess(), provider=name)
