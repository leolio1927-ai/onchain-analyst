"""Swap quote adapter tests (T2-C): pure parsers, Decimal scaling, breaker
composition and the response contract — NO network in any test here."""
import pytest

from providers import swap_quotes as sq
from providers.swap_circuit_breaker import BreakerConfig, SwapCircuitBreaker

SOL_TOKEN = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"   # BONK
EVM_TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"     # USDC (base)

# Shapes captured from the live keyless probes (2026-09-02), trimmed to the
# fields the parsers consume.
JUPITER_PAYLOAD = {
    "inputMint": "So11111111111111111111111111111111111111112",
    "inAmount": "100000000",
    "outputMint": SOL_TOKEN,
    "outAmount": "335764643049",
    "otherAmountThreshold": "334085841733",
    "routePlan": [
        {"swapInfo": {"label": "Raydium CLMM"}},
        {"swapInfo": {"label": "Orca (Whirlpool)"}},
    ],
}

LIFI_PAYLOAD = {
    "type": "lifi",
    "toolDetails": {"key": "fly", "name": "Fly"},
    "action": {
        "fromToken": {"address": "0x0000000000000000000000000000000000000000", "decimals": 18},
        "toToken": {"address": EVM_TOKEN, "decimals": 6},
        "fromAmount": "1000000000000000000",
    },
    "estimate": {
        "fromAmount": "1000000000000000000",
        "toAmount": "2369456145",
        "toAmountMin": "2357608864",
    },
    "includedSteps": [{"toolDetails": {"name": "Fly"}}],
}


def fresh_breaker(**kw) -> SwapCircuitBreaker:
    return SwapCircuitBreaker(config=BreakerConfig(**kw))


# ── Decimal scaling ───────────────────────────────────────────────────────

def test_scale_roundtrip_exact():
    assert sq.scale_to_raw("1.25", 9) == "1250000000"
    assert sq.scale_to_human("1250000000", 9) == "1.250000000"
    assert sq.scale_to_human("335764643049", 5) == "3357646.43049"


def test_scale_refuses_precision_loss_instead_of_truncating():
    with pytest.raises(sq.SwapQuoteError):
        sq.scale_to_raw("0.0000001", 5)      # 7 dp > 5 dp — silent truncation forbidden
    with pytest.raises(sq.SwapQuoteError):
        sq.scale_to_raw("0", 18)
    with pytest.raises(sq.SwapQuoteError):
        sq.scale_to_raw("-1", 18)


# ── parsers ───────────────────────────────────────────────────────────────

def test_jupiter_parser_normalizes_verified_shape():
    out = sq.parse_jupiter_quote(JUPITER_PAYLOAD, decimals_in=9, decimals_out=5)
    assert out["amount_out"] == "3357646.43049"
    assert out["minimum_received"] == "3340858.41733"
    assert out["route"] == ["Raydium CLMM", "Orca (Whirlpool)"]
    assert out["raw_amount_out"] == "335764643049"


def test_lifi_parser_normalizes_verified_shape():
    out = sq.parse_lifi_quote(LIFI_PAYLOAD, decimals_in=18, decimals_out=6)
    assert out["amount_out"] == "2369.456145"
    assert out["minimum_received"] == "2357.608864"
    assert out["route"] == ["Fly"]


def test_parsers_reject_broken_shapes_fail_closed():
    j5 = {"decimals_in": 9, "decimals_out": 5}
    l6 = {"decimals_in": 18, "decimals_out": 6}
    broken = [
        (sq.parse_jupiter_quote, {}, j5),
        (sq.parse_jupiter_quote, {"outAmount": "12", "otherAmountThreshold": None}, j5),
        (sq.parse_jupiter_quote, {"outAmount": "x", "otherAmountThreshold": "1"}, j5),
        (sq.parse_lifi_quote, {}, l6),
        (sq.parse_lifi_quote, {"estimate": {"toAmount": "1", "toAmountMin": "x"}}, l6),
        (sq.parse_jupiter_quote, "not-an-object", j5),
    ]
    for fn, payload, kw in broken:
        with pytest.raises(sq.SwapQuoteError):
            fn(payload, **kw)


# ── composition over the breaker ──────────────────────────────────────────

def test_best_quote_skips_unadapted_candidates_and_returns_first_success(monkeypatch):
    monkeypatch.setattr(sq, "ADAPTERS", {
        "lifi": lambda **kw: {"provider": "lifi", "amount_out": "1", "minimum_received": "0.9",
                              "raw_amount_out": "1", "raw_amount_in": "1",
                              "decimals_in": 18, "decimals_out": 18,
                              "route": ["Fly"], "latency_ms": 5},
    })
    b = fresh_breaker()
    quote, attempts = sq.best_quote(
        source_chain="bnb", destination_chain="bnb", token_in="native",
        token_out=EVM_TOKEN, amount_in="1", slippage_bps=50,
        candidates=["relay", "lifi", "debridge"], breaker=b)
    assert quote["provider"] == "lifi"
    # relay skipped up-front; debridge never attempted (first success returns)
    assert attempts == [
        {"provider": "relay", "outcome": "skipped",
         "detail": "no verified adapter configured"},
        {"provider": "lifi", "outcome": "quoted", "detail": attempts[1]["detail"]}]


def test_best_quote_feeds_failures_to_breaker_until_open(monkeypatch):
    def boom(**kw):
        raise sq.SwapQuoteError("HTTP 429")
    monkeypatch.setattr(sq, "ADAPTERS", {"jupiter": boom})
    b = fresh_breaker(failure_threshold=2)
    for _ in range(2):
        quote, attempts = sq.best_quote(
            source_chain="sol", destination_chain="sol", token_in="native",
            token_out=SOL_TOKEN, amount_in="1", slippage_bps=50,
            candidates=["jupiter"], breaker=b)
        assert quote is None and attempts[0]["outcome"] == "failed"
    quote, attempts = sq.best_quote(
        source_chain="sol", destination_chain="sol", token_in="native",
        token_out=SOL_TOKEN, amount_in="1", slippage_bps=50,
        candidates=["jupiter"], breaker=b)
    assert quote is None and attempts[0]["outcome"] == "breaker_blocked"


def test_requested_provider_tries_first(monkeypatch):
    order: list[str] = []
    def make(name):
        def adapter(**kw):
            order.append(name)
            return {"provider": name, "amount_out": "1", "minimum_received": "1",
                    "raw_amount_out": "1", "raw_amount_in": "1",
                    "decimals_in": 9, "decimals_out": 9, "route": [name], "latency_ms": 1}
        return adapter
    monkeypatch.setattr(sq, "ADAPTERS", {"jupiter": make("jupiter"), "lifi": make("lifi")})
    quote, _ = sq.best_quote(
        source_chain="sol", destination_chain="sol", token_in="native",
        token_out=SOL_TOKEN, amount_in="1", slippage_bps=50,
        candidates=["jupiter", "lifi"], requested="lifi", breaker=fresh_breaker())
    assert quote["provider"] == "lifi" and order == ["lifi"]


# ── the served contract ───────────────────────────────────────────────────

BASE_KW = {"source_chain": "sol", "destination_chain": "sol", "token_in": "native",
           "token_out": SOL_TOKEN, "amount_in": "1", "slippage_bps": 50}


def test_build_live_quote_keeps_execution_refused(monkeypatch):
    monkeypatch.setenv("VILMEI_SWAP_LIVE", "1")
    def fake_best_quote(**kw):
        return {"provider": "jupiter", "amount_out": "3357646.43049",
                "minimum_received": "3340858.41733", "raw_amount_out": "335764643049",
                "raw_amount_in": "100000000", "decimals_in": 9, "decimals_out": 5,
                "route": ["Raydium CLMM"], "latency_ms": 120,
                "source_chain": "sol", "destination_chain": "sol"}, [
            {"provider": "jupiter", "outcome": "quoted", "detail": "ok"}]
    monkeypatch.setattr(sq, "best_quote", fake_best_quote)
    out = sq.build_quote_response(**BASE_KW)
    assert out["data_mode"] == "live"
    assert out["amount_out"] == "3357646.43049"
    assert out["provider_quoted"] == "jupiter"
    assert out["policy"]["execution_allowed"] is False
    assert out["simulation"]["allowed"] is False
    assert out["transaction_request"] is None
    assert out["quote_id"] and len(out["quote_id"]) == 32
    assert out["provenance"]["kind"] == "keyless"


def test_build_degrades_honestly_when_no_provider_answers(monkeypatch):
    monkeypatch.setenv("VILMEI_SWAP_LIVE", "1")
    monkeypatch.setattr(sq, "best_quote", lambda **kw: (
        None, [{"provider": "jupiter", "outcome": "failed", "detail": "TimeoutError: t"}]))
    out = sq.build_quote_response(**BASE_KW)
    assert out["data_mode"] == "unwired"
    assert out["amount_out"] is None
    assert "jupiter: failed" in out["degraded"]
    assert out["policy"]["execution_allowed"] is False


def test_build_without_live_is_validation_only():
    out = sq.build_quote_response(**BASE_KW, live=False)
    assert out["data_mode"] == "unwired"
    assert out["amount_out"] is None
    assert out["degraded"] is None
    assert out["quote_id"]


def test_build_kill_switch_overrides_live(monkeypatch):
    monkeypatch.setenv("VILMEI_SWAP_LIVE", "1")
    monkeypatch.setenv("VILMEI_SWAP_KILL", "1")
    out = sq.build_quote_response(**BASE_KW)
    assert out["data_mode"] == "unwired"
    assert "kill switch" in out["degraded"]
