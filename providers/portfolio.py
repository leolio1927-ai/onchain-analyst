"""PROMPT-V4 M4 — portfolio snapshot: public market facts for a watchlist.

Positions (amounts) live client-side in vilmei.watchlist; the server answers
only what GeckoTerminal actually says about each token's deepest pool —
price, liquidity, 24h volume, 24h change — verbatim, never imputed. A token
with no pool is a sentence, a 429 is a rate_limited row; both are honest
states, never red, never fake zeros. Every fetch rides the M1 governance
(TTL cache + single-flight + capped backoff) — a 15-item watchlist costs at
most 15 upstream calls per TTL window, usually 0.
"""
from __future__ import annotations

import math

from . import geckoterminal as gt

MAX_ITEMS = 15


def _num(v: object) -> float | None:
    try:
        f = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f           # NaN is absent, not zero


def _row(chain: str, token: str) -> dict:
    try:
        pools = gt.fetch_pools(chain, token)
    except Exception as e:                          # noqa: BLE001 — upstream states are rows
        if gt.is_rate_limited(e):
            return {"chain": chain, "token": token, "status": "rate_limited",
                    "note": ("portfolio:rate_limited — GeckoTerminal 429 on the pool "
                             "lookup; retry after the free-tier window (~60s)")}
        return {"chain": chain, "token": token, "status": "upstream_error",
                "note": f"portfolio:upstream_error — {str(e)[:120]}"}
    pool = gt.best_pool(pools)
    if pool is None:
        return {"chain": chain, "token": token, "status": "no_pool",
                "note": (f"portfolio:no_pool — GT lists no pool for this contract "
                         f"on {chain} (fact, not an error)")}
    a = pool.get("attributes") or {}
    vol = a.get("volume_usd") or {}
    chg = a.get("price_change_percentage") or {}
    return {
        "chain": chain, "token": token, "status": "ok",
        "pool": a.get("address"),
        "pool_name": a.get("name"),
        "price_usd": _num(a.get("base_token_price_usd")),
        "liquidity_usd": _num(a.get("reserve_in_usd")),
        "volume_24h": _num(vol.get("h24")) if isinstance(vol, dict) else None,
        "change_24h": _num(chg.get("h24")) if isinstance(chg, dict) else None,
    }


def snapshot(items: list[tuple[str, str]]) -> dict:
    """One market-facts row per (chain, token); the order is the caller's."""
    rows = [_row(c, t) for c, t in items]
    rate_limited = [f"{r['chain']}:{r['token']}" for r in rows
                    if r["status"] == "rate_limited"]
    return {
        "data_mode": "live",
        "sources": ["geckoterminal"],
        "rows": rows,
        "rate_limited": rate_limited,
        "pools_walked": sum(1 for r in rows if r["status"] == "ok"),
        "data_sources": [r["note"] for r in rows if r.get("note")],
    }
