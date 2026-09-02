"""Endpoint-level swap tests: execute door always refuses (idempotent);
quote flows provider numbers when live is stubbed, degrades honestly when
no provider answers. Network is never touched (conftest pins live=0)."""
from fastapi.testclient import TestClient

from providers import swap_quotes as sq
from webapp import server

SOL_TOKEN = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"


def _quote_params(**over):
    params = {"source_chain": "sol", "destination_chain": "sol", "token_in": "native",
              "token_out": SOL_TOKEN, "amount_in": "1", "slippage_bps": 50}
    params.update(over)
    return params


def test_execute_door_always_refuses_and_is_idempotent():
    client = TestClient(server.app)
    r1 = client.post("/api/v1/swap/execute", json={"quote_id": "endpoint-q1"})
    r2 = client.post("/api/v1/swap/execute", json={"quote_id": "endpoint-q1"})
    assert r1.status_code == 200 and r2.status_code == 200
    j1, j2 = r1.json(), r2.json()
    assert j1["decision"] == "refused" and j2 == j1
    assert "quote_only" in j1["reason"]


def test_execute_door_refuses_blank_quote_id():
    client = TestClient(server.app)
    r = client.post("/api/v1/swap/execute", json={"quote_id": "   "})
    assert r.status_code == 200
    assert r.json()["decision"] == "refused"


def test_quote_flows_stubbed_provider_numbers_and_still_refuses_execution(monkeypatch):
    def fake_best_quote(**kw):
        return {"provider": "jupiter", "amount_out": "3357646.43049",
                "minimum_received": "3340858.41733", "raw_amount_out": "335764643049",
                "raw_amount_in": "100000000", "decimals_in": 9, "decimals_out": 5,
                "route": ["Raydium CLMM"], "latency_ms": 120,
                "source_chain": "sol", "destination_chain": "sol"}, [
            {"provider": "jupiter", "outcome": "quoted", "detail": "ok"}]
    monkeypatch.setattr(sq, "best_quote", fake_best_quote)
    monkeypatch.setenv("VILMEI_SWAP_LIVE", "1")
    client = TestClient(server.app)
    r = client.get("/api/v1/swap/quote", params=_quote_params())
    assert r.status_code == 200
    j = r.json()
    assert j["data_mode"] == "live"
    assert j["amount_out"] == "3357646.43049"
    assert j["minimum_received"] == "3340858.41733"
    assert j["provider_quoted"] == "jupiter"
    assert j["quote_id"]
    assert j["policy"]["execution_allowed"] is False
    assert j["simulation"]["allowed"] is False
    assert j["transaction_request"] is None
    assert j["provenance"]["kind"] == "keyless"


def test_quote_degrades_honestly_when_no_provider_answers(monkeypatch):
    monkeypatch.setattr(sq, "best_quote", lambda **kw: (
        None, [{"provider": "jupiter", "outcome": "failed", "detail": "TimeoutError: t"}]))
    monkeypatch.setenv("VILMEI_SWAP_LIVE", "1")
    client = TestClient(server.app)
    r = client.get("/api/v1/swap/quote", params=_quote_params())
    assert r.status_code == 200
    j = r.json()
    assert j["data_mode"] == "unwired"
    assert j["amount_out"] is None
    assert "jupiter: failed" in j["degraded"]
    assert j["policy"]["execution_allowed"] is False


def test_quote_rejects_policy_violations_with_400():
    client = TestClient(server.app)
    r = client.get("/api/v1/swap/quote", params=_quote_params(slippage_bps=5001))
    assert r.status_code == 400
    assert "slippage_cap" in r.json()["detail"]
