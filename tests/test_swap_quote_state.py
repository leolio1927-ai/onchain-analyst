"""T2-E quote_id idempotency tests: QUOTED/CONSUMED/EXPIRED lifecycle,
atomic check-consume, 409 replay, 410 expiry — plus the endpoint contract."""
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from webapp import db, server, swap_quote_state


@pytest.fixture()
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "state.sqlite"
    monkeypatch.setenv("ALPHA_DB_PATH", str(path))
    return path


def _record(path, qid="q1", **kw):
    return swap_quote_state.record_quote(
        path, quote_id=qid, request={"amount_in": "1"}, **kw)


# ── lifecycle ─────────────────────────────────────────────────────────────

def test_unknown_quote_id_is_unknown(db_path):
    outcome, info = swap_quote_state.begin_consume(db_path, quote_id="nope")
    assert outcome == "unknown" and info is None


def test_record_then_consume_then_replay(db_path):
    _record(db_path)
    first = swap_quote_state.begin_consume(db_path, quote_id="q1")
    assert first[0] == "consumed_now"
    second = swap_quote_state.begin_consume(db_path, quote_id="q1")
    assert second[0] == "consumed" and second[1]["previous_decision"] is None
    swap_quote_state.attach_decision(db_path, quote_id="q1",
                                     decision={"decision": "refused"})
    third = swap_quote_state.begin_consume(db_path, quote_id="q1")
    assert third[0] == "consumed"
    assert third[1]["previous_decision"] == {"decision": "refused"}, \
        "a retry replays the PREVIOUS transaction result, never a new one"


def test_expired_quote_is_410_not_consumable(db_path):
    _record(db_path)
    past = datetime.now(UTC) - timedelta(seconds=3600)
    conn = db.connect(db_path)
    conn.execute("UPDATE swap_quotes SET expires_at = ? WHERE quote_id = 'q1'",
                 (past.isoformat(timespec="microseconds"),))
    conn.commit()
    conn.close()
    outcome, info = swap_quote_state.begin_consume(db_path, quote_id="q1")
    assert outcome == "expired" and info["status"] == "EXPIRED"
    # stays expired on every later attempt — refresh is the only way forward
    assert swap_quote_state.begin_consume(db_path, quote_id="q1")[0] == "expired"


def test_expiry_buffer_is_clock_skew_safe(db_path):
    # ttl 60s recorded 110s ago → expires_at sits 50s in the past; the 15s
    # buffer means "expired" only once expiry is >15s stale. now-15s cutoff
    # vs expires_at=now-50s → expired.
    _record(db_path, now=datetime.now(UTC) - timedelta(seconds=110))
    outcome, _ = swap_quote_state.begin_consume(db_path, quote_id="q1")
    assert outcome == "expired"


def test_quote_within_buffer_is_still_consumable(db_path):
    # recorded 55s ago → expires_at 5s in the past, inside the 15s buffer
    _record(db_path, now=datetime.now(UTC) - timedelta(seconds=55))
    outcome, _ = swap_quote_state.begin_consume(db_path, quote_id="q1")
    assert outcome == "consumed_now"


def test_requote_never_resurrects_a_consumed_quote(db_path):
    import json as _json
    _record(db_path, result={"amount_out": "1"})
    swap_quote_state.begin_consume(db_path, quote_id="q1")
    _record(db_path, result={"amount_out": "2"})
    conn = db.connect(db_path)
    row = conn.execute("SELECT status, result_json FROM swap_quotes"
                       " WHERE quote_id = 'q1'").fetchone()
    conn.close()
    assert row["status"] == "CONSUMED"
    assert _json.loads(row["result_json"]) == {"amount_out": "1"}, \
        "the CONSUMED row keeps its original result — never overwritten"


def test_terminal_rows_are_purged_after_retention(db_path):
    _record(db_path, qid="q-old", now=datetime.now(UTC) - timedelta(hours=25))
    swap_quote_state.begin_consume(db_path, quote_id="q-old")
    _record(db_path, qid="q-new")  # triggers the retention sweep
    conn = db.connect(db_path)
    ids = {r["quote_id"] for r in conn.execute("SELECT quote_id FROM swap_quotes")}
    conn.close()
    assert ids == {"q-new"}, "consumed rows older than 24h are swept, fresh ones stay"


def test_concurrent_submits_yield_exactly_one_consumed_now(db_path):
    _record(db_path)
    barrier = __import__("threading").Barrier(6)

    def submit(_):
        barrier.wait()
        return swap_quote_state.begin_consume(db_path, quote_id="q1")

    with ThreadPoolExecutor(max_workers=6) as pool:
        outcomes = list(pool.map(submit, range(6)))
    states = [o for o, _ in outcomes]
    assert states.count("consumed_now") == 1, \
        "one atomic transaction → exactly one consumer"
    assert states.count("consumed") == 5
    assert "expired" not in states and "store_error" not in states


def test_blank_quote_id_never_touches_the_store(db_path):
    assert swap_quote_state.begin_consume(db_path, quote_id="   ")[0] == "unknown"
    conn = db.connect(db_path)
    tables = {r[0] for r in
              conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    conn.close()
    assert "swap_quotes" not in tables, \
        "a blank quote_id must not even create the store"


def test_store_error_still_refuses_shape(tmp_path):
    outcome, _info = swap_quote_state.begin_consume(
        tmp_path, quote_id="q1")  # tmp_path dir without swap_quotes table → ensured empty DB
    assert outcome in ("store_error", "unknown")
    assert outcome != "consumed_now"  # the only law: a broken store can never consume


# ── endpoint contract ─────────────────────────────────────────────────────

def _quote(client):
    return client.get("/api/v1/swap/quote", params={
        "source_chain": "sol", "destination_chain": "sol",
        "token_in": "native",
        "token_out": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        "amount_in": "1", "slippage_bps": 50}).json()


def test_execute_door_409_replays_previous_decision(db_path):
    client = TestClient(server.app)
    qid = _quote(client)["quote_id"]
    r1 = client.post("/api/v1/swap/execute", json={"quote_id": qid})
    assert r1.status_code == 200
    assert r1.json()["decision"] == "refused"
    assert r1.json()["idempotency_state"] == "consumed_now"
    r2 = client.post("/api/v1/swap/execute", json={"quote_id": qid})
    assert r2.status_code == 409
    body = r2.json()
    assert body["state"] == "already_consumed"
    assert body["previous_decision"] is not None
    assert body["previous_decision"]["quote_id"] == qid
    assert body["previous_decision"]["decision"] == "refused"


def test_execute_door_410_for_expired_quote(db_path):
    client = TestClient(server.app)
    qid = _quote(client)["quote_id"]
    conn = db.connect(db_path)
    conn.execute("UPDATE swap_quotes SET expires_at = '2000-01-01T00:00:00.000000+00:00'")
    conn.commit()
    conn.close()
    r = client.post("/api/v1/swap/execute", json={"quote_id": qid})
    assert r.status_code == 410
    assert r.json()["state"] == "expired"
    assert "fresh quote" in r.json()["message"]


def test_execute_door_unknown_quote_id_still_refuses_200(db_path):
    client = TestClient(server.app)
    r = client.post("/api/v1/swap/execute", json={"quote_id": "never-quoted"})
    assert r.status_code == 200
    j = r.json()
    assert j["decision"] == "refused"
    assert j["idempotency_state"] == "unknown"


def test_without_db_the_jsonl_ledger_backing_is_unchanged(monkeypatch):
    monkeypatch.delenv("ALPHA_DB_PATH", raising=False)
    client = TestClient(server.app)
    r1 = client.post("/api/v1/swap/execute", json={"quote_id": "endpoint-q1"})
    r2 = client.post("/api/v1/swap/execute", json={"quote_id": "endpoint-q1"})
    assert r1.status_code == r2.status_code == 200
    assert r1.json()["decision"] == "refused"
    assert r1.json()["idempotency_state"] is None


def test_schema_v4_migration_applies_swap_quotes_table(db_path):
    conn = db.connect(db_path)
    db.init_schema(conn)
    versions = [r["version"] for r in
                conn.execute("SELECT version FROM schema_migrations ORDER BY version")]
    cols = {r[1] for r in conn.execute("PRAGMA table_info(swap_quotes)")}
    conn.close()
    assert versions == list(range(1, db.SCHEMA_VERSION + 1))
    assert {"quote_id", "status", "expires_at", "decision_json"} <= cols
    assert not isinstance(conn, sqlite3.Error)
