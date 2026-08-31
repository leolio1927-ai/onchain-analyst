"""Provider Helius — Solana RPC + Enhanced APIs (work notes §2.2, BE-F5a-R).

Discipline copied from providers/dexscreener.py: timeout, one Retry-After-
aware retry on 429 (never a retry-burst), small TTL caches, single-flight
per cache key. Every BE-F5a fn returns (data, note): `data` is None on any
failure, `note` is None on success or a machine-readable reason otherwise
("helius:not_configured", "helius:timeout", "helius:create_tx_not_found",
"helius:empty_accounts" …). Nothing raises to the caller — a missing key is
an honest not_configured, never an error and never a zero.
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request

BASE = "https://mainnet.helius-rpc.com"
LAMPORTS_PER_SOL = 1_000_000_000
_TIMEOUT_S = 10.0

_CACHE_TTL_S = 60.0
_CACHE_MAX = 64
_cache: dict[tuple, tuple[float, object]] = {}
_locks: dict[tuple, threading.Lock] = {}
_locks_guard = threading.Lock()


class _HeliusError(RuntimeError):
    """Internal: carries a machine-readable note; public fns catch it."""


class NoKeyError(RuntimeError):
    pass


def _key() -> str | None:
    return os.environ.get("HELIUS_API_KEY", "").strip() or None


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


def _call(url: str, *, body: dict | None = None) -> dict | list:
    """One keyed HTTP call; 429 honors Retry-Header once, then gives up.
    Raises _HeliusError with the reason note — callers translate."""
    headers = {"User-Agent": "vilmei/2.0", "Accept": "application/json"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    for attempt in (1, 2):
        req = urllib.request.Request(url, data=data, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt == 1:
                delay = e.headers.get("Retry-After")
                time.sleep(min(float(delay), 5.0) if delay and delay.replace(
                    ".", "", 1).isdigit() else 2.0)
                continue
            raise _HeliusError(f"http_{e.code}") from e
        except TimeoutError as e:
            raise _HeliusError("timeout") from e
        except (urllib.error.URLError, OSError) as e:
            raise _HeliusError(f"unreachable:{str(e)[:60]}") from e
    raise _HeliusError("http_429")


def fetch_balances(address: str) -> dict:
    key = _key()
    if not key:
        raise NoKeyError("HELIUS_API_KEY not set — founder's call (see .env.example)")
    # Key travels in a header, never the URL: urllib HTTPError messages embed
    # the request URL, so a query-string key would leak into error logs.
    url = f"{BASE}/v0/addresses/{address}/balances"
    req = urllib.request.Request(url, headers={"User-Agent": "vilmei/2.0",
                                               "X-API-Key": key})
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.load(r)

    native = data.get("native_balance") or {}
    tokens = []
    for t in (data.get("tokens") or [])[:10]:
        try:
            amount = float(t.get("amount") or 0) / (10 ** int(t.get("decimals") or 0))
        except (TypeError, ValueError, ZeroDivisionError):
            continue
        tokens.append({"mint": t.get("mint"), "amount": amount})
    return {"address": address,
            "sol": (native.get("lamports") or 0) / LAMPORTS_PER_SOL,
            "tokens": tokens}


def _guarded(chain: str, expected: str = "sol") -> str | None:
    """Shared preconditions for the BE-F5a fns. Returns the failure note or
    None when the caller may proceed."""
    if chain != expected:
        return "helius:chain_unsupported"
    if not _key():
        return "helius:not_configured"
    return None


def transfers(chain: str, token: str, limit: int = 100) -> tuple[dict | None, str | None]:
    """Recent enhanced transactions for a token → signed per-wallet deltas.
    Returns ({"transfers": [...], "txs_seen": n} | None, note). A transfer
    whose amount cannot be parsed is skipped — never guessed; an empty list
    is DATA (a quiet token), distinct from a failed fetch."""
    key = ("transfers", chain, token, limit)
    if (note := _guarded(chain)) is not None:
        return None, note
    cached = _cache_get(key)
    if cached is not None:
        return cached, None

    def fetch():
        url = f"{BASE}/v0/addresses/{token}/transactions?api-key={_key()}&limit={limit}"
        txs = _call(url)
        if not isinstance(txs, list):
            raise _HeliusError("unparsed_response")
        out, seen = [], 0
        for tx in txs:
            seen += 1
            ts = tx.get("timestamp")
            sig = tx.get("signature")
            for tb in tx.get("tokenBalances") or []:
                if (tb.get("mint") or "") != token:
                    continue
                try:
                    amount = float(tb.get("amount"))
                except (TypeError, ValueError):
                    continue                      # unparseable delta: skip, never guess
                wallet = tb.get("userAccount")
                if not wallet:
                    continue
                out.append({"wallet": wallet, "amount": amount,
                            "direction": "in" if amount >= 0 else "out",
                            "ts": ts, "tx": sig})
        return {"transfers": out, "txs_seen": seen}

    try:
        return _single_flight(key, fetch), None
    except _HeliusError as e:
        return None, f"helius:{e}"


def get_asset(chain: str, mint: str) -> tuple[dict | None, str | None]:
    """DAS getAsset → the token's authority truth: {"update_authorities":
    [addr…], "mutable": bool} copied verbatim (BONK live probe 2026-08-30:
    authorities still set + mutable=true — revocable, stated as-is)."""
    key = ("get_asset", chain, mint)
    if (note := _guarded(chain)) is not None:
        return None, note
    cached = _cache_get(key)
    if cached is not None:
        return cached, None

    def fetch():
        out = _call(f"{BASE}/?api-key={_key()}",
                    body={"jsonrpc": "2.0", "id": "ta", "method": "getAsset",
                          "params": {"id": mint}})
        result = out.get("result") or {}
        if not result:
            raise _HeliusError("no_asset")
        auths = [a.get("address") for a in (result.get("authorities") or [])
                 if a.get("address")]
        return {"update_authorities": auths, "mutable": result.get("mutable")}

    try:
        return _single_flight(key, fetch), None
    except _HeliusError as e:
        return None, f"helius:{e}"


def get_creation(chain: str, mint: str) -> tuple[dict | None, str | None]:
    """Creation tx of an SPL mint → fee_payer = deployer. Returns
    ({"tx", "fee_payer", "at"} | None, note). Empty result sets are honest
    absence ("helius:create_tx_not_found"), distinct from a timeout."""
    key = ("get_creation", chain, mint)
    if (note := _guarded(chain)) is not None:
        return None, note
    cached = _cache_get(key)
    if cached is not None:
        return cached, None

    def fetch():
        url = (f"{BASE}/v0/addresses/{mint}/transactions"
               f"?api-key={_key()}&limit=100")
        txs = _call(url)
        if not isinstance(txs, list):
            raise _HeliusError("unparsed_response")
        created = [t for t in txs if t.get("type") == "CREATE"]
        if not created:
            raise _HeliusError("create_tx_not_found")
        tx = min(created, key=lambda t: t.get("timestamp") or 0)
        fee_payer = tx.get("feePayer") or tx.get("fee_payer")
        if not fee_payer:
            raise _HeliusError("unparsed_response")
        return {"tx": tx.get("signature"), "fee_payer": fee_payer,
                "at": tx.get("timestamp")}

    try:
        return _single_flight(key, fetch), None
    except _HeliusError as e:
        return None, f"helius:{e}"


def get_largest_accounts(chain: str, mint: str) -> tuple[dict | None, str | None]:
    """Top-10 holder buckets → {"top10_share", "accounts"}. Supply comes from
    the live getTokenSupply answer — never a fixed-decimals approximation.
    An empty account list is DATA (note "helius:empty_accounts"), distinct
    from a failed fetch."""
    key = ("get_largest_accounts", chain, mint)
    if (note := _guarded(chain)) is not None:
        return None, note
    cached = _cache_get(key)
    if cached is not None:
        return cached, None

    def fetch():
        body = {"jsonrpc": "2.0", "id": "ta-probe"}
        accounts = _call(f"{BASE}/?api-key={_key()}",
                         body={**body, "method": "getTokenLargestAccounts",
                               "params": [mint]})
        supply = _call(f"{BASE}/?api-key={_key()}",
                       body={**body, "method": "getTokenSupply",
                             "params": [mint]})
        buckets = ((accounts.get("result") or {}).get("value") or [])
        if not buckets:
            raise _HeliusError("empty_accounts")
        sup = ((supply.get("result") or {}).get("value") or {}).get("uiAmount")
        try:
            supply_ui = float(sup)
            top = sum(float(b.get("uiAmount") or 0) for b in buckets[:10])
        except (TypeError, ValueError):
            raise _HeliusError("unparsed_response") from None
        if not supply_ui or supply_ui <= 0:
            raise _HeliusError("supply_unavailable")
        return {"top10_share": round(top / supply_ui, 6), "accounts": len(buckets)}

    try:
        return _single_flight(key, fetch), None
    except _HeliusError as e:
        return None, f"helius:{e}"
