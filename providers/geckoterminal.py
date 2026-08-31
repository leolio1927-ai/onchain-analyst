"""Provider GeckoTerminal — per-wallet trade feed (free, keyless).

VERIFIED live 2026-08-27 (network ids: solana, bsc, base, avax — all 200 OK):
- GET /networks/{net}/pools/{pool_address}/trades — attributes per trade:
  tx_from_address, kind ("buy"|"sell"), block_timestamp (ISO-8601 UTC),
  volume_in_usd, from_token_amount, to_token_amount,
  from_token_address, to_token_address. Buy → base token = to_token_address.
- GET /networks/{net}/tokens/{token_address}/pools — the response is NOT
  liquidity-sorted; sort it ourselves via attributes.reserve_in_usd.
"hype" is held back until its chainId is officially verified (work notes §3 & §10).
"""
from __future__ import annotations

import json
import time
import urllib.request

BASE = "https://api.geckoterminal.com/api/v2"

NETWORKS = {"sol": "solana", "bnb": "bsc", "base": "base"}  # "avax": "avax" parked 2026-08-30 (founder: 5-chain lineup; re-add to re-enable)

# Free tier is ~10 calls/min — a small TTL trade cache keeps a warm scan at
# zero GT calls without serving meaningfully stale per-wallet data.
TRADE_CACHE_TTL_S = 90.0
TRADE_CACHE_MAX = 64

# (chain_key, pool_address) → (monotonic_ts, trades)
_trade_cache: dict[tuple[str, str], tuple[float, list[dict]]] = {}


def _trade_cache_get(key: tuple[str, str]) -> list[dict] | None:
    hit = _trade_cache.get(key)
    if hit and time.monotonic() - hit[0] < TRADE_CACHE_TTL_S:
        return hit[1]
    return None


def _trade_cache_put(key: tuple[str, str], trades: list[dict]) -> None:
    """Store trades: drop expired entries first, then the oldest ones beyond
    the size cap — the cache must never grow without bound (server._cache_put
    pattern)."""
    now = time.monotonic()
    expired = [k for k, (t, _) in _trade_cache.items() if now - t >= TRADE_CACHE_TTL_S]
    for k in expired:
        del _trade_cache[k]
    while len(_trade_cache) >= TRADE_CACHE_MAX:
        del _trade_cache[min(_trade_cache, key=lambda k: _trade_cache[k][0])]
    _trade_cache[key] = (now, trades)

def _net(chain_key: str) -> str:
    """Resolve GT network slug; raise a readable error for chains GT does
    not serve (e.g. hood) so callers degrade honestly instead of KeyError."""
    if chain_key not in NETWORKS:
        raise ValueError(f"geckoterminal: no network for chain {chain_key!r} "
                         f"(live: {', '.join(sorted(NETWORKS))})")
    return NETWORKS[chain_key]


def _get(path: str) -> dict:
    req = urllib.request.Request(f"{BASE}{path}", headers={
        "User-Agent": "vilmei/2.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)


def fetch_pools(chain_key: str, token_address: str) -> list[dict]:
    """Pools where the token trades (raw from GT)."""
    return _get(f"/networks/{_net(chain_key)}/tokens/{token_address}/pools").get("data") or []


def best_pool(pools: list[dict]) -> dict | None:
    """The largest-liquidity pool — GT's response is unordered, sort it ourselves."""
    if not pools:
        return None

    def _reserve(p: dict) -> float:
        try:
            return float((p.get("attributes") or {}).get("reserve_in_usd") or 0)
        except (TypeError, ValueError):
            return 0.0

    return max(pools, key=_reserve)


def fetch_trades(chain_key: str, pool_address: str) -> list[dict]:
    """Pool's latest trades → normalized for clustering:
    {"wallet", "kind", "ts" (ISO str), "usd" (float), "base_token"}.
    Trades missing a required field are skipped — never guessed.
    Served from the TTL trade cache when warm (callers must not mutate)."""
    key = (chain_key, pool_address)
    cached = _trade_cache_get(key)
    if cached is not None:
        return cached
    data = _get(f"/networks/{_net(chain_key)}/pools/{pool_address}/trades")
    out: list[dict] = []
    for item in data.get("data") or []:
        a = item.get("attributes") or {}
        try:
            usd = float(a.get("volume_in_usd"))
        except (TypeError, ValueError):
            continue
        wallet, kind, ts = a.get("tx_from_address"), a.get("kind"), a.get("block_timestamp")
        if not wallet or kind not in ("buy", "sell") or not ts:
            continue
        base_token = a.get("to_token_address") if kind == "buy" else a.get("from_token_address")
        out.append({"wallet": wallet, "kind": kind, "ts": ts, "usd": usd,
                    "base_token": base_token})
    _trade_cache_put(key, out)
    return out
