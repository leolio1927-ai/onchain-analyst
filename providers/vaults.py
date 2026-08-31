"""PROMPT-V4 M3 — vault destinations: where the PLANNED fee slices would land.

Claim-based by law (docs/FEE-VAULTS.md): the founder holds every vault key;
this repo sees PUBLIC ADDRESSES ONLY, supplied by the founder in .env as
VAULT_{CHAIN}_{SLICE}_ADDRESS. This module never generates, stores, derives
or asks for a key — an unclaimed slice stays null with an honest sentence,
exactly like a declared-null feed. Nothing flows: VILMEI is read-only, so the
vault map is policy data published BEFORE a single basis point could move.
"""
from __future__ import annotations

import os

from . import fee_models

SLICES = tuple(fee_models.SPLIT_BPS)           # ops, buyback, rewards

CLAIMED = "claimed"
AWAITING = "awaiting-founder"

HONEST_NOTE = ("vault map = policy data: public addresses only, founder-claimed "
               "in .env; no key ever enters this repo and nothing is charged")

PROVENANCE = {"doc": "docs/FEE-VAULTS.md", "checked": "2026-08-31",
              "law": "no key generation, no signing, no execution — claim-based",
              "env_pattern": "VAULT_{CHAIN}_{SLICE}_ADDRESS"}


def env_key(chain: str, slice_: str) -> str:
    return f"VAULT_{chain.upper()}_{slice_.upper()}_ADDRESS"


def _vault(chain: str, slice_: str) -> dict:
    address = (os.environ.get(env_key(chain, slice_)) or "").strip() or None
    if address:
        return {"address": address, "status": CLAIMED,
                "note": f"{slice_} vault claimed by the founder (public address only)"}
    return {"address": None, "status": AWAITING,
            "note": (f"{slice_} vault unclaimed — the founder sets "
                     f"{env_key(chain, slice_)} in .env; the repo never "
                     "generates an address")}


def destinations() -> dict:
    """The 5-chain × 3-slice vault map: claimed address or declared-null."""
    chains: dict[str, dict] = {}
    claimed = 0
    for chain in fee_models.CHAINS:
        vaults = {s: _vault(chain, s) for s in SLICES}
        claimed += sum(1 for v in vaults.values() if v["status"] == CLAIMED)
        chains[chain] = {
            "fee_path_verdict": fee_models.CHAIN_FEE_PATHS[chain]["verdict"],
            "vaults": vaults,
        }
    return {
        "data_mode": "static",
        "sources": ["policy:docs/FEE-VAULTS.md"],
        "slices_bps": dict(fee_models.SPLIT_BPS),
        "chains": chains,
        "claimed": claimed,
        "total": len(fee_models.CHAINS) * len(SLICES),
        "honest_note": HONEST_NOTE,
        "provenance": dict(PROVENANCE),
    }
