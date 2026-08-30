"""Capability wiring — one interface, six honest sources (BE-F5a-R).

The matrix below is the probe's verdict (docs/reports/capability-probe-2026-08-30.md)
rendered as wiring. Every capability × chain is EXACTLY one of:
  {"source": "<provider>", "fn": <callable>}   — a wired code path;
  {"source": None, "reason": "<sentence>"}     — no $0 path; the reason is
                                                  the answer, not a bug.
`/api/v1/chains` renders this map verbatim, so "who computes deployer on
hype?" has a sentence for an answer. Runtime notes ("<provider>:not_configured",
"<provider>:timeout", "alchemy:slot_check_failed") travel in the TokenContext
block — they describe THIS request, the catalog describes the design.

validate() is the F4-guard spirit applied to wiring: a row must have exactly
one of source/reason, its provider must actually support that chain
(_PROVIDER_CHAINS), a null row must not carry a fn, and the chain set must
equal the catalog's. Monkeypatching a row red-puts the test the moment the
two disagree.
"""
from __future__ import annotations

from providers import evm_deployer, goplus, helius, jupiter, whales
from webapp.chains import CHAIN_CATALOG

_EVM_NO_HOLDERS = ("probe 2026-08-30: top-holder enumeration needs an indexer "
                   "key; alchemy free RPC cannot enumerate holders")

_CAPABILITIES: dict[str, dict[str, dict]] = {
    "sol": {
        "deployer": {"source": "helius", "fn": helius.get_creation},
        "holders": {"source": "helius", "fn": helius.get_largest_accounts},
        "sell_test": {"source": "jupiter", "fn": jupiter.sell_quote},
        "whales": {"source": "helius", "fn": whales.whales},
        "rug_flags": {"source": "helius", "fn": helius.get_asset},
    },
    "bnb": {
        # FASE-1 probe: goplus keyless creator (LIVE, CAKE) — the provider
        # ships no creation tx, so claims ride flagged unverified-tx
        "deployer": {"source": "goplus", "fn": evm_deployer.get_creation},
        "rug_flags": {"source": "goplus", "fn": goplus.security_flags},
        "holders": {"source": None, "reason": _EVM_NO_HOLDERS},
        "sell_test": {"source": None,
                      "reason": "1inch quote requires an API key "
                                "(probe: 401 unauthenticated)"},
        "whales": {"source": None, "reason": "birdeye trade endpoints answer 404 on the free tier (probe 2026-08-30); no $0 trade feed"},
    },
    "base": {
        # FASE-1 probe: blockscout primary (LIVE, law-3 verified on AERO);
        # goplus fallback composed inside evm_deployer.get_creation
        "deployer": {"source": "blockscout", "fn": evm_deployer.get_creation},
        "rug_flags": {"source": "goplus", "fn": goplus.security_flags},
        "holders": {"source": None, "reason": _EVM_NO_HOLDERS},
        "sell_test": {"source": None,
                      "reason": "1inch quote requires an API key "
                                "(probe: 401 unauthenticated)"},
        "whales": {"source": None, "reason": "birdeye trade endpoints answer 404 on the free tier (probe 2026-08-30); no $0 trade feed"},
    },
    # avax row parked 2026-08-30 (founder: 5-chain lineup) — was: "avax": {         "deployer": {"source": None, "reason": _EVM_NO_DEPLOYER},         "holders": {"source": None, "reason": _EVM_NO_HOLDERS},         "sell_test": {"source": None,                       "reason": "1inch quote requires an API key "                                 "(probe: 401 unauthenticated)"},     },

    "hood": {
        "deployer": {"source": None,
                     "reason": "no $0 deployment source: GT/DS expose no "
                               "creation data for robinhood"},
        "holders": {"source": None,
                    "reason": "no $0 holder source for robinhood"},
        "sell_test": {"source": None,
                      "reason": "DEX-less venues: no route concept"},
        "whales": {"source": None, "reason": "birdeye trade endpoints answer 404 on the free tier (probe 2026-08-30); no $0 trade feed"},
        "rug_flags": {"source": None,
                      "reason": "no security API covers robinhood at $0 (probe 2026-08-30)"},
    },
    "hype": {
        "deployer": {"source": None,
                     "reason": "no $0 deployment source: GT/DS expose no "
                               "creation data for hyperevm"},
        "holders": {"source": None,
                    "reason": "no $0 holder source for hyperevm"},
        "sell_test": {"source": None,
                      "reason": "DEX-less venues: no route concept"},
        "whales": {"source": None, "reason": "birdeye trade endpoints answer 404 on the free tier (probe 2026-08-30); no $0 trade feed"},
        "rug_flags": {"source": None,
                      "reason": "no security API covers hyperevm at $0 (probe 2026-08-30)"},
    },
}

# where each provider is a legitimate source — the wiring guard checks rows
# against this so a fn can never be attached to a chain it cannot serve.
# alchemy: NO chains — the probe rejected its deployment category on every
# EVM network we serve (providers/alchemy.py stays as the working client for
# the day an indexer-grade source lands).
_PROVIDER_CHAINS: dict[str, frozenset[str]] = {
    "helius": frozenset({"sol"}),
    "blockscout": frozenset({"base"}),
    "goplus": frozenset({"bnb", "base"}),
    "jupiter": frozenset({"sol"}),
}

CAPABILITY_NAMES = ("deployer", "holders", "sell_test", "whales", "rug_flags")


def capabilities_for(chain: str) -> dict[str, dict]:
    """chain → its three capability rows (wired fn or explicit reason)."""
    return _CAPABILITIES.get(chain) or {
        cap: {"source": None, "reason": f"chain '{chain}' is not in the "
                                        f"capability map"}
        for cap in CAPABILITY_NAMES}


def capabilities_view() -> dict[str, dict[str, dict]]:
    """The API-rendered map: fn references stripped, source/reason only."""
    out: dict[str, dict[str, dict]] = {}
    for chain, caps in _CAPABILITIES.items():
        out[chain] = {
            cap: ({"source": row["source"]} if row["source"] is not None
                  else {"source": None, "reason": row["reason"]})
            for cap, row in caps.items()}
    return out


def validate() -> None:
    """Wiring ⇄ catalog ⇄ provider-chain equivalence. Raises AssertionError
    on any disagreement (called by the catalog + context tests)."""
    assert set(_CAPABILITIES) == set(CHAIN_CATALOG), (
        "capability map chains != CHAIN_CATALOG chains — update both")
    for chain, caps in _CAPABILITIES.items():
        assert set(caps) == set(CAPABILITY_NAMES), f"{chain}: capability set drifted"
        for cap, row in caps.items():
            if row["source"] is None:
                assert row.get("reason"), f"{chain}.{cap}: null source needs a reason"
            else:
                assert callable(row.get("fn")), (
                    f"{chain}.{cap}: source '{row['source']}' without a fn")
                assert chain in _PROVIDER_CHAINS.get(row["source"], frozenset()), (
                    f"{chain}.{cap}: provider '{row['source']}' cannot serve "
                    f"this chain")
