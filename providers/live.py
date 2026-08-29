"""Live feed (G.7): 6 chains × 4 modes from GeckoTerminal — keyless only.

Stage-0 verified 2026-08-29 against api.geckoterminal.com/api/v2:
- /networks (3 pages, 248 ids): solana, bsc, base, hyperevm, robinhood, avax
  all exist → every founder-locked chain is live today. `live` stays in the
  contract for the day a network disappears — that chain then answers
  live:false with an empty item list, never fabricated data.
- volume source: /networks/{id}/pools?sort=h24_volume_usd_desc — sort honored
  (monotonic-decreasing h24 volume) on all five sampled networks.
- include=base_token → included[] token objects (symbol/name/image_url),
  verified on all three source endpoints; some tokens genuinely lack
  image_url → absent stays absent.
- dex ids are observed-only (LAUNCHPAD map below); unknown id → None.
- GT free tier is ~10 calls/min and 429s are real (observed): the TTL cache
  below is ≥120s per (chain, source); alpha re-ranks the volume feed and
  therefore makes ZERO extra API calls.
"""
from __future__ import annotations

import math
import time
from datetime import UTC, datetime

from providers import geckoterminal as gt

# Founder-locked display order (2026-08-29).
CHAINS: dict[str, dict] = {
    "sol":  {"network_id": "solana",   "live": True},
    "bnb":  {"network_id": "bsc",      "live": True},
    "base": {"network_id": "base",     "live": True},
    "hype": {"network_id": "hyperevm", "live": True},
    "hood": {"network_id": "robinhood", "live": True},
    "avax": {"network_id": "avax",     "live": True},
}

MODES = ("new", "trending", "volume", "alpha")

LIMIT_MAX = 50

# dex_id → badge label, from live GT observations ONLY (no guessing): verbatim
# slug unless the canonical name is unambiguous (pump-fun → pump.fun, the
# pancake/uniswap version slugs → their brand). Unknown dex_id → None.
LAUNCHPAD: dict[str, str] = {
    "pump-fun": "pump.fun", "pumpswap": "pumpswap", "raydium": "raydium",
    "meteora": "meteora", "zerofi": "zerofi", "orca": "orca",
    "pancakeswap_v2": "pancakeswap", "pancakeswap-v3-base": "pancakeswap",
    "uniswap-v2-robinhood": "uniswap", "uniswap-v3-base": "uniswap",
    "uniswap-v4-base": "uniswap", "uniswap-v3-avalanche": "uniswap",
    "uniswap-v3-robinhood": "uniswap", "uniswap-v4-robinhood": "uniswap",
    "aerodrome-slipstream-3": "aerodrome", "pharaoh-exchange-v3": "pharaoh",
    "traderjoe-v2-2-avalanche": "traderjoe", "blackhole-v3": "blackhole",
    "project-x": "project-x", "nest": "nest",
    "ring-exchange-hyperevm": "ring-exchange", "giga-v3": "giga",
    "pons-v2": "pons", "uniswap-pools-trade": "uniswap-pools-trade",
}

# alpha ranking weights (documented, deterministic, zero extra API calls):
# volume 40% · txns 25% · liquidity 20% · freshness 15%. A missing component
# contributes 0 — never fabricated. Ties break by h24 volume desc, then by
# stable source order.
ALPHA_WEIGHTS = {"volume": 0.40, "txns": 0.25, "liquidity": 0.20, "age": 0.15}

FEED_CACHE_TTL_S = 120.0  # mandatory floor — upstream 429s observed in Stage 0
FEED_CACHE_MAX = 32       # 6 chains × 3 sources = 18 keys; cap anyway

FIELDS = ("pool_address", "token_symbol", "token_name", "pair", "logo",
          "price_usd", "volume_24h", "change_24h", "liquidity_usd",
          "txns_24h", "fdv_usd", "created_at", "dex_id", "launchpad")

# (chain, source_mode) → (monotonic_ts, raw GT payload)
_feed_cache: dict[tuple[str, str], tuple[float, dict]] = {}


def _clamp(limit: int) -> int:
    return max(1, min(int(limit), LIMIT_MAX))


def _net(chain: str) -> str:
    info = CHAINS.get(chain)
    if info is None:
        raise ValueError(f"live: unknown chain {chain!r} — pick {'|'.join(CHAINS)}")
    if not info["live"] or not info["network_id"]:
        raise ValueError(f"live: chain {chain!r} has no GeckoTerminal network")
    return info["network_id"]


def _source_mode(mode: str) -> str:
    """alpha re-ranks the volume feed — shares its fetch and cache entry."""
    return "volume" if mode == "alpha" else mode


def _path(chain: str, source: str) -> str:
    net = _net(chain)
    if source == "new":
        return f"/networks/{net}/new_pools?include=base_token"
    if source == "trending":
        return f"/networks/{net}/trending_pools?include=base_token"
    return f"/networks/{net}/pools?sort=h24_volume_usd_desc&include=base_token"


def _cache_put(key: tuple[str, str], raw: dict) -> None:
    """Drop expired entries first, then the oldest beyond the cap — the cache
    must never grow without bound (server._cache_put pattern)."""
    now = time.monotonic()
    expired = [k for k, (t, _) in _feed_cache.items() if now - t >= FEED_CACHE_TTL_S]
    for k in expired:
        del _feed_cache[k]
    while len(_feed_cache) >= FEED_CACHE_MAX:
        del _feed_cache[min(_feed_cache, key=lambda k: _feed_cache[k][0])]
    _feed_cache[key] = (now, raw)


def _included_tokens(raw: dict) -> dict[str, dict]:
    return {e.get("id"): (e.get("attributes") or {})
            for e in (raw.get("included") or []) if e.get("type") == "token"}


def _txns_24h(a: dict) -> int | None:
    h = (a.get("transactions") or {}).get("h24") or {}
    b, s = h.get("buys"), h.get("sells")
    if isinstance(b, (int, float)) and isinstance(s, (int, float)):
        return int(b + s)
    return None


def _normalize(raw: dict, limit: int) -> list[dict]:
    """Flatten GT pool objects to feed items; copy only what the API returned.
    Numbers stay the API's own strings; txns_24h is the one derived value
    (buys+sells, both required). Items without a pair name are dropped."""
    toks = _included_tokens(raw)
    out = []
    for e in raw.get("data", [])[:_clamp(limit)]:
        a = e.get("attributes") or {}
        rel = e.get("relationships") or {}
        bt = ((rel.get("base_token") or {}).get("data") or {}).get("id")
        ta = toks.get(bt) or {}
        dex_id = ((rel.get("dex") or {}).get("data") or {}).get("id")
        out.append({
            "pool_address": a.get("address") or (e.get("id", "").split("_", 1)[-1] or None),
            "token_symbol": ta.get("symbol"),
            "token_name": ta.get("name"),
            "pair": a.get("name"),
            "logo": ta.get("image_url"),
            "price_usd": a.get("base_token_price_usd"),
            "volume_24h": (a.get("volume_usd") or {}).get("h24"),
            "change_24h": (a.get("price_change_percentage") or {}).get("h24"),
            "liquidity_usd": a.get("reserve_in_usd"),
            "txns_24h": _txns_24h(a),
            "fdv_usd": a.get("fdv_usd"),
            "created_at": a.get("pool_created_at"),
            "dex_id": dex_id,
            "launchpad": LAUNCHPAD.get(dex_id) if dex_id else None,
        })
    return [i for i in out if i["pair"]]


def _f(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _age_hours(created_at, now: datetime | None = None) -> float | None:
    if not created_at:
        return None
    try:
        dt = datetime.fromisoformat(str(created_at))  # py>=3.11 parses "Z" directly
    except ValueError:
        return None
    ref = now or datetime.now(UTC)
    return max(0.0, (ref - dt).total_seconds() / 3600.0)


def _alpha_score(item: dict, now: datetime | None = None) -> float:
    """Pure and deterministic (inject `now` for tests). Each normalized
    contribution is capped at 1.0; a missing component contributes 0:
    volume log10(1+v24)/8 (≈$100M → 1) · txns log10(1+t24)/3 (≈1k → 1) ·
    liquidity min(liq, 100k)/100k · freshness max(0, 1 − age_h/168) (1 week)."""
    w = ALPHA_WEIGHTS
    vol = _f(item.get("volume_24h"))
    t = item.get("txns_24h")
    liq = _f(item.get("liquidity_usd"))
    age = _age_hours(item.get("created_at"), now)
    s = w["volume"] * min(math.log10(1 + max(vol, 0.0)) / 8.0, 1.0)
    s += w["txns"] * (min(math.log10(1 + t) / 3.0, 1.0) if t else 0.0)
    s += w["liquidity"] * (min(liq, 100_000) / 100_000 if liq > 0 else 0.0)
    s += w["age"] * (max(0.0, 1.0 - age / 168.0) if age is not None else 0.0)
    return s


def _alpha_rank(items: list[dict], now: datetime | None = None) -> list[dict]:
    """Score desc → volume desc (stable tie-break) → stable source order."""
    return sorted(items, key=lambda i: (-_alpha_score(i, now), -_f(i.get("volume_24h"))))


def get_feed(chain: str, mode: str, limit: int = 20) -> tuple[list[dict], dict]:
    """→ (items, {"cached": bool, "stale": bool}).

    cached=True  — served from the ≥120s TTL cache (no upstream call).
    stale=True   — the upstream refresh failed and the expired entry was
                   served instead (honest flag, never silent). No cache to
                   fall back on → the error propagates (route answers 502).
    alpha ranks the FULL page before slicing, so re-ranking is not clipped
    by the caller's limit."""
    if mode not in MODES:
        raise ValueError(f"live: bad mode {mode!r} — pick {'|'.join(MODES)}")
    _net(chain)  # raises for unknown / not-live chains before any I/O
    limit = _clamp(limit)
    key = (chain, _source_mode(mode))
    now = time.monotonic()
    hit = _feed_cache.get(key)
    if hit and now - hit[0] < FEED_CACHE_TTL_S:
        raw, cached, stale = hit[1], True, False
    else:
        try:
            raw = gt._get(_path(chain, _source_mode(mode)))
            _cache_put(key, raw)
            cached, stale = False, False
        except Exception:
            if hit is None:
                raise
            raw, cached, stale = hit[1], True, True
    items = _normalize(raw, LIMIT_MAX)
    if mode == "alpha":
        items = _alpha_rank(items)
    return items[:limit], {"cached": cached, "stale": stale}
