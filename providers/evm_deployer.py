"""EVM deployer composition (BE-ALL-LIVE F2) — primary → fallback → law-3 gate.

Per chain (FASE-1 probe verdict, docs/reports/phase1-probe-2026-08-30.md):
- base: Blockscout primary — its creation-tx claim is run through the law-3
  on-chain gate (to=null && from==claim). Verified ⇒ shipped with the
  verbatim evidence line. Gate fails or Blockscout 500s/has no row ⇒
  GoPlus fallback, shipped flagged unverified-tx (no creation tx from
  GoPlus ⇒ law 3 cannot be satisfied — never silently trusted).
- bnb: GoPlus only (no public Blockscout instance) — always flagged
  unverified-tx.
- hood/hype: NOT wired — the capability map carries the reason sentences.

Every path returns (data|None, note) and fills `data_source` — the verbatim
provenance line the context block renders verbatim.
"""
from __future__ import annotations

from providers import blockscout, evm, goplus


def _blockscout_verified(chain: str, token: str) -> tuple[dict | None, str | None]:
    data, note = blockscout.get_creation(chain, token)
    if data is None:
        return None, note
    ok, detail = evm.verify_creation(chain, data["tx"], data["deployer"])
    if not ok:
        return None, f"blockscout:verify_failed — {detail}"
    kind = evm.code_kind(chain, data["deployer"])
    return {"deployer": data["deployer"], "deployer_kind": kind,
            "deployer_source": "blockscout", "verified": True,
            "data_source": f"blockscout({chain}) — {detail}"}, None


def _goplus_claimed(chain: str, token: str) -> tuple[dict | None, str | None]:
    data, note = goplus.get_creator(chain, token)
    if data is None:
        return None, note
    kind = evm.code_kind(chain, data["deployer"])
    return {"deployer": data["deployer"], "deployer_kind": kind,
            "deployer_source": "goplus", "verified": False,
            "data_source": (f"goplus({chain}) — creator address claim, NOT "
                            f"on-chain-verifiable (provider ships no creation "
                            f"tx); eth_getCode={kind or 'unknown'}")}, None


def get_creation(chain: str, token: str) -> tuple[dict | None, str | None]:
    """Uniform deployer entry (chain, token) — the chains_map fn for EVM."""
    notes: list[str] = []
    data: dict | None = None

    if chain == "base":
        data, note = _blockscout_verified(chain, token)
        if note:
            notes.append(f"base deployer: blockscout — {note}")
        if data is None:
            data, note = _goplus_claimed(chain, token)
            if note:
                notes.append(f"base deployer: goplus — {note}")
    elif chain == "bnb":
        data, note = _goplus_claimed(chain, token)
        if note:
            notes.append(f"bnb deployer: goplus — {note}")
    else:
        return None, f"evm_deployer:chain_unsupported ({chain})"

    if data is not None and data.get("data_source"):
        notes.append(data["data_source"])
    if data is not None:
        data = {k: v for k, v in data.items() if k != "data_source"}
    return data, ("; ".join(notes) or None)
