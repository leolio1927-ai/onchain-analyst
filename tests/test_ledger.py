"""PROMPT-V — VILMEI Token Ledger laws (transports mocked, no network).

1. invariant: top-20 sum ≤ current supply, always; the chip flips red on a
   breach instead of hiding it.
2. absent stays absent: unreachable RPCs → holders=null + a GAPS row, never
   a guessed number; unwired chains say so.
3. label engine: labels file wins (with evidence), default = UNKNOWN — an
   unevidenced label is a law violation.
"""
import json

import pytest
from fastapi.testclient import TestClient

from providers import ledger_solana as L
from webapp import server

MINT = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"


def _reset():
    L._cache.update(payload=None, ts=0, key=None)
    L._backoff_until = 0.0


@pytest.fixture
def client(monkeypatch, tmp_path):
    _reset()
    monkeypatch.setattr(L, "SNAP_DIR", tmp_path / "ledger")
    monkeypatch.setattr(L, "LABELS_PATH", tmp_path / "labels.json")
    monkeypatch.delenv("HELIUS_API_KEY", raising=False)
    return TestClient(server.app)


def _wire(monkeypatch, *, supply=6862431145.753392, authority=None,
          accounts=20, fail_holders=False, labels=None, holder_frac=0.01):
    def fake_call(calls):
        for endpoint, method, params in calls:
            if method == "getTokenSupply":
                return {"value": {"uiAmount": supply, "decimals": 6}}, "jsonrpc:getTokenSupply@rpc"
            if method == "getAccountInfo":
                return {"value": {"data": {"parsed": {"info": {"mintAuthority": authority,
                        "decimals": 6, "supply": str(int(supply * 1e6))}}}}}, "prov"
            if method == "getTokenLargestAccounts":
                if fail_holders:
                    continue
                return {"value": [{"address": f"TA{i}", "uiAmount": supply * holder_frac,
                                   "uiAmountString": str(supply * holder_frac)} for i in range(accounts)]}, "prov"
            if method == "getMultipleAccounts":
                return {"value": [{"data": {"parsed": {"info": {"owner": f"W{i}"}}}} for i in range(accounts)]}, "prov"
        return None, ""
    monkeypatch.setattr(L, "_call_first_ok", fake_call)
    monkeypatch.setattr(L, "_known_pools_from_env", lambda: {"POOLVAULT1": "deepest pool raydium $JUP"})
    monkeypatch.setattr(L, "_snapshot_delta", lambda mint, holders: ([], "mocked"))
    if labels is not None:
        monkeypatch.setattr(L, "_load_labels", lambda: labels)
    _reset()


def test_invariant_holds_and_chip_green(client, monkeypatch):
    _wire(monkeypatch)
    r = client.get("/api/ledger", params={"chain": "sol", "mint": MINT})
    j = r.json()
    assert r.status_code == 200 and j["data_mode"] == "live"
    assert j["invariant"]["holds"] is True
    assert j["supply"]["mint_absent"] is True          # self-verifiable chip
    assert j["holders"][0]["pct_supply"] == 1.0
    assert j["holders"][0]["amount"] <= j["supply"]["current_supply"]


def test_invariant_breach_flips_red_not_hidden(client, monkeypatch):
    _wire(monkeypatch, supply=5.0, holder_frac=0.2)    # top20 sum = 20 > supply 5 → red on purpose
    r = client.get("/api/ledger", params={"chain": "sol", "mint": MINT})
    j = r.json()
    assert j["invariant"]["holds"] is False            # red chip with the delta, on purpose
    assert j["invariant"]["top20_sum"] > j["invariant"]["current_supply"]


def test_unreachable_holders_is_gaps_not_guess(client, monkeypatch):
    _wire(monkeypatch, fail_holders=True)
    r = client.get("/api/ledger", params={"chain": "sol", "mint": MINT})
    j = r.json()
    assert j["data_mode"] == "partial" and j["holders"] == []
    assert any("top-20" in g for g in j["gaps"])
    assert j["burn"]["rows"] == [] and "gap" in j["burn"]   # empty by law, with the reason
    assert j["vesting"]["gap"] and j["buyback"]["gap"]


def test_label_engine_unknown_default_and_evidence_file(client, monkeypatch):
    _wire(monkeypatch, labels={"labels": {"W0": {"label": "LP",
          "evidence": "raydium vault — pair 3Uwf…, verified getAccountInfo"}}})
    r = client.get("/api/ledger", params={"chain": "sol", "mint": MINT})
    j = r.json()
    assert j["holders"][0]["label"] == "LP" and "raydium vault" in j["holders"][0]["evidence"]
    assert j["holders"][1]["label"] == "UNKNOWN"        # default, never invented


def test_unwired_chain_is_honest(client):
    r = client.get("/api/ledger", params={"chain": "bnb", "mint": MINT})
    j = r.json()
    assert j["data_mode"] == "unwired" and any("not wired" in g for g in j["gaps"])


def test_jsonl_dump_is_machine_readable(client, monkeypatch):
    _wire(monkeypatch)
    r = client.get("/ledger.jsonl", params={"chain": "sol", "mint": MINT})
    assert r.status_code == 200
    lines = [json.loads(l) for l in r.text.strip().splitlines()]
    assert lines[0]["type"] == "envelope" and "gaps" in lines[0]
    assert sum(1 for l in lines if l["type"] == "holder") == 20
    assert lines[-1]["type"] == "eof"
    for l in lines:
        assert json.dumps(l)                            # every line parses = machine-readable
