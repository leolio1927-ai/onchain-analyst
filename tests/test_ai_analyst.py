"""AI layer: evidence terkontrol, tanpa key → gagal jujur di SEMUA provider,
output terstruktur JSON + grounding log mencatat parse_ok."""
import json

import pytest

import ai_analyst
from ai_analyst import NoKeyError, _evidence, explain, parse_output
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


def test_parse_output_json_valid():
    out = parse_output('```json\n{"summary": "r", "key_signals": '
                       '[{"label": "l", "evidence": "b"}], "limitations": "k"}\n```')
    assert out["parse_ok"] is True
    assert out["summary"] == "r"
    assert out["key_signals"] == [{"label": "l", "evidence": "b"}]
    assert out["limitations"] == "k"


def test_parse_output_fallback_mentah():
    out = parse_output("not json at all")
    assert out["parse_ok"] is False
    assert out["summary"] == "not json at all"
    assert out["key_signals"] == []


def test_grounding_log_terstruktur(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(ai_analyst, "_call", lambda *a, **k: (
        '{"summary": "r", "key_signals": [], "limitations": "k"}', "mock-model",
        {"input": 1, "output": 1}))
    out = explain(_pair(), _assess(), "free", "claude")
    assert out["parse_ok"] is True
    f = next((tmp_path / "logs" / "grounding").glob("*.jsonl"))
    rec = json.loads(f.read_text().splitlines()[-1])
    assert rec["provider"] == "claude" and rec["tier"] == "free"
    assert rec["parse_ok"] is True
    assert rec["output_structured"]["summary"] == "r"
    assert "evidence" in rec


def test_tier_hanya_panjang_bukan_kebenaran(monkeypatch, tmp_path):
    """Invariant §2.3: beda tier hanya max_tokens — prompt & evidence identik."""
    monkeypatch.chdir(tmp_path)
    seen = {}

    def fake(provider, system, user, max_tokens):
        seen.update(system=system, user=user, mt=max_tokens)
        return "{}", "mock-model", {}

    monkeypatch.setattr(ai_analyst, "_call", fake)
    explain(_pair(), _assess(), "free", "claude")
    mt_free, sys_free, user_free = seen["mt"], seen["system"], seen["user"]
    explain(_pair(), _assess(), "deep", "claude")
    assert (mt_free, seen["mt"]) == (400, 1000)
    assert seen["system"] == sys_free
    # <evidence> block identical — only the depth instruction sentence differs at the end
    assert user_free.split("Analyze this token")[0] == seen["user"].split("Analyze this token")[0]
