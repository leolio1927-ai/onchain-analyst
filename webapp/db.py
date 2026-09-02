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

SCHEMA_VERSION = 4
HISTORY_LIMIT_MAX = 500

_TABLES = ("price_points", "trades", "scan_snapshots", "ingest_run",
           "tokens", "wallet_labels", "swap_quotes")

# The honest kind set for wallet labels — enforced HERE, in code, never in SQL
# (an open SQL CHECK would silently accept tomorrow's typo as a new category).
# "unlabeled" is deliberately absent: the absence of a row IS the unlabeled
# state — silence, never a row that guesses.
LABEL_KINDS = frozenset({"deployer", "sniper", "bot", "cex", "team", "fund", "kols"})

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

# v2 (BE-F3) — entity layer: token registry + wallet labels
_DDL_V2 = """
CREATE TABLE IF NOT EXISTS tokens (
    chain TEXT NOT NULL,
    ident TEXT NOT NULL,
    symbol TEXT,
    name TEXT,
    decimals INTEGER,
    logo_ref TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    data_mode TEXT NOT NULL,
    source TEXT NOT NULL,
    ingested_at TEXT NOT NULL,
    PRIMARY KEY (chain, ident)
);
CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens (symbol);
CREATE TABLE IF NOT EXISTS wallet_labels (
    chain TEXT NOT NULL,
    address TEXT NOT NULL,
    label TEXT NOT NULL,
    kind TEXT NOT NULL,
    evidence TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    data_mode TEXT NOT NULL,
    source TEXT NOT NULL,
    ingested_at TEXT NOT NULL,
    PRIMARY KEY (chain, address, label, source)
);
"""

# v4 (T2-E) — swap quote_id idempotency state machine. quote_id is the
# PRIMARY KEY (UNIQUE by construction): one row per validated request.
# status is the lifecycle enum; it is enforced in swap_quote_state code,
# not in SQL (same law as LABEL_KINDS — a CHECK would silently accept
# tomorrow's typo as a new state).
_DDL_V4 = """
CREATE TABLE IF NOT EXISTS swap_quotes (
    quote_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    request_json TEXT NOT NULL,
    result_json TEXT,
    consumed_at TEXT,
    decision_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_swap_quotes_status ON swap_quotes (status, expires_at);
"""

def _migrate_v3(conn: sqlite3.Connection) -> None:
    """v3 (BE-F5a-R) — deployer provenance columns on scan_snapshots, added
    in one ALTER batch. Conditional because SQLite lacks ADD COLUMN IF NOT
    EXISTS; the index itself is IF NOT EXISTS."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(scan_snapshots)")}
    for col in ("deployer", "deployer_kind", "deployer_source"):
        if col not in cols:
            conn.execute(f"ALTER TABLE scan_snapshots ADD COLUMN {col} TEXT")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_scan_snapshots_deployer "
                 "ON scan_snapshots (chain, deployer)")


# ordered migrations; each applied at most once, recorded in schema_migrations.
# A str entry runs via executescript; a callable entry runs against the open
# connection (used when a step must be conditional, e.g. SQLite has no
# "ADD COLUMN IF NOT EXISTS").
_MIGRATIONS: tuple[tuple[int, str | object], ...] = (
    (1, _DDL), (2, _DDL_V2), (3, _migrate_v3), (4, _DDL_V4))


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
    """Idempotent migrations: v1 base DDL always runs (CREATE IF NOT EXISTS),
    then every migration not yet recorded in schema_migrations applies once.
    Safe on every open, fresh or old database alike."""
    conn.executescript(_DDL)
    applied = {r[0] for r in conn.execute("SELECT version FROM schema_migrations")}
    for version, step in _MIGRATIONS:
        if version in applied:
            continue
        if callable(step):
            step(conn)
        else:
            conn.executescript(step)
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
            (version, datetime.now(UTC).isoformat()))
    conn.commit()


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


# ── write-through (scan) ─────────────────────────────────────────────────

def write_scan_snapshot(path: Path, chain: str, ident: str, scan: dict, *,
                        deployer: str | None = None,
                        deployer_kind: str | None = None,
                        deployer_source: str | None = None) -> int:
    """Persist one scan observation. The stored data_mode is "live" because
    only real engine output reaches this writer (fixture snapshots arrive
    through the ingest loader, which stamps "fixture"). The deployer columns
    ride in the SAME INSERT/transaction — lineage can see its own scan the
    moment it is served. deployer_source records WHO said it (helius/
    alchemy), so cross-chain values stay comparable strings."""
    assessment = scan.get("assessment") or {}
    signals = assessment.get("signals") or []
    denominator = sum(1 for s in signals if s.get("severity") is not None)
    conn = connect(path)
    try:
        init_schema(conn)
        cur = conn.execute(
            "INSERT INTO scan_snapshots (chain, ident, ts, score, denominator,"
            " payload_json, data_mode, source, ingested_at,"
            " deployer, deployer_kind, deployer_source)"
            " VALUES (?, ?, ?, ?, ?, ?, 'live', ?, ?, ?, ?, ?)",
            (chain, ident, scan.get("ts") or utc_now_iso(),
             assessment.get("score"), denominator,
             json.dumps({"pair": scan.get("pair"), "assessment": assessment,
                         "clustering": scan.get("clustering")},
                        ensure_ascii=False, separators=(",", ":")),
             ",".join(scan.get("sources") or []), utc_now_iso(),
             deployer, deployer_kind, deployer_source))
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


# ── entity layer (BE-F3: tokens + wallet labels) ────────────────────────

def assert_label_kind(kind: str) -> None:
    """The honest kind set, enforced in code. Unknown kinds (including
    'unlabeled' — the absence of a row is that state) are refused, never
    coerced into something adjacent."""
    if kind not in LABEL_KINDS:
        raise ValueError(
            f"unknown label kind {kind!r} — pick {'|'.join(sorted(LABEL_KINDS))}"
            " (unlabeled = no row, never a kind)")


def upsert_token(conn: sqlite3.Connection, chain: str, ident: str, *,
                 symbol: str | None, name: str | None, decimals: int | None,
                 logo_ref: str | None, tags: list[str], data_mode: str,
                 source: str, now_iso: str, first_seen: str | None = None,
                 last_seen: str | None = None) -> None:
    """Field-wise last-non-null-wins UPSERT (conflict rules):
    - a NULL/absent field in the new row NEVER erases a richer stored value;
    - tags: a non-empty list replaces, an empty/absent list keeps the old;
    - first_seen keeps MIN(old, new), last_seen takes MAX(old, new) —
      a reload can move a token forward, never backward or blank.
    first_seen/last_seen args carry the source's own observation window;
    they default to the ingest clock when the source doesn't know one."""
    first = first_seen or now_iso
    last = last_seen or now_iso
    conn.execute(
        """
        INSERT INTO tokens (chain, ident, symbol, name, decimals, logo_ref,
                            tags_json, first_seen, last_seen, data_mode,
                            source, ingested_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (chain, ident) DO UPDATE SET
            symbol = COALESCE(excluded.symbol, tokens.symbol),
            name = COALESCE(excluded.name, tokens.name),
            decimals = COALESCE(excluded.decimals, tokens.decimals),
            logo_ref = COALESCE(excluded.logo_ref, tokens.logo_ref),
            tags_json = CASE WHEN excluded.tags_json != '[]'
                             THEN excluded.tags_json ELSE tokens.tags_json END,
            first_seen = MIN(tokens.first_seen, excluded.first_seen),
            last_seen = MAX(tokens.last_seen, excluded.last_seen),
            data_mode = excluded.data_mode,
            source = excluded.source,
            ingested_at = excluded.ingested_at
        """,
        (chain, ident, symbol, name, decimals, logo_ref,
         json.dumps(tags, ensure_ascii=False, separators=(",", ":")),
         first, last, data_mode, source, now_iso))


def upsert_label(conn: sqlite3.Connection, chain: str, address: str, *,
                 label: str, kind: str, evidence: str | None, verified: bool,
                 data_mode: str, source: str, now_iso: str) -> None:
    """Label UPSERT on (chain, address, label, source). `verified` means
    OPERATOR-checked — distinct from data provenance. Only the fixture
    loaders call this today and they pass verified=False regardless of what
    the payload claims; the operator writer does not exist yet by design."""
    assert_label_kind(kind)
    conn.execute(
        """
        INSERT INTO wallet_labels (chain, address, label, kind, evidence,
                                   verified, data_mode, source, ingested_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (chain, address, label, source) DO UPDATE SET
            kind = excluded.kind,
            evidence = COALESCE(excluded.evidence, wallet_labels.evidence),
            verified = excluded.verified,
            data_mode = excluded.data_mode,
            ingested_at = excluded.ingested_at
        """,
        (chain, address, label, kind, evidence, int(bool(verified)),
         data_mode, source, now_iso))


def get_token(path: Path, chain: str, ident: str) -> dict | None:
    """One token row → TokenMeta-shaped dict, or None when unknown
    (silence — the registry has no opinion on tokens it never saw)."""
    conn = connect(path)
    try:
        r = conn.execute("SELECT * FROM tokens WHERE chain = ? AND ident = ?",
                         (chain, ident)).fetchone()
        if r is None:
            return None
        return {"chain": r["chain"], "address": r["ident"], "symbol": r["symbol"],
                "name": r["name"], "decimals": r["decimals"], "logo_ref": r["logo_ref"],
                "tags": json.loads(r["tags_json"] or "[]"),
                "first_seen": r["first_seen"], "last_seen": r["last_seen"],
                "data_mode": r["data_mode"], "schema_version": "1.0",
                "sources": [r["source"]], "ts": utc_now_iso()}
    finally:
        conn.close()


def get_wallet_labels(path: Path, address: str) -> dict:
    """All labels for an address across chains — rows carry their own chain.
    No rows = honest empty list (an unlabeled wallet is a fact, not an error)."""
    conn = connect(path)
    try:
        rows = conn.execute(
            "SELECT * FROM wallet_labels WHERE address = ? ORDER BY chain, label",
            (address,)).fetchall()
        labels = [{"chain": r["chain"], "address": r["address"], "label": r["label"],
                   "kind": r["kind"], "evidence": r["evidence"],
                   "verified": bool(r["verified"])} for r in rows]
        return {"address": address, "labels": labels,
                "data_mode": _page_mode(rows), "schema_version": "1.0",
                "sources": sorted({r["source"] for r in rows}), "ts": utc_now_iso()}
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
