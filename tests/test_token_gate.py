"""Token gate v0: free-only sampai soulbound ada — invariant §2.3 dijaga di tempat lain."""
from access import token_gate


def test_v0_free_only():
    assert token_gate.resolve_tier() == "free"


def test_tier_dikenal():
    assert token_gate.resolve_tier() in token_gate.TIERS
