"""Fixture-fed ingestion loop + retention CLI (BE-F2, entities BE-F3).

    uv run python -m webapp.ingest --once  [--source tests/fixtures/ingest/*.json]
                                    [--now ISO] [--db PATH]
    uv run python -m webapp.ingest --tokens [--source tests/fixtures/tokens/*.json]  [...]
    uv run python -m webapp.ingest --labels [--source tests/fixtures/labels/*.json]  [...]
    uv run python -m webapp.ingest purge --keep-days N [--now ISO] [--db PATH]

Offline by construction: the only accepted input is fixture JSON files under
tests/fixtures/ (the guard is a resolved-path check — anything else is
refused before a single row is written, so a live feed can never be ingested
through this module). Every row is stamped data_mode='fixture', source=<file
name>, ingested_at=<now>. Idempotent per run key: the (source file, row
count) identity is checked against the last run per source, so re-running a
mode writes nothing the second time. purge deletes only rows whose
ingested_at is strictly older than now - keep_days (default 400 via
ALPHA_RETENTION_DAYS), whole rows, never interpolated, and records its own
ingest_run.

Entity loaders (--tokens, --labels) add UPSERT semantics on top:
- field-wise last-non-null-wins: a null/absent field NEVER erases a richer
  stored value; a non-empty tags list replaces, an empty one keeps the old;
- first_seen keeps MIN(old, new), last_seen takes MAX(old, new);
- labels are keyed (chain, address, label, source) and their kind must be in
  db.LABEL_KINDS — an unknown kind is refused, never coerced;
- `verified` means OPERATOR-checked and no operator path exists yet: the
  loader overrides any claimed value to 0 (provenance beats payload), and it
  deliberately exposes no verified parameter to be set from outside.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from webapp import db

DEFAULT_KEEP_DAYS = 400
_FIXTURE_ROOT = Path("tests/fixtures").resolve()


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _parse_now(raw: str | None) -> datetime:
    if raw is None:
        return _utc_now()
    dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        raise SystemExit("--now must be a timezone-aware ISO-8601 timestamp")
    return dt.astimezone(UTC)


def _resolve_db(raw: str | None) -> Path:
    p = Path(raw) if raw else (db.resolve_path() or Path("data/terminal_alpha.db"))
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _check_fixture_path(source: Path) -> None:
    """Refuse anything that is not a committed fixture file under
    tests/fixtures/ — the live-pipeline firewall of this module."""
    resolved = source.resolve()
    if _FIXTURE_ROOT not in resolved.parents:
        raise SystemExit(
            f"refusing '{source}': --source must name fixture files under tests/fixtures/"
            " (live upstreams can never be ingested through this module)")
    if not resolved.is_file():
        raise SystemExit(f"fixture not found: {source}")


def _load_fixture(path: Path) -> dict:
    doc = json.loads(path.read_text(encoding="utf-8"))
    for key in ("chain", "ident", "price_points", "trades"):
        if key not in doc:
            raise SystemExit(f"fixture {path.name} missing required key '{key}'")
    return doc


def _fixture_rows(doc: dict) -> tuple[list[tuple], list[tuple], list[tuple]]:
    """Normalize a fixture doc into (price, trade, snapshot) insert tuples.
    Values are copied verbatim — absent keys stay None, never 0."""
    chain = doc["chain"].strip().lower()
    ident = doc["ident"].strip().lower()
    prices = [(chain, ident, r["ts"], r.get("price"), r.get("liquidity"),
               r.get("fdv"), r.get("vol24")) for r in doc["price_points"]]
    trades = [(chain, ident, r["ts"], r.get("side"), r.get("amount"),
               r.get("wallet"), r.get("tx_hash")) for r in doc["trades"]]
    snaps: list[tuple] = []
    snap = doc.get("scan_snapshot")
    if snap is not None:
        snaps.append((chain, ident, snap["ts"], snap.get("score"),
                      snap.get("denominator"),
                      json.dumps(snap.get("payload"), ensure_ascii=False,
                                 separators=(",", ":"))))
    return prices, trades, snaps


def _last_run_rows(conn, source_name: str) -> int | None:
    row = conn.execute(
        "SELECT params_json FROM ingest_run WHERE source = ?"
        " ORDER BY id DESC LIMIT 1", (source_name,)).fetchone()
    if row is None:
        return None
    try:
        return json.loads(row["params_json"]).get("rows")
    except json.JSONDecodeError:
        return None


def run_once(sources: list[Path], now: datetime, db_path: Path) -> dict:
    """Ingest the given fixture files. Returns per-file {file: rows_written}."""
    for s in sources:
        _check_fixture_path(s)
    conn = db.connect(db_path)
    out: dict[str, int] = {}
    try:
        db.init_schema(conn)
        now_iso = now.isoformat()
        for path in sources:
            doc = _load_fixture(path)
            prices, trades, snaps = _fixture_rows(doc)
            total = len(prices) + len(trades) + len(snaps)
            if _last_run_rows(conn, path.name) == total:
                out[path.name] = 0  # idempotent: identical run already ingested
                continue
            conn.executemany(
                "INSERT INTO price_points (chain, ident, ts, price, liquidity,"
                " fdv, vol24, data_mode, source, ingested_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, 'fixture', ?, ?)",
                [(*t, path.name, now_iso) for t in prices])
            conn.executemany(
                "INSERT INTO trades (chain, ident, ts, side, amount, wallet,"
                " tx_hash, data_mode, source, ingested_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, 'fixture', ?, ?)",
                [(*t, path.name, now_iso) for t in trades])
            conn.executemany(
                "INSERT INTO scan_snapshots (chain, ident, ts, score,"
                " denominator, payload_json, data_mode, source, ingested_at)"
                " VALUES (?, ?, ?, ?, ?, ?, 'fixture', ?, ?)",
                [(*t, path.name, now_iso) for t in snaps])
            conn.execute(
                "INSERT INTO ingest_run (run_at, data_mode, source, params_json,"
                " rows_written) VALUES (?, 'fixture', ?, ?, ?)",
                (now_iso, path.name,
                 json.dumps({"rows": total, "idents": [doc["ident"].lower()]}),
                 total))
            conn.commit()
            out[path.name] = total
        return out
    finally:
        conn.close()


def _load_rows(path: Path, key: str) -> list[dict]:
    """Read one fixture file's entity list; absent list = honest empty."""
    doc = json.loads(path.read_text(encoding="utf-8"))
    return doc.get(key) or []


def _entity_run(conn, source_name: str, total: int, now_iso: str) -> bool:
    """Run-key gate: False = an identical run already landed this source
    (skip). True = proceed; the run row is written by the caller."""
    if _last_run_rows(conn, source_name) == total:
        return False
    conn.execute(
        "INSERT INTO ingest_run (run_at, data_mode, source, params_json,"
        " rows_written) VALUES (?, 'fixture', ?, ?, ?)",
        (now_iso, source_name, json.dumps({"rows": total}), total))
    return True


def load_tokens(sources: list[Path], now: datetime, db_path: Path) -> dict:
    """--tokens loader: upsert token registry rows (fixture-stamped)."""
    for s in sources:
        _check_fixture_path(s)
    conn = db.connect(db_path)
    out: dict[str, int] = {}
    try:
        db.init_schema(conn)
        now_iso = now.isoformat()
        for path in sources:
            rows = _load_rows(path, "tokens")
            total = len(rows)
            if not _entity_run(conn, f"tokens:{path.name}", total, now_iso):
                out[path.name] = 0
                continue
            for r in rows:
                db.upsert_token(
                    conn, r["chain"].strip().lower(), r["ident"].strip().lower(),
                    symbol=r.get("symbol"), name=r.get("name"),
                    decimals=r.get("decimals"), logo_ref=r.get("logo_ref"),
                    tags=r.get("tags") or [], data_mode="fixture",
                    source=path.name, now_iso=now_iso,
                    first_seen=r.get("first_seen"), last_seen=r.get("last_seen"))
            conn.commit()
            out[path.name] = total
        return out
    finally:
        conn.close()


def load_labels(sources: list[Path], now: datetime, db_path: Path) -> dict:
    """--labels loader: upsert wallet label claims (fixture-stamped).

    verified is ALWAYS written as 0 here — the fixture payload's claim is
    ignored (provenance beats payload) and this loader exposes no operator
    path; one does not exist yet by design."""
    for s in sources:
        _check_fixture_path(s)
    conn = db.connect(db_path)
    out: dict[str, int] = {}
    try:
        db.init_schema(conn)
        now_iso = now.isoformat()
        for path in sources:
            rows = _load_rows(path, "labels")
            # validate every kind BEFORE writing anything — a bad kind
            # refuses the whole file instead of landing half of it
            for r in rows:
                try:
                    db.assert_label_kind(r.get("kind"))
                except ValueError as e:
                    raise SystemExit(str(e)) from e
            total = len(rows)
            if not _entity_run(conn, f"labels:{path.name}", total, now_iso):
                out[path.name] = 0
                continue
            for r in rows:
                db.upsert_label(
                    conn, r["chain"].strip().lower(), r["address"].strip(),
                    label=r["label"], kind=r["kind"],
                    evidence=r.get("evidence"), verified=False,
                    data_mode="fixture", source=path.name, now_iso=now_iso)
            conn.commit()
            out[path.name] = total
        return out
    finally:
        conn.close()


def purge(keep_days: int, now: datetime, db_path: Path) -> dict[str, int]:
    """Delete rows whose ingested_at is strictly older than now - keep_days.
    Retention ages data from its arrival, not its event time — backfilled
    history must not be nuked for being old. Whole rows only; the purge
    records its own ingest_run so it is itself auditable."""
    cutoff = (now - timedelta(days=keep_days)).isoformat()
    conn = db.connect(db_path)
    try:
        db.init_schema(conn)
        now_iso = now.isoformat()
        deleted = {}
        for table in ("price_points", "trades", "scan_snapshots"):
            cur = conn.execute(f"DELETE FROM {table} WHERE ingested_at < ?", (cutoff,))
            deleted[table] = cur.rowcount
        conn.execute(
            "INSERT INTO ingest_run (run_at, data_mode, source, params_json,"
            " rows_written) VALUES (?, 'fixture', 'purge', ?, ?)",
            (now_iso, json.dumps({"keep_days": keep_days, "cutoff": cutoff}),
             sum(deleted.values())))
        conn.commit()
        return deleted
    finally:
        conn.close()


def main(argv: list[str] | None = None) -> int:
    shared = argparse.ArgumentParser(add_help=False)
    shared.add_argument("--db", default=None,
                        help="sqlite path (default ALPHA_DB_PATH or data/terminal_alpha.db)")
    shared.add_argument("--now", default=None, help="timezone-aware ISO override (retention tests)")

    parser = argparse.ArgumentParser(
        prog="webapp.ingest", description="fixture-fed ingestion + retention CLI",
        parents=[shared])
    parser.add_argument("--once", action="store_true",
                        help="ingest market fixtures (idempotent per run key)")
    parser.add_argument("--tokens", action="store_true",
                        help="upsert the token registry from fixtures/tokens/*.json")
    parser.add_argument("--labels", action="store_true",
                        help="upsert wallet label claims from fixtures/labels/*.json")
    parser.add_argument("--source", action="append", default=None,
                        help="fixture JSON path (repeatable); default dir depends on the mode")
    sub = parser.add_subparsers(dest="cmd")

    p_purge = sub.add_parser("purge", description="delete rows older than keep-days",
                             parents=[shared])
    p_purge.add_argument("--keep-days", type=int,
                         default=int(__import__("os").environ.get("ALPHA_RETENTION_DAYS", DEFAULT_KEEP_DAYS)))

    args = parser.parse_args(argv)
    now = _parse_now(args.now)
    db_path = _resolve_db(args.db)

    if args.cmd == "purge":
        deleted = purge(args.keep_days, now, db_path)
        print(json.dumps({"purged": deleted, "keep_days": args.keep_days,
                          "db": str(db_path)}, indent=1))
        return 0

    modes = [m for m, on in (("--once", args.once), ("--tokens", args.tokens),
                             ("--labels", args.labels)) if on]
    if len(modes) != 1:
        parser.error("pick exactly one mode: --once | --tokens | --labels")

    default_dir = {"--once": "ingest", "--tokens": "tokens", "--labels": "labels"}[modes[0]]
    sources = ([Path(s) for s in args.source]
               if args.source else sorted(_FIXTURE_ROOT.glob(f"{default_dir}/*.json")))
    if not sources:
        print(f"no fixture sources found under tests/fixtures/{default_dir}/",
              file=sys.stderr)
        return 1
    if modes[0] == "--tokens":
        written = load_tokens(sources, now, db_path)
    elif modes[0] == "--labels":
        written = load_labels(sources, now, db_path)
    else:
        written = run_once(sources, now, db_path)
    print(json.dumps({"ingested": written, "db": str(db_path)}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
