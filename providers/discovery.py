"""Keyless discovery feed: trending & new pools via GeckoTerminal (free).

Live-verified 2026-08-28 against api.geckoterminal.com/api/v2 (free tier
~10 calls/min, https://www.geckoterminal.com/dex-api):
- GET /networks/{net}/trending_pools — hottest pools by 24h volume
- GET /networks/{net}/new_pools — fresh deployments (early-warning feed)
GT puts the dex id at relationships.dex.data.id (attributes.dex is always
absent) and does not honor page_size on these endpoints, so the limit is
applied client-side after normalization. Only fields the API actually
returned are copied — absent stays absent (None), never zero-filled.
"""
from __future__ import annotations

import asyncio

from providers import geckoterminal as gt

LIMIT_MAX = 50  # request-side clamp; the upstream page currently yields ~20

FIELDS = ("pool_address", "pair", "dex", "price_usd", "volume_24h",
          "change_24h", "fdv_usd", "created_at")


def _clamp(limit: int) -> int:
    """Bound the caller's limit to 1..LIMIT_MAX — a garbage limit must not
    turn into a giant slice request or a silent empty feed."""
    return max(1, min(int(limit), LIMIT_MAX))


def _normalize(raw: dict, limit: int) -> list[dict]:
    """Flatten Gecko pools to feed items; copy only fields the API returned."""
    out = []
    for e in raw.get("data", [])[:_clamp(limit)]:
        a = e.get("attributes") or {}
        dex = (((e.get("relationships") or {}).get("dex") or {})
               .get("data") or {}).get("id")
        out.append({
            "pool_address": e.get("id", "").split("_", 1)[-1] or None,
            "pair": a.get("name"),
            "dex": dex,
            "price_usd": a.get("base_token_price_usd"),
            "volume_24h": (a.get("volume_usd") or {}).get("h24"),
            "change_24h": (a.get("price_change_percentage") or {}).get("h24"),
            "fdv_usd": a.get("fdv_usd"),
            "created_at": a.get("pool_created_at"),
        })
    return [i for i in out if i["pair"]]


async def trending_pools(chain_key: str, limit: int = 20) -> list[dict]:
    """Hottest pools by volume — the radar default view."""
    raw = await asyncio.to_thread(gt._get, f"/networks/{gt._net(chain_key)}/trending_pools")
    return _normalize(raw, limit)


async def new_pools(chain_key: str, limit: int = 20) -> list[dict]:
    """Fresh deployments — memecoin early-warning feed."""
    raw = await asyncio.to_thread(gt._get, f"/networks/{gt._net(chain_key)}/new_pools")
    return _normalize(raw, limit)
