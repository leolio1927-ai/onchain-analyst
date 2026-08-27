"""Token gate v0 — free-only (catatan kerja §8; keputusan: jalur "deep" ditunda).

Belum ada blockchain/billing/soulbound. resolve_tier() adalah SATU titik tukar
kelak (soulbound/time-bound). Invariant §2.3: tier hanya boleh mengatur PANJANG
output AI (max_tokens di ai_analyst) — tidak pernah evidence atau kebenaran data.
"""
from __future__ import annotations

TIERS = ("free", "deep")


def resolve_tier() -> str:
    """v0: selalu "free" — token gate on-chain belum ada."""
    return "free"
