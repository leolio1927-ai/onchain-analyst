"""P1-B — persistent AI run history + evidence provenance.

One append-only JSONL record per AI run (terminal analyst, MCP ai_ask,
landing chat). Privacy law: no API keys, no raw wallet addresses (redacted),
no raw question text (length + sha256 only). The evidence hash is the SAME
deterministic digest the analyst already pins its answers to
(ai_ask.evidence_digest) — identical evidence ⇒ identical hash, any change
⇒ different hash. Failed runs are recorded with status="error" and NEVER
look like successes; cache hits carry cached=True so they are never
mistaken for fresh upstream runs. Writer is best-effort: a disk hiccup must
not break a live AI stream.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
import uuid
from pathlib import Path

_LOCK = threading.Lock()
RUNS_PATH = Path(os.environ.get("VILMEI_AI_RUNS_FILE", "data/ai-runs.jsonl"))
MAX_BYTES = 5 * 1024 * 1024

# 0x + 40 hex, or a 32-44 char base58 group — the two address shapes VILMEI
# touches. Anything matching is masked before a record leaves memory.
_ADDRESS_RE = re.compile(r"(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})")


def redact(text: str) -> str:
    return _ADDRESS_RE.sub(lambda m: m.group(0)[:6] + "…" + m.group(0)[-4:], text)


def question_fingerprint(question: str) -> dict:
    red = redact(question.strip())
    return {
        "question_len": len(question),
        "question_sha": hashlib.sha256(question.encode("utf-8")).hexdigest()[:16],
        "question_redacted": red[:160],
    }


def new_run_id() -> str:
    return uuid.uuid4().hex[:16]


def record_run(*, surface: str, persona: str, mode: str, provider: str,
               model: str, prompt_version: str, run_id: str,
               question: str, evidence_sources: list[str] | None,
               evidence_hash: str | None, status: str,
               latency_ms: int | None, usage: dict | None = None,
               cached: bool = False, error_kind: str | None = None,
               degraded: bool = False) -> dict:
    """Append one run record. Never raises; never stores credentials."""
    rec = {
        "run_id": run_id,
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "epoch": round(time.time(), 3),
        "surface": surface,
        "persona": persona,
        "mode": mode,
        "provider": provider,
        "model": model,
        "prompt_version": prompt_version,
        **question_fingerprint(question or ""),
        "evidence_sources": evidence_sources or [],
        "evidence_hash": evidence_hash,
        "status": status,                 # ok | error | degraded
        "cached": bool(cached),
        "error_kind": error_kind,
        "degraded": bool(degraded),
        "latency_ms": latency_ms,
        "usage": usage or {},
    }
    line = json.dumps(rec, ensure_ascii=False, separators=(",", ":"))
    try:
        with _LOCK:
            RUNS_PATH.parent.mkdir(parents=True, exist_ok=True)
            if RUNS_PATH.exists() and RUNS_PATH.stat().st_size > MAX_BYTES:
                RUNS_PATH.write_text("")   # bounded: history restarts, never grows unbounded
            with RUNS_PATH.open("a", encoding="utf-8") as fh:
                fh.write(line + "\n")
    except OSError:
        pass
    return rec


def read_runs(limit: int = 50) -> list[dict]:
    try:
        lines = RUNS_PATH.read_text(encoding="utf-8").strip().splitlines()
    except OSError:
        return []
    out = []
    for line in lines[-max(1, min(limit, 200)):]:
        try:
            out.append(json.loads(line))
        except ValueError:
            continue
    return out
