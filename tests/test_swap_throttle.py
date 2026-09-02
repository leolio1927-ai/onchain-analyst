"""T2-E rate limit + quote cache tests: identical spam shares one provider
call, floods answer 429 with Retry-After, and a cache HIT still carries the
fresh policy/simulation decision."""
from fastapi.testclient import TestClient

from providers import swap_quotes as sq
from webapp import server, swap_throttle

SOL_TOKEN = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"


# ── throttle unit ─────────────────────────────────────────────────────────

def test_throttle_allows_limit_then_blocks_with_retry_after():
    for _ in range(20):
        allowed, retry, key = swap_throttle.check(["ip:t1"])
        assert allowed and retry == 0
    allowed, retry, key = swap_throttle.check(["ip:t1"])
    assert not allowed and key == "ip:t1"
    assert 1 <= retry <= 61


def test_throttle_window_slides_with_clock():
    now = {"t": 1000.0}
    for _ in range(20):
        assert swap_throttle.check(["ip:t2"], now_fn=lambda: now["t"])[0]
    assert not swap_throttle.check(["ip:t2"], now_fn=lambda: now["t"])[0]
    now["t"] += 61
    assert swap_throttle.check(["ip:t2"], now_fn=lambda: now["t"])[0]


def test_wallet_and_ip_are_independent_budgets():
    for _ in range(20):
        assert swap_throttle.check(["ip:t3", "wallet:w1"])[0]
    # both budgets exhausted together
    assert not swap_throttle.check(["ip:t3", "wallet:w1"])[0]
    # a fresh wallet on the SAME IP → blocked by the IP budget
    allowed, _, blocked = swap_throttle.check(["ip:t3", "wallet:w2"])
    assert not allowed and blocked == "ip:t3"
    # the SAME wallet on a fresh IP → blocked by the wallet budget
    allowed, _, blocked = swap_throttle.check(["ip:t4", "wallet:w1"])
    assert not allowed and blocked == "wallet:w1"


def test_blocked_wallet_never_consumes_the_ip_slot():
    for _ in range(20):
        swap_throttle.check(["wallet:wX"])  # exhaust the wallet budget only
    before = len(swap_throttle._hits.get("ip:t5", ()))
    allowed, _, blocked = swap_throttle.check(["ip:t5", "wallet:wX"])
    assert not allowed and blocked == "wallet:wX"
    assert len(swap_throttle._hits.get("ip:t5", ())) == before, \
        "atomic multi-key check: a block consumes no IP slot"


# ── quote cache unit ──────────────────────────────────────────────────────

BASE_KW = {"source_chain": "sol", "destination_chain": "sol", "token_in": "native",
           "token_out": SOL_TOKEN, "amount_in": "1", "slippage_bps": 50}


def _stub_quote(monkeypatch, calls: list):
    def fake_best_quote(**kw):
        calls.append(kw)
        return {"provider": "jupiter", "amount_out": "100", "minimum_received": "99",
                "raw_amount_out": "100", "raw_amount_in": "1", "decimals_in": 9,
                "decimals_out": 9, "route": ["Raydium CLMM"], "latency_ms": 10,
                "source_chain": "sol", "destination_chain": "sol"}, [
            {"provider": "jupiter", "outcome": "quoted", "detail": "ok"}]
    monkeypatch.setattr(sq, "best_quote", fake_best_quote)


def test_identical_requests_share_one_provider_call(monkeypatch):
    monkeypatch.setenv("VILMEI_SWAP_LIVE", "1")
    calls: list = []
    _stub_quote(monkeypatch, calls)
    first = sq.build_quote_response(**BASE_KW)
    second = sq.build_quote_response(**BASE_KW)
    assert len(calls) == 1, "the second identical request must not fan out again"
    assert first["quote_cache"] == "miss" and second["quote_cache"] == "hit"
    assert second["amount_out"] == first["amount_out"] == "100"


def test_cache_hit_still_carries_a_fresh_policy_decision(monkeypatch):
    monkeypatch.setenv("VILMEI_SWAP_LIVE", "1")
    calls: list = []
    _stub_quote(monkeypatch, calls)
    sq.build_quote_response(**BASE_KW)
    second = sq.build_quote_response(**BASE_KW)
    assert second["quote_cache"] == "hit"
    assert second["policy"]["execution_allowed"] is False
    assert second["simulation"]["allowed"] is False
    assert second["simulation"]["reason"] == "no route provider wired — quote policy only"
    assert second["transaction_request"] is None


def test_different_request_shape_is_a_cache_miss(monkeypatch):
    monkeypatch.setenv("VILMEI_SWAP_LIVE", "1")
    calls: list = []
    _stub_quote(monkeypatch, calls)
    sq.build_quote_response(**BASE_KW)
    other_amount = sq.build_quote_response(**{**BASE_KW, "amount_in": "2"})
    other_slippage = sq.build_quote_response(**{**BASE_KW, "slippage_bps": 100})
    assert other_amount["quote_cache"] == "miss"
    assert other_slippage["quote_cache"] == "miss", \
        "slippage is part of the key: minimum_received must never go stale"
    assert len(calls) == 3


def test_cache_entries_expire(monkeypatch):
    monkeypatch.setenv("VILMEI_SWAP_LIVE", "1")
    monkeypatch.setattr(sq, "CACHE_TTL_S", -1.0)  # instantly stale
    calls: list = []
    _stub_quote(monkeypatch, calls)
    sq.build_quote_response(**BASE_KW)
    again = sq.build_quote_response(**BASE_KW)
    assert again["quote_cache"] == "miss" and len(calls) == 2


# ── endpoint: spam → 429 + Retry-After ────────────────────────────────────

def _params(**over):
    params = {"source_chain": "sol", "destination_chain": "sol", "token_in": "native",
              "token_out": SOL_TOKEN, "amount_in": "1", "slippage_bps": 50}
    params.update(over)
    return params


def test_spam_hits_429_with_retry_after_header(monkeypatch):
    monkeypatch.setenv("VILMEI_SWAP_LIVE", "0")
    client = TestClient(server.app)
    codes = [client.get("/api/v1/swap/quote", params=_params()).status_code
             for _ in range(21)]
    assert codes[:20] == [200] * 20
    assert codes[20] == 429
    blocked = client.get("/api/v1/swap/quote", params=_params())
    assert blocked.headers.get("Retry-After", "").isdigit()
    assert "rate limit" in blocked.json()["detail"]


def test_wallet_param_is_throttle_only_and_quotes_still_work(monkeypatch):
    monkeypatch.setenv("VILMEI_SWAP_LIVE", "0")
    client = TestClient(server.app)
    r = client.get("/api/v1/swap/quote", params=_params(wallet="9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"))
    assert r.status_code == 200
    j = r.json()
    assert j["quote_cache"] is None, "live disabled → no provider cache state"
    assert j["data_mode"] == "unwired"
    assert j["policy"]["execution_allowed"] is False
