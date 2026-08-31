"""Provider Jupiter — keyless lite quote API (BE-F5a-R).

Sell-side test via https://quote-api.jup.ag/v6/quote (no key, free tier):
can 1 raw unit of `mint` actually route to wrapped SOL right now?

Tri-state by contract — the caller must never have to guess:
- routable=True   — HTTP 200 with outAmount: the token is sellable today;
- routable=False  — a recognized no-route answer (HTTP 400 whose body is a
                    route error): a LOUD honeypot signal, never softened;
- (None, note)    — timeout / 5xx / unparseable / bad request: "sell
                    simulation unavailable", NEVER conflated with unroutable
                    and never implying safe.

Shape copied from providers/dexscreener.py: timeout, one Retry-After-aware
retry on 429 (no retry-burst), small TTL cache, single-flight per key.
Every public fn returns (data, note) — note None on success, a
machine-readable reason otherwise; nothing here raises to the caller.
"""
from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request

BASE = "https://lite-api.jup.ag/swap/v1"
SOL_MINT = "So11111111111111111111111111111111111111112"
_TIMEOUT_S = 10.0

_CACHE_TTL_S = 60.0
_CACHE_MAX = 64
_cache: dict[tuple, tuple[float, object]] = {}
_locks: dict[tuple, threading.Lock] = {}
_locks_guard = threading.Lock()


class _JupiterError(RuntimeError):
    """Internal: carries a machine-readable note; public fns catch it."""


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
    """One caller per cache-key does network I/O; the rest wait and reuse."""
    with _locks_guard:
        lock = _locks.setdefault(key, threading.Lock())
    if lock.acquire(blocking=False):
        try:
            value = fn()
            _cache_put(key, value)
            return value
        finally:
            lock.release()
    with lock:  # wait for the in-flight fetch, then read its cache entry
        pass
    return _cache_get(key)


def _get(path: str) -> dict:
    """One HTTP GET with a single Retry-After-aware retry on 429."""
    url = f"{BASE}{path}"
    for attempt in (1, 2):
        req = urllib.request.Request(url, headers={"User-Agent": "vilmei/2.0",
                                                   "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            if e.code == 429 and attempt == 1:
                delay = e.headers.get("Retry-After")
                time.sleep(min(float(delay), 5.0) if delay and delay.replace(
                    ".", "", 1).isdigit() else 2.0)
                continue
            if e.code == 400:
                raise _JupiterError(f"no-route:{body[:120]}") from e
            raise _JupiterError(f"http_{e.code}") from e
        except TimeoutError as e:
            raise _JupiterError("timeout") from e
        except (urllib.error.URLError, OSError) as e:
            raise _JupiterError(f"unreachable:{str(e)[:60]}") from e
    raise _JupiterError("http_429")  # unreachable: loop always returns/raises


def sell_quote(chain: str, mint: str, amount_raw: int = 10 ** 9) -> tuple[dict | None, str | None]:
    """1 raw unit of `mint` → SOL. Returns (data, note):
    ({"routable": True, "amount_out": str, "checked_via": "jupiter"}, None)
    ({"routable": False, "amount_out": None, "checked_via": "jupiter",
      "note": "no route found"}, None)
    (None, "jupiter:timeout" | "jupiter:unreachable" | ...) — unavailable,
    never False. A missing key concept does not exist: the lite API is
    keyless; only `chain` support is checked."""
    key = ("sell_quote", chain, mint, amount_raw)
    if chain != "sol":
        return None, "jupiter:chain_unsupported"
    cached = _cache_get(key)
    if cached is not None:
        return cached, None

    def fetch():
        path = (f"/quote?inputMint={mint}&outputMint={SOL_MINT}"
                f"&amount={amount_raw}&slippageBps=50")
        return {"routable": True, "amount_out": _get(path).get("outAmount"),
                "checked_via": "jupiter", "note": None}

    try:
        data = _single_flight(key, fetch)
        return data, None
    except _JupiterError as e:
        msg = str(e)
        if msg.startswith("no-route:"):
            return {"routable": False, "amount_out": None, "checked_via": "jupiter",
                    "note": "no route found"}, None
        if msg.startswith("transport:Timeout") or "timed out" in msg:
            return None, "jupiter:timeout"
        return None, f"jupiter:{msg.split(':')[0] if ':' in msg else msg}"
