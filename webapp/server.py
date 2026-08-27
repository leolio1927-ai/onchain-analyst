"""Terminal Alpha web — FastAPI backend serving the React frontend + read-only JSON API.

Boundary (catatan kerja §4): this layer only orchestrates providers → heuristics →
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
import os
import re
import time
import urllib.error
from collections import defaultdict, deque
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

import ai_analyst
from access import token_gate
from heuristics import clustering, rug_check
from providers import dexscreener, geckoterminal, helius

CACHE_TTL_S = 30.0

_ADDRESS_RES = {
    "sol": re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$"),
    "bnb": re.compile(r"^0x[a-fA-F0-9]{40}$"),
    "base": re.compile(r"^0x[a-fA-F0-9]{40}$"),
    "avax": re.compile(r"^0x[a-fA-F0-9]{40}$"),
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


class ExplainBody(BaseModel):
    chain: str
    address: str
    provider: str = "claude"


class WhaleBody(BaseModel):
    address: str


app = FastAPI(title="Terminal Alpha", docs_url=None, redoc_url=None)


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
    honest degrade (severity None + reason), the other signals still run."""
    pair = await asyncio.to_thread(dexscreener.fetch_pair, chain_key, address)
    if pair is None:
        return None

    pool = pair.get("pairAddress")
    token = (pair.get("baseToken") or {}).get("address")
    try:
        trades: list[dict] = []
        if pool:
            trades = await asyncio.to_thread(geckoterminal.fetch_trades, chain_key, pool)
        if not trades and token:
            pools = await asyncio.to_thread(geckoterminal.fetch_pools, chain_key, token)
            best = geckoterminal.best_pool(pools)
            addr = (best.get("attributes") or {}).get("address") if best else None
            if addr:
                trades = await asyncio.to_thread(geckoterminal.fetch_trades, chain_key, addr)
        cl = clustering.analyze(trades)
    except urllib.error.HTTPError as e:
        cl = {"wallets": 0, "buys": 0, "severity": None,
              "evidence": f"GeckoTerminal HTTP {e.code} — clustering data unavailable"}
    except Exception as e:  # noqa: BLE001 — clustering failing ≠ token can't be assessed
        cl = {"wallets": 0, "buys": 0, "severity": None,
              "evidence": f"GeckoTerminal failed ({str(e)[:60]}) — clustering data unavailable"}

    assessment = rug_check.assess(pair, cl)
    return {"pair": _pair_view(pair), "assessment": assessment, "clustering": cl,
            "sources": ["dexscreener", "geckoterminal"],
            "ts": datetime.now(UTC).isoformat()}


async def _get_scan(chain_key: str, address: str) -> dict:
    key = (chain_key, address)
    hit = _scan_cache.get(key)
    now = time.monotonic()
    if hit and now - hit[0] < CACHE_TTL_S:
        return hit[1]
    result = await _scan_chain(chain_key, address)
    if result is None:
        raise HTTPException(404, f"no pair found for {address} on {chain_key} — check address/chain")
    _scan_cache[key] = (now, result)
    return result


def _ai_rate_ok(ip: str) -> bool:
    hourly, daily = _ai_rate_limits()
    now = time.time()
    q = _ai_hits[ip]
    while q and now - q[0] > 86_400:
        q.popleft()
    if len(q) >= daily or sum(1 for t in q if now - t < 3_600) >= hourly:
        return False
    q.append(now)
    return True


@app.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok",
        "chains": sorted(dexscreener.CHAIN_IDS),
        "tier": token_gate.resolve_tier(),
        "ai_providers": [k for k, p in ai_analyst.PROVIDERS.items()
                         if os.environ.get(p.env_key)],
    }


@app.post("/api/scan")
async def api_scan(body: ScanBody) -> dict:
    _validate(body.chain, body.address)
    return await _get_scan(body.chain, body.address)


@app.post("/api/explain")
async def api_explain(body: ExplainBody, request: Request) -> dict:
    if body.provider not in ai_analyst.PROVIDERS:
        raise HTTPException(400, f"unknown provider '{body.provider}' — pick {'|'.join(ai_analyst.PROVIDERS)}")
    ip = request.client.host if request.client else "unknown"
    if not _ai_rate_ok(ip):
        hourly, daily = _ai_rate_limits()
        raise HTTPException(429, f"AI rate limit reached ({hourly}/hour, {daily}/day on the free tier) — try again later")
    _validate(body.chain, body.address)
    scan = await _get_scan(body.chain, body.address)
    try:
        out = await asyncio.to_thread(ai_analyst.explain, scan["pair"], scan["assessment"],
                                      token_gate.resolve_tier(), body.provider)
    except ai_analyst.NoKeyError as e:
        raise HTTPException(503, str(e)) from e
    return {**out, "tier": token_gate.resolve_tier(), "provider": body.provider}


@app.post("/api/whale")
async def api_whale(body: WhaleBody) -> dict:
    if not re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]{32,44}|0x[a-fA-F0-9]{40}", body.address or ""):
        raise HTTPException(400, "invalid wallet address format")
    try:
        return await asyncio.to_thread(helius.fetch_balances, body.address)
    except helius.NoKeyError as e:
        raise HTTPException(503, str(e)) from e


_NO_BUILD = """<!doctype html><html><head><meta charset="utf-8">
<title>Terminal Alpha</title><style>body{background:#0a0e14;color:#8b98a9;
font-family:ui-monospace,monospace;display:grid;place-items:center;height:100vh;margin:0}
code{color:#ffb000}</style></head><body><div><p>Frontend not built yet.</p>
<p>Run: <code>cd frontend && npm install && npm run build</code></p></div></body></html>"""


def _page(name: str) -> FileResponse | HTMLResponse:
    f = _dist_dir() / name
    if f.is_file():
        return FileResponse(f)
    return HTMLResponse(_NO_BUILD, status_code=503)


@app.get("/", include_in_schema=False)
async def index():
    return _page("index.html")


@app.get("/terminal", include_in_schema=False)
async def terminal():
    return _page("terminal.html")


@app.get("/assets/{subpath:path}", include_in_schema=False)
async def assets(subpath: str):
    base = (_dist_dir() / "assets").resolve()
    f = (base / subpath).resolve()
    if not f.is_relative_to(base) or not f.is_file():
        raise HTTPException(404, "asset not found — is the frontend built?")
    return FileResponse(f)


def main() -> None:
    parser = argparse.ArgumentParser(prog="webapp", description="Terminal Alpha web server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
