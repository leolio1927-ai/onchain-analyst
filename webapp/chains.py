"""Chain capability catalog (BE-F4) — the structured single source of truth
for the provider matrix first laid out in the backend gap audit (§2).

This is CONFIG, not observation: each row encodes today's verified provider
support. Honesty law for this file:
- a False cell means the provider genuinely cannot serve that capability on
  that chain today — the absence is stated, never papered over;
- the guard (validate_against_providers) asserts the flags equal what the
  provider modules can actually serve, so a provider-side change (a new
  network in DexScreener/GT) fails the catalog test until this file is
  consciously updated — no silent drift, same spirit as the openapi snapshot;
- venues are launch-venue labels traceable to the providers' own observed
  slug maps (live.LAUNCHPAD / dexscreener.VENUE_MAP); logo_ref stays None —
  the chain marks live in the frontend bundle, no backend asset path exists.

Known-false cells (honesty-critical):
- hood.clustering  = False — GeckoTerminal has no robinhood network
  (providers/geckoterminal.py NETWORKS), so wallet clustering can never run;
  hood scans honestly carry a 5-signal denominator instead of 6;
- hype.scan        = False — no verified DexScreener chainId yet
  (providers/dexscreener.py holds it back);
- hype.clustering  = False — GT has no hyperevm entry in NETWORKS either;
- hype.socials     = False — DexScreener does not list hyperevm
  (providers/live.py _enrich_socials).
"""
from __future__ import annotations

from providers import dexscreener, geckoterminal, live

ChainId = str

CHAIN_CATALOG: dict[ChainId, dict] = {
    "sol": {
        "name": "Solana", "symbol": "SOL",
        "scan": True, "clustering": True, "socials": True, "live_feed": True,
        "venues": ["pump.fun", "pumpswap", "raydium", "meteora", "zerofi", "orca"],
        "logo_ref": None,
    },
    "bnb": {
        "name": "BNB Chain", "symbol": "BNB",
        "scan": True, "clustering": True, "socials": True, "live_feed": True,
        "venues": ["pancakeswap", "four.meme"],
        "logo_ref": None,
    },
    "base": {
        "name": "Base", "symbol": "ETH",
        "scan": True, "clustering": True, "socials": True, "live_feed": True,
        "venues": ["uniswap", "aerodrome", "clanker", "virtuals"],
        "logo_ref": None,
    },
    "avax": {
        "name": "Avalanche", "symbol": "AVAX",
        "scan": True, "clustering": True, "socials": True, "live_feed": True,
        "venues": ["uniswap", "traderjoe", "pharaoh", "blackhole"],
        "logo_ref": None,
    },
    "hood": {
        "name": "Robinhood Chain", "symbol": None,
        "scan": True, "clustering": False, "socials": True, "live_feed": True,
        "venues": ["uniswap"],
        "logo_ref": None,
    },
    "hype": {
        "name": "HyperEVM", "symbol": "HYPE",
        "scan": False, "clustering": False, "socials": False, "live_feed": True,
        "venues": ["ring-exchange"],
        "logo_ref": None,
    },
}


def validate_against_providers() -> None:
    """Catalog ⇄ provider equivalence guard. Raises AssertionError when the
    two disagree — call it wherever drift would matter (the catalog test
    calls it on every run; wiring surfaces will call it at boot)."""
    assert set(CHAIN_CATALOG) == set(live.CHAINS), (
        f"catalog chains {sorted(CHAIN_CATALOG)} != live feed chains "
        f"{sorted(live.CHAINS)} — update both in the same change")
    for chain_id, info in CHAIN_CATALOG.items():
        assert info["scan"] == (chain_id in dexscreener.CHAIN_IDS), (
            f"{chain_id}: scan flag disagrees with dexscreener.CHAIN_IDS")
        assert info["socials"] == (chain_id in dexscreener.CHAIN_IDS), (
            f"{chain_id}: socials flag disagrees with dexscreener.CHAIN_IDS")
        assert info["clustering"] == (chain_id in geckoterminal.NETWORKS), (
            f"{chain_id}: clustering flag disagrees with geckoterminal.NETWORKS")
        assert info["live_feed"] == bool(
            live.CHAINS.get(chain_id, {}).get("live")), (
            f"{chain_id}: live_feed flag disagrees with live.CHAINS")
