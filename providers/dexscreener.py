"""Provider DexScreener — aggregate price/liquidity/volume (keyless).
Verified: DexScreener provides NO per-wallet data (work notes §5/§10)."""
from __future__ import annotations

import json
import urllib.request

CHAIN_IDS = {"sol": "solana", "bnb": "bsc", "base": "base", "avax": "avalanche", "hood": "robinhood"}  # verified live 2026-08-28/29: DS chainIds "robinhood" and "avalanche" (NOT "avax" — that slug matched nothing)
# "hype" is deliberately held back until its chainId is verified (work notes §3 & §10).


def _chain_id(chain_key: str) -> str:
    """Resolve the upstream chainId; raise a readable error for unknown keys
    (same pattern as geckoterminal._net) instead of a bare KeyError."""
    if chain_key not in CHAIN_IDS:
        raise ValueError(f"dexscreener: no chainId for chain {chain_key!r} "
                         f"(live: {', '.join(sorted(CHAIN_IDS))})")
    return CHAIN_IDS[chain_key]


def fetch_pairs(chain_key: str, address: str) -> list[dict]:
    url = f"https://api.dexscreener.com/latest/dex/tokens/{address}"
    req = urllib.request.Request(url, headers={"User-Agent": "terminal-alpha/0.1"})
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.load(r)
    chain_id = _chain_id(chain_key)
    return [p for p in (data.get("pairs") or []) if p.get("chainId") == chain_id]


def best_pair(pairs: list[dict]) -> dict | None:
    if not pairs:
        return None
    return max(pairs, key=lambda p: (p.get("liquidity") or {}).get("usd") or 0)


def fetch_pair(chain_key: str, address: str) -> dict | None:
    return best_pair(fetch_pairs(chain_key, address))

# Launch venue: friendly name per dexId (launchpad/AMM where the token was born).
# Unknown dexId passes through raw — no guessing beyond dexscreener's own labels.
VENUE_MAP = {
    "pumpfun": "pump.fun", "pumpswap": "pumpswap", "launchlab": "bonk.fun (LaunchLab)",
    "bonkfun": "bonk.fun", "raydium": "raydium", "meteora": "meteora", "orca": "orca",
    "four": "four.meme", "clanker": "clanker", "virtuals": "virtuals",
    "uniswap": "uniswap", "pancakeswap": "pancakeswap",
}

def launch_venue(pairs: list[dict]) -> str | None:
    """Birthplace = earliest pairCreatedAt among the requested chain's pairs —
    the venue the token launched on within that chain, not where it later migrated."""
    earliest = min((p for p in pairs if p.get("pairCreatedAt")),
                   key=lambda p: p["pairCreatedAt"], default=None)
    if earliest is None:
        return None
    dex = earliest.get("dexId") or ""
    return VENUE_MAP.get(dex, dex or None)
