"""Provider RugCheck.xyz — keyless Solana token report summary (PROMPT-V2 P3).

PROBE (2026-08-31, this session): GET /v1/tokens/{mint}/report/summary
→ 200 @1.02s for BONK: {tokenProgram, tokenType, risks[{name, value,
description, score, level}], score, score_normalised, lpLockedPct}.
The older /v1/tokens/{mint}/report (full) is the heavy variant; the summary
is the current lean path and is what we proxy. Discipline mirrors
providers/goplus.py: (data, note) returns, hard timeout, TTL cache +
size cap — never a fabricated score, never an invented risk row.
"""
from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request

_BASE = "https://api.rugcheck.xyz/v1"
_TIMEOUT_S = 15.0

_CACHE_TTL_S = 300.0
_CACHE_MAX = 64
_cache: dict[str, tuple[float, object]] = {}
_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _cache_get(key: str):
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < _CACHE_TTL_S:
        return hit[1]
    return None


def _cache_put(key: str, value) -> None:
    now = time.monotonic()
    for k in [k for k, (t, _) in _cache.items() if now - t >= _CACHE_TTL_S]:
        del _cache[k]
    while len(_cache) >= _CACHE_MAX:
        del _cache[min(_cache, key=lambda k: _cache[k][0])]
    _cache[key] = (now, value)


def _single_flight(key: str, fn):
    with _locks_guard:
        lock = _locks.setdefault(key, threading.Lock())
    if lock.acquire(blocking=False):
        try:
            value = fn()
            _cache_put(key, value)
            return value
        finally:
            lock.release()
    with lock:
        pass
    return _cache_get(key)


_MINT_RE_OK = None  # shape is validated by the route layer (base58 32-44)


def summary(mint: str) -> tuple[dict | None, str | None]:
    """(summary_dict, note) — note is None on success, a reason sentence
    otherwise; both values are passed through verbatim."""
    key = f"summary:{mint}"
    hit = _cache_get(key)
    if hit is not None:
        return hit if hit[0] is not None else (None, hit[1])

    def fetch():
        try:
            req = urllib.request.Request(f"{_BASE}/tokens/{mint}/report/summary",
                                         headers={"User-Agent": "vilmei/2.0",
                                                  "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as r:
                data = json.load(r)
            if not isinstance(data, dict) or "score" not in data:
                return (None, "rugcheck: unexpected payload shape (no score field)")
            return (data, None)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return (None, "rugcheck: no report for this mint (404) — unindexed token")
            return (None, f"rugcheck: HTTP {e.code}")
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            return (None, f"rugcheck: unreachable ({str(e)[:60]})")
        except (ValueError, KeyError) as e:
            return (None, f"rugcheck: malformed response ({str(e)[:40]})")

    return _single_flight(key, fetch)
