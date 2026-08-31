"""Provider Alchemy — EVM JSON-RPC gateway (BE-F5a-R).

Scope decided by the capability probe: only the deployment lookup is wired
(alchemy_getAssetTransfers, category "contract" — the transfer whose `to`
is the deployed contract, ordered ascending, gives fromAddress = deployer).
Top-holder enumeration is NOT implemented: free-tier RPC cannot enumerate
holders (that needs an Etherscan-class indexer key) — the capability catalog
records that as a reason row, never an invented number.

deployer_kind: eth_getCode on the deployer address distinguishes a direct
EOA deployer ("eoa") from a factory/deployer-contract ("factory") — we
store what it IS, both are honest answers.

Shape identical to providers/helius.py: (data, note) returns, machine-
readable notes ("alchemy:not_configured", "alchemy:timeout", …), one
Retry-After-aware retry on 429, single-flight, TTL caches, no raises.
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request

_BASES = {
    "bnb": "https://bnb-mainnet.g.alchemy.com/v2",
    "base": "https://base-mainnet.g.alchemy.com/v2",
    "avax": "https://avax-mainnet.g.alchemy.com/v2",
}
_TIMEOUT_S = 10.0

_CACHE_TTL_S = 60.0
_CACHE_MAX = 64
_cache: dict[tuple, tuple[float, object]] = {}
_locks: dict[tuple, threading.Lock] = {}
_locks_guard = threading.Lock()


class _AlchemyError(RuntimeError):
    """Internal: carries a machine-readable note; public fns catch it."""


def _key() -> str | None:
    return os.environ.get("ALCHEMY_API_KEY", "").strip() or None


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


def _rpc(chain: str, method: str, params: list) -> dict:
    key = _key()
    if not key:
        raise _AlchemyError("not_configured")
    url = f"{_BASES[chain]}/{key}"
    body = {"jsonrpc": "2.0", "id": "ta", "method": method, "params": params}
    data = json.dumps(body).encode()
    headers = {"User-Agent": "vilmei/2.0", "Content-Type": "application/json"}
    for attempt in (1, 2):
        req = urllib.request.Request(url, data=data, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as r:
                out = json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt == 1:
                delay = e.headers.get("Retry-After")
                time.sleep(min(float(delay), 5.0) if delay and delay.replace(
                    ".", "", 1).isdigit() else 2.0)
                continue
            raise _AlchemyError(f"http_{e.code}") from e
        except TimeoutError as e:
            raise _AlchemyError("timeout") from e
        except (urllib.error.URLError, OSError) as e:
            raise _AlchemyError(f"unreachable:{str(e)[:60]}") from e
        if "error" in out:
            raise _AlchemyError(f"rpc_{out['error'].get('code')}")
        return out.get("result") or {}
    raise _AlchemyError("http_429")


def get_creation(chain: str, token: str) -> tuple[dict | None, str | None]:
    """Deployment lookup: first "contract" transfer to `token`, ascending —
    fromAddress is the deployer (EOA or factory; `deployer_kind` says which).
    Returns ({"deployer", "deployer_kind", "at"} | None, note)."""
    key = ("get_creation", chain, token)
    if chain not in _BASES:
        return None, "alchemy:chain_unsupported"
    if not _key():
        return None, "alchemy:not_configured"
    cached = _cache_get(key)
    if cached is not None:
        return cached, None

    def fetch():
        result = _rpc(chain, "alchemy_getAssetTransfers", [{
            "fromBlock": "0x0", "toBlock": "latest",
            "category": ["contract"], "toAddress": token,
            "order": "asc", "maxCount": "0x1", "withMetadata": True,
        }])
        transfers = result.get("transfers") or []
        if not transfers:
            raise _AlchemyError("no_deploy_tx_found")
        first = transfers[0]
        deployer = first.get("fromAddress")
        if not deployer:
            raise _AlchemyError("unparsed_response")
        code = _rpc(chain, "eth_getCode", [deployer, "latest"])
        kind = "eoa" if code in ("0x", "", None) else "factory"
        meta = first.get("metadata") or {}
        return {"deployer": deployer, "deployer_kind": kind,
                "at": meta.get("blockTimestamp")}

    try:
        return _single_flight(key, fetch), None
    except _AlchemyError as e:
        return None, f"alchemy:{e}"


def get_balances(chain: str, address: str) -> tuple[dict | None, str | None]:
    """PROMPT-V4 M5 — holdings for an EVM address: native balance
    (eth_getBalance) + top-10 ERC-20 balances (alchemy_getTokenBalances
    "erc20", free-tier coverage probed on base+bnb 2026-08-31). Decimals are
    resolved per token with one eth_call(decimals()); a token whose decimals
    cannot be read keeps its row with amount None — never guessed, never
    dropped silently. Symbols are not fetched: this tier answers balances,
    and each extra call spends the founder's free CU."""
    key = ("get_balances", chain, address)
    if chain not in _BASES:
        return None, "alchemy:chain_unsupported"
    if not _key():
        return None, "alchemy:not_configured"
    cached = _cache_get(key)
    if cached is not None:
        return cached, None

    def fetch():
        hexwei = _rpc(chain, "eth_getBalance", [address, "latest"])
        try:
            native = int(hexwei, 16) / 1e18
        except (TypeError, ValueError):
            raise _AlchemyError("unparsed_response") from None
        tb = _rpc(chain, "alchemy_getTokenBalances", [address, "erc20"])
        tokens: list[dict] = []
        for t in (tb.get("tokenBalances") or [])[:10]:
            contract, bal = t.get("contractAddress"), t.get("tokenBalance")
            if not contract or bal in (None, "0x"):
                continue
            try:
                raw = int(bal, 16)
            except (TypeError, ValueError):
                continue
            decimals = None
            try:
                out = _rpc(chain, "eth_call", [{
                    "to": contract, "data": "0x313ce567"}, "latest"])
                decimals = int(out, 16)
            except (_AlchemyError, TypeError, ValueError):
                decimals = None                 # exotic token — amount stays absent
            amount = raw / (10 ** decimals) if isinstance(decimals, int) and decimals >= 0 else None
            tokens.append({"token": contract, "symbol": None, "amount": amount})
        return {"native": native, "tokens": tokens}

    try:
        return _single_flight(key, fetch), None
    except _AlchemyError as e:
        return None, f"alchemy:{e}"
