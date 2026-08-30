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

from providers import alchemy, helius, jupiter
from webapp.chains import CHAIN_CATALOG

_CAPABILITIES: dict[str, dict[str, dict]] = {
    "sol": {
        "deployer": {"source": "helius", "fn": helius.get_creation},
        "holders": {"source": "helius", "fn": helius.get_largest_accounts},
        "sell_test": {"source": "jupiter", "fn": jupiter.sell_quote},
    },
    "bnb": {
        "deployer": {"source": "alchemy", "fn": alchemy.get_creation},
        "holders": {"source": None,
                    "reason": "no $0 top-holders source on EVM: enumeration "
                              "needs an indexer key (probe 2026-08-30)"},
        "sell_test": {"source": None,
                      "reason": "1inch quote requires an API key "
                                "(probe: 401 unauthenticated)"},
    },
    "base": {
        "deployer": {"source": "alchemy", "fn": alchemy.get_creation},
        "holders": {"source": None,
                    "reason": "no $0 top-holders source on EVM: enumeration "
                              "needs an indexer key (probe 2026-08-30)"},
        "sell_test": {"source": None,
                      "reason": "1inch quote requires an API key "
                                "(probe: 401 unauthenticated)"},
    },
    "avax": {
        "deployer": {"source": "alchemy", "fn": alchemy.get_creation},
        "holders": {"source": None,
                    "reason": "no $0 top-holders source on EVM: enumeration "
                              "needs an indexer key (probe 2026-08-30)"},
        "sell_test": {"source": None,
                      "reason": "1inch quote requires an API key "
                                "(probe: 401 unauthenticated)"},
    },
    "hood": {
        "deployer": {"source": None,
                     "reason": "no $0 deployment source: GT/DS expose no "
                               "creation data for robinhood"},
        "holders": {"source": None,
                    "reason": "no $0 holder source for robinhood"},
        "sell_test": {"source": None,
                      "reason": "DEX-less venues: no route concept"},
    },
    "hype": {
        "deployer": {"source": None,
                     "reason": "no $0 deployment source: GT/DS expose no "
                               "creation data for hyperevm"},
        "holders": {"source": None,
                    "reason": "no $0 holder source for hyperevm"},
        "sell_test": {"source": None,
                      "reason": "DEX-less venues: no route concept"},
    },
}

# where each provider is a legitimate source — the wiring guard checks rows
# against this so a fn can never be attached to a chain it cannot serve
_PROVIDER_CHAINS: dict[str, frozenset[str]] = {
    "helius": frozenset({"sol"}),
    "alchemy": frozenset({"bnb", "base", "avax"}),
    "jupiter": frozenset({"sol"}),
}

CAPABILITY_NAMES = ("deployer", "holders", "sell_test")


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
