"""BE-F2 history/persistence tests — all offline, fixtures only.

Covers: idempotent double ingest, provenance stamping (a fixture row can
never read as live), schema_migrations bookkeeping, cursor-walk termination
(None exactly once, ts ascending, no dupes/gaps), window filters, the scan
write-through, the purge boundary on a fixed clock (no time mocking), and
the /api/version db block contract.
"""
import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.stubs import provider_stub as stubs
from webapp import db, ingest, server

_SOL_PAIR = "fixturepair1111111111111111111111111111111"
_BASE_PAIR = "0xfixturebasepair000000000000000000000000dead"
_T0 = "2026-08-29T12:00:00+00:00"


@pytest.fixture()
def db_path(tmp_path):
    return tmp_path / "history.db"


@pytest.fixture()
def client(db_path, monkeypatch):
    monkeypatch.setenv("ALPHA_DB_PATH", str(db_path))
    return TestClient(server.app)


def _counts(db_path: Path) -> dict[str, int]:
    conn = db.connect(db_path)
    try:
        return {t: conn.execute(f"SELECT COUNT(*) AS c FROM {t}").fetchone()["c"]
                for t in ("price_points", "trades", "scan_snapshots", "ingest_run")}
    finally:
        conn.close()


def _ingest_all(db_path: Path, now: str = _T0) -> dict:
    return ingest.run_once(sorted((Path("tests/fixtures") / "ingest").glob("*.json")),
                           datetime.fromisoformat(now), db_path)


def _walk(client, url: str, limit: int = 2) -> list[dict]:
    """Follow next_cursor to exhaustion; assert it is None exactly once."""
    items, pages, seen_cursors = [], 0, set()
    params = {"limit": limit}
    while True:
        r = client.get(url, params=params)
        assert r.status_code == 200
        j = r.json()
        items += j["items"]
        pages += 1
        cur = j["next_cursor"]
        if cur is None:
            break
        assert cur not in seen_cursors          # a cursor never repeats
        seen_cursors.add(cur)
        params = {"limit": limit, "cursor": cur}
        assert pages < 100                      # walk must terminate
    assert pages >= 2                           # pagination actually paginated
    return items


# ── ingest ───────────────────────────────────────────────────────────────

def test_ingest_twice_is_idempotent(db_path):
    first = _ingest_all(db_path)
    assert first["sol_fixture.json"] == 15 and first["base_fixture.json"] == 7
    counts = _counts(db_path)
    assert counts["price_points"] == 11 and counts["trades"] == 9
    assert counts["scan_snapshots"] == 2 and counts["ingest_run"] == 2

    second = _ingest_all(db_path)
    assert second == {"sol_fixture.json": 0, "base_fixture.json": 0}  # nothing re-written
    assert _counts(db_path) == counts                # row counts stable


def test_ingest_refuses_non_fixture_sources(db_path, tmp_path):
    evil = tmp_path / "not_a_fixture.json"
    evil.write_text('{"chain": "sol", "ident": "x", "price_points": [], "trades": []}')
    with pytest.raises(SystemExit, match="refusing"):
        ingest.run_once([evil], datetime.fromisoformat(_T0), db_path)
    assert not db_path.exists()                      # refused before any write


def test_fixture_rows_are_never_live(db_path):
    _ingest_all(db_path)
    conn = db.connect(db_path)
    try:
        for table in ("price_points", "trades", "scan_snapshots"):
            live = conn.execute(
                f"SELECT COUNT(*) AS c FROM {table} WHERE data_mode = 'live'"
            ).fetchone()["c"]
            assert live == 0, f"{table} leaked a live row"
            stamped = conn.execute(
                f"SELECT COUNT(*) AS c FROM {table} WHERE data_mode = 'fixture'"
                " AND source LIKE '%fixture%.json' AND ingested_at = ?",
                (_T0,)).fetchone()["c"]
            assert stamped > 0
    finally:
        conn.close()


def test_schema_migrations_recorded(db_path):
    _ingest_all(db_path)
    conn = db.connect(db_path)
    try:
        row = conn.execute(
            "SELECT version, applied_at FROM schema_migrations").fetchone()
        assert row["version"] == db.SCHEMA_VERSION and row["applied_at"]
    finally:
        conn.close()


# ── history routes: cursor walk ──────────────────────────────────────────

def test_price_history_cursor_walk_terminates_cleanly(client, db_path):
    _ingest_all(db_path)
    url = f"/api/v1/history/prices/sol/{_SOL_PAIR}"
    items = _walk(client, url, limit=2)
    assert len(items) == 7                                    # every row, no dupes/gaps
    ts_list = [i["ts"] for i in items]
    assert ts_list == sorted(ts_list) and len(set(ts_list)) == len(ts_list)
    assert all(i["close"] is not None for i in items)
    assert all(i["open"] is None and i["high"] is None and i["low"] is None
               for i in items)                                # no synthesized candles
    j = client.get(url).json()
    assert j["data_mode"] == "fixture" and j["schema_version"] == "1.0"
    assert j["sources"] == ["sol_fixture.json"]


def test_trade_history_shape_and_chain_isolation(client, db_path):
    _ingest_all(db_path)
    sol = client.get(f"/api/v1/history/trades/sol/{_SOL_PAIR}").json()
    base = client.get(f"/api/v1/history/trades/base/{_BASE_PAIR}").json()
    assert len(sol["items"]) == 7 and len(base["items"]) == 2
    assert sol["sources"] == ["sol_fixture.json"] and base["sources"] == ["base_fixture.json"]
    for t in sol["items"] + base["items"]:
        assert set(t) == {"wallet", "kind", "ts", "usd", "base_token", "tx_hash"}
        assert t["kind"] in ("buy", "sell")


def test_history_window_filters(client, db_path):
    _ingest_all(db_path)
    r = client.get(f"/api/v1/history/prices/sol/{_SOL_PAIR}", params={
        "since": "2026-08-22T00:00:00+00:00", "until": "2026-08-24T00:00:00+00:00"})
    j = r.json()
    # window bounds are inclusive on both ends
    assert [i["ts"] for i in j["items"]] == ["2026-08-22T00:00:00+00:00",
                                             "2026-08-23T00:00:00+00:00",
                                             "2026-08-24T00:00:00+00:00"]
    assert j["next_cursor"] is None                  # page ends inside the window


def test_history_rejects_bad_window_and_cursor(client, db_path):
    _ingest_all(db_path)
    url = f"/api/v1/history/prices/sol/{_SOL_PAIR}"
    assert client.get(url, params={"since": "not-a-date"}).status_code == 400
    assert client.get(url, params={"since": "2026-08-22T00:00:00"}).status_code == 400  # naive
    assert client.get(url, params={"cursor": "garbage!!"}).status_code == 400
    assert client.get(url, params={"limit": 0}).status_code == 400   # explicit, like /api/v1/live
    assert client.get(url, params={"limit": 501}).status_code == 400


def test_history_503_when_persistence_off(monkeypatch):
    monkeypatch.delenv("ALPHA_DB_PATH", raising=False)
    r = TestClient(server.app).get(f"/api/v1/history/prices/sol/{_SOL_PAIR}")
    assert r.status_code == 503 and "ALPHA_DB_PATH" in r.json()["detail"]


def test_history_full_page_at_limit(client, db_path):
    _ingest_all(db_path)
    j = client.get(f"/api/v1/history/prices/sol/{_SOL_PAIR}", params={"limit": 500}).json()
    assert len(j["items"]) == 7 and j["next_cursor"] is None  # all rows fit one page


# ── write-through ────────────────────────────────────────────────────────

def test_scan_write_through_records_live_observation(client, db_path, monkeypatch):
    stubs.install_scan(monkeypatch)
    server._scan_cache.clear()
    r = client.post("/api/scan", json={"chain": "sol", "address": stubs.address()})
    assert r.status_code == 200
    j = r.json()
    conn = db.connect(db_path)
    try:
        row = conn.execute(
            "SELECT * FROM scan_snapshots WHERE chain='sol'").fetchone()
        assert row is not None
        assert row["data_mode"] == "live"            # the only live-stamping writer
        assert row["score"] == j["assessment"]["score"]
        computed = sum(1 for s in j["assessment"]["signals"] if s["severity"] is not None)
        assert row["denominator"] == computed        # the auditable denominator
        assert set(json.loads(row["payload_json"])) == {"pair", "assessment", "clustering"}
    finally:
        conn.close()
        server._scan_cache.clear()


# ── purge (fixed clock — no time mocking) ────────────────────────────────

def test_purge_boundary_402d_gone_398d_survives(db_path):
    _ingest_all(db_path, now=_T0)
    base_counts = _counts(db_path)
    assert base_counts["price_points"] == 11

    # 402 days later: everything ingested at _T0 is older than the 400d cutoff
    ingest.purge(400, datetime.fromisoformat(_T0) + timedelta(days=402), db_path)
    gone = _counts(db_path)
    assert gone["price_points"] == 0 and gone["trades"] == 0 and gone["scan_snapshots"] == 0
    purge_run = db.connect(db_path)  # the purge recorded its own ingest_run
    try:
        row = purge_run.execute(
            "SELECT source, params_json, rows_written FROM ingest_run"
            " WHERE source = 'purge'").fetchone()
        assert row is not None
        assert json.loads(row["params_json"])["keep_days"] == 400
        assert row["rows_written"] == 22             # 11 + 9 + 2 data rows
    finally:
        purge_run.close()

    # 398 days later: the same rows are still inside the window
    db_path2 = db_path.with_name("keep.db")
    _ingest_all(db_path2, now=_T0)
    ingest.purge(400, datetime.fromisoformat(_T0) + timedelta(days=398), db_path2)
    kept = _counts(db_path2)
    assert kept["price_points"] == base_counts["price_points"]   # untouched
    assert kept["trades"] == base_counts["trades"]


# ── /api/version db block ────────────────────────────────────────────────

def test_version_db_block_contract(client, db_path):
    j = client.get("/api/version").json()
    block = j["db"]
    assert set(block) == {"path_kind", "schema_version", "rows_by_table",
                          "last_run_at", "oldest_row_ts"}
    assert block["path_kind"] == "env"               # configured, path itself never leaked
    assert "ALPHA_DB_PATH" not in json.dumps(j) and str(db_path) not in json.dumps(j)

    _ingest_all(db_path)
    j2 = client.get("/api/version").json()["db"]
    assert j2["schema_version"] == db.SCHEMA_VERSION
    assert j2["rows_by_table"]["price_points"] == 11
    assert j2["last_run_at"] == _T0
    assert j2["oldest_row_ts"] == "2026-08-20T00:00:00+00:00"


def test_version_db_block_off_when_unconfigured(monkeypatch):
    monkeypatch.delenv("ALPHA_DB_PATH", raising=False)
    j = TestClient(server.app).get("/api/version").json()["db"]
    assert j["path_kind"] == "off" and j["schema_version"] is None
    assert j["rows_by_table"] == {} and j["last_run_at"] is None
