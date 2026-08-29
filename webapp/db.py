"""SQLite persistence layer (BE-F2) — offline-first, stdlib only.

Design rules:
- connect() is a pure helper: every caller opens a fresh connection from a
  parametrized path. NO module-global handle — one shared handle is how cache
  pollution leaked between tests in F1's first run.
- WAL journal mode; writers commit explicitly and close.
- Provenance on every persisted row: data_mode ("live" | "fixture" — stamped
  by the writer, never inferred after the fact), source, ingested_at. A
  fixture row can never be read back as a live row.
- ts columns are UTC ISO-8601 strings with explicit offsets, so lexicographic
  order equals chronological order; cursors and windows compare strings.
- ident = normalized lowercase address / pool id (the BE-F2 contract).
- Retention never interpolates: purge deletes whole rows older than the
  cutoff and records its own ingest_run; history pages are never padded.
- Price points are point-in-time quotes: the history route maps them to
  OhlcvPoint with open/high/left None and close = the observed price — a
  candle that was never observed is never synthesized.

Persistence is opt-in via ALPHA_DB_PATH: unset → resolve_path() returns None,
write-through is skipped and history routes answer 503. Default-off keeps
dev/test runs from writing stray databases.
"""
from __future__ import annotations

import base64
import json
import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

SCHEMA_VERSION = 1
HISTORY_LIMIT_MAX = 500

_TABLES = ("price_points", "trades", "scan_snapshots", "ingest_run")

_DDL = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ingest_run (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at TEXT NOT NULL,
    data_mode TEXT NOT NULL,
    source TEXT NOT NULL,
    params_json TEXT NOT NULL,
    rows_written INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS price_points (
    chain TEXT NOT NULL,
    ident TEXT NOT NULL,
    ts TEXT NOT NULL,
    price REAL,
    liquidity REAL,
    fdv REAL,
    vol24 REAL,
    data_mode TEXT NOT NULL,
    source TEXT NOT NULL,
    ingested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_price_points_ident ON price_points (chain, ident, ts);
CREATE TABLE IF NOT EXISTS trades (
    chain TEXT NOT NULL,
    ident TEXT NOT NULL,
    ts TEXT NOT NULL,
    side TEXT,
    amount REAL,
    wallet TEXT,
    tx_hash TEXT,
    data_mode TEXT NOT NULL,
    source TEXT NOT NULL,
    ingested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trades_ident ON trades (chain, ident, ts);
CREATE TABLE IF NOT EXISTS scan_snapshots (
    chain TEXT NOT NULL,
    ident TEXT NOT NULL,
    ts TEXT NOT NULL,
    score REAL,
    denominator INTEGER,
    payload_json TEXT,
    data_mode TEXT NOT NULL,
    source TEXT NOT NULL,
    ingested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scan_snapshots_ident ON scan_snapshots (chain, ident, ts);
"""


def resolve_path() -> Path | None:
    """ALPHA_DB_PATH → an absolute-ready Path (parent mkdir'd); unset → None
    (persistence off — honest, not an error)."""
    raw = os.environ.get("ALPHA_DB_PATH", "").strip()
    if not raw:
        return None
    p = Path(raw)
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def connect(path: Path | str) -> sqlite3.Connection:
    """Fresh connection per call — WAL, row access by name. Caller closes."""
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    """Idempotent DDL + the schema_migrations row. Safe on every open."""
    conn.executescript(_DDL)
    conn.execute(
        "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
        (SCHEMA_VERSION, datetime.now(UTC).isoformat()))
    conn.commit()


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


# ── write-through (scan) ─────────────────────────────────────────────────

def write_scan_snapshot(path: Path, chain: str, ident: str, scan: dict) -> int:
    """Persist one scan observation. The stored data_mode is "live" because
    only real engine output reaches this writer (fixture snapshots arrive
    through the ingest loader, which stamps "fixture")."""
    assessment = scan.get("assessment") or {}
    signals = assessment.get("signals") or []
    denominator = sum(1 for s in signals if s.get("severity") is not None)
    conn = connect(path)
    try:
        init_schema(conn)
        cur = conn.execute(
            "INSERT INTO scan_snapshots (chain, ident, ts, score, denominator,"
            " payload_json, data_mode, source, ingested_at)"
            " VALUES (?, ?, ?, ?, ?, ?, 'live', ?, ?)",
            (chain, ident, scan.get("ts") or utc_now_iso(),
             assessment.get("score"), denominator,
             json.dumps({"pair": scan.get("pair"), "assessment": assessment,
                         "clustering": scan.get("clustering")},
                        ensure_ascii=False, separators=(",", ":")),
             ",".join(scan.get("sources") or []), utc_now_iso()))
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


# ── pagination primitives ────────────────────────────────────────────────

def _cursor_encode(ts: str, rid: int) -> str:
    return base64.urlsafe_b64encode(
        json.dumps({"t": ts, "r": rid}, separators=(",", ":")).encode()).decode()


def _cursor_decode(raw: str) -> tuple[str, int]:
    try:
        d = json.loads(base64.urlsafe_b64decode(raw.encode()))
        return str(d["t"]), int(d["r"])
    except Exception as e:  # malformed cursor → a 400, never a 500
        raise ValueError("invalid cursor") from e


def _norm_utc(value: str | None, field: str) -> str | None:
    """Validate a window bound; naive timestamps are rejected (they would
    silently filter against the wrong clock). Returns a UTC ISO string."""
    if value is None:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except (TypeError, ValueError) as e:
        raise ValueError(f"{field} must be an ISO-8601 timestamp") from e
    if dt.tzinfo is None:
        raise ValueError(f"{field} must be timezone-aware (UTC expected)")
    return dt.astimezone(UTC).isoformat()


def _page_mode(rows: list[sqlite3.Row]) -> str:
    """Envelope data_mode = what the rows actually are. A mixed page takes
    the conservative label — a fixture row must never read as live."""
    modes = {r["data_mode"] for r in rows}
    if len(modes) == 1:
        return modes.pop()
    if not modes:
        return "unwired"  # empty page: nothing was observed
    return "fixture"


def _fetch_window(conn: sqlite3.Connection, table: str, chain: str, ident: str,
                  limit: int, cursor: str | None,
                  since: str | None, until: str | None) -> list[sqlite3.Row]:
    limit = max(1, min(int(limit), HISTORY_LIMIT_MAX))
    where = ["chain = ?", "ident = ?"]
    args: list = [chain, ident]
    after = _cursor_decode(cursor) if cursor else None
    if after is not None:
        where.append("(ts > ? OR (ts = ? AND rowid > ?))")
        args += [after[0], after[0], after[1]]
    bound_since = _norm_utc(since, "since")
    bound_until = _norm_utc(until, "until")
    if bound_since is not None:
        where.append("ts >= ?")
        args.append(bound_since)
    if bound_until is not None:
        where.append("ts <= ?")
        args.append(bound_until)
    sql = (f"SELECT rowid AS rid, * FROM {table} WHERE {' AND '.join(where)}"
           f" ORDER BY ts ASC, rid ASC LIMIT ?")
    return conn.execute(sql, [*args, limit + 1]).fetchall()


def _envelope(rows: list[sqlite3.Row], limit: int, items: list[dict]) -> dict:
    has_more = len(rows) > limit
    page = rows[:limit]
    return {
        "items": items,
        "next_cursor": _cursor_encode(page[-1]["ts"], page[-1]["rid"]) if has_more else None,
        "data_mode": _page_mode(page),
        "schema_version": "1.0",
        "sources": sorted({r["source"] for r in page}),
        "ts": utc_now_iso(),
    }


# ── history reads ────────────────────────────────────────────────────────

def history_prices(path: Path, chain: str, ident: str, limit: int = 100,
                   cursor: str | None = None, since: str | None = None,
                   until: str | None = None) -> dict:
    """Point-in-time quotes → OhlcvPage items with open/high/low None and
    close = the observed price (see module docstring)."""
    conn = connect(path)
    try:
        rows = _fetch_window(conn, "price_points", chain, ident,
                             limit, cursor, since, until)
        items = [{"ts": r["ts"], "open": None, "high": None, "low": None,
                  "close": r["price"], "volume": r["vol24"],
                  "liquidity": r["liquidity"], "fdv": r["fdv"]}
                 for r in rows[:max(1, min(int(limit), HISTORY_LIMIT_MAX))]]
        return _envelope(rows, max(1, min(int(limit), HISTORY_LIMIT_MAX)), items)
    finally:
        conn.close()


def history_trades(path: Path, chain: str, ident: str, limit: int = 100,
                   cursor: str | None = None, since: str | None = None,
                   until: str | None = None) -> dict:
    conn = connect(path)
    try:
        rows = _fetch_window(conn, "trades", chain, ident,
                             limit, cursor, since, until)
        items = [{"wallet": r["wallet"], "kind": r["side"], "ts": r["ts"],
                  "usd": r["amount"], "base_token": ident, "tx_hash": r["tx_hash"]}
                 for r in rows[:max(1, min(int(limit), HISTORY_LIMIT_MAX))]]
        return _envelope(rows, max(1, min(int(limit), HISTORY_LIMIT_MAX)), items)
    finally:
        conn.close()


# ── introspection (for /api/version) ─────────────────────────────────────

def db_info(path: Path | None) -> dict:
    """The /api/version db block. path None → persistence off, honestly."""
    if path is None:
        return {"path_kind": "off", "schema_version": None, "rows_by_table": {},
                "last_run_at": None, "oldest_row_ts": None}
    if not Path(path).is_file():
        return {"path_kind": "env", "schema_version": None, "rows_by_table": {},
                "last_run_at": None, "oldest_row_ts": None}
    conn = connect(path)
    try:
        row = conn.execute("SELECT MAX(version) AS v FROM schema_migrations").fetchone()
        counts = {t: conn.execute(f"SELECT COUNT(*) AS c FROM {t}").fetchone()["c"]
                  for t in _TABLES}
        oldest = conn.execute(
            "SELECT MIN(ts) AS m FROM (SELECT ts FROM price_points"
            " UNION ALL SELECT ts FROM trades UNION ALL SELECT ts FROM scan_snapshots)"
        ).fetchone()["m"]
        last_run = conn.execute(
            "SELECT MAX(run_at) AS m FROM ingest_run").fetchone()["m"]
        return {"path_kind": "env", "schema_version": row["v"],
                "rows_by_table": counts, "last_run_at": last_run,
                "oldest_row_ts": oldest}
    finally:
        conn.close()
