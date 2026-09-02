"""Tests for Slot D.3: Provider Settlement Status Normalizer.

Verifies canonical provider parsing, invariant guards, same-chain vs cross-chain
destination evidence rules, and transition argument generation using fixtures/mocks only.
"""
from __future__ import annotations

import inspect
from pathlib import Path

import pytest

from providers import settlement_repository as repo
from providers import settlement_status as status_mod
from webapp import db


@pytest.fixture
def tmp_db(tmp_path: Path) -> Path:
    """Create a clean isolated SQLite test database with schema initialized to v5."""
    db_file = tmp_path / "test_status_vilmei.db"
    conn = db.connect(db_file)
    db.init_schema(conn)
    conn.close()
    return db_file


# ── Mandatory D.3 Tests ───────────────────────────────────────────────────

def test_lifi_source_status_does_not_complete() -> None:
    """1. LI.FI status with source hash only does not complete or confirm destination."""
    raw = {
        "status": "DONE",
        "sending": {"txHash": "0xsrc_lifi_111"},
        "receiving": {},  # destination missing
    }
    res = status_mod.normalize_settlement_status(raw, provider="lifi")
    assert res.proposed_state != "COMPLETED"
    assert res.proposed_state != "DEST_CONFIRMED"
    assert res.proposed_state == "SOLVER_FILLING"
    assert res.has_dest_evidence is False
    assert res.has_source_evidence is True


def test_lifi_destination_confirmed_maps_to_dest_confirmed() -> None:
    """2. LI.FI status with confirmed destination tx maps to DEST_CONFIRMED."""
    raw = {
        "status": "DONE",
        "sending": {"txHash": "0xsrc_lifi_222"},
        "receiving": {
            "txHash": "0xdst_lifi_222",
            "amount": "99.5",
        },
    }
    res = status_mod.normalize_settlement_status(raw, provider="lifi")
    assert res.proposed_state == "DEST_CONFIRMED"
    assert res.has_dest_evidence is True
    assert res.dest_tx_hash == "0xdst_lifi_222"
    assert res.amount_dest_observed == "99.5"
    assert res.transition_args is not None
    assert res.transition_args.to_state == "DEST_CONFIRMED"


def test_relay_solver_filling_maps_internal_solver() -> None:
    """3. Relay status pending_fill maps to internal SOLVER_FILLING."""
    raw = {
        "status": "pending_fill",
        "inTxHash": "0xsrc_relay_333",
    }
    res = status_mod.normalize_settlement_status(raw, provider="relay")
    assert res.proposed_state == "SOLVER_FILLING"
    assert res.has_source_evidence is True
    assert res.has_dest_evidence is False
    assert res.transition_args is not None
    assert res.transition_args.to_state == "SOLVER_FILLING"


def test_mayan_unknown_status_maps_stuck() -> None:
    """4. Mayan unknown or malformed status maps to STUCK_UNKNOWN."""
    raw = {
        "status": "MYSTERY_PHASE",
        "swapHash": "0xmayan_444",
    }
    res = status_mod.normalize_settlement_status(raw, provider="mayan")
    assert res.proposed_state == "STUCK_UNKNOWN"
    assert res.reason == "provider_status_unparsed"
    assert res.unknown_reason == "unrecognized_mayan_status"
    assert res.transition_args is not None
    assert res.transition_args.to_state == "STUCK_UNKNOWN"
    assert res.transition_args.stuck_reason == "status_unparsable"


def test_jupiter_same_chain_signature_confirmed_can_map_dest_only_if_same_chain_rule_true() -> None:
    """5. Jupiter same-chain signature confirmed can map to DEST_CONFIRMED."""
    raw = {
        "confirmationStatus": "confirmed",
        "signature": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        "err": None,
    }
    res = status_mod.normalize_settlement_status(
        raw,
        provider="jupiter",
        source_chain="sol",
        dest_chain="sol",
    )
    assert res.proposed_state == "DEST_CONFIRMED"
    assert res.has_dest_evidence is True
    assert res.dest_tx_hash == "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"


def test_jupiter_source_only_does_not_confirm_destination() -> None:
    """6. Jupiter cross-chain or unconfirmed source does not confirm destination."""
    # Scenario A: processed (not confirmed)
    raw_unconfirmed = {
        "confirmationStatus": "processed",
        "signature": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    }
    res_a = status_mod.normalize_settlement_status(
        raw_unconfirmed,
        provider="jupiter",
        source_chain="sol",
        dest_chain="sol",
    )
    assert res_a.proposed_state == "SUBMITTED_PENDING"
    assert res_a.has_dest_evidence is False

    # Scenario B: cross-chain specified (Solana -> Base) with Jupiter
    raw_cross = {
        "confirmationStatus": "confirmed",
        "signature": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    }
    res_b = status_mod.normalize_settlement_status(
        raw_cross,
        provider="jupiter",
        source_chain="sol",
        dest_chain="base",
    )
    assert res_b.proposed_state == "SOURCE_CONFIRMED"
    assert res_b.has_dest_evidence is False
    assert res_b.dest_tx_hash is None


def test_debridge_bridge_fill_maps_dest_or_solver() -> None:
    """7. deBridge DLN order mapping: Created maps to SOLVER_FILLING, Fulfilled maps to DEST_CONFIRMED."""
    # Created
    raw_open = {
        "status": "Created",
        "orderCreationTxHash": "0xdeb_src",
    }
    res_open = status_mod.normalize_settlement_status(raw_open, provider="debridge")
    assert res_open.proposed_state == "SOLVER_FILLING"
    assert res_open.has_dest_evidence is False

    # Fulfilled with destination tx
    raw_fulfilled = {
        "status": "Fulfilled",
        "orderCreationTxHash": "0xdeb_src",
        "fulfillTxHash": "0xdeb_dst",
    }
    res_fulfilled = status_mod.normalize_settlement_status(raw_fulfilled, provider="debridge")
    assert res_fulfilled.proposed_state == "DEST_CONFIRMED"
    assert res_fulfilled.has_dest_evidence is True
    assert res_fulfilled.dest_tx_hash == "0xdeb_dst"


def test_unknown_provider_returns_stuck_unknown() -> None:
    """8. Unknown provider name returns STUCK_UNKNOWN with provider_status_unparsed."""
    raw = {"status": "SUCCESS"}
    res = status_mod.normalize_settlement_status(raw, provider="uniswap_v4")
    assert res.proposed_state == "STUCK_UNKNOWN"
    assert res.reason == "provider_status_unparsed"
    assert "unknown_provider" in str(res.unknown_reason)


def test_no_parser_invents_completed_without_destination_evidence() -> None:
    """9. Invariant guard: no parser outputs COMPLETED directly."""
    for prov in ("lifi", "relay", "mayan", "jupiter", "debridge"):
        raw_cases = [
            {"status": "DONE"},
            {"status": "SUCCESS"},
            {"status": "COMPLETED"},
            {"status": "FULFILLED"},
            {"status": "confirmed"},
            {"status": "tx_complete"},
        ]
        for rc in raw_cases:
            res = status_mod.normalize_settlement_status(rc, provider=prov)
            assert res.proposed_state != "COMPLETED", (
                f"Provider {prov} illegally returned COMPLETED for payload {rc}"
            )


def test_transition_args_from_dest_confirmed_to_completed_not_allowed_without_dest_evidence() -> None:
    """10. Transition args cannot transition to COMPLETED without dest_evidence."""
    legal, msg = repo.can_transition(
        from_state="DEST_CONFIRMED",
        to_state="COMPLETED",
        dest_evidence=False,
    )
    assert legal is False
    assert "destination evidence" in msg


def test_provider_canonical_lowercase_enforced() -> None:
    """11. Provider names are normalized to canonical snake-lowercase."""
    raw = {"status": "waiting_deposit"}
    res = status_mod.normalize_settlement_status(raw, provider="  ReLaY  ")
    assert res.provider == "relay"
    assert res.proposed_state == "SUBMITTED_PENDING"


def test_all_provider_mappings_labeled_unverified_or_draft() -> None:
    """12. All provider parsers include [TODAY_UNVERIFIED] or draft disclosure in docstring."""
    parsers = [
        status_mod.parse_lifi,
        status_mod.parse_relay,
        status_mod.parse_mayan,
        status_mod.parse_jupiter,
        status_mod.parse_debridge,
    ]
    for p in parsers:
        doc = inspect.getdoc(p) or ""
        assert "[TODAY_UNVERIFIED]" in doc or "draft" in doc.lower(), (
            f"Parser {p.__name__} missing [TODAY_UNVERIFIED] / draft disclosure in docstring"
        )


def test_apply_normalized_status_in_sqlite(tmp_db: Path) -> None:
    """13. Integration: apply_normalized_status moves settlement_repository state atomically."""
    conn = db.connect(tmp_db)
    repo.create_settlement(
        conn,
        quote_id="q_norm_apply",
        wallet="0x1234567890123456789012345678901234567890",
        provider="relay",
        underlying_route_id="route_norm",
        src_chain="base",
        dest_chain="sol",
        initial_state="SOURCE_CONFIRMED",
        source_tx_hash="0xsrc_tx",
    )

    # 1. Apply solver filling
    norm_status = status_mod.normalize_settlement_status(
        {"status": "pending_fill", "inTxHash": "0xsrc_tx"},
        provider="relay",
        quote_id="q_norm_apply",
    )
    updated = status_mod.apply_normalized_status(conn, "q_norm_apply", norm_status)
    assert updated is not None
    assert updated["state"] == "SOLVER_FILLING"
    assert updated["source_tx_hash"] == "0xsrc_tx"

    # 2. Apply destination confirmed
    norm_dest = status_mod.normalize_settlement_status(
        {"status": "filled", "outTxHash": "sig_dest_tx"},
        provider="relay",
        quote_id="q_norm_apply",
    )
    updated_dest = status_mod.apply_normalized_status(conn, "q_norm_apply", norm_dest)
    assert updated_dest is not None
    assert updated_dest["state"] == "DEST_CONFIRMED"
    assert updated_dest["dest_tx_hash"] == "sig_dest_tx"
    conn.close()
