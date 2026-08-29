"""Fixture-fed ingestion loop + retention CLI (BE-F2).

    uv run python -m webapp.ingest --once [--source tests/fixtures/ingest/*.json]
                                    [--now ISO] [--db PATH]
    uv run python -m webapp.ingest purge --keep-days N [--now ISO] [--db PATH]

Offline by construction: the only accepted input is fixture JSON files under
tests/fixtures/ (the guard is a resolved-path check — anything else is
refused before a single row is written, so a live feed can never be ingested
through this module). Every row is stamped data_mode='fixture', source=<file
name>, ingested_at=<now>. Idempotent per run key: the (source file, content,
rows) identity is checked against the last run per source, so running --once
twice writes nothing the second time. purge deletes only rows strictly older
than now - keep_days (default 400 via ALPHA_RETENTION_DAYS), whole rows,
never interpolated, and records its own ingest_run.
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
                        help="ingest fixture files once (idempotent per run key)")
    parser.add_argument("--source", action="append", default=None,
                        help="fixture JSON path (repeatable); default: tests/fixtures/ingest/*.json")
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

    if not args.once:
        parser.print_help()
        return 1

    sources = ([Path(s) for s in args.source]
               if args.source else sorted(_FIXTURE_ROOT.glob("ingest/*.json")))
    if not sources:
        print("no fixture sources found under tests/fixtures/ingest/", file=sys.stderr)
        return 1
    written = run_once(sources, now, db_path)
    print(json.dumps({"ingested": written, "db": str(db_path)}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
