"""Provider GoPlus — keyless token-security API (BE-ALL-LIVE F2/F4).

api.gopluslabs.io/api/v1/token_security/{chainId}?contract_addresses=…
answers keyless (free tier, probed 2026-08-30): creator_address,
is_honeypot, buy/sell tax, mintable/freezable, holder_count. FASE-1 probe:
CAKE creator live on bnb, AERO creator identical to Blockscout AND to the
on-chain from (three-way match) on base.

Discipline copied from providers/jupiter.py: (data, note) returns, hard
timeout, one Retry-After-aware retry, TTL cache + single-flight. GoPlus
gives NO creation-tx hash, so its creator claims can never satisfy the
law-3 on-chain gate alone — callers must ship them flagged unverified-tx.
"""
from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request

_BASE = "https://api.gopluslabs.io/api/v1"
_CHAIN_IDS = {"bnb": 56, "base": 8453}
_TIMEOUT_S = 15.0

_CACHE_TTL_S = 300.0          # security fields move slowly
_CACHE_MAX = 64
_cache: dict[tuple, tuple[float, object]] = {}
_locks: dict[tuple, threading.Lock] = {}
_locks_guard = threading.Lock()


class _GoPlusError(RuntimeError):
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


def _get(url: str) -> dict:
    req = urllib.request.Request(url, headers={
        "User-Agent": "terminal-alpha/0.1", "Accept": "application/json"})
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as r:
                out = json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503) and attempt == 1:
                delay = e.headers.get("Retry-After")
                time.sleep(min(float(delay), 5.0) if delay and delay.replace(
                    ".", "", 1).isdigit() else 2.0)
                continue
            raise _GoPlusError(f"http_{e.code}") from e
        except TimeoutError as e:
            raise _GoPlusError("timeout") from e
        except (urllib.error.URLError, OSError) as e:
            raise _GoPlusError(f"unreachable:{str(e)[:60]}") from e
    if not isinstance(out, dict) or out.get("code") not in (1, 0):
        raise _GoPlusError("unparsed_response")
    return out


def token_security(chain: str, token: str) -> tuple[dict | None, str | None]:
    """Raw security payload for one contract ({} when GoPlus has no row —
    that is data-level absence, note "goplus:no_row")."""
    key = ("token_security", chain, token)
    if chain not in _CHAIN_IDS:
        return None, "goplus:chain_unsupported"
    cached = _cache_get(key)
    if cached is not None:
        return cached, None

    def fetch():
        out = _get(f"{_BASE}/token_security/{_CHAIN_IDS[chain]}"
                   f"?contract_addresses={token}")
        result = out.get("result") or {}
        row = result.get(token.lower())
        if not row:
            raise _GoPlusError("no_row")
        return row

    try:
        return _single_flight(key, fetch), None
    except _GoPlusError as e:
        return None, f"goplus:{e}"


def get_creator(chain: str, token: str) -> tuple[dict | None, str | None]:
    """Creator claim from GoPlus — no creation tx hash exists here, so the
    caller ships it flagged unverified-tx (law 3 cannot be satisfied)."""
    row, note = token_security(chain, token)
    if row is None:
        return None, note
    creator = row.get("creator_address") or row.get("contract_creator")
    if not creator:
        return None, "goplus:no_creator_field"
    return {"deployer": creator}, None


def security_flags(chain: str, token: str) -> tuple[dict | None, str | None]:
    """Rug-relevant flag set for the context block (FASE 4). Values are
    copied verbatim from GoPlus — absent fields stay absent."""
    row, note = token_security(chain, token)
    if row is None:
        return None, note
    return {"is_honeypot": row.get("is_honeypot"),
            "buy_tax": row.get("buy_tax"),
            "sell_tax": row.get("sell_tax"),
            "mintable": row.get("mintable"),
            "freezable": row.get("freezable"),
            "holder_count": row.get("holder_count"),
            "lp_holders": row.get("lp_holders")}, None
