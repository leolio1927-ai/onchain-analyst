"""VILMEI web — FastAPI backend serving the React frontend + read-only JSON API.

Boundary (work notes §4): this layer only orchestrates providers → heuristics →
ai_analyst → access. It never touches ui/ (TUI) and never exposes raw provider
freedom to the client: /api/explain re-fetches and re-assesses SERVER-SIDE so a
client can never forge evidence. All network provider calls are blocking urllib —
always wrapped in asyncio.to_thread.

Run: uv run python -m webapp [--host 127.0.0.1] [--port 8000]
Frontend: cd frontend && npm install && npm run build  → served from frontend/dist
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import math
import os
import re
import sys
import time
import urllib.error
from collections import defaultdict, deque
from datetime import UTC, datetime
from pathlib import Path

import fastapi
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    RedirectResponse,
    Response,
)
from pydantic import BaseModel

import ai_analyst
from access import token_gate
from heuristics import clustering, rug_check
from providers import (
    chains_map,
    dexscreener,
    discovery,
    fee_models,
    geckoterminal,
    goplus,
    helius,
    live,
    market,
    rugcheck,
    whale_windows,
    whales,
)
from webapp import chains, db, mcp, schemas
from webapp import lineage as lineage_mod

CACHE_TTL_S = 30.0
SCAN_CACHE_MAX = 512  # hard cap — every /api/scan key would otherwise live forever (memory DoS)

_ADDRESS_RES = {
    "sol": re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$"),
    "bnb": re.compile(r"^0x[a-fA-F0-9]{40}$"),
    "base": re.compile(r"^0x[a-fA-F0-9]{40}$"),
    # "avax" parked 2026-08-30 (founder: 5-chain lineup)
}

# (chain, address) → (monotonic_ts, response). Tiny TTL cache so /api/explain
# re-fetching evidence does not burn DexScreener's free rate limit.
_scan_cache: dict[tuple[str, str], tuple[float, dict]] = {}

# per-IP sliding window for the AI endpoint (keys cost founder money)
_ai_hits: dict[str, deque[float]] = defaultdict(deque)


def _ai_rate_limits() -> tuple[int, int]:
    return (int(os.environ.get("ALPHA_AI_RATELIMIT_HOURLY", "5")),
            int(os.environ.get("ALPHA_AI_RATELIMIT_DAILY", "30")))


def _dist_dir() -> Path:
    return Path(os.environ.get("ALPHA_DIST_DIR", "frontend/dist"))


class ScanBody(BaseModel):
    chain: str
    address: str
    refresh: bool = False  # /cluster semantics: bypass TTL cache, force fresh fetch


class ExplainBody(BaseModel):
    chain: str
    address: str
    provider: str = "claude"


class WhaleBody(BaseModel):
    address: str


def _apply_cors(app: FastAPI) -> None:
    """CORS is opt-in for split FE/BE hosting: CORS_ALLOW_ORIGINS is a comma
    list of origins (e.g. "https://alpha.example.com,https://alpha.pages.dev").
    Empty/unset = no middleware — the same-origin reverse-proxy deploy needs none."""
    origins = [o.strip() for o in os.environ.get("CORS_ALLOW_ORIGINS", "").split(",") if o.strip()]
    if not origins:
        return
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-API-Key"],
    )


APP_VERSION = "0.1.0"

_DESCRIPTION = """Read-only multichain memecoin research terminal — reduce noise, add context.

- **POST /api/scan** — DexScreener pair + GeckoTerminal trade clustering → deterministic, weighted risk assessment
- **GET /api/v1/discovery** — keyless trending/new pool radar (GeckoTerminal free tier)
- **POST /api/explain** — evidence-first AI narrative; `provider: "local"` serves a deterministic heuristic narrative with zero API keys
- **POST /api/whale** — Helius wallet balances (key required)
- **GET /api/v1/whale/windows** — whale windows (1h/6h/24h) on the keyless GeckoTerminal trade tape, all five chains; threshold is a labelled heuristic, never an on-chain label
- **GET /api/v1/whale/auto** — AUTO: resolve a contract across networks + trending top-N candidates
- **GET /api/v1/fees/estimate** — the PLANNED VILMEI fee (0.50% split 0.30/0.10/0.10) as inspectable data; nothing is charged, VILMEI is read-only
- **WS /ws/snap** — full honest snapshot ticker · **WS /ws/tape** — live trade-tape deltas for the active pool

Every value is copied verbatim from the upstream APIs; absent fields stay absent —
nothing is simulated, zero-filled or random-walked. Heuristic thresholds are public
and auditable (heuristics/)."""

_TAGS = [
    {"name": "market", "description": "Token scanning, discovery radar and market evidence."},
    {"name": "history", "description": "Persisted point-in-time history from the local database (BE-F2). Cursor-paginated; every page carries the provenance of its rows."},
    {"name": "live", "description": "Live per-chain memecoin feed — keyless GeckoTerminal, ≥120s TTL cache, honest live:false for networks GT does not serve."},
    {"name": "ai", "description": "Evidence-first narrative: LLM providers or the keyless deterministic local tier."},
    {"name": "whale", "description": "Wallet balances via Helius (needs HELIUS_API_KEY)."},
    {"name": "system", "description": "Health, version and live process metrics."},
]

app = FastAPI(
    title="VILMEI",
    version=APP_VERSION,
    summary="Evidence-first multichain memecoin risk terminal",
    description=_DESCRIPTION,
    license_info={"name": "MIT", "identifier": "MIT"},
    openapi_tags=_TAGS,
    docs_url="/api/docs",   # Swagger moved off /docs — that path is the human Docs page now
    redoc_url="/api/redoc",
)
_apply_cors(app)


def _validate(chain: str, address: str) -> None:
    if chain not in dexscreener.CHAIN_IDS:
        raise HTTPException(400, f"unknown chain '{chain}' — pick {'|'.join(dexscreener.CHAIN_IDS)}")
    if not _ADDRESS_RES.get(chain, re.compile(r"^.+$")).fullmatch(address or ""):
        raise HTTPException(400, f"invalid {chain} address format")


def _pair_view(pair: dict) -> dict:
    """Whitelisted projection — the web UI can only render what we send (same
    spirit as ai_analyst._evidence)."""
    return {k: pair.get(k) for k in (
        "pairAddress", "chainId", "dexId", "baseToken", "quoteToken", "url",
        "priceUsd", "liquidity", "fdv", "marketCap", "volume", "priceChange",
        "txns", "pairCreatedAt")}


async def _scan_chain(chain_key: str, address: str) -> dict | None:
    """DexScreener pair + GeckoTerminal clustering → assessment. GT failure →
    honest degrade (severity None + reason), the other signals still run.

    Per-chain denominator note (BE-F4 wiring decision, deliberately not
    joined yet — same no-join rule as F3 labels): when it ships, it reads the
    chain's capabilities from webapp/chains.py CHAIN_CATALOG (e.g. hype has
    scan=False → an honest "signals unavailable on this chain")."""
    try:
        pairs = await asyncio.to_thread(dexscreener.fetch_pairs, chain_key, address)
    except urllib.error.HTTPError as e:
        # Upstream rate limit / hard error must surface as an honest 503, not a raw 500.
        raise HTTPException(503, f"DexScreener HTTP {e.code} — provider unavailable, try again shortly") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise HTTPException(503, f"DexScreener unreachable ({str(e)[:60]}) — try again shortly") from e
    pair = dexscreener.best_pair(pairs)
    if pair is None:
        return None

    pool = pair.get("pairAddress")
    token = (pair.get("baseToken") or {}).get("address")
    try:
        trades: list[dict] = []
        primary_ok = False
        if pool:
            trades = await asyncio.to_thread(geckoterminal.fetch_trades, chain_key, pool)
            primary_ok = True
        # GT budget guard (~10 calls/min free tier): only spend the extra
        # pools→trades round-trip when the pair carries no pool address at all.
        # A successful primary fetch with zero trades is honest "no trades".
        if not primary_ok and token:
            pools = await asyncio.to_thread(geckoterminal.fetch_pools, chain_key, token)
            best = geckoterminal.best_pool(pools)
            addr = (best.get("attributes") or {}).get("address") if best else None
            if addr:
                trades = await asyncio.to_thread(geckoterminal.fetch_trades, chain_key, addr)
        cl = clustering.analyze(trades)
    except urllib.error.HTTPError as e:
        # counts stay None (never 0): the fetch observed no wallets — it failed
        cl = {"wallets": None, "buys": None, "severity": None,
              "evidence": f"GeckoTerminal HTTP {e.code} — clustering data unavailable"}
    except Exception as e:  # noqa: BLE001 — clustering failing ≠ token can't be assessed
        cl = {"wallets": None, "buys": None, "severity": None,
              "evidence": f"GeckoTerminal failed ({str(e)[:60]}) — clustering data unavailable"}

    assessment = rug_check.assess(pair, cl)
    return {"pair": _pair_view(pair), "assessment": assessment, "clustering": cl,
            "sources": ["dexscreener", "geckoterminal"],
            "launch_venue": dexscreener.launch_venue(pairs),
            "ts": datetime.now(UTC).isoformat()}


def _cache_put(key: tuple[str, str], at: float, result: dict) -> None:
    """Store a scan result: drop expired entries first, then the oldest ones
    beyond the size cap — the cache must never grow without bound."""
    expired = [k for k, (t, _) in _scan_cache.items() if at - t >= CACHE_TTL_S]
    for k in expired:
        del _scan_cache[k]
    while len(_scan_cache) >= SCAN_CACHE_MAX:
        del _scan_cache[min(_scan_cache, key=lambda k: _scan_cache[k][0])]
    _scan_cache[key] = (at, result)


async def _get_scan(chain_key: str, address: str, refresh: bool = False) -> dict:
    key = (chain_key, address)
    hit = _scan_cache.get(key)
    now = time.monotonic()
    if hit and not refresh and now - hit[0] < CACHE_TTL_S:
        return hit[1]
    result = await _scan_chain(chain_key, address)
    if result is None:
        raise HTTPException(404, f"no pair found for {address} on {chain_key} — check address/chain")
    _cache_put(key, now, result)
    return result


def _persist_scan(chain_key: str, address: str, result: dict,
                  ctx: dict | None = None) -> None:
    """BE-F2/F5a write-through: append a scan_snapshot when persistence is
    on (ALPHA_DB_PATH), with the deployer provenance columns riding the SAME
    INSERT (lineage can see its own scan the moment it is served).
    Best-effort by design — a storage hiccup must never fail a scan; the
    miss is visible as a missing row, never wrong data."""
    import sqlite3
    path = db.resolve_path()
    if path is None:
        return
    pair = result.get("pair") or {}
    ident = (pair.get("pairAddress") or address).strip().lower()
    ctx = ctx or {}
    try:
        db.write_scan_snapshot(path, chain_key, ident, result,
                               deployer=ctx.get("deployer"),
                               deployer_kind=ctx.get("deployer_kind"),
                               deployer_source=ctx.get("deployer_source"))
    except sqlite3.Error:
        pass


# hard cap on tracked IPs — one dict key per client IP must not grow forever
_AI_HITS_MAX_IPS = 1000


def _throttle_evict_ips(now: float) -> None:
    """Drop IPs whose window has fully expired, then the oldest ones beyond
    the cap — _ai_hits must never grow without bound."""
    dead = [ip for ip, q in _ai_hits.items() if not q or now - q[-1] > 86_400]
    for ip in dead:
        del _ai_hits[ip]
    while len(_ai_hits) >= _AI_HITS_MAX_IPS:
        oldest = min(_ai_hits, key=lambda ip: _ai_hits[ip][-1] if _ai_hits[ip] else 0.0)
        del _ai_hits[oldest]


def _throttle_hit(ip: str) -> bool:
    """Single write path for the per-IP AI rate limiter: prune the sliding
    window, enforce the IP cap, then record the hit. False = over limit."""
    hourly, daily = _ai_rate_limits()
    now = time.time()
    _throttle_evict_ips(now)
    q = _ai_hits[ip]
    while q and now - q[0] > 86_400:
        q.popleft()
    if len(q) >= daily or sum(1 for t in q if now - t < 3_600) >= hourly:
        return False
    q.append(now)
    return True


# ── BE-F1 versioning: /api/v1/* aliases call the same handlers; the legacy
# paths stay forever compatible, flagged deprecated via headers only ──
_DEPRECATED_PATHS = {"/api/scan": "/api/v1/scan",
                     "/api/explain": "/api/v1/explain",
                     "/api/whale": "/api/v1/whale"}


@app.middleware("http")
async def _deprecation_headers(request: Request, call_next):
    resp = await call_next(request)
    successor = _DEPRECATED_PATHS.get(request.url.path)
    if successor is not None:
        resp.headers["Deprecation"] = "true"
        resp.headers["Link"] = f'<{successor}>; rel="successor-version"'
    return resp


@app.get("/api/health", tags=["system"])
async def health() -> dict:
    """Liveness + served chains + active tier + which AI providers have keys."""
    return {
        "status": "ok",
        "chains": sorted(dexscreener.CHAIN_IDS),
        "tier": token_gate.resolve_tier(),
        "ai_providers": [k for k, p in ai_analyst.PROVIDERS.items()
                         if os.environ.get(p.env_key)],
    }


@app.get("/api/version", response_model=schemas.VersionResponse, tags=["system"])
async def version() -> dict:
    """Build identity — real toolchain versions, nothing invented. The db
    block reports measured persistence facts (path_kind, schema version,
    rows per table, last run, oldest row) — never the raw filesystem path."""
    return {"name": "VILMEI", "version": APP_VERSION,
            "python": sys.version.split()[0], "fastapi": fastapi.__version__,
            "uptime_s": int(time.monotonic() - _T0),
            "db": db.db_info(db.resolve_path())}


@app.get("/api/metrics", tags=["system"])
async def metrics() -> dict:
    """Live process counters — every number is measured, none estimated.
    tokens/labels are measured persistence row counts (0 when persistence
    is off — off is a fact, not an estimate)."""
    rows = db.db_info(db.resolve_path())["rows_by_table"]
    return {"scans": _STATS["scans"], "uptime_s": int(time.monotonic() - _T0),
            "ws_clients": len(_WS_CLIENTS), "scan_cache_entries": len(_scan_cache),
            "gt_trade_cache_entries": len(geckoterminal._trade_cache),
            "throttled_ips": len(_ai_hits),
            "tokens": rows.get("tokens", 0), "labels": rows.get("wallet_labels", 0),
            "chains": len(chains.CHAIN_CATALOG)}


def _enrich_scan(chain_key: str, ident: str) -> dict:
    """BE-F5a-R trader-loop context: best-effort per wired capability, one
    try/except PER provider fn — a single failure never degrades the
    existing verdict, it becomes an honest None + reason note. Context is
    built per request (never cached): lineage must be current, and a cached
    context would grow stale silently."""
    ctx: dict = {"deployer": None, "deployer_kind": None, "deployer_source": None,
                 "lineage": None, "top10_share": None, "sell_test": None,
                 "notes": [], "data_mode": "unwired", "schema_version": "1.0",
                 "sources": [], "ts": schemas._utc_now_iso()}
    caps = chains_map.capabilities_for(chain_key)
    live = 0
    for name in chains_map.CAPABILITY_NAMES:
        cap = caps[name]
        if cap["source"] is None:
            ctx["notes"].append(f"{chain_key} {name}: {cap['reason']}")
            continue
        try:
            data, note = cap["fn"](chain_key, ident)
        except Exception as e:  # noqa: BLE001 — a provider failure is a note, not a 500
            data, note = None, f"{cap['source']}:failed ({str(e)[:40]})"
        if note:
            ctx["notes"].append(f"{chain_key} {name}: {note}")
        if data is None:
            continue
        live += 1
        if data.get("data_source"):
            ctx.setdefault("data_sources", []).append(data["data_source"])
        if cap["source"] not in ctx["sources"]:
            ctx["sources"].append(cap["source"])
        if name == "deployer":
            # helius speaks "fee_payer" (the creation-tx fee payer IS the
            # deployer), alchemy speaks "deployer" — normalized here so the
            # contract stays uniform across chains
            ctx["deployer"] = data.get("deployer") or data.get("fee_payer")
            ctx["deployer_kind"] = data.get("deployer_kind")
            ctx["deployer_source"] = cap["source"]
            db_path = db.resolve_path()
            if db_path is None:
                ctx["notes"].append(f"{chain_key} lineage: ALPHA_DB_PATH not "
                                    f"configured on this deployment")
            else:
                ctx["lineage"] = lineage_mod.resolve(db_path, ctx["deployer"])
        elif name == "holders":
            ctx["top10_share"] = data.get("top10_share")
        elif name == "sell_test":
            ctx["sell_test"] = {"routable": data.get("routable"),
                                "checked_via": data.get("checked_via"),
                                "note": data.get("note")}
        elif name == "rug_flags":
            ctx["rug_flags"] = data
    # "live" means the WHOLE trader loop answered (all three capabilities);
    # a chain with fewer wired sources can only ever be "partial" — honest
    if live == len(chains_map.CAPABILITY_NAMES):
        ctx["data_mode"] = "live"
    elif live:
        ctx["data_mode"] = "partial"
    return ctx


@app.post("/api/v1/scan", response_model=schemas.ScanResponse, tags=["market"])
@app.post("/api/scan", response_model=schemas.ScanResponse, tags=["market"], deprecated=True)
async def api_scan(body: ScanBody) -> dict:
    """Full evidence scan: pair view + weighted risk assessment + clustering,
    plus the best-effort trader-loop `context` block (BE-F5a-R — context
    renders beside the verdict; the score formula never reads it).
    `refresh: true` bypasses the 30s TTL cache and forces a fresh fetch."""
    _validate(body.chain, body.address)
    out = await _get_scan(body.chain, body.address, body.refresh)
    _STATS["scans"] += 1  # real usage counter — cache hits count as served scans
    # context providers get the address AS GIVEN — solana mints are
    # case-sensitive base58; lowercasing broke every helius call (probe:
    # BONK answered no_asset/http_400 2026-08-30). DB idents are lowercased
    # inside _persist_scan.
    ctx = await asyncio.to_thread(_enrich_scan, body.chain, body.address.strip())
    out["context"] = ctx
    out["data_mode"] = "partial" if ctx["data_mode"] in ("live", "partial") else "live"
    await asyncio.to_thread(_persist_scan, body.chain, body.address, out, ctx)
    return out


@app.post("/api/v1/explain", response_model=schemas.ExplainResponse, tags=["ai"])
@app.post("/api/explain", response_model=schemas.ExplainResponse, tags=["ai"], deprecated=True)
async def api_explain(body: ExplainBody, request: Request) -> dict:
    """Evidence-first narrative. `provider`: claude|glm|kimi (LLM, rate-limited,
    needs its key) or `local` (deterministic heuristics, keyless, unlimited).
    Evidence is always re-fetched and re-assessed server-side."""
    if body.provider != "local" and body.provider not in ai_analyst.PROVIDERS:
        raise HTTPException(400, f"unknown provider '{body.provider}' — pick {'|'.join(ai_analyst.PROVIDERS)}|local")
    # validate input first — invalid requests must not consume a rate-limit slot
    _validate(body.chain, body.address)
    if body.provider == "local":
        # Keyless tier (G.5): deterministic narrative from the heuristics.
        # Same server-side re-fetch (a client can never forge evidence), but
        # no rate-limit slot — local costs no founder money.
        scan = await _get_scan(body.chain, body.address)
        out = ai_analyst.local_explain(scan["pair"], scan["assessment"], scan["clustering"])
        return {**out, "tier": "local", "provider": "local",
                "sources": scan.get("sources", [])}
    ip = request.client.host if request.client else "unknown"
    if not _throttle_hit(ip):
        hourly, daily = _ai_rate_limits()
        raise HTTPException(429, f"AI rate limit reached ({hourly}/hour, {daily}/day on the free tier) — try again later")
    scan = await _get_scan(body.chain, body.address)
    try:
        out = await asyncio.to_thread(ai_analyst.explain, scan["pair"], scan["assessment"],
                                      token_gate.resolve_tier(), body.provider)
    except ai_analyst.NoKeyError as e:
        raise HTTPException(503, f"{e} — or provider='local' for the keyless heuristic narrative") from e
    return {**out, "tier": token_gate.resolve_tier(), "provider": body.provider,
            "sources": scan.get("sources", [])}


@app.post("/api/v1/whale", response_model=schemas.WhaleResponse, tags=["whale"])
@app.post("/api/whale", response_model=schemas.WhaleResponse, tags=["whale"], deprecated=True)
async def api_whale(body: WhaleBody) -> dict:
    """Solana wallet balances via Helius (needs HELIUS_API_KEY)."""
    if not re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]{32,44}|0x[a-fA-F0-9]{40}", body.address or ""):
        raise HTTPException(400, "invalid wallet address format")
    try:
        out = await asyncio.to_thread(helius.fetch_balances, body.address)
        return {**out, "sources": ["helius"]}
    except helius.NoKeyError as e:
        raise HTTPException(503, str(e)) from e


@app.get("/api/v1/discovery", response_model=schemas.DiscoveryResponse, tags=["market"])
async def api_discovery(chain: str = "sol", mode: str = "trending", limit: int = 20) -> dict:
    """Keyless radar feed (G.3): trending or new pools via GeckoTerminal free
    tier. Validation → 400; upstream failure → honest 502. Items carry only
    what the API returned — absent fields stay absent (None)."""
    if chain not in geckoterminal.NETWORKS:
        raise HTTPException(400, f"discovery: chain '{chain}' not served — "
                                 f"pick {'|'.join(sorted(geckoterminal.NETWORKS))}")
    if mode not in ("trending", "new"):
        raise HTTPException(400, "mode must be 'trending' or 'new'")
    try:
        items = await (discovery.new_pools(chain, limit) if mode == "new"
                       else discovery.trending_pools(chain, limit))
    except ValueError as e:  # provider-level chain guard (gt._net)
        raise HTTPException(400, str(e)) from e
    except urllib.error.HTTPError as e:
        raise HTTPException(502, f"GeckoTerminal HTTP {e.code} — discovery upstream failed") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise HTTPException(502, f"GeckoTerminal unreachable ({str(e)[:60]})") from e
    return {"chain": chain, "mode": mode, "count": len(items), "items": items,
            "sources": ["geckoterminal"]}


# ── PROMPT-V Fase 3/4: market surface (ohlcv · socials · detect) ─────────
# Every route follows the envelope + provenance law: WHERE each payload came
# from (source/host), how fresh it is (cache/freshness), and an honest
# `degraded` reason instead of fabricated values.

def _prov(out: dict, source: str, host: str) -> dict:
    """Build the Provenance block from the provider payload's cache/freshness/
    degraded fields and strip them off the top level. Works on a COPY — the
    provider's TTL cache holds the original dict and must stay intact."""
    out = dict(out)
    prov = {"source": source, "host": host,
            "cache": out.pop("cache"), "freshness": out.pop("freshness"),
            "degraded": out.pop("degraded")}
    out["provenance"] = prov
    return out


@app.get("/api/v1/market/ohlcv", response_model=schemas.OhlcvResponse, tags=["market"])
async def api_market_ohlcv(chain: str, pair: str, resolution: str = "15m",
                           limit: int = 200) -> dict:
    """GT candles for a pool (Fase 4 chart/volume/indicator source). Keyless,
    TTL-cached 60s, verbatim floats oldest→newest — no gap-filling, no
    rounding. An empty candle list ships with a degraded reason, never a
    synthesized series. The browser never calls GT directly (zero
    third-party-host claim); this route is the only door."""
    try:
        out = await asyncio.to_thread(market.ohlcv, chain, pair, resolution, limit)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except urllib.error.HTTPError as e:
        raise HTTPException(502, f"GeckoTerminal HTTP {e.code} — ohlcv upstream failed") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise HTTPException(502, f"GeckoTerminal unreachable ({str(e)[:60]})") from e
    out = _prov(out, "geckoterminal", "api.geckoterminal.com")
    out["sources"] = ["geckoterminal"]
    return out


@app.get("/api/v1/socials", response_model=schemas.SocialsResponse, tags=["market"])
async def api_socials(chain: str, token: str) -> dict:
    """Official links for a token (Fase 4 SOCIALS tab) from DexScreener
    token-pairs info, TTL-cached 300s. Param is the TOKEN address (CA): DS
    answers 0 pairs for a pair address (probed 2026-08-30) — the FE passes
    the CA from the active-pair identity context. Empty lists = 'no official
    links in feed'; links are never invented."""
    try:
        out = await asyncio.to_thread(market.socials, chain, token)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except urllib.error.HTTPError as e:
        raise HTTPException(502, f"DexScreener HTTP {e.code} — socials upstream failed") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise HTTPException(502, f"DexScreener unreachable ({str(e)[:60]})") from e
    out = _prov(out, "dexscreener", "api.dexscreener.com")
    out["sources"] = ["dexscreener"]
    return out


@app.get("/api/v1/detect", response_model=schemas.DetectResponse, tags=["market"])
async def api_detect(address: str) -> dict:
    """Auto-detect (Fase 3): pasted CA or $TICKER → one candidate pair per
    founder chain where DS lists it (deepest pool), liquidity-ranked. The
    client MUST present the candidate set on >1 — silently defaulting to one
    chain is the identity bug this surface exists to prevent. DS search only:
    GT /api/v2/search does not exist (probed 404, 2026-08-30)."""
    try:
        out = await asyncio.to_thread(market.detect, address)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except urllib.error.HTTPError as e:
        raise HTTPException(502, f"DexScreener HTTP {e.code} — detect upstream failed") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise HTTPException(502, f"DexScreener unreachable ({str(e)[:60]})") from e
    out = _prov(out, "dexscreener", "api.dexscreener.com")
    out["sources"] = ["dexscreener"]
    return out


# ── PROMPT-V2 P3: rug surface (multi-chain, $0) ─────────────────────────
# sol → RugCheck.xyz summary (proxied: browser never calls the third party);
# evm (bnb/base) → GoPlus token_security, verbatim 0/1-string rows. hype/hood
# have no free provider coverage — the FE renders the honest limited panel,
# this API simply 400s an unsupported chain so nothing is invented.

_RUG_EVM_FIELDS = ("token_symbol", "is_honeypot", "is_open_source", "buy_tax",
                   "sell_tax", "is_mintable", "is_freezable", "holder_count",
                   "contract_creator")
_BASE58_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")
_HEX40_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")


@app.get("/api/v1/rug/sol/{mint}", response_model=schemas.RugSolResponse, tags=["market"])
async def api_rug_sol(mint: str) -> dict:
    """Solana rug summary (RugCheck.xyz), TTL-cached 300s, provenance
    attached. A missing report ships empty risks + a degraded reason —
    an unindexed token is a fact, never an invented verdict."""
    if not _BASE58_RE.fullmatch(mint or ""):
        raise HTTPException(400, "rug/sol: mint must be a base58 address (32-44)")
    data, note = await asyncio.to_thread(rugcheck.summary, mint)
    if data is None:
        out: dict = {"mint": mint, "score": None, "score_normalised": None,
                     "lp_locked_pct": None, "risks": []}
    else:
        out = {"mint": mint,
               "score": data.get("score"),
               "score_normalised": data.get("score_normalised"),
               "lp_locked_pct": data.get("lpLockedPct"),
               "risks": data.get("risks") or []}
    prov = {"source": "rugcheck", "host": "api.rugcheck.xyz",
            "cache": {"cached": False, "age_s": None, "ttl_s": 300},
            "freshness": {"path": "/v1/tokens/{mint}/report/summary (probed 2026-08-31)"},
            "degraded": note}
    return {**out, "provenance": prov, "sources": ["rugcheck"],
            "data_mode": "live" if note is None else "partial"}


@app.get("/api/v1/rug/evm/{chain}/{token}", response_model=schemas.RugEvmResponse, tags=["market"])
async def api_rug_evm(chain: str, token: str) -> dict:
    """EVM rug rows (GoPlus) for bnb/base — verbatim values, provider chip
    per row, TTL-cached 300s (the provider module owns its cache)."""
    if chain not in goplus._CHAIN_IDS:
        raise HTTPException(400, "rug/evm covers " + ", ".join(goplus._CHAIN_IDS) +
                                 " via GoPlus — this chain has no free provider coverage yet, "
                                 "so no security rows exist to show (market signals still load)")
    if not _HEX40_RE.fullmatch(token or ""):
        raise HTTPException(400, "rug/evm: token must be a 0x + 40-hex address")
    row, note = await asyncio.to_thread(goplus.token_security, chain, token)
    rows: list[dict] = []
    symbol = None
    if row is not None:
        symbol = row.get("token_symbol")
        rows = [{"field": f, "value": row.get(f)} for f in _RUG_EVM_FIELDS]
    prov = {"source": "goplus", "host": "api.gopluslabs.io",
            "cache": {"cached": False, "age_s": None, "ttl_s": 300},
            "freshness": {"path": f"/api/v1/token_security/{goplus._CHAIN_IDS[chain]}"},
            "degraded": note}
    return {"chain": chain, "chain_id": goplus._CHAIN_IDS[chain], "token": token,
            "token_symbol": symbol, "rows": rows, "provenance": prov,
            "sources": ["goplus"], "data_mode": "live" if note is None else "partial"}


@app.get("/api/v1/live/{chain}", response_model=schemas.LiveResponse, tags=["live"])
async def api_live(chain: str, mode: str = "new", limit: int = 20) -> dict:
    """Live memecoin feed per chain (G.7) — modes: new | trending | volume | alpha.

    Keyless GeckoTerminal only, TTL-cached ≥120s per (chain, mode) — the free
    tier is ~10 calls/min and `alpha` re-ranks the volume feed with zero extra
    calls. A chain without a GT network answers live:false with an empty item
    list — never fabricated. Unknown chain → 404; bad mode/limit → 400;
    upstream failure without a cache fallback → 502 (a warm expired cache is
    served with stale:true instead)."""
    info = live.CHAINS.get(chain)
    if info is None:
        raise HTTPException(404, f"unknown chain '{chain}' — pick {'|'.join(live.CHAINS)}")
    if mode not in live.MODES:
        raise HTTPException(400, f"mode must be {'|'.join(live.MODES)}")
    if not 1 <= limit <= live.LIMIT_MAX:
        raise HTTPException(400, f"limit must be 1..{live.LIMIT_MAX}")
    generated_at = datetime.now(UTC).isoformat()
    if not info["live"]:
        return {"chain": chain, "network_id": None, "live": False,
                "generated_at": generated_at, "cached": False, "stale": False,
                "items": [], "sources": []}  # no upstream was called
    try:
        items, meta = await asyncio.to_thread(live.get_feed, chain, mode, limit)
    except ValueError as e:  # unreachable post-validation — kept for contract
        raise HTTPException(400, str(e)) from e
    except urllib.error.HTTPError as e:
        raise HTTPException(502, f"GeckoTerminal HTTP {e.code} — live feed upstream failed") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise HTTPException(502, f"GeckoTerminal unreachable ({str(e)[:60]})") from e
    # sources = upstreams that actually contributed to THIS payload: GT serves
    # the feed; DexScreener appears only when a social link survived enrichment
    sources = ["geckoterminal"] + (["dexscreener"] if any(i.get("socials") for i in items) else [])
    return {"chain": chain, "network_id": info["network_id"], "live": True,
            "generated_at": generated_at, **meta, "items": items, "sources": sources}


def _db_or_503() -> Path:
    p = db.resolve_path()
    if p is None:
        raise HTTPException(503, "history unavailable — ALPHA_DB_PATH is not set on"
                                " this deployment (persistence is opt-in)")
    return p


def _history_params(limit: int, cursor: str | None, since: str | None,
                    until: str | None) -> dict:
    if not 1 <= limit <= db.HISTORY_LIMIT_MAX:
        raise HTTPException(400, f"limit must be 1..{db.HISTORY_LIMIT_MAX}")
    return {"limit": limit, "cursor": cursor, "since": since, "until": until}


@app.get("/api/v1/history/prices/{chain}/{ident}",
         response_model=schemas.HistoryPage[schemas.OhlcvPoint], tags=["market"])
async def api_history_prices(chain: str, ident: str, limit: int = 100,
                             cursor: str | None = None, since: str | None = None,
                             until: str | None = None) -> dict:
    """Point-in-time price history from the local persistence layer (BE-F2).

    limit clamped to 1..500 · opaque cursor is None-terminated · window
    filters since/until take timezone-aware ISO-8601. data_mode = the union
    of the page's rows (fixture|live), never hardcoded. Rows are point
    observations: open/high/low stay None, close = the observed price —
    candles are never synthesized."""
    path = _db_or_503()
    try:
        return db.history_prices(path, chain.strip().lower(), ident.strip().lower(),
                                 **_history_params(limit, cursor, since, until))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.get("/api/v1/history/trades/{chain}/{ident}",
         response_model=schemas.HistoryPage[schemas.TradeRow], tags=["market"])
async def api_history_trades(chain: str, ident: str, limit: int = 100,
                             cursor: str | None = None, since: str | None = None,
                             until: str | None = None) -> dict:
    """Trade history from the local persistence layer (BE-F2) — same cursor,
    window and data_mode contract as the prices page."""
    path = _db_or_503()
    try:
        return db.history_trades(path, chain.strip().lower(), ident.strip().lower(),
                                 **_history_params(limit, cursor, since, until))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


# ── BE-F3 entity surface: token registry + wallet labels (additive) ──

@app.get("/api/v1/tokens/{chain}/{ident}", response_model=schemas.TokenMeta,
         tags=["market"])
async def api_token_meta(chain: str, ident: str) -> dict:
    """One registry token. 404 only when the registry never saw it — the
    registry is silent on unknowns, never guesses. Registry-backed pages
    carry data_mode='fixture' today; fields no upstream filled stay None."""
    path = _db_or_503()
    tok = db.get_token(path, chain.strip().lower(), ident.strip().lower())
    if tok is None:
        raise HTTPException(404, f"unknown token '{ident}' on '{chain}' — "
                                 f"the registry has no row for it")
    return tok


_WALLET_SHAPE = re.compile(r"[1-9A-HJ-NP-Za-km-z]{32,44}|0x[a-fA-F0-9]{40}")


@app.get("/api/v1/wallets/{address}", response_model=schemas.WalletLabelsResponse,
         tags=["market"])
async def api_wallet_labels(address: str) -> dict:
    """Wallet label claims across chains. 200 + [] for a valid address with
    no labels (unlabeled = silence, never a guess); 404 only on a malformed
    address shape. Labels are claims with provenance — verified=false unless
    an operator path (none exists yet) checked them."""
    if not _WALLET_SHAPE.fullmatch(address or ""):
        raise HTTPException(404, f"invalid wallet address shape '{address[:12]}…' — "
                                 f"not base58 (32-44) or 0x-hex (40)")
    path = _db_or_503()
    return await asyncio.to_thread(db.get_wallet_labels, path, address)


# ── BE-F4: chain capability catalog (config-not-observed → data_mode "static") ──

@app.get("/api/v1/chains", response_model=schemas.ChainsResponse, tags=["market"])
async def api_chains() -> dict:
    """What each chain can honestly do today, per provider. This is the
    audit-§2 provider matrix as a structured, importable constant — the
    guard in webapp/chains.py keeps it equivalent to the provider modules,
    so a capability change fails the catalog test until updated."""
    return {
        "chains": [{"chain": cid, **info}
                   for cid, info in chains.CHAIN_CATALOG.items()],
        "note": "reflects verified provider support",
        "capabilities": chains_map.capabilities_view(),
        "data_mode": "static",
        "schema_version": "1.0",
        "sources": ["chains.py", "chains_map.py"],
        "ts": schemas._utc_now_iso(),
    }


# ── BE-ALL-LIVE F3: whale tracker (large transfers + netflow) ──

@app.get("/api/v1/whales/{chain}/{token}", response_model=schemas.WhalesResponse,
         tags=["market"])
async def api_whales(chain: str, token: str, threshold_usd: float = 1000.0,
                     limit: int = 25) -> dict:
    """Large recent transfers + per-wallet netflow for one token. Solana =
    Helius enhanced transactions (keyed); the other chains stay unwired HERE
    (this is the signed-delta view) — the GT trade tape at
    /api/v1/whale/windows covers all five chains keyless. USD sizing uses the
    DexScreener pair price; when absent, `usd` stays None and token amounts
    stand alone."""
    out: dict = {"chain": chain.strip().lower(), "token": token.strip().lower(),
                 "threshold_usd": threshold_usd, "transfers": [], "netflow": [],
                 "window_txs": 0, "price_usd": None,
                 "data_mode": "unwired", "schema_version": "1.0",
                 "sources": [], "ts": schemas._utc_now_iso(),
                 "data_sources": []}
    try:
        # the token goes to providers AS GIVEN — solana addresses are
        # case-sensitive; lowercasing is only for DB idents
        data, note = await asyncio.to_thread(whales.whales, chain.strip().lower(),
                                             token.strip(),
                                             threshold_usd, limit)
    except Exception as e:  # noqa: BLE001 — a provider failure is a note, not a 500
        data, note = None, f"whales:failed ({str(e)[:40]})"
    if data is None:
        out["data_sources"].append(note or "whales unavailable")
        out["data_mode"] = "unwired"
        return out
    out.update(data)
    out["data_mode"] = "live"       # a served window is real data; quiet tokens included
    out["sources"] = ["helius", "dexscreener"] if data["price_usd"] is not None else ["helius"]
    out["data_sources"].append(
        f"whales: helius enhanced txs (window={data['window_txs']} txs, "
        f"threshold ${threshold_usd}) + dexscreener pair price"
        + ("" if data["price_usd"] is not None else " — price absent: usd stays null"))
    return out


# ── PROMPT-V3 R2: whale windows on the GeckoTerminal trade tape ──
# The $0 whale feed on all five chains: GT pool trades (probe 2026-08-31).
# A "whale" is a labelled heuristic (one trade ≥ chain threshold), never an
# on-chain label — the threshold sentence ships inside every payload.

@app.get("/api/v1/whale/windows", response_model=schemas.WhaleWindowsResponse,
         tags=["market"])
async def api_whale_windows(chain: str, ca: str) -> dict:
    """Whale windows (1h/6h/24h) for one contract on one chain, from the
    GeckoTerminal trade tape. Threshold is a labelled heuristic per chain
    (sol $50K · bnb/base $30K · hype/hood = native qty × live native price,
    $30K fallback stated). No pool for the contract = an honest unwired
    envelope with the reason, never a red wall."""
    chain_key = chain.strip().lower()
    out: dict = {"chain": chain_key, "token": ca.strip(),
                 "data_mode": "unwired", "schema_version": "1.0",
                 "sources": [], "ts": schemas._utc_now_iso(),
                 "data_sources": []}
    try:
        data, note = await asyncio.to_thread(whale_windows.whale_windows,
                                             chain_key, ca.strip())
    except Exception as e:  # noqa: BLE001 — a provider failure is a note, not a 500
        data, note = None, f"whale_windows:failed ({str(e)[:40]})"
    if data is None:
        out["data_sources"].append(note or "whale_windows unavailable")
        return out
    out.update(data)
    out["data_mode"] = "live"
    out["sources"] = ["geckoterminal"]
    return out


@app.get("/api/v1/whale/auto", response_model=schemas.WhaleAutoResponse,
         tags=["market"])
async def api_whale_auto(ca: str, limit: int = 5) -> dict:
    """AUTO mode: resolve the contract across networks via GT search, run
    whale windows on every chain that lists it, and add the trending top-N
    (small N, one call per chain, cached + backoff) as candidates. Every
    miss or rate-limit is a sentence in data_sources."""
    out: dict = {"token": ca.strip(), "results": [], "candidates": [],
                 "trending": [], "data_mode": "live", "schema_version": "1.0",
                 "sources": ["geckoterminal"], "ts": schemas._utc_now_iso(),
                 "data_sources": []}
    try:
        data = await asyncio.to_thread(whale_windows.whale_auto, ca.strip(),
                                       max(1, min(int(limit), 10)))
    except Exception as e:  # noqa: BLE001 — never a 500; the note is the answer
        out["data_sources"].append(f"whale_auto:failed ({str(e)[:40]})")
        return out
    out.update(data)
    return out


# ── PROMPT-V3 R4: fee frontier — the planned fee as inspectable data ──
# Matrix: docs/FEE-MODELS-2026.md (checked 2026-08-31). Nothing is charged:
# VILMEI is read-only. data_mode='static' — a policy constant, not a feed.

@app.get("/api/v1/fees/estimate", response_model=schemas.FeeEstimateResponse,
         tags=["market"])
async def api_fees_estimate(chain: str, amountUsd: float) -> dict:
    """The PLANNED VILMEI fee (0.50% = ops 0.30 + buyback 0.10 + rewards
    0.10) for one notional on one chain, plus that chain's fee path verbatim
    from the docs/FEE-MODELS-2026.md matrix (verdict vocabulary: SIAP-$0 ·
    PERLU-AGREEMENT-BISNIS · TIDAK-ADA). A policy constant — nothing is
    charged, and VILMEI stays read-only. Unknown chain → 404 with the allowed
    list; non-finite or negative amount → 400."""
    chain_key = chain.strip().lower()
    if chain_key not in fee_models.CHAINS:
        raise HTTPException(404, f"unknown chain '{chain_key}' — "
                                 f"pick {'|'.join(fee_models.CHAINS)}")
    if not math.isfinite(amountUsd) or amountUsd < 0:
        raise HTTPException(400, "amountUsd must be a finite number ≥ 0")
    return fee_models.estimate(chain_key, amountUsd)


# ── PROMPT-V2B P6: machine surfaces (read-only) ─────────────────────────
# MCP spec revision 2026-07-28 (modelcontextprotocol.io/specification/latest,
# checked 2026-08-31); discovery via RFC 9727 api-catalog. The tools are thin
# read-only doors onto the SAME functions the REST surface serves.

async def _mcp_trending(a: dict) -> dict:
    return await api_live(str(a.get("chain", "sol")),
                          str(a.get("mode", "trending")),
                          int(a.get("limit", 20)))


async def _mcp_scan(a: dict) -> dict:
    chain = str(a.get("chain", "")).strip().lower()
    addr = str(a.get("address", "")).strip()
    if not chain or not addr:
        raise ValueError("scan: chain + address required")
    return await _get_scan(chain, addr)


async def _mcp_rug(a: dict) -> dict:
    chain = str(a.get("chain", "")).strip().lower()
    addr = str(a.get("address", "")).strip()
    if chain == "sol":
        return await api_rug_sol(addr)
    if chain in ("bnb", "base"):
        return await api_rug_evm(chain, addr)
    return {"chain": chain, "coverage": "partial",
            "reason": "free coverage does not index this chain yet — the "
                      "limited GT/DS panel is the honest signal set"}


async def _mcp_whales(a: dict) -> dict:
    return await api_whales(str(a.get("chain", "sol")), str(a.get("token", "")),
                            float(a.get("threshold_usd", 1000)),
                            int(a.get("limit", 25)))


async def _mcp_fees(a: dict) -> dict:
    return await api_fees_estimate(str(a.get("chain", "sol")),
                                   float(a.get("amountUsd", 1000)))


_MCP_IMPL: dict[str, mcp.ToolImpl] = {
    "trending": _mcp_trending, "scan": _mcp_scan,
    "rug": _mcp_rug, "whale_windows": _mcp_whales, "fee_view": _mcp_fees,
}


@app.post("/mcp", tags=["system"])
async def mcp_rpc(request: Request) -> Response:
    """Read-only Model Context Protocol endpoint — JSON-RPC 2.0 (spec rev
    2026-07-28): initialize / ping / tools/list / tools/call over five
    read-only tools (trending, scan, rug, whale_windows, fee_view). Nothing
    here trades, custodies, or writes."""
    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001 — a broken body is a JSON-RPC error, not a 500
        payload = None
    status, out = await mcp.handle(payload, _MCP_IMPL)
    if out is None:
        return Response(status_code=status)
    return JSONResponse(out, status_code=status)


@app.get("/.well-known/api-catalog", include_in_schema=False)
async def api_catalog(request: Request) -> Response:
    """RFC 9727 — machine-discoverable catalog pointing at openapi.json."""
    base = str(request.base_url)
    catalog = f"{base}.well-known/api-catalog"
    openapi = f"{base}openapi.json"
    return JSONResponse({"linkset": [
        {"anchor": catalog, "item": [{"href": openapi}]},
        {"anchor": openapi,
         "service-desc": [{"href": openapi,
                           "type": "application/vnd.oai.openapi+json;version=3.1"}]},
    ]}, media_type="application/linkset+json")


_NO_BUILD = """<!doctype html><html><head><meta charset="utf-8">
<title>VILMEI</title><style>body{background:#0a0e14;color:#8b98a9;
font-family:ui-monospace,monospace;display:grid;place-items:center;height:100vh;margin:0}
code{color:#ffb000}</style></head><body><div><p>Frontend not built yet.</p>
<p>Run: <code>cd frontend && npm install && npm run build</code></p></div></body></html>"""


def _page(name: str) -> FileResponse | HTMLResponse:
    f = _dist_dir() / name
    if f.is_file():
        # HTML always revalidates: after a rebuild the hashed chunk names
        # change, and a cached index kept serving dead chunks (2026-08-30).
        return FileResponse(f, headers={"cache-control": "no-cache"})
    return HTMLResponse(_NO_BUILD, status_code=503)


@app.get("/", include_in_schema=False)
async def index():
    return _page("index.html")


@app.get("/terminal", include_in_schema=False)
async def terminal():
    return _page("terminal.html")


@app.get("/live", include_in_schema=False)
async def live_page():
    return _page("live.html")


@app.get("/live/{chain}", include_in_schema=False)
async def live_chain_page(chain: str):
    # unknown chains still serve the SPA — it renders an honest
    # "unknown chain" state from LIVE_CHAINS (no server-side data involved)
    return _page("live.html")


@app.get("/swap-preview", include_in_schema=False)
async def swap_preview():
    """Dev preview for the Swap mockup (PROMPT-S) — one URL for the founder
    to screenshot the panel without enabling the terminal. Easily removable."""
    return RedirectResponse("/terminal#/swap")


@app.get("/docs", include_in_schema=False)
async def docs_page():
    return _page("docs.html")


@app.get("/roadmap", include_in_schema=False)
async def roadmap_page():
    return _page("roadmap.html")


@app.get("/assets/{subpath:path}", include_in_schema=False)
async def assets(subpath: str):
    base = (_dist_dir() / "assets").resolve()
    f = (base / subpath).resolve()
    if not f.is_relative_to(base) or not f.is_file():
        raise HTTPException(404, "asset not found — is the frontend built?")
    # content-hashed filenames → safe to cache forever; a rebuilt asset
    # always ships under a new hash (index.html is the no-cache entry point)
    return FileResponse(f, headers={"cache-control": "public, max-age=31536000, immutable"})


# ── B4a: live snapshot feed (real data only — the frontend fake-walk dies here) ──
from fastapi import WebSocket, WebSocketDisconnect

_STATS: dict = {"scans": 0}
_T0 = time.monotonic()
_WS_CLIENTS: set = set()

# /ws/snap access control: WS_AUTH_TOKEN empty = dev-open (one-time warning);
# set = every client must connect with ?token=<value>. MAX_WS_CLIENTS bounds
# per-process fan-out so one box cannot open unbounded sockets.
logger = logging.getLogger("vilmei.ws")
_ws_open_warning_shown = False


def _ws_max_clients() -> int:
    try:
        return int(os.environ.get("MAX_WS_CLIENTS", "64"))
    except ValueError:
        return 64


def _ws_auth_ok(ws: WebSocket) -> bool:
    """True → accept; (False, code) → reject with that close code."""
    global _ws_open_warning_shown
    expected = os.environ.get("WS_AUTH_TOKEN", "")
    if not expected:
        if not _ws_open_warning_shown:
            logger.warning("WS_AUTH_TOKEN not set — /ws/snap is open (dev mode)")
            _ws_open_warning_shown = True
        return True
    token = ws.query_params.get("token", "")
    return bool(token) and token == expected


def _snap() -> dict:
    ticks = []
    for (chain_key, address), (_at, res) in _scan_cache.items():
        p = res.get("pair") or {}
        a = res.get("assessment") or {}
        ticks.append({
            "sym": (p.get("baseToken") or {}).get("symbol") or "?",
            "chain": chain_key.upper(),
            "address": address,
            "px": float(p["priceUsd"]) if p.get("priceUsd") else None,
            "chg": (p.get("priceChange") or {}).get("h24"),
            "risk": a.get("score"),
            "level": a.get("level"),
            "ts": res.get("ts"),
        })
    return {"now": datetime.now(UTC).isoformat(), "scans": _STATS["scans"],
            "uptime_s": int(time.monotonic() - _T0), "clients": len(_WS_CLIENTS),
            "ticks": ticks}

@app.websocket("/ws/snap")
async def ws_snap(ws: WebSocket) -> None:
    """Full-snapshot ticker: identical honest state for every client, no
    random walk. Frontend liveStream.startPolling swaps to this in B4b.
    Auth via ?token= against WS_AUTH_TOKEN (empty env = dev-open)."""
    # accept-then-close so the custom code actually reaches the client
    # (closing before accept collapses to a generic HTTP 403 handshake)
    if not _ws_auth_ok(ws):
        await ws.accept()
        await ws.close(code=4401)  # unauthorized
        return
    if len(_WS_CLIENTS) >= _ws_max_clients():
        await ws.accept()
        await ws.close(code=4429)  # too many clients
        return
    await ws.accept()
    _WS_CLIENTS.add(ws)
    try:
        while True:
            await ws.send_json(_snap())
            await asyncio.sleep(15)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        _WS_CLIENTS.discard(ws)


# ── G.4: live tape — additive delta channel over real GT per-trade data ──
# /ws/snap and its payload schema above are untouched; /ws/tape is a separate
# channel whose frames carry only trades GeckoTerminal actually returned
# (deltas deduped by trade identity — nothing replayed, nothing fabricated).

def _tape_interval() -> float:
    try:
        v = float(os.environ.get("ALPHA_TAPE_INTERVAL_S", "5"))
    except ValueError:
        return 5.0
    return max(0.2, v)  # floor: a runaway client must not spam upstream


def _latest_scan_pool() -> tuple[str, str] | None:
    """"Active pool" = the pool of the most recent /api/scan result."""
    newest = None
    for (chain_key, _addr), (at, res) in _scan_cache.items():
        pool = (res.get("pair") or {}).get("pairAddress")
        if pool and (newest is None or at > newest[0]):
            newest = (at, chain_key, pool)
    return (newest[1], newest[2]) if newest else None


def _tape_delta(seen: dict[str, bool], trades: list[dict]) -> list[dict]:
    """Return the trades not yet sent on this connection, marking them seen.
    First poll = full recent window; later polls = only new identities."""
    fresh = []
    for t in trades:
        key = f"{t.get('wallet')}|{t.get('ts')}|{t.get('kind')}|{t.get('usd')}"
        if seen.get(key):
            continue
        seen[key] = True
        fresh.append(t)
    while len(seen) > 512:  # insertion-ordered — drop the oldest identities
        del seen[next(iter(seen))]
    return fresh


@app.websocket("/ws/tape")
async def ws_tape(ws: WebSocket, chain: str | None = None, pool: str | None = None) -> None:
    """Live trade tape for the active pool: additive delta frames of real
    GeckoTerminal trades (same trade schema the clustering heuristic eats).
    ?chain=&pool= pins a pool; without params the tape follows the most
    recently scanned pool. Same auth + client cap as /ws/snap."""
    if not _ws_auth_ok(ws):
        await ws.accept()
        await ws.close(code=4401)  # unauthorized
        return
    if len(_WS_CLIENTS) >= _ws_max_clients():
        await ws.accept()
        await ws.close(code=4429)  # too many clients
        return
    if bool(chain) != bool(pool) or (chain and chain not in geckoterminal.NETWORKS):
        await ws.accept()
        await ws.close(code=4400)  # pinned pool needs both chain and pool, chain must be live
        return
    await ws.accept()
    _WS_CLIENTS.add(ws)
    try:
        seen: dict[str, dict[str, bool]] = {}
        while True:
            target = (chain, pool) if chain and pool else _latest_scan_pool()
            if target is None:
                await ws.send_json({"type": "tape", "chain": None, "pool": None,
                                    "trades": [], "ts": datetime.now(UTC).isoformat()})
            else:
                ch, pl = target
                frame: dict = {"type": "tape", "chain": ch, "pool": pl,
                               "ts": datetime.now(UTC).isoformat()}
                try:
                    trades = await asyncio.to_thread(geckoterminal.fetch_trades, ch, pl)
                    frame["trades"] = _tape_delta(seen.setdefault(pl, {}), trades)
                except (urllib.error.HTTPError, urllib.error.URLError,
                        TimeoutError, OSError, ValueError) as e:
                    frame["trades"] = []
                    frame["error"] = f"trade fetch failed ({str(e)[:60]})"
                await ws.send_json(frame)
            await asyncio.sleep(_tape_interval())
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        _WS_CLIENTS.discard(ws)

def main() -> None:
    parser = argparse.ArgumentParser(prog="webapp", description="VILMEI web server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
