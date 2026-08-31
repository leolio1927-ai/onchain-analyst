"""PROMPT-V4 M3 — vault destination gates (offline).

The vault map is claim-based policy data: PUBLIC addresses only, supplied by
the founder in .env; the repo never generates a key. Laws under test:
unclaimed = declared-null (never fabricated), a claimed slice surfaces the
verbatim address, the 5×3 structure mirrors fee_models, the route validates
against the response schema, the MCP tool answers the same payload, and the
tolerant .env parser survives the founder's real broken line 2 (a bare '=').
"""
import json

import pytest
from fastapi.testclient import TestClient

from providers import fee_models, vaults
from webapp import envfile, schemas, server

SLICES = ("ops", "buyback", "rewards")


@pytest.fixture
def client():
    return TestClient(server.app)


# ── the vault map (module-level contract) ────────────────────────────────

def test_unclaimed_map_is_declared_null_never_fabricated(monkeypatch):
    for chain in fee_models.CHAINS:
        for s in SLICES:
            monkeypatch.delenv(vaults.env_key(chain, s), raising=False)
    out = vaults.destinations()
    assert set(out["chains"]) == set(fee_models.CHAINS)
    assert out["claimed"] == 0 and out["total"] == 15
    assert out["slices_bps"] == fee_models.SPLIT_BPS
    for chain, row in out["chains"].items():
        assert set(row["vaults"]) == set(SLICES)
        assert row["fee_path_verdict"] == fee_models.CHAIN_FEE_PATHS[chain]["verdict"]
        for s, v in row["vaults"].items():
            assert v["address"] is None
            assert v["status"] == vaults.AWAITING
            assert vaults.env_key(chain, s) in v["note"]     # tells the founder what to set
    assert out["data_mode"] == "static"


def test_a_claimed_slice_surfaces_the_verbatim_public_address(monkeypatch):
    monkeypatch.setenv("VAULT_SOL_OPS_ADDRESS", "VaultOps11111111111111111111111111111111111")
    out = vaults.destinations()
    sol = out["chains"]["sol"]["vaults"]
    assert sol["ops"] == {"address": "VaultOps11111111111111111111111111111111111",
                          "status": vaults.CLAIMED,
                          "note": "ops vault claimed by the founder (public address only)"}
    assert sol["buyback"]["status"] == vaults.AWAITING      # neighbours untouched
    assert out["claimed"] == 1 and out["total"] == 15


def test_blank_or_whitespace_address_stays_unclaimed(monkeypatch):
    monkeypatch.setenv("VAULT_BNB_REWARDS_ADDRESS", "   ")
    assert vaults.destinations()["chains"]["bnb"]["vaults"]["rewards"]["status"] == vaults.AWAITING


# ── the route + schema ───────────────────────────────────────────────────

def test_route_validates_against_the_response_schema(client):
    body = client.get("/api/v1/fees/destinations").json()
    schemas.FeeDestinationsResponse.model_validate(body)
    assert body["data_mode"] == "static"
    assert body["honest_note"].startswith("vault map = policy data")


# ── the MCP door answers the same payload ────────────────────────────────

def test_mcp_fee_destinations_one_truth_two_doors(client):
    rest = client.get("/api/v1/fees/destinations").json()
    rpc = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                                    "params": {"name": "fee_destinations", "arguments": {}}})
    assert rpc.status_code == 200
    mcp_payload = json.loads(rpc.json()["result"]["content"][0]["text"])
    # ts is stamped per response — everything else must be byte-identical
    for d in (rest, mcp_payload):
        d.pop("ts")
    assert mcp_payload == rest


# ── the tolerant .env parser (the founder's real broken line 2) ─────────

REAL_BROKEN_ENV = """HELIUS_API_KEY=310159dd-ed26-451e-b3f1-b16fb70c122d
=
ALCHEMY_API_KEY=x81MHgtv7PTAyhh_uHnG7
"""


def test_parser_tolerates_the_broken_bare_equals_line():
    env, skipped = envfile.parse(REAL_BROKEN_ENV)
    assert env == {"HELIUS_API_KEY": "310159dd-ed26-451e-b3f1-b16fb70c122d",
                   "ALCHEMY_API_KEY": "x81MHgtv7PTAyhh_uHnG7"}
    assert skipped == [2]


def test_parser_handles_quotes_export_prefix_and_comments():
    env, skipped = envfile.parse(
        "# comment\n\nexport FOO=\"bar baz\"\nQUOTED='single'\nNO_VALUE\nBAD KEY=x\n")
    assert env == {"FOO": "bar baz", "QUOTED": "single"}
    assert skipped == [5, 6]


def test_parse_file_on_a_missing_path_is_an_empty_env(tmp_path):
    assert envfile.parse_file(tmp_path / "nope.env") == ({}, [])
