"""PROMPT-V3 R4 — fee frontier: the PLANNED VILMEI fee as inspectable data.

The matrix behind every row is docs/FEE-MODELS-2026.md (checked 2026-08-31).
This module is a POLICY CONSTANT surface: deterministic, offline, no network,
and nothing in it charges anything — VILMEI is read-only (no execution, no
custody, no keys). The estimator exists so the fee policy is quotable and
testable before a single basis point could ever flow.

Verdict vocabulary (founder-mandated): SIAP-$0 · PERLU-AGREEMENT-BISNIS ·
TIDAK-ADA. The only row verified live/keyless/agreement-free today is Jupiter
Swap API platformFeeBps on sol.
"""
from __future__ import annotations

import math

CHAINS = ("sol", "bnb", "base", "hype", "hood")

PLANNED_TOTAL_BPS = 50
SPLIT_BPS = {"ops": 30, "buyback": 10, "rewards": 10}  # sums to PLANNED_TOTAL_BPS

HONEST_NOTE = "planned — nothing is charged; VILMEI is read-only"

BUYBACK_BLOCKER = ("VM-fee-01 — the buyback slice has no engine: VILMEI ships "
                   "no execution surface, so nothing here could ever buy back "
                   "anything until a founder decision unblocks it")

PROVENANCE = {"doc": "docs/FEE-MODELS-2026.md", "checked": "2026-08-31",
              "matrix_rows": 7,
              "summary": "only $0 keyless integrator fee verified today = "
                         "Jupiter platformFeeBps (sol); other chains = "
                         "self-deployed hook, partner tier, or BD"}

# per-chain fee path — verbatim from the FEE-MODELS-2026 matrix (one row each;
# sol counts the Swap API tier, the Ultra partner tier is noted inside)
CHAIN_FEE_PATHS: dict[str, dict[str, str]] = {
    "sol": {
        "provider": "jupiter-swap-api",
        "mechanism": ("platformFeeBps on /quote + /swap, paid on-chain to the "
                      "integrator feeAccount in the swap mint"),
        "verdict": "SIAP-$0",
        "note": ("keyless probe 2026-08-31: lite-api.jup.ag accepted feeBps and "
                 "echoed platformFee — no key, no agreement; planned 50 bps is "
                 "below every figure observed. Ultra partner tier (20% share) "
                 "exists but needs an agreement"),
    },
    "bnb": {
        "provider": "none-keyless",
        "mechanism": ("integrator fee requires a self-deployed hook (Uniswap v4 "
                      "or PancakeSwap Infinity); no keyless API parameter exists"),
        "verdict": "TIDAK-ADA",
        "note": ("escape hatch = deploy + audit our own hook; Pancake "
                 "dynamic-fee-hook caps at 5% and is an LP/arbitrage tool, not "
                 "an integrator fee"),
    },
    "base": {
        "provider": "none-keyless",
        "mechanism": ("hook path (Uniswap v4) or a BD conversation (Aerodrome "
                      "veAERO/gauge model) — no keyless integrator-fee API found"),
        "verdict": "TIDAK-ADA",
        "note": ("Aerodrome docs unreachable from the probe environment; hook "
                 "deployment = slow lane, per-venue audit budget"),
    },
    "hype": {
        "provider": "hyperliquid-hip3",
        "mechanism": ("HIP-3 builder-deployed perps with builder fee share + "
                      "builder codes; HyperEVM spot itself is gas-only"),
        "verdict": "PERLU-AGREEMENT-BISNIS",
        "note": "builder application required — spot has no fee scheme",
    },
    "hood": {
        "provider": "none-public",
        "mechanism": "no public integrator-fee scheme found for chain id 4663",
        "verdict": "TIDAK-ADA",
        "note": ("TBD — docs host unreachable in probe; chain liveness proven "
                 "via GoPlus supported_chains (id 4663)"),
    },
}


def _usd(amount: float, bps: int) -> float:
    return round(amount * bps / 10000, 2)


def estimate(chain: str, amount_usd: float) -> dict:
    """The planned fee for one notional on one chain. Raises ValueError on an
    unknown chain or a non-finite/negative amount — the route layer maps that
    to the honest 404/400 sentences."""
    chain_key = chain.strip().lower()
    if chain_key not in CHAINS:
        raise ValueError(f"unknown chain '{chain_key}' — pick {'|'.join(CHAINS)}")
    if not math.isfinite(amount_usd) or amount_usd < 0:
        raise ValueError("amountUsd must be a finite number ≥ 0")
    path = CHAIN_FEE_PATHS[chain_key]
    return {
        "data_mode": "static",
        "schema_version": "1.0",
        "sources": ["policy:docs/FEE-MODELS-2026.md"],
        "chain": chain_key,
        "amount_usd": amount_usd,
        "planned_rate_bps": PLANNED_TOTAL_BPS,
        "split_bps": dict(SPLIT_BPS),
        "estimate_usd": _usd(amount_usd, PLANNED_TOTAL_BPS),
        "split_usd": {k: _usd(amount_usd, b) for k, b in SPLIT_BPS.items()},
        "provider": dict(path),
        "matrix": {c: dict(p) for c, p in CHAIN_FEE_PATHS.items()},
        "buyback_blocker": BUYBACK_BLOCKER,
        "honest_note": HONEST_NOTE,
        "provenance": dict(PROVENANCE),
    }
