"""Provider market surface (PROMPT-V Fase 3/4): OHLCV candles, token socials,
and chain auto-detect — all $0 keyless upstreams (GeckoTerminal + DexScreener).

PROBE-FIRST evidence (2026-08-30, founder law):
- GT OHLCV /networks/{net}/pools/{addr}/ohlcv/{day|hour|minute}?aggregate=N
  → data.attributes.ohlcv_list = [[ts,o,h,l,c,v], …] (ts unix seconds, newest
  first) + meta.base/quote {name,symbol,address}. "minute15" is an INVALID
  timeframe (400) — the aggregate query param carries the bucket size.
- DS /tokens/v1/{chainId}/{tokenAddress} → pairs[] with info.{imageUrl,header,
  openGraph,websites[{url,label}],socials[{url,type:twitter|telegram|discord}]}.
  Keyed by TOKEN address only — a pair address answers 0 pairs (probed).
- DS /latest/dex/search?q= → pairs across chains (CAKE → 22×bsc, AERO → 19×base
  +1×robinhood, BONK → 20×solana): cross-chain ambiguity is real → detect
  returns per-chain candidates, never a silent single default.
- GT /api/v2/search does NOT exist (404 HTML page, probed) → detect uses the
  DS search uniformly; solana is covered by the same DS search (probe).
- DS chain slugs verified: solana, bsc, base, robinhood, hyperevm (the last
  two already shipped in frontend services + GT network ids).
"""
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request

from providers import dexscreener, live
from providers import geckoterminal as gt

# DS chainId per founder chain — DS-search/tokens slugs (verified, see docstring)
DS_CHAINS = {"sol": "solana", "bnb": "bsc", "base": "base", "hype": "hyperevm",
             "hood": "robinhood"}

# chart resolutions → GT (timeframe, aggregate). Probed set: day/hour/minute.
RESOLUTIONS: dict[str, tuple[str, int]] = {
    "1m": ("minute", 1), "5m": ("minute", 5), "15m": ("minute", 15),
    "1h": ("hour", 1), "4h": ("hour", 4), "1d": ("day", 1), "1w": ("day", 7),
}
OHLCV_LIMIT_MAX = 1000  # GT hard cap
OHLCV_TTL_S = 60.0      # candles churn fast enough to matter, slow enough to cache
SOCIALS_TTL_S = 300.0   # links change rarely (same 1h spirit as live.py socials)
DETECT_TTL_S = 60.0     # feeds move; a stale candidate set is worse than a re-fetch

# keyed caches — every one is size-capped like server._cache_put (never grows
# without bound)
_ohlcv_cache: dict[tuple[str, str, str], tuple[float, dict]] = {}
_socials_cache: dict[tuple[str, str], tuple[float, dict]] = {}
_detect_cache: dict[str, tuple[float, dict]] = {}
_CACHE_MAX = 512


def _cache_put(store: dict, key, ttl: float, value: dict) -> None:
    now = time.monotonic()
    expired = [k for k, (t, _) in store.items() if now - t >= ttl]
    for k in expired:
        del store[k]
    while len(store) >= _CACHE_MAX:
        del store[min(store, key=lambda k: store[k][0])]
    store[key] = (now, value)


def _cache_get(store: dict, key, ttl: float) -> tuple[dict, float] | None:
    hit = store.get(key)
    if not hit or time.monotonic() - hit[0] >= ttl:
        return None
    return hit[1], time.monotonic() - hit[0]


def _fetch_gt(path: str) -> dict:
    return gt._get(path)


def _fetch_ds(path: str) -> dict:
    req = urllib.request.Request(f"https://api.dexscreener.com{path}",
                                 headers={"User-Agent": "vilmei/2.0"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)


# ── OHLCV (Fase 4: chart/volume/indicators source) ─────────────────────────

def ohlcv(chain: str, pair: str, resolution: str, limit: int = 200) -> dict:
    """GT candles for a pool. Returns candles oldest→newest (chart order),
    verbatim floats — no rounding, no gap-filling (absent stays absent)."""
    if chain not in live.CHAINS or not live.CHAINS[chain].get("live"):
        raise ValueError(f"ohlcv: chain {chain!r} is not live on GeckoTerminal")
    if resolution not in RESOLUTIONS:
        raise ValueError(f"ohlcv: resolution must be {'|'.join(RESOLUTIONS)}")
    pair = (pair or "").strip()
    if not pair:
        raise ValueError("ohlcv: pair address is required")
    limit = max(1, min(int(limit), OHLCV_LIMIT_MAX))

    key = (chain, pair.lower(), resolution)
    hit = _cache_get(_ohlcv_cache, key, OHLCV_TTL_S)
    if hit:
        payload, age = hit
        payload = {**payload, "cache": {**payload["cache"], "cached": True, "age_s": round(age)}}
        return payload

    tf, agg = RESOLUTIONS[resolution]
    net = live.CHAINS[chain]["network_id"]
    path = (f"/networks/{net}/pools/{pair}/ohlcv/{tf}"
            f"?aggregate={agg}&limit={limit}&currency=usd")
    raw = _fetch_gt(path)
    rows = (((raw.get("data") or {}).get("attributes") or {}).get("ohlcv_list")) or []
    candles = [{"ts": int(r[0]), "o": float(r[1]), "h": float(r[2]),
                "l": float(r[3]), "c": float(r[4]), "v": float(r[5])}
               for r in rows if len(r) >= 6]
    base = ((raw.get("meta") or {}).get("base") or {})
    now = time.time()
    last_ts = candles[-1]["ts"] if candles else None
    payload = {
        "chain": chain, "network_id": net, "pair": pair,
        "resolution": resolution, "timeframe": tf, "aggregate": agg,
        "candles": list(reversed(candles)),  # oldest→newest
        "base_token": {"symbol": base.get("symbol"), "name": base.get("name"),
                       "address": base.get("address")} if base else None,
        "cache": {"cached": False, "age_s": None, "ttl_s": int(OHLCV_TTL_S)},
        "freshness": {"last_candle_ts": last_ts,
                      "last_candle_age_s": round(now - last_ts) if last_ts else None,
                      "timezone": "UTC"},
        "degraded": None if candles else "geckoterminal returned no candles for this pool/resolution",
    }
    _cache_put(_ohlcv_cache, key, OHLCV_TTL_S, payload)
    return payload


# ── socials (Fase 4: SOCIALS tab — real links or honest absence) ───────────

def socials(chain: str, token: str) -> dict:
    """DS token info for a TOKEN address (CA). A pair address answers nothing
    upstream (probed) — callers pass the token CA from the active pair."""
    if chain not in DS_CHAINS:
        raise ValueError(f"socials: chain must be {'|'.join(DS_CHAINS)}")
    token = (token or "").strip()
    if not token:
        raise ValueError("socials: token address is required")

    key = (chain, token.lower())
    hit = _cache_get(_socials_cache, key, SOCIALS_TTL_S)
    if hit:
        payload, age = hit
        payload = {**payload, "cache": {**payload["cache"], "cached": True, "age_s": round(age)}}
        return payload

    raw = _fetch_ds(f"/tokens/v1/{DS_CHAINS[chain]}/{token}")
    pairs = raw if isinstance(raw, list) else (raw.get("pairs") or [])
    best = dexscreener.best_pair([p for p in pairs if p.get("chainId") == DS_CHAINS[chain]])
    info = (best or {}).get("info") or {}
    payload = {
        "chain": chain, "token": token,
        "image_url": info.get("imageUrl"),
        "header_url": info.get("header"),
        "websites": [{"url": w.get("url"), "label": w.get("label")}
                     for w in (info.get("websites") or []) if w.get("url")],
        "links": [{"url": s.get("url"), "type": s.get("type")}
                  for s in (info.get("socials") or []) if s.get("url")],
        "pair_address": (best or {}).get("pairAddress"),
        "dex_id": (best or {}).get("dexId"),
        "liquidity_usd": ((best or {}).get("liquidity") or {}).get("usd"),
        "cache": {"cached": False, "age_s": None, "ttl_s": int(SOCIALS_TTL_S)},
        "freshness": {"source": "dexscreener token-pairs info"},
        "degraded": None if best else "no pair found for this token in the dexscreener feed",
    }
    _cache_put(_socials_cache, key, SOCIALS_TTL_S, payload)
    return payload


# ── detect (Fase 3: CA/ticker → per-chain candidates) ──────────────────────

_BASE58_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")
_EVM_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
_TICKER_RE = re.compile(r"^\$?[A-Za-z0-9]{1,24}$")


def classify(query: str) -> str:
    """Local classify shared with the FE test: base58 → solana-shaped, 0x →
    EVM-ambiguous (bnb/base/hype/hood), else ticker. 'invalid' = reject."""
    q = (query or "").strip()
    if _BASE58_RE.match(q):
        return "base58"
    if _EVM_RE.match(q):
        return "evm-ambiguous"
    if _TICKER_RE.match(q):
        return "ticker"
    return "invalid"


def detect(query: str) -> dict:
    """Per-chain candidate pairs for a pasted CA or ticker. One candidate per
    founder chain (deepest pool), sorted by liquidity desc — NEVER a silent
    single default (the Fase-1 identity bug, inverted)."""
    q = (query or "").strip()
    kind = classify(q)
    if kind == "invalid":
        raise ValueError("detect: paste a token address (CA) or $TICKER (1-24 chars)")

    key = q.lower()
    hit = _cache_get(_detect_cache, key, DETECT_TTL_S)
    if hit:
        payload, age = hit
        payload = {**payload, "cache": {**payload["cache"], "cached": True, "age_s": round(age)}}
        return payload

    if kind == "ticker":
        raw = _fetch_ds(f"/latest/dex/search?q={urllib.parse.quote(q.lstrip('$'))}")
        pairs = raw.get("pairs") or []
    else:
        # address lookup: one DS call answers for every chain at once (probed)
        raw = _fetch_ds(f"/latest/dex/tokens/{q}")
        pairs = raw.get("pairs") or []
        q_lower = q.lower()
        pairs = [p for p in pairs
                 if ((p.get("baseToken") or {}).get("address") or "").lower() == q_lower
                 or ((p.get("quoteToken") or {}).get("address") or "").lower() == q_lower]

    # keep the deepest pair per founder chain — the honest candidate set
    best_by_chain: dict[str, dict] = {}
    for p in pairs:
        cid = p.get("chainId")
        if cid not in DS_CHAINS.values():
            continue
        cur = best_by_chain.get(cid)
        if cur is None or ((p.get("liquidity") or {}).get("usd") or 0) > \
                ((cur.get("liquidity") or {}).get("usd") or 0):
            best_by_chain[cid] = p
    chain_keys = {v: k for k, v in DS_CHAINS.items()}
    candidates = [{
        "chain": chain_keys[cid],
        "chain_id": cid,
        "symbol": ((p.get("baseToken") or {}).get("symbol")),
        "name": ((p.get("baseToken") or {}).get("name")),
        "token_address": (p.get("baseToken") or {}).get("address"),
        "pair_address": p.get("pairAddress"),
        "dex_id": p.get("dexId"),
        "liquidity_usd": (p.get("liquidity") or {}).get("usd"),
        "price_usd": p.get("priceUsd"),
        "url": p.get("url"),
    } for cid, p in best_by_chain.items()]
    candidates.sort(key=lambda c: c["liquidity_usd"] or 0, reverse=True)

    payload = {
        "query": q, "kind": kind, "candidates": candidates,
        "cache": {"cached": False, "age_s": None, "ttl_s": int(DETECT_TTL_S)},
        "freshness": {"chains_searched": sorted(DS_CHAINS.values())},
        "degraded": None if candidates else \
            "no pair found on the five live feeds for this query",
    }
    _cache_put(_detect_cache, key, DETECT_TTL_S, payload)
    return payload
