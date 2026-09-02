"""Unit tests for Settlement Feeder (Slot D.5).

Verifies deterministic simulation logic, state machine invariants,
zero external network imports, and CLI execution.
"""

from __future__ import annotations

import sqlite3
import subprocess
import sys
from typing import Any
from unittest.mock import patch

from providers import settlement_feeder as feeder
from providers import settlement_repository as repo


def test_seed_is_idempotent_no_hood_rows(tmp_path: Any) -> None:
    """1. Verifies seed creates rows, skips hood scenarios, and is fully idempotent."""
    db_file = tmp_path / "test_feeder_seed.db"
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row

    try:
        res1 = feeder.seed_settlements(conn)
        assert res1["errors"] == 0
        assert res1["skipped_hood"] >= 1
        assert res1["seeded"] > 0

        # Verify no hood rows exist in DB
        hood_rows = conn.execute(
            "SELECT COUNT(*) as c FROM settlement_state WHERE provider = 'hood' OR src_chain = 'hood' OR dest_chain = 'hood'"
        ).fetchone()["c"]
        assert hood_rows == 0

        # Re-run seed (idempotency check)
        res2 = feeder.seed_settlements(conn)
        assert res2["seeded"] == 0  # no new rows created
        assert res2["errors"] == 0
    finally:
        conn.close()


def test_lifi_tick_reaches_completed_only_via_dest_confirmed_evidence(tmp_path: Any) -> None:
    """2. Verifies LiFi scenario follows legal chain: SUBMITTED -> SOURCE -> SOLVER -> DEST -> COMPLETED."""
    db_file = tmp_path / "test_feeder_lifi.db"
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row

    try:
        feeder.seed_settlements(conn)
        quote_id = "q_sim_lifi_01"

        # Step 1: SUBMITTED_PENDING -> SOURCE_CONFIRMED
        t1 = feeder.tick_settlements(conn, quote_id=quote_id)
        assert len(t1) == 1
        assert t1[0].state_to == "SOURCE_CONFIRMED"

        # Step 2: SOURCE_CONFIRMED -> SOLVER_FILLING
        t2 = feeder.tick_settlements(conn, quote_id=quote_id)
        assert len(t2) == 1
        assert t2[0].state_to == "SOLVER_FILLING"

        # Step 3: SOLVER_FILLING -> DEST_CONFIRMED
        t3 = feeder.tick_settlements(conn, quote_id=quote_id)
        assert len(t3) == 1
        assert t3[0].state_to == "DEST_CONFIRMED"

        # Step 4: DEST_CONFIRMED -> COMPLETED
        t4 = feeder.tick_settlements(conn, quote_id=quote_id)
        assert len(t4) == 1
        assert t4[0].state_to == "COMPLETED"

        # Terminal state: next tick produces no-op
        t5 = feeder.tick_settlements(conn, quote_id=quote_id)
        assert len(t5) == 0
    finally:
        conn.close()


def test_tick_never_invents_completed_without_dest_evidence(tmp_path: Any) -> None:
    """3. Invariant: COMPLETED cannot be reached directly without DEST_CONFIRMED and dest evidence."""
    db_file = tmp_path / "test_feeder_invariant.db"
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row

    try:
        feeder.seed_settlements(conn)

        # State is currently SUBMITTED_PENDING
        # Attempting illegal direct transition to COMPLETED via repo must fail
        legal, err = repo.can_transition(
            from_state="SUBMITTED_PENDING",
            to_state="COMPLETED",
            source_evidence=True,
            dest_evidence=False,
        )
        assert not legal
        assert "COMPLETED requires DEST_CONFIRMED" in err
    finally:
        conn.close()


def test_jupiter_same_chain_path(tmp_path: Any) -> None:
    """4. Verifies same-chain Solana path completes atomically without bridge intermediate."""
    db_file = tmp_path / "test_feeder_jup.db"
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row

    try:
        feeder.seed_settlements(conn)
        quote_id = "q_sim_jupiter_03"

        # Step 1: SUBMITTED_PENDING -> SOURCE_CONFIRMED
        t1 = feeder.tick_settlements(conn, quote_id=quote_id)
        assert t1[0].state_to == "SOURCE_CONFIRMED"

        # Step 2: SOURCE_CONFIRMED -> DEST_CONFIRMED
        t2 = feeder.tick_settlements(conn, quote_id=quote_id)
        assert t2[0].state_to == "DEST_CONFIRMED"

        # Step 3: DEST_CONFIRMED -> COMPLETED
        t3 = feeder.tick_settlements(conn, quote_id=quote_id)
        assert t3[0].state_to == "COMPLETED"
    finally:
        conn.close()


def test_mayan_stuck_terminal_no_further_ticks(tmp_path: Any) -> None:
    """5. Verifies Mayan stuck scenario halts at STUCK_UNKNOWN and does not tick further."""
    db_file = tmp_path / "test_feeder_mayan.db"
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row

    try:
        feeder.seed_settlements(conn)
        quote_id = "q_sim_mayan_04"

        # Step 1: SUBMITTED_PENDING -> SOURCE_CONFIRMED
        t1 = feeder.tick_settlements(conn, quote_id=quote_id)
        assert t1[0].state_to == "SOURCE_CONFIRMED"

        # Step 2: SOURCE_CONFIRMED -> STUCK_UNKNOWN
        t2 = feeder.tick_settlements(conn, quote_id=quote_id)
        assert t2[0].state_to == "STUCK_UNKNOWN"

        row = repo.get_settlement(conn, quote_id=quote_id)
        assert row["state"] == "STUCK_UNKNOWN"
        assert row["stuck_reason"] == "rpc_timeout"

        # Subsequent tick does nothing (terminal state)
        t3 = feeder.tick_settlements(conn, quote_id=quote_id)
        assert len(t3) == 0
    finally:
        conn.close()


def test_refund_path_requires_refund_supported(tmp_path: Any) -> None:
    """6. Verifies deBridge path from FAILED to REFUND_AVAILABLE and REFUNDED."""
    db_file = tmp_path / "test_feeder_refund.db"
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row

    try:
        feeder.seed_settlements(conn)
        quote_id = "q_sim_debridge_05"

        # Step 1: SUBMITTED -> SOURCE_CONFIRMED
        t1 = feeder.tick_settlements(conn, quote_id=quote_id)
        assert t1[0].state_to == "SOURCE_CONFIRMED"

        # Step 2: SOURCE_CONFIRMED -> FAILED
        t2 = feeder.tick_settlements(conn, quote_id=quote_id)
        assert t2[0].state_to == "FAILED"

        # Step 3: FAILED -> REFUND_AVAILABLE
        t3 = feeder.tick_settlements(conn, quote_id=quote_id)
        assert t3[0].state_to == "REFUND_AVAILABLE"

        # Step 4: REFUND_AVAILABLE -> REFUNDED
        t4 = feeder.tick_settlements(conn, quote_id=quote_id)
        assert t4[0].state_to == "REFUNDED"

        # Terminal
        t5 = feeder.tick_settlements(conn, quote_id=quote_id)
        assert len(t5) == 0
    finally:
        conn.close()


def test_feeder_has_no_network_imports_or_provider_calls() -> None:
    """7. Verifies settlement_feeder does not import or call any HTTP client libraries."""
    import inspect

    src = inspect.getsource(feeder)
    forbidden = ["httpx", "requests", "urllib.request", "aiohttp", "urllib3"]
    for f in forbidden:
        assert f"import {f}" not in src, f"feeder contains forbidden network import: {f}"
        assert f"from {f}" not in src, f"feeder contains forbidden network import: {f}"


def test_expired_ticks(tmp_path: Any) -> None:
    """8. Verifies EXPIRED scenario transitions legally and stops."""
    db_file = tmp_path / "test_feeder_expired.db"
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row

    try:
        feeder.seed_settlements(conn)
        quote_id = "q_sim_expired_09"

        t1 = feeder.tick_settlements(conn, quote_id=quote_id)
        assert len(t1) == 1
        assert t1[0].state_to == "EXPIRED"

        t2 = feeder.tick_settlements(conn, quote_id=quote_id)
        assert len(t2) == 0
    finally:
        conn.close()


def test_illegal_step_recorded_not_silent(tmp_path: Any) -> None:
    """9. Verifies that an illegal transition failure is cleanly captured in TickResult.error."""
    db_file = tmp_path / "test_feeder_illegal.db"
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row

    try:
        feeder.seed_settlements(conn)
        quote_id = "q_sim_lifi_01"

        # Monkeypatch transition to raise an error
        with patch("providers.settlement_repository.transition", side_effect=ValueError("simulated error")):
            results = feeder.tick_settlements(conn, quote_id=quote_id)
            assert len(results) == 1
            assert results[0].error == "simulated error"
    finally:
        conn.close()


def test_status_cli(tmp_path: Any) -> None:
    """10. Tests CLI execution of seed, tick, and status."""
    db_file = str(tmp_path / "test_cli.db")

    # Seed
    cmd_seed = [sys.executable, "-m", "providers.settlement_feeder", "--db", db_file, "seed", "--pretty"]
    r_seed = subprocess.run(cmd_seed, capture_output=True, text=True, check=True)
    assert "seeded=" in r_seed.stdout
    assert "skipped_hood=" in r_seed.stdout

    # Tick
    cmd_tick = [sys.executable, "-m", "providers.settlement_feeder", "--db", db_file, "tick", "--pretty"]
    r_tick = subprocess.run(cmd_tick, capture_output=True, text=True, check=True)
    assert "tick advanced=" in r_tick.stdout

    # Status
    cmd_status = [sys.executable, "-m", "providers.settlement_feeder", "--db", db_file, "status", "--pretty"]
    r_status = subprocess.run(cmd_status, capture_output=True, text=True, check=True)
    assert "total=" in r_status.stdout
