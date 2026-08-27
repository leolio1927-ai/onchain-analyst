"""Provider DexScreener — agregat harga/likuiditas/volume (tanpa key).
Terverifikasi: DexScreener TIDAK menyediakan data per-wallet (catatan kerja §5/§10)."""
from __future__ import annotations

import json
import urllib.request

CHAIN_IDS = {"sol": "solana", "bnb": "bsc", "base": "base", "avax": "avax"}
# "hype" sengaja ditahan sampai chainId terverifikasi (catatan kerja §3 & §10).


def fetch_pairs(chain_key: str, address: str) -> list[dict]:
    url = f"https://api.dexscreener.com/latest/dex/tokens/{address}"
    req = urllib.request.Request(url, headers={"User-Agent": "terminal-alpha/0.1"})
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.load(r)
    return [p for p in (data.get("pairs") or []) if p.get("chainId") == CHAIN_IDS[chain_key]]


def best_pair(pairs: list[dict]) -> dict | None:
    if not pairs:
        return None
    return max(pairs, key=lambda p: (p.get("liquidity") or {}).get("usd") or 0)


def fetch_pair(chain_key: str, address: str) -> dict | None:
    return best_pair(fetch_pairs(chain_key, address))
