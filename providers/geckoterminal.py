"""Provider GeckoTerminal — per-wallet trade feed (free, keyless).

VERIFIED live 2026-08-27 (network ids: solana, bsc, base, avax — all 200 OK):
- GET /networks/{net}/pools/{pool_address}/trades — attributes per trade:
  tx_from_address, kind ("buy"|"sell"), block_timestamp (ISO-8601 UTC),
  volume_in_usd, from_token_amount, to_token_amount,
  from_token_address, to_token_address. Buy → base token = to_token_address.
- GET /networks/{net}/tokens/{token_address}/pools — the response is NOT
  liquidity-sorted; sort it ourselves via attributes.reserve_in_usd.

PROMPT-V3 R2 probe 2026-08-31 (all keyless, all 200):
- /api/v2/networks lists hype as `hyperevm` and hood as `robinhood`;
  trending_pools + pools/{addr}/trades answer on both slugs with the same
  300-trades/page shape → the whale tape rides GT on all five chains.
- GET api.geckoterminal.com/api/v1/search/pools?query={CA} resolves a
  contract to its pools per network (AUTO mode), url carries
  /networks/{slug}/pools/{pool} so the pool address needs no second call.
- Rate limit is undocumented ("Beta, subject to changes") → _get honors
  Retry-After once on 429, and every list feed here carries a TTL cache.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

BASE = "https://api.geckoterminal.com/api/v2"
SEARCH_BASE = "https://api.geckoterminal.com/api/v1"

NETWORKS = {"sol": "solana", "bnb": "bsc", "base": "base",
            "hype": "hyperevm", "hood": "robinhood"}
# hype/hood added 2026-08-31 — R2 probe (module docstring). "avax" stays
# parked 2026-08-30 (founder: 5-chain lineup; re-add to re-enable).
_SLUG_TO_CHAIN = {v: k for k, v in NETWORKS.items()}

# Free tier is ~10 calls/min — small TTL caches keep a warm scan at zero GT
# calls without serving meaninglessly stale per-wallet data.
TRADE_CACHE_TTL_S = 90.0
TRADE_CACHE_MAX = 64
TREND_TTL_S = 300.0          # trending pools + native price drift slowly
SEARCH_TTL_S = 120.0
SEARCH_CACHE_MAX = 64

# (chain_key, pool_address) → (monotonic_ts, trades)
_trade_cache: dict[tuple[str, str], tuple[float, list[dict]]] = {}
# (chain_key, include) → (monotonic_ts, raw trending payload)
_trend_cache: dict[tuple[str, bool], tuple[float, dict]] = {}
# query → (monotonic_ts, hits)
_search_cache: dict[str, tuple[float, list[dict]]] = {}


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
    not serve so callers degrade honestly instead of KeyError."""
    if chain_key not in NETWORKS:
        raise ValueError(f"geckoterminal: no network for chain {chain_key!r} "
                         f"(live: {', '.join(sorted(NETWORKS))})")
    return NETWORKS[chain_key]


def _get_url(url: str) -> dict:
    """One GET against GT with a single Retry-After-aware retry on 429 —
    the free tier is ~10 calls/min and the docs state no hard number, so
    backoff is the only honest response (R2 mandate guard)."""
    for attempt in (1, 2):
        req = urllib.request.Request(url, headers={
            "User-Agent": "vilmei/2.0", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=12) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt == 1:
                delay = e.headers.get("Retry-After")
                time.sleep(min(float(delay), 5.0) if delay and delay.replace(
                    ".", "", 1).isdigit() else 2.0)
                continue
            raise


def _get(path: str) -> dict:
    """One v2-API GET by BASE-relative path — the seam market.py, live.py
    and discovery.py have called since before R2."""
    return _get_url(f"{BASE}{path}")


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


def _normalize_trade(item: dict) -> dict | None:
    """One GT trade item → the normalized row; None when a required field is
    missing — never guessed."""
    a = item.get("attributes") or {}
    try:
        usd = float(a.get("volume_in_usd"))
    except (TypeError, ValueError):
        return None
    wallet, kind, ts = a.get("tx_from_address"), a.get("kind"), a.get("block_timestamp")
    if not wallet or kind not in ("buy", "sell") or not ts:
        return None
    base_token = a.get("to_token_address") if kind == "buy" else a.get("from_token_address")
    return {"wallet": wallet, "kind": kind, "ts": ts, "usd": usd,
            "tx": a.get("tx_hash"), "base_token": base_token}


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
    out = [t for item in data.get("data") or []
           if (t := _normalize_trade(item)) is not None]
    _trade_cache_put(key, out)
    return out


def _ts_epoch(ts: str) -> float | None:
    try:
        return datetime.fromisoformat(ts).timestamp()
    except (TypeError, ValueError):
        return None


def fetch_trades_window(chain_key: str, pool_address: str,
                        within_s: float = 86400.0,
                        max_pages: int = 3) -> tuple[list[dict], int]:
    """The pool's tape walked back up to `within_s` (never deeper — GT pages
    older than the window cost calls without content). Returns (trades,
    pages_fetched). Pagination stops early once a page's oldest trade is
    already outside the window; a cap on pages guards the ~10 calls/min
    free tier. Warm reads reuse the single-page trade cache for page 1."""
    net = _net(chain_key)
    cutoff = time.time() - within_s
    out: list[dict] = []
    pages = 0
    for page in range(1, max_pages + 1):
        if page == 1:
            page_trades = fetch_trades(chain_key, pool_address)
        else:
            data = _get(f"/networks/{net}/pools/{pool_address}/trades?page={page}")
            page_trades = [t for item in data.get("data") or []
                           if (t := _normalize_trade(item)) is not None]
        pages += 1
        if not page_trades:
            break
        oldest = None
        for t in page_trades:
            e = _ts_epoch(t["ts"])
            if e is None:
                continue
            if e >= cutoff:
                out.append(t)
            if oldest is None or e < oldest:
                oldest = e
        if oldest is not None and oldest < cutoff:
            break                       # tape walked past the window edge
        if len(page_trades) < 300:
            break                       # short page = tape exhausted
    out.sort(key=lambda t: t["ts"], reverse=True)
    return out, pages


def search_pools(query: str) -> list[dict]:
    """GT v1 pool search — a CA or name → candidate pools across networks.
    Each hit: {chain, network, pool, name, liquidity_usd, volume_24h,
    price_usd}; hits GT cannot map to one of our chains are dropped."""
    q = query.strip().lower()
    hit = _search_cache.get(q)
    if hit and time.monotonic() - hit[0] < SEARCH_TTL_S:
        return hit[1]
    data = _get_url(f"{SEARCH_BASE}/search/pools?query={urllib.parse.quote(q)}")
    out: list[dict] = []
    for h in data.get("data") or []:
        url = h.get("url") or ""
        # url shape: https://www.geckoterminal.com/{slug}/pools/{pool}
        parts = url.rstrip("/").split("/")
        if "pools" not in parts:
            continue
        i = parts.index("pools")
        if i < 1 or i + 1 >= len(parts):
            continue
        chain = _SLUG_TO_CHAIN.get(parts[i - 1])
        if chain is None:
            continue
        try:
            liq = float(h.get("liquidity")) if h.get("liquidity") is not None else None
        except (TypeError, ValueError):
            liq = None
        try:
            vol = float(h.get("volume_24h")) if h.get("volume_24h") is not None else None
        except (TypeError, ValueError):
            vol = None
        try:
            px = float(h.get("base_token_price_usd")) if h.get("base_token_price_usd") is not None else None
        except (TypeError, ValueError):
            px = None
        out.append({"chain": chain, "network": parts[i - 1], "pool": parts[i + 1],
                    "name": h.get("name"), "liquidity_usd": liq,
                    "volume_24h": vol, "price_usd": px})
    now = time.monotonic()
    for k in [k for k, (t, _) in _search_cache.items() if now - t >= SEARCH_TTL_S]:
        del _search_cache[k]
    while len(_search_cache) >= SEARCH_CACHE_MAX:
        del _search_cache[min(_search_cache, key=lambda k: _search_cache[k][0])]
    _search_cache[q] = (now, out)
    return out


def fetch_trending(chain_key: str, include_tokens: bool = False) -> dict:
    """The network's trending pools (raw payload, 300s cache). include_tokens
    adds the base/quote token resources — the native-price path reads quote
    symbols from it (WHYPE on hype, WETH on hood)."""
    key = (chain_key, include_tokens)
    hit = _trend_cache.get(key)
    if hit and time.monotonic() - hit[0] < TREND_TTL_S:
        return hit[1]
    q = "?include=base_token,quote_token" if include_tokens else ""
    data = _get(f"/networks/{_net(chain_key)}/trending_pools{q}")
    now = time.monotonic()
    for k in [k for k, (t, _) in _trend_cache.items() if now - t >= TREND_TTL_S]:
        del _trend_cache[k]
    _trend_cache[key] = (now, data)
    return data


# wrapped-native quote symbols per frontier chain (R2 probe 2026-08-31:
# hype pools quote WHYPE @ the HYPE price; robinhood pools quote WETH)
_NATIVE_QUOTE = {"hype": "WHYPE", "hood": "WETH"}


def native_price_usd(chain_key: str) -> float | None:
    """Live native-token price for hype/hood, taken from a trending pool
    whose quote IS the wrapped native (quote_token_price_usd, verbatim).
    None when no such pool trends — callers carry the fallback honestly."""
    if chain_key not in _NATIVE_QUOTE:
        return None
    want = _NATIVE_QUOTE[chain_key]
    try:
        data = fetch_trending(chain_key, include_tokens=True)
    except Exception:  # noqa: BLE001 — a price failure is a None, never a 500
        return None
    inc = {x.get("id"): (x.get("attributes") or {})
           for x in data.get("included") or []}
    for p in data.get("data") or []:
        rel = p.get("relationships") or {}
        qid = ((rel.get("quote_token") or {}).get("data") or {}).get("id")
        if (inc.get(qid) or {}).get("symbol") != want:
            continue
        try:
            return float((p.get("attributes") or {}).get("quote_token_price_usd"))
        except (TypeError, ValueError):
            continue
    return None
