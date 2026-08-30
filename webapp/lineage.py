"""Deployer lineage (BE-F5a-R) — DB-LOCAL, zero provider calls on the read
path. What a deployer "did" is what THIS registry observed: scan_snapshots
rows carrying that deployer address. Never fetches history from a provider,
never fills gaps with upstream guesses.

Semantics:
- resolve(None) → None: no deployer, no lineage claim at all;
- a known deployer with no rows → {"launches": 0, ...} — that IS data
  (the registry has watched this deployer launch nothing so far), distinct
  from None;
- wallet_labels are joined display-only (label + kind): a label is a claim
  with provenance, never a score input;
- `rug` is the stored assessment level (payload_json), parsed defensively —
  absent stays None.
"""
from __future__ import annotations

import json

from webapp import db


def resolve(db_path, deployer: str | None, chain: str | None = None) -> dict | None:
    """Deployer → {"launches", "tokens", "labels"} from the local DB only."""
    if not deployer or not str(deployer).strip():
        return None
    deployer = str(deployer).strip()
    conn = db.connect(db_path)
    try:
        db.init_schema(conn)
        sql = ("SELECT chain, ident, ts, score, payload_json FROM scan_snapshots"
               " WHERE deployer = ?")
        args: list = [deployer]
        if chain is not None:
            sql += " AND chain = ?"
            args.append(chain)
        sql += " ORDER BY ts ASC"
        rows = conn.execute(sql, args).fetchall()
        tokens = []
        for r in rows:
            level = None
            try:
                level = ((json.loads(r["payload_json"] or "{}")
                          .get("assessment") or {}).get("level"))
            except (json.JSONDecodeError, AttributeError):
                level = None  # a damaged payload stays absent, never guessed
            tokens.append({"mint": r["ident"], "chain": r["chain"],
                           "score": r["score"], "rug": level, "ts": r["ts"]})
        labels = [{"label": r["label"], "kind": r["kind"],
                   "verified": bool(r["verified"])}
                  for r in conn.execute(
                      "SELECT label, kind, verified FROM wallet_labels"
                      " WHERE address = ? ORDER BY source", (deployer,))]
        return {"launches": len(tokens), "tokens": tokens, "labels": labels}
    finally:
        conn.close()
