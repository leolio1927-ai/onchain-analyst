"""Token gate v0 — free-only (work notes §8; decision: the "deep" path is deferred).

No blockchain/billing/soulbound yet. resolve_tier() is the SINGLE future swap
point (soulbound/time-bound). Invariant §2.3: a tier may only control the LENGTH
of AI output (max_tokens in ai_analyst) — never the evidence or data truth.
"""
from __future__ import annotations

TIERS = ("free", "deep")


def resolve_tier() -> str:
    """v0: always "free" — no on-chain token gate exists yet."""
    return "free"
