"""PROMPT-V3 R4 — fee frontier gates (offline).

The planned VILMEI fee (0.50% = ops 0.30 + buyback 0.10 + rewards 0.10) is a
POLICY CONSTANT, shipped as inspectable data: matrix verdicts restricted to the
founder vocabulary, exact-cent arithmetic, zero-is-a-fact, honest 404/400
sentences, data_mode='static', and the grep gate — zero execution wiring in
the fee surface (nothing here trades, custodies, or signs).
"""
import json
import math
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from providers import fee_models
from webapp import schemas, server

VERDICTS = {"SIAP-$0", "PERLU-AGREEMENT-BISNIS", "TIDAK-ADA"}


@pytest.fixture
def client():
    return TestClient(server.app)


# ── the matrix (module-level contract) ───────────────────────────────────

def test_matrix_covers_exactly_the_five_founder_chains():
    assert set(fee_models.CHAIN_FEE_PATHS) == set(fee_models.CHAINS) == {
        "sol", "bnb", "base", "hype", "hood"}


def test_matrix_verdicts_use_only_the_founder_vocabulary():
    for chain, row in fee_models.CHAIN_FEE_PATHS.items():
        assert row["verdict"] in VERDICTS, chain
        assert row["provider"] and row["mechanism"] and row["note"], chain


def test_only_sol_is_siap_0_today():
    """The mandate-0-V3 probe conclusion, pinned: Jupiter platformFeeBps is
    the one verified $0 keyless path; nothing else may claim it silently."""
    siap = {c for c, r in fee_models.CHAIN_FEE_PATHS.items()
            if r["verdict"] == "SIAP-$0"}
    assert siap == {"sol"}


def test_split_sums_to_the_planned_total():
    assert sum(fee_models.SPLIT_BPS.values()) == fee_models.PLANNED_TOTAL_BPS == 50
    assert fee_models.SPLIT_BPS == {"ops": 30, "buyback": 10, "rewards": 10}


# ── the estimator (pure function) ────────────────────────────────────────

def test_estimate_exact_cents_on_one_thousand():
    out = fee_models.estimate("sol", 1000)
    assert out["estimate_usd"] == 5.0
    assert out["split_usd"] == {"ops": 3.0, "buyback": 1.0, "rewards": 1.0}
    assert out["planned_rate_bps"] == 50
    assert out["data_mode"] == "static"
    assert out["honest_note"] == "planned — nothing is charged; VILMEI is read-only"
    assert out["provenance"]["doc"] == "docs/FEE-MODELS-2026.md"
    assert out["buyback_blocker"].startswith("VM-fee-01")


def test_estimate_zero_is_a_fact():
    out = fee_models.estimate("bnb", 0)
    assert out["estimate_usd"] == 0.0          # $0 notional → $0 fee, verbatim
    assert all(v == 0.0 for v in out["split_usd"].values())
    assert out["provider"]["verdict"] == "TIDAK-ADA"


def test_estimate_rejects_unknown_chain_and_bad_amounts():
    with pytest.raises(ValueError, match="unknown chain"):
        fee_models.estimate("avax", 100)
    with pytest.raises(ValueError, match="finite"):
        fee_models.estimate("sol", -1)
    with pytest.raises(ValueError, match="finite"):
        fee_models.estimate("sol", math.nan)


# ── the route (envelope + honest errors) ─────────────────────────────────

def test_route_envelope_matches_schema_fields(client):
    r = client.get("/api/v1/fees/estimate",
                   params={"chain": "sol", "amountUsd": 1000})
    assert r.status_code == 200
    j = r.json()
    assert set(j) == set(schemas.FeeEstimateResponse.model_fields)
    assert j["chain"] == "sol" and j["amount_usd"] == 1000.0
    assert j["provider"]["verdict"] == "SIAP-$0"
    assert j["sources"] == ["policy:docs/FEE-MODELS-2026.md"]


def test_route_unknown_chain_is_a_404_with_the_allowed_list(client):
    r = client.get("/api/v1/fees/estimate",
                   params={"chain": "avax", "amountUsd": 10})
    assert r.status_code == 404
    assert "sol|bnb|base|hype|hood" in r.json()["detail"]


def test_route_bad_amount_is_a_400_sentence(client):
    r = client.get("/api/v1/fees/estimate",
                   params={"chain": "sol", "amountUsd": -5})
    assert r.status_code == 400
    assert "finite" in r.json()["detail"]


def test_every_chain_answers_with_its_matrix_row(client):
    for chain, row in fee_models.CHAIN_FEE_PATHS.items():
        j = client.get("/api/v1/fees/estimate",
                       params={"chain": chain, "amountUsd": 250}).json()
        assert j["provider"]["verdict"] == row["verdict"]
        assert j["provider"]["provider"] == row["provider"]
        assert j["estimate_usd"] == 1.25        # 250 × 50 bps
        # one call carries ALL five rows — the FE chip strip reads this map
        assert set(j["matrix"]) == set(fee_models.CHAINS)
        assert j["matrix"][chain]["verdict"] == row["verdict"]


# ── grep gate: the fee surface never wires execution ─────────────────────

_EXECUTION_REGISTER = (
    "send_transaction", "sign_transaction", "broadcast", "execute_swap",
    "private_key", "seed_phrase", "create_transfer", "wallet_drain",
)


def test_fee_module_has_zero_execution_register():
    src = Path(fee_models.__file__).read_text(encoding="utf-8")
    hits = [w for w in _EXECUTION_REGISTER if w in src.lower()]
    assert hits == [], f"execution wiring leaked into the fee surface: {hits}"


# ── MCP fee_view (one truth, two doors) ──────────────────────────────────

def rpc(client, method, params=None):
    return client.post("/mcp", json={"jsonrpc": "2.0", "id": 1,
                                     "method": method, "params": params or {}})


def test_mcp_fee_view_returns_the_same_payload(client):
    b = rpc(client, "tools/call",
            {"name": "fee_view", "arguments": {"chain": "sol",
                                                "amountUsd": 1000}}).json()
    assert b["result"]["isError"] is False
    payload = json.loads(b["result"]["content"][0]["text"])
    assert payload["estimate_usd"] == 5.0
    assert payload["provider"]["verdict"] == "SIAP-$0"
    assert payload["honest_note"].startswith("planned")


def test_mcp_fee_view_bad_chain_is_content_not_500(client):
    b = rpc(client, "tools/call",
            {"name": "fee_view", "arguments": {"chain": "avax"}}).json()
    assert b["result"]["isError"] is True
    assert "unknown chain" in b["result"]["content"][0]["text"]
