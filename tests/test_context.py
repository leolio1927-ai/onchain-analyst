"""BE-F5a-R trader-loop enrichment tests — offline, all six chains.

Laws under test:
- the verdict is untouchable: score/assessment bitwise EQUAL pre/post
  enrichment on every chain;
- tri-state sell test: timeout is NEVER False (None + honest note);
- no key is not an error: not_configured notes, fields stay None;
- a catalog null is a sentence: hood/hype carry the reason for every block;
- lineage is DB-local: launches=0 is data, None deployer is None, labels
  are display-only and never claim a provider said them.
"""
from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from providers import chains_map
from tests.stubs import provider_stub as stubs
from webapp import db, lineage, schemas, server

_SOL_ADDR = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
_EVM_ADDR = "0x" + "a" * 40
_ADDRS = {"sol": _SOL_ADDR, "bnb": _EVM_ADDR, "base": _EVM_ADDR,
          "avax": _EVM_ADDR, "hood": _EVM_ADDR, "hype": _EVM_ADDR}
_SCANNABLE = ("sol", "bnb", "base", "hood")  # hype: scan=False; avax: disabled 2026-08-30
_DEPLOYERS = {"sol": "DEP1", "bnb": "DEPEVM", "base": "DEPEVM", "avax": "DEPEVM"}
_T0 = "2026-08-29T12:00:00+00:00"


@pytest.fixture()
def db_path(tmp_path):
    return tmp_path / "context.db"


@pytest.fixture()
def client(db_path, monkeypatch):
    monkeypatch.setenv("ALPHA_DB_PATH", str(db_path))
    return TestClient(server.app)


def _scan(client, monkeypatch, chain):
    server._scan_cache.clear()
    stubs.install_scan(monkeypatch)
    return client.post("/api/scan", json={"chain": chain, "address": _ADDRS[chain]})


# ── per-chain, per-mode enrichment matrix ────────────────────────────────

def test_live_enrichment_per_chain(client, db_path, monkeypatch):
    stubs.install_enrichment(monkeypatch, mode="live")
    rows = {c: _scan(client, monkeypatch, c).json() for c in _SCANNABLE}
    sol = rows["sol"]["context"]
    assert sol["deployer"] == "DEP1" and sol["deployer_source"] == "helius"
    assert sol["top10_share"] == 0.95            # (900+50)/1000, live supply
    assert sol["sell_test"]["routable"] is True
    assert sol["data_mode"] == "live"            # all three wired blocks live
    assert rows["sol"]["data_mode"] == "partial"  # envelope: enriched-but-partial
    assert sol["lineage"]["launches"] == 0       # watched, launched nothing YET
    # FASE 2: EVM deployer is wired (blockscout base / goplus bnb, canned) —
    # holders + sell_test remain catalog-null with their reason sentences
    assert rows["base"]["context"]["deployer"] == "0xcanned0000000000000000000000000000000001"
    assert rows["base"]["context"]["deployer_source"] == "blockscout"
    assert any("verified on-chain" in s for s in rows["base"]["context"]["data_sources"])
    assert rows["bnb"]["context"]["deployer_source"] == "goplus"
    assert any("NOT on-chain-verifiable" in s for s in rows["bnb"]["context"]["data_sources"])
    for c in ("bnb", "base"):
        ctx = rows[c]["context"]
        assert ctx["top10_share"] is None        # catalog null → stays None
        assert ctx["sell_test"] is None
        assert len(ctx["notes"]) == 3            # holders + sell_test + whales sentences
        assert ctx["data_mode"] == "partial"     # one of three capabilities live
        assert rows[c]["data_mode"] == "partial"
    for c in ("hood",):            # hype is unscannable (catalog scan=False)
        ctx = rows[c]["context"]
        assert ctx["deployer"] is None and ctx["top10_share"] is None
        assert ctx["sell_test"] is None and ctx["lineage"] is None
        assert len(ctx["notes"]) == 5            # a sentence per capability
        assert ctx["data_mode"] == "unwired"
        assert rows[c]["data_mode"] == "live"    # verdict half fully live


def test_not_configured_is_honest_not_zero(client, monkeypatch):
    stubs.install_scan(monkeypatch)
    stubs.install_enrichment(monkeypatch, mode="nokey")
    rows = {c: _scan(client, monkeypatch, c).json() for c in _SCANNABLE}
    sol = rows["sol"]["context"]
    assert sol["deployer"] is None and sol["top10_share"] is None
    assert any("helius:not_configured" in n for n in sol["notes"])
    assert sol["sell_test"]["routable"] is True  # keyless path unaffected
    assert sol["data_mode"] == "partial"
    # keyless providers (blockscout/goplus) keep serving without keys —
    # only the KEYED provider (helius) honors absence on sol
    for c in ("bnb", "base"):
        assert rows[c]["context"]["deployer"] == "0xcanned0000000000000000000000000000000001"
    hood_ctx = rows["hood"]["context"]
    assert hood_ctx["deployer"] is None and hood_ctx["data_mode"] == "unwired"
    for c in ("hood",):            # hype is unscannable (catalog scan=False)
        assert rows[c]["context"]["data_mode"] == "unwired"


def test_timeout_never_false_on_any_path(client, monkeypatch):
    stubs.install_scan(monkeypatch)
    stubs.install_enrichment(monkeypatch, mode="timeout")
    rows = {c: _scan(client, monkeypatch, c).json() for c in _SCANNABLE}
    for c in _SCANNABLE:
        ctx = rows[c]["context"]
        st = ctx["sell_test"]
        if st is not None:
            assert st["routable"] is not False   # timeout ≠ unroutable
            assert st["routable"] is None or st["routable"] is True
        assert all("timeout" in n or "unroutable" not in n for n in ctx["notes"])
    sol = rows["sol"]["context"]
    assert sol["sell_test"] is None              # timeout → absent, not False
    assert any("jupiter:timeout" in n for n in sol["notes"])
    assert sol["deployer"] is None and any("helius:timeout" in n for n in sol["notes"])


def test_score_bitwise_equal_pre_post_enrichment(client, db_path, monkeypatch):
    stubs.install_scan(monkeypatch)
    stubs.install_enrichment(monkeypatch, mode="nokey")
    unenriched = {c: _scan(client, monkeypatch, c).json()["assessment"] for c in _SCANNABLE}
    stubs.install_enrichment(monkeypatch, mode="live")
    enriched = {c: _scan(client, monkeypatch, c).json()["assessment"] for c in _SCANNABLE}
    for c in _SCANNABLE:
        assert enriched[c] == unenriched[c]      # the verdict is untouched


def test_one_provider_failure_never_degrades_the_verdict(client, monkeypatch):
    stubs.install_scan(monkeypatch)
    stubs.install_enrichment(monkeypatch, mode="live")
    ok = _scan(client, monkeypatch, "sol").json()
    # now the helius transport explodes mid-request
    def boom(url, body=None):
        raise RuntimeError("socket exploded")
    from providers import helius
    monkeypatch.setattr(helius, "_call", boom)
    helius._cache.clear()           # a cached live answer would mask the failure
    r = _scan(client, monkeypatch, "sol")
    assert r.status_code == 200                   # the scan itself must survive
    degraded = r.json()
    assert degraded["assessment"] == ok["assessment"]         # verdict identical
    ctx = degraded["context"]
    assert ctx["deployer"] is None and ctx["top10_share"] is None
    assert any("helius:failed" in n for n in ctx["notes"])
    assert ctx["sell_test"]["routable"] is True   # the other provider still ran


# ── lineage (DB-local) ───────────────────────────────────────────────────

def _seed_serial_deployer(db_path: Path) -> None:
    for chain, ident, score, level, ts in (
            ("sol", "tok1", 11.0, "low", "2026-08-20T00:00:00+00:00"),
            ("base", "tok2", 44.0, "medium", "2026-08-21T00:00:00+00:00")):
        db.write_scan_snapshot(db_path, chain, ident,
                               {"ts": ts, "assessment": {"score": score,
                                                         "level": level,
                                                         "signals": []},
                                "sources": ["dexscreener"]},
                               deployer="DEP1", deployer_kind="eoa",
                               deployer_source="helius" if chain == "sol" else "alchemy")
    conn = db.connect(db_path)
    db.upsert_label(conn, "sol", "DEP1", label="serial deployer",
                    kind="deployer", evidence=None, verified=False,
                    data_mode="fixture", source="wallets.json",
                    now_iso=_T0)
    conn.commit()
    conn.close()


def test_lineage_serial_deployer_exact(db_path):
    _seed_serial_deployer(db_path)
    lin = lineage.resolve(db_path, "DEP1")
    assert lin["launches"] == 2
    assert [(t["chain"], t["mint"], t["score"], t["rug"]) for t in lin["tokens"]] == [
        ("sol", "tok1", 11.0, "low"), ("base", "tok2", 44.0, "medium")]
    assert lin["labels"] == [{"label": "serial deployer", "kind": "deployer",
                              "verified": False}]   # display-only: no source claim
    assert lineage.resolve(db_path, "DEP1", chain="sol")["launches"] == 1


def test_launches_zero_is_data_and_none_deployer_is_none(db_path):
    conn = db.connect(db_path)
    db.init_schema(conn)
    conn.close()
    unknown = lineage.resolve(db_path, "UNSEEN")
    assert unknown == {"launches": 0, "tokens": [], "labels": []}   # data
    assert lineage.resolve(db_path, None) is None                   # absence
    assert lineage.resolve(db_path, "   ") is None


def test_deployer_columns_round_trip_v3_on_v2_db(db_path, monkeypatch):
    # build a v2-era database with a row, then let v3 migrate it in place
    full = db._MIGRATIONS
    legacy = ((1, db._DDL), (2, db._DDL_V2))
    monkeypatch.setattr(db, "_MIGRATIONS", legacy)
    conn = db.connect(db_path)
    db.init_schema(conn)
    conn.execute(
        "INSERT INTO scan_snapshots (chain, ident, ts, score, denominator,"
        " payload_json, data_mode, source, ingested_at)"
        " VALUES ('sol', 'old', '2026-08-01T00:00:00+00:00', 9.0, 5, '{}',"
        " 'live', 'x', '2026-08-01T00:00:00+00:00')")
    conn.commit()
    conn.close()
    monkeypatch.setattr(db, "_MIGRATIONS", full)   # full v1..v3
    conn = db.connect(db_path)
    db.init_schema(conn)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(scan_snapshots)")}
    assert {"deployer", "deployer_kind", "deployer_source"} <= cols
    old = conn.execute("SELECT deployer FROM scan_snapshots").fetchone()
    assert old["deployer"] is None                # legacy row honestly null
    conn.close()
    db.write_scan_snapshot(db_path, "sol", "new",
                           {"ts": _T0, "assessment": {"score": 1.0, "signals": []},
                            "sources": ["dexscreener"]},
                           deployer="DEP1", deployer_kind="eoa",
                           deployer_source="helius")
    conn = db.connect(db_path)
    fresh = conn.execute("SELECT deployer, deployer_kind, deployer_source"
                         " FROM scan_snapshots WHERE ident='new'").fetchone()
    assert tuple(fresh) == ("DEP1", "eoa", "helius")   # provider-sourced row
    conn.close()
    lin = lineage.resolve(db_path, "DEP1")
    assert lin["launches"] == 1 and lin["tokens"][0]["mint"] == "new"


def test_db_sourced_join_never_claims_a_provider(db_path):
    _seed_serial_deployer(db_path)
    lin = lineage.resolve(db_path, "DEP1")
    assert all(set(l) == {"label", "kind", "verified"} for l in lin["labels"])


# ── golden wire per chain + catalog guard growth ─────────────────────────

def test_golden_wire_all_chains(client, monkeypatch):
    stubs.install_enrichment(monkeypatch, mode="nokey")
    for chain in _SCANNABLE:
        j = _scan(client, monkeypatch, chain).json()
        assert {"pair", "assessment", "clustering", "sources", "launch_venue",
                "ts"} <= set(j)                       # legacy keys ⊆ new
        assert set(j["context"]) == set(schemas.TokenContext.model_fields)
        assert j["context"]["schema_version"] == "1.0"
        assert datetime.fromisoformat(j["ts"]).utcoffset() is not None
    # hype is honestly unscannable — the route refuses what the catalog denies
    r = client.post("/api/scan", json={"chain": "hype", "address": _ADDRS["hype"]})
    assert r.status_code == 400 and "unknown chain 'hype'" in r.json()["detail"]


def test_catalog_guard_grows_to_wiring(monkeypatch):
    chains_map.validate()                          # consistent today
    monkeypatch.setattr(chains_map, "_CAPABILITIES", {
        **chains_map._CAPABILITIES,
        "hood": {**chains_map._CAPABILITIES["hood"],
                 "deployer": {"source": "helius",
                              "fn": lambda c, m: (None, None)}}})
    with pytest.raises(AssertionError, match="cannot serve"):
        chains_map.validate()                      # null→wired flip goes red


def test_capabilities_render_in_chains_route(client):
    j = client.get("/api/v1/chains").json()
    caps = j["capabilities"]
    assert caps["sol"]["deployer"] == {"source": "helius", "reason": None}
    assert caps["hood"]["deployer"]["source"] is None
    assert "no $0 deployment source" in caps["hood"]["deployer"]["reason"]
    assert caps["hype"]["sell_test"]["reason"].startswith("DEX-less")
