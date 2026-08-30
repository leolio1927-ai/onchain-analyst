"""BE-F3 entity layer tests — token registry + wallet labels, all offline.

Discipline under test: labeled = claim with provenance (verified stays false
until an operator path exists — it does not), unlabeled = silence (200 + []
or 404-unknown, never a guess), and the upsert conflict rules keep a reload
from erasing richer rows (last-non-null-wins, first_seen MIN).
"""
import inspect
import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from webapp import db, ingest, schemas, server

_SOL_IDENT = "fixturepair1111111111111111111111111111111"
_BASE_IDENT = "0xfixturebasepair000000000000000000000000dead"
_NULL_DEC_IDENT = "fixturetokendecnull111111111111111111111"
_KNOWN_WALLET = "F1xTUREWa11etoooooooooooooooooooooooooo1"
_UNLABELED_WALLET = "F1xTUREWa11etzzzzzzzzzzzzzzzzzzzzzzzzzz1"
_T0 = datetime.fromisoformat("2026-08-29T12:00:00+00:00")

_TOKEN_SOURCES = sorted(Path("tests/fixtures/tokens").glob("*.json"))
_LABEL_SOURCES = [Path("tests/fixtures/labels/wallets.json")]


@pytest.fixture()
def db_path(tmp_path):
    return tmp_path / "entities.db"


@pytest.fixture()
def client(db_path, monkeypatch):
    monkeypatch.setenv("ALPHA_DB_PATH", str(db_path))
    return TestClient(server.app)


def _seed(db_path: Path) -> None:
    ingest.load_tokens(_TOKEN_SOURCES, _T0, db_path)
    ingest.load_labels(_LABEL_SOURCES, _T0, db_path)


def _counts(db_path: Path) -> dict[str, int]:
    conn = db.connect(db_path)
    try:
        return {t: conn.execute(f"SELECT COUNT(*) AS c FROM {t}").fetchone()["c"]
                for t in ("tokens", "wallet_labels", "ingest_run")}
    finally:
        conn.close()


# ── idempotency + conflict rules ─────────────────────────────────────────

def test_entity_ingest_twice_is_idempotent(db_path):
    _seed(db_path)
    counts = _counts(db_path)
    assert counts["tokens"] == 3 and counts["wallet_labels"] == 5
    first = {k: v for k, v in db.get_token(db_path, "sol", _SOL_IDENT).items()
             if k != "ts"}                    # envelope ts is per-call

    again_t = ingest.load_tokens(_TOKEN_SOURCES, _T0, db_path)
    again_l = ingest.load_labels(_LABEL_SOURCES, _T0, db_path)
    assert again_t == {"sol_tokens.json": 0, "sol_tokens_reload.json": 0}
    assert again_l == {"wallets.json": 0}
    assert _counts(db_path) == counts                    # no dup rows
    second = {k: v for k, v in db.get_token(db_path, "sol", _SOL_IDENT).items()
              if k != "ts"}
    assert second == first                               # no richer-row regression


def test_last_non_null_wins_and_first_seen_min(db_path):
    _seed(db_path)
    t = db.get_token(db_path, "sol", _SOL_IDENT)
    assert t["decimals"] == 6                 # the reload's null did NOT erase
    assert t["logo_ref"] == "assets/fixture/fxt.png"   # the reload's value landed
    assert t["tags"] == ["fixture", "reloaded"]        # non-empty tags replace
    assert t["first_seen"] == "2026-07-15T00:00:00+00:00"   # MIN, not re-stamped
    assert t["last_seen"] == "2026-08-25T00:00:00+00:00"    # MAX moved forward
    b = db.get_token(db_path, "base", _BASE_IDENT)
    assert b["decimals"] == 18 and b["tags"] == ["fixture"]  # empty tags keep old


def test_null_decimals_row_stays_null(db_path):
    _seed(db_path)
    t = db.get_token(db_path, "sol", _NULL_DEC_IDENT)
    assert t["decimals"] is None              # absent stays absent, never 0


# ── provenance beats payload ─────────────────────────────────────────────

def test_claimed_verified_is_overridden_to_false(db_path):
    _seed(db_path)
    w = db.get_wallet_labels(db_path, _KNOWN_WALLET)
    assert w["labels"][0]["verified"] is False   # the fixture claimed verified:1
    assert w["data_mode"] == "fixture" and w["sources"] == ["wallets.json"]


def test_loaders_refuse_the_operator_path():
    """verified = operator-checked. The operator writer does not exist yet,
    so no loader may accept or set it — provenance beats payload, in code."""
    for fn in (ingest.load_tokens, ingest.load_labels):
        assert "verified" not in inspect.signature(fn).parameters
    src = Path("webapp/ingest.py").read_text(encoding="utf-8")
    assert "verified=False" in src               # the only value loaders write
    assert "verified=r.get" not in src and "verified=payload" not in src


def test_bad_kind_refused_not_coerced(db_path, tmp_path, monkeypatch):
    monkeypatch.setattr(ingest, "_FIXTURE_ROOT", tmp_path)
    d = tmp_path / "labels"
    d.mkdir()
    f = d / "bad.json"
    f.write_text(json.dumps({"labels": [
        {"chain": "sol", "address": _KNOWN_WALLET, "label": "x",
         "kind": "whale", "evidence": None}]}))
    with pytest.raises(SystemExit, match="unknown label kind"):
        ingest.load_labels([f], _T0, db_path)
    assert _counts(db_path)["wallet_labels"] == 0     # refused before any write
    with pytest.raises(ValueError, match="unlabeled"):
        db.assert_label_kind("unlabeled")   # unlabeled = no row, never a kind


def test_entity_loaders_refuse_non_fixture_sources(db_path, tmp_path):
    evil = tmp_path / "tokens_dump.json"
    evil.write_text('{"tokens": [{"chain": "sol", "ident": "x"}]}')
    with pytest.raises(SystemExit, match="refusing"):
        ingest.load_tokens([evil], _T0, db_path)
    with pytest.raises(SystemExit, match="refusing"):
        ingest.load_labels([evil], _T0, db_path)
    assert not db_path.exists()


# ── routes: golden wire + honest emptiness ───────────────────────────────

def test_known_token_golden_wire(client, db_path):
    _seed(db_path)
    r = client.get(f"/api/v1/tokens/sol/{_SOL_IDENT}")
    assert r.status_code == 200
    j = r.json()
    assert set(schemas.TokenMeta.model_fields) <= set(j)   # ⊇ TokenMeta fields
    assert {"data_mode", "schema_version", "sources", "ts"} <= set(j)
    assert j["data_mode"] == "fixture" and j["schema_version"] == "1.0"
    assert datetime.fromisoformat(j["ts"]).utcoffset() == timedelta(0)
    assert j["symbol"] == "FXT" and j["decimals"] == 6
    assert j["logo"] is None and j["socials"] is None      # unplumbed stays None


def test_unknown_token_404_honest(client, db_path):
    _seed(db_path)
    r = client.get("/api/v1/tokens/sol/nope0000000000000000000000000000000")
    assert r.status_code == 404 and "no row" in r.json()["detail"]


def test_unknown_wallet_200_empty_list(client, db_path):
    _seed(db_path)
    r = client.get(f"/api/v1/wallets/{_UNLABELED_WALLET}")
    assert r.status_code == 200                            # never 404 on valid shape
    j = r.json()
    assert j["labels"] == [] and j["address"] == _UNLABELED_WALLET
    assert j["data_mode"] == "unwired" and j["sources"] == []  # silence, honestly


def test_malformed_wallet_404_on_shape_only(client, db_path):
    _seed(db_path)
    assert client.get("/api/v1/wallets/short").status_code == 404


def test_wallet_labels_row_shape_and_kinds(client, db_path):
    _seed(db_path)
    j = client.get(f"/api/v1/wallets/{_KNOWN_WALLET}").json()
    assert len(j["labels"]) == 1
    for lbl in j["labels"]:
        assert set(lbl) == set(schemas.WalletLabel.model_fields)
        assert lbl["kind"] in db.LABEL_KINDS
        assert lbl["verified"] is False


# ── metrics / version db block grow additively ─────────────────────────

def test_metrics_grows_additively(client, db_path):
    m0 = client.get("/api/metrics").json()
    assert {"scans", "uptime_s", "ws_clients", "scan_cache_entries",
            "gt_trade_cache_entries", "throttled_ips"} <= set(m0)  # F2 keys intact
    assert m0["tokens"] == 0 and m0["labels"] == 0          # off/empty = measured 0
    _seed(db_path)
    m1 = client.get("/api/metrics").json()
    assert m1["tokens"] == 3 and m1["labels"] == 5


def test_version_db_block_counts_entities(client, db_path):
    _seed(db_path)
    block = client.get("/api/version").json()["db"]
    assert block["rows_by_table"]["tokens"] == 3
    assert block["rows_by_table"]["wallet_labels"] == 5
    assert block["schema_version"] == db.SCHEMA_VERSION
