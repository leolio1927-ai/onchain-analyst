"""Circuit breaker tests (T2-E): fail-closed states, deterministic clock,
spec parameters (>=3 consecutive failures, >40% error rate over 60s,
120s open hold, per (provider, chain, route-type) granularity)."""
from providers.swap_circuit_breaker import BreakerConfig, SwapCircuitBreaker


def make_breaker(**kw):
    now = {"t": 1000.0}
    return SwapCircuitBreaker(config=BreakerConfig(**kw), now_fn=lambda: now["t"]), now


def test_closed_allows_then_opens_after_threshold():
    b, _ = make_breaker(failure_threshold=3, open_seconds=100)
    for i in range(3):
        assert b.check("lifi", "bnb:bnb")["allowed"] is True
        b.record_failure("lifi", "bnb:bnb", f"err {i}")
    d = b.check("lifi", "bnb:bnb")
    assert d["allowed"] is False and d["state"] == "open"


def test_half_open_after_cooloff_and_success_closes():
    b, now = make_breaker(failure_threshold=1, open_seconds=10, half_open_successes=1)
    b.record_failure("jupiter", "sol:sol", "boom")
    assert b.check("jupiter", "sol:sol")["state"] == "open"
    now["t"] += 11
    d = b.check("jupiter", "sol:sol")
    assert d["state"] == "half_open" and d["allowed"] is True
    b.record_success("jupiter", "sol:sol", 120)
    assert b.check("jupiter", "sol:sol")["state"] == "closed"


def test_kill_switch_blocks_everything(monkeypatch):
    monkeypatch.setenv("VILMEI_SWAP_KILL", "1")
    b, _ = make_breaker()
    d = b.check("jupiter", "sol:sol")
    assert d["allowed"] is False and d["state"] == "killed"


def test_latency_spike_counts_as_failure():
    b, _ = make_breaker(failure_threshold=1)
    assert b.check("lifi", "bnb:bnb")["allowed"] is True
    b.record_success("lifi", "bnb:bnb", 20_000)
    assert b.check("lifi", "bnb:bnb")["state"] == "open"


def test_snapshot_shape_and_bounded_error_text():
    b, _ = make_breaker()
    b.record_failure("x", "y", "e" * 500)
    snap = b.snapshot()
    assert snap[0]["provider"] == "x" and snap[0]["route"] == "y"
    assert len(snap[0]["last_error"]) <= 200
    assert snap[0]["total_failures"] == 1


# ── T2-E spec parameters ──────────────────────────────────────────────────

def test_defaults_match_spec():
    c = BreakerConfig()
    assert c.failure_threshold == 3
    assert c.open_seconds == 120.0
    assert c.error_rate_threshold == 0.40
    assert c.error_rate_window_s == 60.0
    assert c.half_open_successes == 1


def test_spec_flow_three_failures_open_hold_half_open_then_closed():
    b, now = make_breaker()  # defaults: threshold 3, hold 120s
    route = "same_chain:sol"
    for i in range(3):
        assert b.check("jupiter", route)["allowed"] is True
        b.record_failure("jupiter", route, f"err {i}")
    assert b.check("jupiter", route)["state"] == "open"
    now["t"] += 119
    assert b.check("jupiter", route)["allowed"] is False
    now["t"] += 2
    assert b.check("jupiter", route)["state"] == "half_open"
    b.record_success("jupiter", route, 100)
    assert b.check("jupiter", route)["state"] == "closed"


def test_error_rate_over_40pct_trips_open_without_consecutive_failures():
    b, _ = make_breaker()  # window 60s, threshold 40%, min sample 5
    route = "cross_chain:sol->bnb"
    for outcome in ("fail", "ok", "fail", "fail", "ok"):
        b.check("lifi", route)
        if outcome == "fail":
            b.record_failure("lifi", route, "HTTP 500")
        else:
            b.record_success("lifi", route, 50)
    d = b.check("lifi", route)
    assert d["allowed"] is False and d["state"] == "open"
    assert "error rate 60%" in d["reason"]


def test_error_rate_below_minimum_sample_never_trips():
    b, _ = make_breaker()  # 2 fails / 4 calls = 50% > 40% but sample < 5
    route = "cross_chain:sol->bnb"
    for outcome in ("fail", "ok", "fail", "ok"):
        b.check("lifi", route)
        if outcome == "fail":
            b.record_failure("lifi", route, "HTTP 500")
        else:
            b.record_success("lifi", route, 50)
    assert b.check("lifi", route)["allowed"] is True


def test_error_rate_window_slides_back_closed():
    b, now = make_breaker(error_rate_min_sample=3, error_rate_threshold=0.4)
    route = "same_chain:bnb"
    for _ in range(3):
        b.record_failure("lifi", route, "boom")
    assert b.check("lifi", route)["state"] == "open"
    now["t"] += 121  # hold expires → half_open probe allowed
    assert b.check("lifi", route)["state"] == "half_open"
    b.record_success("lifi", route, 40)
    assert b.check("lifi", route)["state"] == "closed"
    now["t"] += 70  # window (60s) fully slides past the old failures
    b.record_success("lifi", route, 40)
    assert b.check("lifi", route)["allowed"] is True


def test_granularity_is_per_provider_chain_and_route_type():
    b, _ = make_breaker()
    sol_same = "same_chain:sol"
    bnb_cross = "cross_chain:sol->bnb"
    for i in range(3):
        b.record_failure("jupiter", sol_same, f"err {i}")
    assert b.check("jupiter", sol_same)["state"] == "open"
    # same provider, different chain/route-type → still allowed
    assert b.check("jupiter", bnb_cross)["allowed"] is True
    # same route, different provider → still allowed
    assert b.check("lifi", sol_same)["allowed"] is True


def test_best_quote_feeds_route_typed_keys_to_breaker(monkeypatch):
    from providers import swap_quotes as sq
    seen: list[str] = []

    class SpyBreaker(SwapCircuitBreaker):
        def check(self, provider, route):
            seen.append(route)
            return super().check(provider, route)

    monkeypatch.setattr(sq, "ADAPTERS", {"jupiter": lambda **kw: (_ for _ in ()).throw(
        sq.SwapQuoteError("HTTP 500"))})
    spy = SpyBreaker(config=BreakerConfig())
    for _ in range(4):
        quote, _attempts = sq.best_quote(
            source_chain="sol", destination_chain="sol", token_in="native",
            token_out="DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
            amount_in="1", slippage_bps=50, candidates=["jupiter"], breaker=spy)
        assert quote is None
    assert seen == ["same_chain:sol->sol"] * 4, \
        "breaker key must encode chain(s) + route type, not bare provider"
