"""Provider Blockscout — public explorer API (BE-ALL-LIVE F2).

base.blockscout.com/api/v2 is the probe-proven primary for EVM deployer
lookups on base: `/addresses/{token}` carries `creator_address_hash` +
`creation_transaction_hash`, and the FASE-1 probe verified the claim
on-chain (law 3: to=null, from==claim on AERO).

Hard rules honored: the UA header is MANDATORY (no-UA = Cloudflare 403,
probe-proven), transient 500s get one retry after a short backoff (founder:
"BRETT 500 transient"), a missing creation row is honest absence
("blockscout:no_creation_row" — some tokens genuinely have none), and every
public fn returns (data, note) without raising.
"""
from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request

_BASES = {"base": "https://base.blockscout.com/api/v2"}
# bnb: no public blockscout instance known (probe 2026-08-30) — bnb deploys
# come from GoPlus (see providers/goplus.py).
_TIMEOUT_S = 15.0

_CACHE_TTL_S = 120.0
_CACHE_MAX = 64
_cache: dict[tuple, tuple[float, object]] = {}
_locks: dict[tuple, threading.Lock] = {}
_locks_guard = threading.Lock()


class _BlockscoutError(RuntimeError):
    """Internal: carries a machine-readable note."""


def _cache_get(key):
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < _CACHE_TTL_S:
        return hit[1]
    return None


def _cache_put(key, value) -> None:
    now = time.monotonic()
    for k in [k for k, (t, _) in _cache.items() if now - t >= _CACHE_TTL_S]:
        del _cache[k]
    while len(_cache) >= _CACHE_MAX:
        del _cache[min(_cache, key=lambda k: _cache[k][0])]
    _cache[key] = (now, value)


def _single_flight(key, fn):
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


def _get(path: str) -> dict:
    url = f"{_BASES['base']}{path}"
    for attempt in (1, 2):
        req = urllib.request.Request(url, headers={
            "User-Agent": "terminal-alpha/0.1",   # mandatory: CF 403 without it
            "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:120]
            # founder: transient 500s are real (BRETT) — one backoff retry
            if e.code in (500, 502, 503) and attempt == 1:
                time.sleep(1.5)
                continue
            raise _BlockscoutError(f"http_{e.code}:{body}") from e
        except TimeoutError as e:
            raise _BlockscoutError("timeout") from e
        except (urllib.error.URLError, OSError) as e:
            raise _BlockscoutError(f"unreachable:{str(e)[:60]}") from e
    raise _BlockscoutError("http_500")   # loop exhausted


def get_creation(chain: str, token: str) -> tuple[dict | None, str | None]:
    """Creator + creation tx for a contract. Returns
    ({"deployer", "tx"} | None, note). A missing row is honest absence —
    NOT an error and NOT a zero."""
    key = ("get_creation", chain, token)
    if chain not in _BASES:
        return None, "blockscout:chain_unsupported"
    cached = _cache_get(key)
    if cached is not None:
        return cached, None

    def fetch():
        out = _get(f"/addresses/{token}")
        creator = out.get("creator_address_hash")
        tx = out.get("creation_transaction_hash")
        if not creator or not tx:
            raise _BlockscoutError("no_creation_row")
        return {"deployer": creator, "tx": tx}

    try:
        return _single_flight(key, fetch), None
    except _BlockscoutError as e:
        return None, f"blockscout:{e}"
