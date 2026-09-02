"""T2 swap foundation tests: chain-aware identity and fail-closed policy.

These tests deliberately do not call a bridge/DEX or wallet. The foundation
must validate requests and expose honest quote-only/unwired state before any
provider adapter is allowed to produce executable calldata.
"""
from fastapi.testclient import TestClient

from providers import swap_policy
from webapp import server

SOL = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
EVM = "0x1111111111111111111111111111111111111111"


def test_chain_registry_uses_canonical_solana_caip2_and_holds_unverified_hood():
    sol = swap_policy.chain_identity("sol")
    assert sol["caip2"] == "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
    hood = swap_policy.chain_identity("hood")
    assert hood["caip2"] is None
    assert hood["execution_status"] == "unwired"


def test_policy_accepts_valid_assets_but_is_fail_closed_for_execution():
    out = swap_policy.evaluate_quote(
        source_chain="sol", destination_chain="base", token_in=SOL,
        token_out=EVM, amount_in="1.25", slippage_bps=50)
    assert out["source_chain_caip2"].startswith("solana:")
    assert out["destination_chain_caip2"] == "eip155:8453"
    assert out["amount_out"] is None
    assert out["policy"]["quote_allowed"] is True
    assert out["policy"]["execution_allowed"] is False
    assert out["simulation"]["state"] == "not_run"
    assert out["simulation"]["allowed"] is False


def test_policy_rejects_bad_chain_asset_provider_and_slippage():
    cases = [
        ("unknown_chain", lambda: swap_policy.chain_identity("eth")),
        ("invalid_asset", lambda: swap_policy.validate_asset("base", "not-address")),
        ("provider_not_allowed", lambda: swap_policy.evaluate_quote(
            source_chain="sol", destination_chain="base", token_in=SOL,
            token_out=EVM, amount_in="1", provider="unknown")),
        ("slippage_cap", lambda: swap_policy.validate_slippage(501)),
    ]
    for code, fn in cases:
        try:
            fn()
        except swap_policy.SwapPolicyError as exc:
            assert exc.code == code
        else:
            raise AssertionError(f"expected {code}")


def test_simulation_gate_is_fail_closed():
    assert swap_policy.simulation_gate({"state": "passed"})["allowed"] is True
    for state in (None, {"state": "not_run"}, {"state": "unavailable"}, {"state": "reverted"}):
        assert swap_policy.simulation_gate(state)["allowed"] is False


def test_quote_id_is_deterministic_and_discriminates():
    kw = {"source_chain": "sol", "destination_chain": "base", "token_in": SOL,
          "token_out": EVM, "amount_in": "1.25", "slippage_bps": 50}
    assert swap_policy.quote_id_for(**kw) == swap_policy.quote_id_for(**kw)
    assert swap_policy.quote_id_for(**kw) != swap_policy.quote_id_for(**{**kw, "amount_in": "1.26"})
    assert swap_policy.quote_id_for(**kw) != swap_policy.quote_id_for(**{**kw, "provider": "lifi"})
    # verbatim amounts: "1.5" and "1.50" are different requests, different ids
    assert swap_policy.quote_id_for(**kw) != swap_policy.quote_id_for(**{**kw, "amount_in": "1.50"})
    assert len(swap_policy.quote_id_for(**kw)) == 32


def test_capability_endpoint_never_claims_five_chain_execution():
    client = TestClient(server.app)
    response = client.get("/api/v1/swap/capabilities")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["chains"]) == 5
    assert payload["execution_enabled"] is False
    assert all(row["execution_status"] in {"quote_only", "unwired"} for row in payload["chains"])


def test_quote_endpoint_returns_honest_unwired_contract():
    client = TestClient(server.app)
    response = client.get("/api/v1/swap/quote", params={
        "source_chain": "sol", "destination_chain": "base",
        "token_in": SOL, "token_out": EVM, "amount_in": "1",
    })
    assert response.status_code == 200
    payload = response.json()
    assert payload["data_mode"] == "unwired"
    assert payload["amount_out"] is None
    assert payload["transaction_request"] is None
    assert payload["policy"]["execution_allowed"] is False
    assert payload["simulation"]["allowed"] is False
