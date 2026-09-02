"""T2-E quote_id idempotency state machine — SQLite (the project's own
store; no new infra).

Lifecycle: QUOTED → CONSUMED (one submission) or EXPIRED (stale).
The execute door MUST call ``begin_consume`` and branch on the outcome:
- ``consumed``    → HTTP 409 with the PREVIOUS decision replayed (a retry
  can never produce a second transaction);
- ``expired``     → HTTP 410, the client must fetch a fresh quote
  (expiry = expires_at past, minus a 15s safety buffer, clock-skew safe);
- ``unknown`` / ``consumed_now`` / ``store_error`` → the caller proceeds to
  the refusal door. Every one of those outcomes is REFUSAL-shaped, so a
  storage problem can never let a second submission through.

Atomicity: check + consume happen inside ONE ``BEGIN IMMEDIATE``
transaction — two concurrent submits of the same quote_id get exactly one
``consumed_now`` and one ``consumed``. Timestamps are UTC ISO-8601 with
fixed microsecond width, so lexicographic order equals chronological order
(the db.py convention).
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from datetime import UTC, datetime, timedelta
from typing import Any

BUFFER_S = 15.0
RETENTION_H = 24.0

# one-time schema ensure per DB path — a fresh ALPHA_DB_PATH must gain its
# swap_quotes table on first use, not fail (fail-closed ≠ fail-useless)
_ENSURED: set[str] = set()
_ENSURE_LOCK = threading.Lock()


def _ttl_s() -> float:
    raw = os.environ.get("VILMEI_SWAP_QUOTE_TTL_S", "").strip()
    try:
        value = float(raw) if raw else 60.0
    except ValueError:
        value = 60.0
    return max(1.0, value)


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat(timespec="microseconds")


def record_quote(path, *, quote_id: str, request: dict, result: dict | None = None,
                 now: datetime | None = None) -> dict:
    """Insert (or refresh, ONLY while still QUOTED) the quote row. A
    CONSUMED/EXPIRED quote_id is never resurrected by a re-quote. Best-effort:
    a store error returns honestly instead of breaking the served quote —
    the execute door stays fail-closed regardless (unknown → refusal)."""
    now_dt = now or datetime.now(UTC)
    try:
        conn = _connect(path)
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                INSERT INTO swap_quotes (quote_id, status, created_at, expires_at,
                                         request_json, result_json)
                VALUES (?, 'QUOTED', ?, ?, ?, ?)
                ON CONFLICT(quote_id) DO UPDATE SET
                    request_json = excluded.request_json,
                    result_json = excluded.result_json,
                    expires_at = excluded.expires_at
                WHERE swap_quotes.status = 'QUOTED'
                """,
                (quote_id, _iso(now_dt), _iso(now_dt + timedelta(seconds=_ttl_s())),
                 _dumps(request), _dumps(result)))
            conn.execute(
                "DELETE FROM swap_quotes WHERE status IN ('CONSUMED','EXPIRED')"
                " AND expires_at <= ?",
                (_iso(now_dt - timedelta(hours=RETENTION_H)),))
            row = conn.execute("SELECT status FROM swap_quotes WHERE quote_id = ?",
                               (quote_id,)).fetchone()
            conn.commit()
            return {"quote_id": quote_id, "status": row["status"] if row else None}
        finally:
            conn.close()
    except sqlite3.Error as exc:
        return {"quote_id": quote_id, "status": None,
                "error": f"quote state store unavailable: {exc.__class__.__name__}"}


def begin_consume(path, *, quote_id: str, buffer_s: float = BUFFER_S,
                  now: datetime | None = None) -> tuple[str, dict | None]:
    """The ONE atomic check-consume. Outcomes:
    ``unknown`` | ``consumed`` (409) | ``expired`` (410) | ``consumed_now``
    | ``store_error``. Never raises."""
    qid = str(quote_id or "").strip()
    if not qid:
        return "unknown", None
    try:
        conn = _connect(path)
    except sqlite3.Error as exc:
        return "store_error", {"error": exc.__class__.__name__}
    try:
        now_dt = now or datetime.now(UTC)
        cutoff = _iso(now_dt - timedelta(seconds=buffer_s))
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM swap_quotes WHERE quote_id = ?",
                           (qid,)).fetchone()
        if row is None:
            conn.commit()
            return "unknown", None
        if row["status"] == "CONSUMED":
            conn.commit()
            return "consumed", _info(row)
        if row["status"] == "EXPIRED" or row["expires_at"] <= cutoff:
            conn.execute("UPDATE swap_quotes SET status = 'EXPIRED'"
                         " WHERE quote_id = ? AND status = 'QUOTED'", (qid,))
            conn.commit()
            fresh = conn.execute("SELECT * FROM swap_quotes WHERE quote_id = ?",
                                 (qid,)).fetchone()
            return "expired", _info(fresh)
        cur = conn.execute(
            "UPDATE swap_quotes SET status = 'CONSUMED', consumed_at = ?"
            " WHERE quote_id = ? AND status = 'QUOTED'", (_iso(now_dt), qid))
        if cur.rowcount != 1:  # lost a race inside the lock — treat as consumed
            conn.commit()
            fresh = conn.execute("SELECT * FROM swap_quotes WHERE quote_id = ?",
                                 (qid,)).fetchone()
            return "consumed", _info(fresh)
        conn.commit()
        fresh = conn.execute("SELECT * FROM swap_quotes WHERE quote_id = ?",
                             (qid,)).fetchone()
        return "consumed_now", _info(fresh)
    except sqlite3.Error as exc:
        try:
            conn.rollback()
        except sqlite3.Error:
            pass
        return "store_error", {"error": exc.__class__.__name__}
    finally:
        conn.close()


def attach_decision(path, *, quote_id: str, decision: dict) -> bool:
    """Record the decision a CONSUMED quote produced, so a later retry's 409
    can replay the previous transaction result. One write; NULL-only fill."""
    try:
        conn = _connect(path)
        try:
            conn.execute(
                "UPDATE swap_quotes SET decision_json = ?"
                " WHERE quote_id = ? AND status = 'CONSUMED' AND decision_json IS NULL",
                (_dumps(decision), quote_id))
            conn.commit()
            return True
        finally:
            conn.close()
    except sqlite3.Error:
        return False


def _connect(path):
    from webapp import db  # local import: db owns connection conventions
    conn = db.connect(path)
    conn.execute("PRAGMA busy_timeout=5000")
    key = str(path)
    with _ENSURE_LOCK:
        if key not in _ENSURED:
            db.init_schema(conn)
            _ENSURED.add(key)
    return conn


def reset_for_tests() -> None:
    _ENSURED.clear()


def _dumps(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str)


def _info(row: sqlite3.Row) -> dict:
    info = {"quote_id": row["quote_id"], "status": row["status"],
            "expires_at": row["expires_at"], "created_at": row["created_at"],
            "consumed_at": row["consumed_at"], "previous_decision": None}
    if row["decision_json"]:
        try:
            info["previous_decision"] = json.loads(row["decision_json"])
        except (ValueError, TypeError):
            info["previous_decision"] = None  # torn record: replay honestly empty
    return info
