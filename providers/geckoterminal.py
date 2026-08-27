"""Provider GeckoTerminal — trade individual per-wallet (gratis, tanpa key).

TERVERIFIKASI live 2026-08-27 (network id: solana, bsc, base, avax — semua 200 OK):
- GET /networks/{net}/pools/{pool_address}/trades — attributes per trade:
  tx_from_address, kind ("buy"|"sell"), block_timestamp (ISO-8601 UTC),
  volume_in_usd, from_token_amount, to_token_amount,
  from_token_address, to_token_address. Buy → base token = to_token_address.
- GET /networks/{net}/tokens/{token_address}/pools — response TIDAK terurut
  likuiditas; sort sendiri via attributes.reserve_in_usd.
"hype" ditahan sampai chainId resmi diverifikasi (catatan kerja §3 & §10).
"""
from __future__ import annotations

import json
import urllib.request

BASE = "https://api.geckoterminal.com/api/v2"

NETWORKS = {"sol": "solana", "bnb": "bsc", "base": "base", "avax": "avax"}


def _get(path: str) -> dict:
    req = urllib.request.Request(f"{BASE}{path}", headers={
        "User-Agent": "terminal-alpha/0.1", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)


def fetch_pools(chain_key: str, token_address: str) -> list[dict]:
    """Pool tempat token itu diperdagangkan (raw dari GT)."""
    return _get(f"/networks/{NETWORKS[chain_key]}/tokens/{token_address}/pools").get("data") or []


def best_pool(pools: list[dict]) -> dict | None:
    """Pool likuiditas terbesar — response GT tidak terurut, sort sendiri."""
    if not pools:
        return None

    def _reserve(p: dict) -> float:
        try:
            return float((p.get("attributes") or {}).get("reserve_in_usd") or 0)
        except (TypeError, ValueError):
            return 0.0

    return max(pools, key=_reserve)


def fetch_trades(chain_key: str, pool_address: str) -> list[dict]:
    """Trade terbaru pool → normalisasi buat clustering:
    {"wallet", "kind", "ts" (ISO str), "usd" (float), "base_token"}.
    Trade dengan field wajib bolong di-skip — jangan nebak."""
    data = _get(f"/networks/{NETWORKS[chain_key]}/pools/{pool_address}/trades")
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
    return out
