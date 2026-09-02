"""T2-E execution idempotency plumbing — the single choke point any future
execution path MUST use.

Execution is DISABLED by policy today (the terminal is quote-only): every
attempt is refused and recorded. Idempotency law: ONE record per quote_id —
a retry returns the SAME refusal record and can never produce a second
submission. Fail-closed law: an unknown/malformed quote_id is refused, and
a storage failure refuses too — never "assume it went through".
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from pathlib import Path

_LOCK = threading.Lock()
EXEC_PATH = Path(os.environ.get("VILMEI_SWAP_EXEC_FILE", "data/swap-executions.jsonl"))
MAX_BYTES = 5 * 1024 * 1024
_INDEX: dict[str, dict] | None = None

REFUSAL_REASON = "execution is disabled by policy — the terminal is quote_only"


def _payload_digest(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def _load_index() -> dict[str, dict]:
    global _INDEX
    if _INDEX is not None:
        return _INDEX
    index: dict[str, dict] = {}
    try:
        if EXEC_PATH.exists():
            for line in EXEC_PATH.read_text(encoding="utf-8").splitlines():
                try:
                    rec = json.loads(line)
                    if isinstance(rec, dict) and isinstance(rec.get("quote_id"), str):
                        index[rec["quote_id"]] = rec
                except json.JSONDecodeError:
                    continue  # a torn tail line must not poison the map
    except Exception:  # noqa: BLE001 — unreadable store → empty index; refusal still guaranteed
        index = {}
    _INDEX = index
    return _INDEX


def request_execution(*, quote_id: str, payload: dict | None = None) -> dict:
    """The ONLY door to execution. Today it always refuses; the record is
    idempotent on quote_id so a retried quote can never double-submit."""
    qid = str(quote_id or "").strip()
    if not qid:
        return {"decision": "refused", "quote_id": qid or None,
                "reason": "missing quote_id — nothing is ever executed unnamed"}
    with _LOCK:
        index = _load_index()
        existing = index.get(qid)
        if existing is not None:
            return dict(existing)  # SAME record back — no second submission
        rec = {
            "quote_id": qid,
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "decision": "refused",
            "reason": REFUSAL_REASON,
            "payload_digest": _payload_digest(payload or {}),
        }
        try:
            EXEC_PATH.parent.mkdir(parents=True, exist_ok=True)
            if EXEC_PATH.exists() and EXEC_PATH.stat().st_size > MAX_BYTES:
                EXEC_PATH.rename(EXEC_PATH.with_suffix(
                    EXEC_PATH.suffix + "." + time.strftime("%Y%m%d%H%M%S")))
                index.clear()
            with EXEC_PATH.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(rec, separators=(",", ":")) + "\n")
        except Exception:  # noqa: BLE001 — a broken store refuses, never "assume fine"
            return {"decision": "refused", "quote_id": qid,
                    "reason": REFUSAL_REASON + " (execution record store unavailable)"}
        index[qid] = rec
        return dict(rec)


def reset_for_tests() -> None:
    global _INDEX
    with _LOCK:
        _INDEX = None
