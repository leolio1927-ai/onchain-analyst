"""PROMPT-V — VILMEI Token Ledger laws (transports mocked, no network).

1. invariant: top-20 sum ≤ current supply, always; the chip flips red on a
   breach instead of hiding it.
2. absent stays absent: unreachable RPCs → holders=null + a GAPS row, never
   a guessed number; unwired chains say so.
3. label engine: labels file wins (with evidence), default = UNKNOWN — an
   unevidenced label is a law violation.
"""
import json
import time

import pytest
from fastapi.testclient import TestClient

from providers import ledger_solana as L
from webapp import server

MINT = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R"  # $RAY preview


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


def _wire(monkeypatch, *, supply=6862431145.753392, authority=None, freeze=None,
          accounts=20, fail_holders=False, labels=None, holder_frac=0.01):
    raw = str(int(round(supply * 1e6)))
    exact = L.scale_raw_amount(raw, 6)
    hraw = str(int(round(supply * holder_frac * 1e6)))
    hexact = L.scale_raw_amount(hraw, 6)

    def fake_call(calls):
        for endpoint, method, params in calls:
            if method == "getTokenSupply":
                return {"value": {"uiAmount": supply, "decimals": 6, "amount": raw,
                                  "uiAmountString": exact}}, "jsonrpc:getTokenSupply@rpc"
            if method == "getAccountInfo":
                return {"value": {"data": {"parsed": {"info": {"mintAuthority": authority,
                        "freezeAuthority": freeze,
                        "decimals": 6, "supply": raw}}}}}, "prov"
            if method == "getTokenLargestAccounts":
                if fail_holders:
                    continue
                return {"value": [{"address": f"TA{i}", "uiAmount": supply * holder_frac,
                                   "amount": hraw, "decimals": 6,
                                   "uiAmountString": hexact} for i in range(accounts)]}, "prov"
            if method == "getMultipleAccounts":
                return {"value": [{"data": {"parsed": {"info": {"owner": f"W{i}"}}}} for i in range(accounts)]}, "prov"
        return None, ""
    monkeypatch.setattr(L, "_call_first_ok", fake_call)
    monkeypatch.setattr(L, "_known_pools_from_env", lambda: {"POOLVAULT1": "deepest pool raydium $RAY"})
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


# ── v1.1 data-integrity hotfix (PROMPT-B PART A) ──────────────────────────

def test_claim_correction_is_published_not_deleted(client, monkeypatch):
    """A2: the docs claim (1B) the chain broke must APPEAR as a GAPS
    correction row — never vanish, never render as a metric."""
    _wire(monkeypatch)  # on-chain ≈ 6.86B vs claim 1,000,000,000
    j = client.get("/api/ledger", params={"chain": "sol", "mint": MINT}).json()
    cc = j["claim_correction"]
    assert cc["claim"] == 1_000_000_000
    assert cc["on_chain"] == pytest.approx(6862431145.753392)
    assert "superseded by chain" in cc["status"]
    assert any("superseded by chain" in g for g in j["gaps"])
    assert j["supply"]["total_supply_onchain"] == pytest.approx(cc["on_chain"])


def test_burned_pct_null_when_baseline_unproven(client, monkeypatch):
    """A1: derived metrics go null without proven inputs. The broken 1B
    baseline would print -586% — the UI must never see that number."""
    _wire(monkeypatch)
    j = client.get("/api/ledger", params={"chain": "sol", "mint": MINT}).json()
    assert j["bars"]["burned_upper_bound_pct"] is None
    assert j["schema_version"] == "1.2"


def test_concentration_top2_reported_with_labels(client, monkeypatch):
    """A3: top-2 ≈ 49.3% both unlabelled → the concentration data ships so
    the rail card can say it out loud instead of hiding it."""
    _wire(monkeypatch, holder_frac=0.2465)
    j = client.get("/api/ledger", params={"chain": "sol", "mint": MINT}).json()
    c = j["concentration"]
    assert c["top2_pct"] == pytest.approx(49.3, abs=0.1)
    assert c["top2_labels"] == ["UNKNOWN", "UNKNOWN"]


def test_cache_age_is_real_not_zero(client, monkeypatch):
    """A4: the provenance line must carry the real cache age."""
    _wire(monkeypatch)
    client.get("/api/ledger", params={"chain": "sol", "mint": MINT})
    time.sleep(0.05)
    j2 = client.get("/api/ledger", params={"chain": "sol", "mint": MINT}).json()
    assert j2["cached"] is True
    assert j2["cache_age_s"] >= 0.04


# ── PROMPT-W PART C — formatter law + cap-consistency + freeze chip ───────

def test_formatter_is_integer_exact_not_float():
    """C1: raw base units scale by integer math only — the exact strings the
    UI renders. The float uiAmount (double) was the 10× bug's escape hatch."""
    assert L.scale_raw_amount("123456789", 6) == "123.456789"
    assert L.scale_raw_amount("554997570390840", 6) == "554997570.39084"
    assert L.scale_raw_amount("1000000", 6) == "1"
    assert L.scale_raw_amount("123456789012345", 6) == "123456789.012345"
    assert L.scale_raw_amount("5", 6) == "0.000005"


def test_supply_renders_exact_uiamountstring(client, monkeypatch):
    _wire(monkeypatch)
    j = client.get("/api/ledger", params={"chain": "sol", "mint": MINT}).json()
    assert j["supply"]["total_supply_exact"] == "6862431145.753392"
    assert j["supply"]["supply_amount_raw"] == "6862431145753392"
    assert j["supply"]["decimals"] == 6
    assert j["holders"][0]["amount_exact"] == "68624311.457534"  # scaled from the mocked raw, integer-exact


def test_cap_under_cap_is_consistent_not_superseded(client, monkeypatch):
    """C3: current ≤ docs cap is NOT a contradiction — status says so and the
    'superseded' gap row must NOT exist."""
    _wire(monkeypatch, supply=554997570.39084)
    j = client.get("/api/ledger", params={"chain": "sol", "mint": MINT}).json()
    assert j["claim_correction"]["status"] == "consistent (current < cap)"
    assert not any("superseded" in g for g in j["gaps"])
    assert j["claim_correction"]["claim_kind"] == "docs cap"


def test_freeze_authority_chip_data(client, monkeypatch):
    """C0/C6: freeze authority rides the same self-verifiable probe."""
    _wire(monkeypatch, authority=None, freeze=None)
    j = client.get("/api/ledger", params={"chain": "sol", "mint": MINT}).json()
    assert j["supply"]["mint_absent"] is True and j["supply"]["freeze_absent"] is True
    _wire(monkeypatch, authority="Auth1", freeze="Frz1")
    j2 = client.get("/api/ledger", params={"chain": "sol", "mint": MINT}).json()
    assert j2["supply"]["mint_absent"] is False and j2["supply"]["freeze_absent"] is False
    assert j2["supply"]["freeze_authority"] == "Frz1"


def test_invariant_reason_present_when_holders_missing(client, monkeypatch):
    """C2 backend half: no top-20 → Σ carries an honest reason, never a guess."""
    _wire(monkeypatch, fail_holders=True)
    j = client.get("/api/ledger", params={"chain": "sol", "mint": MINT}).json()
    assert j["invariant"]["holds"] is None
    assert j["invariant"]["reason"] and "unproven" in j["invariant"]["reason"]


def test_gaps_carries_ray_chronology_without_dates(client, monkeypatch):
    """C5: the preview-token swap is published as one GAPS chronology line."""
    _wire(monkeypatch)
    j = client.get("/api/ledger", params={"chain": "sol", "mint": MINT}).json()
    assert any("$RAY" in g and "decimal off-by-one" in g for g in j["gaps"])
    import re
    assert not re.search(r"\b20\d{2}-\d{2}-\d{2}\b", " ".join(j["gaps"]))
