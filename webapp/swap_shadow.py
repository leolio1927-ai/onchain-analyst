"""T2-C shadow-mode recorder — one append-only JSONL line per served quote.

Purpose: the shadow-mode comparison (served quote vs later real market
price) that gates any future execution enable. Privacy law: the quote
request carries no wallet and no IP — records hold the request parameters
and provider outcomes only. Writer is best-effort: a disk hiccup must not
break a live quote.
"""
from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

_LOCK = threading.Lock()
SHADOW_PATH = Path(os.environ.get("VILMEI_SWAP_SHADOW_FILE", "logs/swap_quotes.jsonl"))
MAX_BYTES = 5 * 1024 * 1024


def record_quote(*, quote_id: str, source_chain: str, destination_chain: str,
                 token_in: str, token_out: str, amount_in: str,
                 slippage_bps: int, provider_quoted: str | None,
                 amount_out: str | None, minimum_received: str | None,
                 latency_ms: int | None, degraded: str | None,
                 live: bool) -> dict:
    rec = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "quote_id": quote_id,
        "source_chain": source_chain,
        "destination_chain": destination_chain,
        "token_in": token_in,
        "token_out": token_out,
        "amount_in": amount_in,
        "slippage_bps": slippage_bps,
        "provider_quoted": provider_quoted,
        "amount_out": amount_out,
        "minimum_received": minimum_received,
        "latency_ms": latency_ms,
        "live": live,
        "degraded": degraded,
    }
    try:
        with _LOCK:
            SHADOW_PATH.parent.mkdir(parents=True, exist_ok=True)
            if SHADOW_PATH.exists() and SHADOW_PATH.stat().st_size > MAX_BYTES:
                SHADOW_PATH.rename(SHADOW_PATH.with_suffix(
                    SHADOW_PATH.suffix + "." + time.strftime("%Y%m%d%H%M%S")))
            with SHADOW_PATH.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(rec, separators=(",", ":")) + "\n")
    except Exception:  # noqa: BLE001, S110 — best-effort: observability must never break a quote
        pass
    return rec
