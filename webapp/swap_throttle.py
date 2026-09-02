"""T2-E quote throttle — per-IP and per-wallet sliding window for
/api/v1/swap/quote (no new dependency; same in-memory pattern as the AI
per-IP limiter in server.py).

Law: check() is ATOMIC across all keys of one request — a request either
consumes a slot on EVERY key (ip + wallet) or on NONE, so a blocked wallet
attempt can never burn the shared IP budget of other users. Retry-After is
derived from the oldest hit still inside the window. Keys are kept in
memory only, bounded, never persisted and never logged: the wallet string
exists here ONLY as an opaque throttle key.

The limiter runs BEFORE quote building: its whole purpose is damping the
fan-out, so even invalid requests consume a slot (per-IP stays the backstop
for anonymous floods).
"""
from __future__ import annotations

import os
import threading
import time
from collections import deque
from collections.abc import Callable

WINDOW_S = 60.0
MAX_KEYS = 2000

_hits: dict[str, deque] = {}
_LOCK = threading.Lock()


def limit_per_minute() -> int:
    raw = os.environ.get("VILMEI_SWAP_QUOTE_RPM", "").strip()
    try:
        value = int(raw) if raw else 20
    except ValueError:
        value = 20
    return max(1, value)


def check(keys: list[str], *, now_fn: Callable[[], float] = time.time) -> tuple[bool, int, str | None]:
    """(allowed, retry_after_s, blocked_key). Never raises; on block no slot
    is consumed anywhere."""
    limit = limit_per_minute()
    now = now_fn()
    with _LOCK:
        dead = [k for k, q in _hits.items() if not q or now - q[-1] > WINDOW_S * 2]
        for k in dead:
            del _hits[k]
        while len(_hits) >= MAX_KEYS:
            oldest = min(_hits, key=lambda k: _hits[k][-1] if _hits[k] else 0.0)
            del _hits[oldest]
        for k in keys:
            q = _hits.setdefault(k, deque())
            while q and now - q[0] > WINDOW_S:
                q.popleft()
            if len(q) >= limit:
                retry = max(1, int(WINDOW_S - (now - q[0])) + 1)
                return False, retry, k
        for k in keys:
            _hits[k].append(now)
        return True, 0, None


def reset_for_tests() -> None:
    with _LOCK:
        _hits.clear()
