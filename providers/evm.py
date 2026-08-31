"""Public EVM JSON-RPC (no key) + the law-3 creation verifier (BE-ALL-LIVE F2).

rpc() speaks to the public gateways (mainnet.base.org, bsc-dataseed…) with the
UA header every one of them demands (no-UA = Cloudflare 403, probe-proven),
a hard timeout, and one retry on 429/503.

verify_creation(tx_hash, claimed) is the law-3 gate: a provider's creator
claim is trusted ONLY when the creation transaction answers on-chain with
`to == null` (a true deploy) AND `from == claimed`. Anything else fails and
the caller must fall back or ship null — a claim is never silently trusted.
"""
from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request

_RPCS = {
    "base": "https://mainnet.base.org",
    "bnb": "https://bsc-dataseed.binance.org",
}
_TIMEOUT_S = 10.0

_verify_cache: dict[tuple, tuple[float, tuple[bool, str]]] = {}
_verify_locks: dict[tuple, threading.Lock] = {}
_locks_guard = threading.Lock()
_VERIFY_TTL_S = 60.0


class _EvmError(RuntimeError):
    """Internal: carries a machine-readable note."""


def rpc(chain: str, method: str, params: list) -> dict | list | None:
    if chain not in _RPCS:
        raise _EvmError("chain_unsupported")
    body = json.dumps({"jsonrpc": "2.0", "id": "ta", "method": method,
                       "params": params}).encode()
    headers = {"User-Agent": "vilmei/2.0", "Content-Type": "application/json",
               "Accept": "application/json"}
    for attempt in (1, 2):
        req = urllib.request.Request(_RPCS[chain], data=body, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as r:
                out = json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt == 1:
                delay = e.headers.get("Retry-After")
                time.sleep(min(float(delay), 5.0) if delay and delay.replace(
                    ".", "", 1).isdigit() else 2.0)
                continue
            raise _EvmError(f"http_{e.code}") from e
        except TimeoutError as e:
            raise _EvmError("timeout") from e
        except (urllib.error.URLError, OSError) as e:
            raise _EvmError(f"unreachable:{str(e)[:60]}") from e
        if "error" in out:
            raise _EvmError(f"rpc_{out['error'].get('code')}")
        return out.get("result")
    raise _EvmError("http_429")


def verify_creation(chain: str, tx_hash: str | None,
                    claimed: str | None) -> tuple[bool, str]:
    """Law-3 gate (cached): the creation tx must be a real deploy (to null)
    and its from must equal the claimed creator. (ok, detail) — detail is
    the verbatim evidence line for data_sources."""
    key = ("verify", chain, tx_hash, (claimed or "").lower())
    now = time.monotonic()
    hit = _verify_cache.get(key)
    if hit and now - hit[0] < _VERIFY_TTL_S:
        return hit[1]
    with _locks_guard:
        lock = _verify_locks.setdefault(key, threading.Lock())
    with lock:
        hit = _verify_cache.get(key)
        if hit and time.monotonic() - hit[0] < _VERIFY_TTL_S:
            return hit[1]
        try:
            tx = rpc(chain, "eth_getTransactionByHash", [tx_hash]) or {}
        except _EvmError as e:
            result = (False, f"verification unavailable ({e})")
            _verify_cache[key] = (time.monotonic(), result)
            return result
        to = tx.get("to")
        frm = (tx.get("from") or "").lower()
        ok = to is None and frm == (claimed or "").lower()
        detail = (f"creation tx verified on-chain (to=null, from={frm})" if ok
                  else f"verification FAILED (to={to}, from={frm}, claim={claimed})")
        result = (ok, detail)
        _verify_cache[key] = (time.monotonic(), result)
        return result


def code_kind(chain: str, address: str) -> str | None:
    """'eoa' when the address has no code, 'factory' when it does — what the
    deployer IS, stated not guessed. None when the chain is unsupported."""
    if chain not in _RPCS:
        return None
    try:
        code = rpc(chain, "eth_getCode", [address, "latest"])
    except _EvmError:
        return None
    return "factory" if code not in ("0x", "", None) else "eoa"
