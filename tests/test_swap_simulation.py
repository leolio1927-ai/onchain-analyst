"""T2-E simulation gate tests: fail-closed everywhere, deterministic
payloads — NO network in any test here."""
import pytest
from fastapi.testclient import TestClient

from providers import simulation, swap_policy
from webapp import server

SOL_TOKEN = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
TX = {"from": "0x" + "11" * 20, "to": "0x" + "22" * 20,
      "data": "0xdeadbeef", "value": "0x1"}


@pytest.fixture(autouse=True)
def _no_sim_rpc(monkeypatch):
    for name in simulation.RPC_ENV_VARS.values():
        monkeypatch.delenv(name, raising=False)


# ── RPC config is env-only, never a default URL ──────────────────────────

def test_rpc_unconfigured_chain_reports_unavailable():
    assert simulation.rpc_configured("sol") is False
    out = simulation.simulate("sol", {"transaction_base64": "QUJD"})
    assert out["state"] == "unavailable" and out["allowed"] is False
    assert "VILMEI_SIM_RPC_SOL" in out["reason"]


def test_rpc_url_is_never_hardcoded(monkeypatch):
    monkeypatch.setenv("VILMEI_SIM_RPC_BASE", "https://operator-owned.example")
    assert simulation.rpc_url("base") == "https://operator-owned.example"
    assert simulation.rpc_configured("bnb") is False


# ── execution_decision branches, verbatim per spec ────────────────────────

def test_no_route_means_quote_only_with_explicit_reason():
    out = swap_policy.evaluate_quote(
        source_chain="sol", destination_chain="sol", token_in="native",
        token_out=SOL_TOKEN, amount_in="1")
    assert out["execution_status"] == "quote_only"
    assert out["policy"]["execution_allowed"] is False
    assert out["simulation"]["state"] == "not_run"
    assert out["simulation"]["reason"] == "no route provider wired — quote policy only"
    assert "no route provider wired — quote policy only" in out["policy"]["reasons"]
    assert out["transaction_request"] is None


def test_route_without_simulation_is_fail_closed():
    out = swap_policy.evaluate_quote(
        source_chain="sol", destination_chain="sol", token_in="native",
        token_out=SOL_TOKEN, amount_in="1",
        transaction_request={"transaction_base64": "QUJD"})
    assert out["policy"]["execution_allowed"] is False
    assert out["simulation"]["state"] == "unavailable"
    assert out["simulation"]["reason"] == "simulation unavailable"
    assert "simulation unavailable" in out["policy"]["reasons"]


def test_reverted_simulation_refuses_execution():
    out = swap_policy.evaluate_quote(
        source_chain="sol", destination_chain="sol", token_in="native",
        token_out=SOL_TOKEN, amount_in="1",
        transaction_request={"transaction_base64": "QUJD"},
        simulation_result={"state": "reverted"})
    assert out["policy"]["execution_allowed"] is False
    assert out["simulation"]["allowed"] is False


def test_passed_simulation_is_the_only_state_that_allows():
    tx = {"from": TX["from"], "to": TX["to"], "data": TX["data"]}
    out = swap_policy.evaluate_quote(
        source_chain="bnb", destination_chain="bnb", token_in="native",
        token_out="0x" + "33" * 20, amount_in="1",
        transaction_request=tx,
        simulation_result={"state": "passed"})
    assert out["policy"]["execution_allowed"] is True
    assert out["simulation"]["state"] == "passed"
    assert out["transaction_request"] == tx


def test_unwired_chain_never_allows_even_with_passed_simulation():
    out = swap_policy.evaluate_quote(
        source_chain="hood", destination_chain="base", token_in="native",
        token_out="0x" + "33" * 20, amount_in="1",
        transaction_request=dict(TX),
        simulation_result={"state": "passed"})
    assert out["execution_status"] == "unwired"
    assert out["policy"]["execution_allowed"] is False


# ── EVM eth_simulateV1 (stubbed RPC) ──────────────────────────────────────

def _stub_rpc(monkeypatch, result):
    monkeypatch.setenv("VILMEI_SIM_RPC_BNB", "https://operator-owned.example")
    monkeypatch.setattr(simulation, "_post_rpc", lambda url, method, params: result)


def test_evm_passed_with_transfers_summary(monkeypatch):
    _stub_rpc(monkeypatch, [{
        "calls": [{"status": "0x1", "returnData": "0x",
                   "transfers": [{"from": TX["from"], "to": TX["to"],
                                  "value": "0xde0b6b3a7640000"},
                                 {"from": TX["to"], "to": TX["from"],
                                  "token": "0x" + "33" * 20, "value": "0x1e"}]}]}])
    out = simulation.simulate("bnb", TX)
    assert out["state"] == "passed"
    assert out["asset_changes"] == [
        {"from": TX["from"], "to": TX["to"], "asset": "native",
         "raw_value": "1000000000000000000"},
        {"from": TX["to"], "to": TX["from"], "asset": "0x" + "33" * 20,
         "raw_value": "30"}]


def test_evm_reverted_reason_is_decoded(monkeypatch):
    reason = "slippage limit exceeded"
    data = ("0x08c379a0"
            + (32).to_bytes(32, "big").hex()          # offset of the string
            + len(reason).to_bytes(32, "big").hex()   # string length
            + reason.encode().hex().ljust(64, "0"))
    _stub_rpc(monkeypatch, [{"calls": [{"status": "0x0", "returnData": data}]}])
    out = simulation.simulate("bnb", TX)
    assert out["state"] == "reverted"
    assert reason in out["reason"]
    assert out["allowed"] is False


def test_evm_unknown_response_shape_never_counts_as_pass(monkeypatch):
    _stub_rpc(monkeypatch, {"weird": "shape"})
    out = simulation.simulate("bnb", TX)
    assert out["state"] == "unavailable"


def test_evm_incomplete_request_is_refused(monkeypatch):
    monkeypatch.setenv("VILMEI_SIM_RPC_BNB", "https://operator-owned.example")
    out = simulation.simulate("bnb", {"from": TX["from"]})
    assert out["state"] == "unavailable" and "incomplete" in out["reason"]


# ── Solana simulateTransaction (stubbed RPC) ──────────────────────────────

def test_solana_err_means_reverted(monkeypatch):
    monkeypatch.setenv("VILMEI_SIM_RPC_SOL", "https://operator-owned.example")
    monkeypatch.setattr(simulation, "_post_rpc", lambda url, method, params: {
        "err": {"InstructionError": [1, "SlippageToleranceExceeded"]},
        "logs": ["Program log: a", "Program log: failed"]})
    out = simulation.simulate("sol", {"transaction_base64": "QUJD"})
    assert out["state"] == "reverted" and "SlippageToleranceExceeded" in out["reason"]


def test_solana_pass_states_the_no_deltas_limitation(monkeypatch):
    monkeypatch.setenv("VILMEI_SIM_RPC_SOL", "https://operator-owned.example")
    monkeypatch.setattr(simulation, "_post_rpc", lambda url, method, params: {
        "err": None, "logs": ["Program log: success"], "unitsConsumed": 42})
    out = simulation.simulate("sol", {"transaction_base64": "QUJD"})
    assert out["state"] == "passed"
    assert out["asset_changes"] == []
    assert "does not report balance deltas" in (out["asset_summary_note"] or "")


def test_simulate_never_raises_even_when_the_world_breaks(monkeypatch):
    monkeypatch.setenv("VILMEI_SIM_RPC_SOL", "https://operator-owned.example")
    def boom(*a, **kw):
        raise RuntimeError("socket exploded")
    monkeypatch.setattr(simulation, "_post_rpc", boom)
    out = simulation.simulate("sol", {"transaction_base64": "QUJD"})
    assert out["state"] == "unavailable" and out["allowed"] is False


# ── capabilities surface the honest per-chain RPC state ──────────────────

def test_capabilities_report_simulation_rpc_configured(monkeypatch):
    monkeypatch.delenv("VILMEI_SIM_RPC_SOL", raising=False)
    monkeypatch.setenv("VILMEI_SIM_RPC_BNB", "https://operator-owned.example")
    client = TestClient(server.app)
    rows = {r["chain"]: r for r in client.get("/api/v1/swap/capabilities").json()["chains"]}
    assert rows["sol"]["simulation_rpc_configured"] is False
    assert rows["bnb"]["simulation_rpc_configured"] is True
    assert all(r["execution_status"] in ("quote_only", "unwired") for r in rows.values())
