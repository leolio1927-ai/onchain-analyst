"""Tests for Slot D.2: Settlement Persistence + State Machine (v5).

Verifies canonical state transitions, fail-closed guards, atomic SQLite persistence,
v5 migration coexisting with v4, and read-only endpoint behavior.
"""
from __future__ import annotations

import asyncio
import inspect
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from providers import settlement_repository as repo
from providers import simulation
from webapp import db, server


@pytest.fixture
def tmp_db(tmp_path: Path) -> Path:
    """Create a clean isolated SQLite test database with schema initialized to v5."""
    db_file = tmp_path / "test_vilmei.db"
    conn = db.connect(db_file)
    db.init_schema(conn)
    conn.close()
    return db_file


@pytest.fixture
def client(tmp_db: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("ALPHA_DB_PATH", str(tmp_db))
    return TestClient(server.app)


# ── 15 Required Tests ─────────────────────────────────────────────────────

def test_legal_full_chain_to_completed(tmp_db: Path) -> None:
    """1. PENDING -> SRC -> DEST -> COMPLETED + dest_evidence=True."""
    conn = db.connect(tmp_db)
    row = repo.create_settlement(
        conn,
        quote_id="q_full_chain",
        wallet="0x1111111111111111111111111111111111111111",
        provider="relay",
        underlying_route_id="route_relay_1",
        src_chain="base",
        dest_chain="sol",
        initial_state="SUBMITTED_PENDING",
        reason="Tx broadcast by client",
    )
    assert row is not None
    assert row["state"] == "SUBMITTED_PENDING"

    # Step 1: SOURCE_CONFIRMED
    s1 = repo.transition(
        conn,
        quote_id="q_full_chain",
        to_state="SOURCE_CONFIRMED",
        reason="Mined in block 123",
        source_tx="0xsrc_hash_1",
    )
    assert s1["state"] == "SOURCE_CONFIRMED"
    assert s1["source_tx_hash"] == "0xsrc_hash_1"

    # Step 2: DEST_CONFIRMED
    s2 = repo.transition(
        conn,
        quote_id="q_full_chain",
        to_state="DEST_CONFIRMED",
        reason="Solver filled destination",
        dest_tx="sig_dest_hash_1",
        evidence={"destination": "sig_dest_hash_1", "block": 987},
    )
    assert s2["state"] == "DEST_CONFIRMED"
    assert s2["dest_tx_hash"] == "sig_dest_hash_1"

    # Step 3: COMPLETED
    s3 = repo.transition(
        conn,
        quote_id="q_full_chain",
        to_state="COMPLETED",
        reason="Destination receipt verified terminal",
        dest_tx="sig_dest_hash_1",
        evidence={"destination": "receipt_verified", "confirmations": 32},
    )
    assert s3["state"] == "COMPLETED"
    conn.close()


def test_source_pending_to_completed_is_illegal(tmp_db: Path) -> None:
    """2. SUBMITTED_PENDING -> COMPLETED is ILLEGAL (raises IllegalStateTransitionError)."""
    conn = db.connect(tmp_db)
    repo.create_settlement(
        conn,
        quote_id="q_illegal_pending",
        wallet="0x2222222222222222222222222222222222222222",
        provider="lifi",
        underlying_route_id="route_lifi_2",
        src_chain="base",
        dest_chain="bnb",
        initial_state="SUBMITTED_PENDING",
    )

    with pytest.raises(repo.IllegalStateTransitionError) as exc_info:
        repo.transition(
            conn,
            quote_id="q_illegal_pending",
            to_state="COMPLETED",
            reason="Illegal jump from pending",
        )
    assert "source submitted is NEVER COMPLETED" in str(exc_info.value)
    conn.close()


def test_source_confirmed_to_completed_is_illegal(tmp_db: Path) -> None:
    """3. SOURCE_CONFIRMED -> COMPLETED is ILLEGAL."""
    conn = db.connect(tmp_db)
    repo.create_settlement(
        conn,
        quote_id="q_illegal_src",
        wallet="0x3333333333333333333333333333333333333333",
        provider="debridge",
        underlying_route_id="route_debridge_3",
        src_chain="bnb",
        dest_chain="sol",
        initial_state="SUBMITTED_PENDING",
    )
    repo.transition(
        conn,
        quote_id="q_illegal_src",
        to_state="SOURCE_CONFIRMED",
        reason="Source confirmed on chain",
        source_tx="0xsrc_3",
    )

    with pytest.raises(repo.IllegalStateTransitionError) as exc_info:
        repo.transition(
            conn,
            quote_id="q_illegal_src",
            to_state="COMPLETED",
            reason="Bypassing solver filling and destination confirmation",
        )
    assert "source submitted is NEVER COMPLETED" in str(exc_info.value)
    conn.close()


def test_stuck_to_completed_without_new_evidence_is_illegal(tmp_db: Path) -> None:
    """4. STUCK_UNKNOWN -> COMPLETED without DEST_CONFIRMED evidence is ILLEGAL."""
    conn = db.connect(tmp_db)
    repo.create_settlement(
        conn,
        quote_id="q_illegal_stuck",
        wallet="0x4444444444444444444444444444444444444444",
        provider="mayan",
        underlying_route_id="route_mayan_4",
        src_chain="sol",
        dest_chain="base",
        initial_state="SUBMITTED_PENDING",
    )
    repo.transition(
        conn,
        quote_id="q_illegal_stuck",
        to_state="STUCK_UNKNOWN",
        reason="RPC timeout during watch",
        stuck_reason="rpc_timeout",
    )

    with pytest.raises(repo.IllegalStateTransitionError) as exc_info:
        repo.transition(
            conn,
            quote_id="q_illegal_stuck",
            to_state="COMPLETED",
            reason="Attempting direct complete from stuck",
        )
    assert "COMPLETED requires DEST_CONFIRMED" in str(exc_info.value)
    conn.close()


def test_refund_requires_refund_supported(tmp_db: Path) -> None:
    """5. FAILED -> REFUND_AVAILABLE requires refund_supported=True; default False rejects."""
    conn = db.connect(tmp_db)
    repo.create_settlement(
        conn,
        quote_id="q_refund_test",
        wallet="0x5555555555555555555555555555555555555555",
        provider="mayan",
        underlying_route_id="route_mayan_5",
        src_chain="sol",
        dest_chain="base",
        initial_state="SUBMITTED_PENDING",
    )
    repo.transition(conn, quote_id="q_refund_test", to_state="FAILED", reason="Auction expired")

    # 1. Without refund_supported=True -> REJECT
    with pytest.raises(repo.IllegalStateTransitionError) as exc_info:
        repo.transition(
            conn,
            quote_id="q_refund_test",
            to_state="REFUND_AVAILABLE",
            reason="Attempt refund without support flag",
            refund_supported=False,
        )
    assert "refund_supported=True" in str(exc_info.value)

    # 2. With refund_supported=True -> LEGAL
    s_ref = repo.transition(
        conn,
        quote_id="q_refund_test",
        to_state="REFUND_AVAILABLE",
        reason="Mayan Wormhole VAA claimable",
        refund_supported=True,
    )
    assert s_ref["state"] == "REFUND_AVAILABLE"
    conn.close()


def test_hood_dest_no_settlement_row_created(tmp_db: Path) -> None:
    """6. dest_chain or src_chain == 'hood' returns None (no-op, DO NOT INSERT)."""
    conn = db.connect(tmp_db)
    res_dest = repo.create_settlement(
        conn,
        quote_id="q_hood_dest",
        wallet="0x6666666666666666666666666666666666666666",
        provider="relay",
        underlying_route_id="route_hood_1",
        src_chain="base",
        dest_chain="hood",
    )
    assert res_dest is None

    res_src = repo.create_settlement(
        conn,
        quote_id="q_hood_src",
        wallet="0x6666666666666666666666666666666666666666",
        provider="relay",
        underlying_route_id="route_hood_2",
        src_chain="hood",
        dest_chain="sol",
    )
    assert res_src is None

    # Verify zero rows created
    c_dest = conn.execute("SELECT COUNT(*) AS c FROM settlement_state WHERE quote_id = 'q_hood_dest'").fetchone()["c"]
    c_src = conn.execute("SELECT COUNT(*) AS c FROM settlement_state WHERE quote_id = 'q_hood_src'").fetchone()["c"]
    assert c_dest == 0
    assert c_src == 0
    conn.close()


def test_unknown_provider_and_state_rejected(tmp_db: Path) -> None:
    """7. Unknown provider or unknown state is rejected with ValueError."""
    conn = db.connect(tmp_db)
    with pytest.raises(ValueError, match="unknown provider 'uniswap_v4'"):
        repo.create_settlement(
            conn,
            quote_id="q_unknown_p",
            wallet="0x7777777777777777777777777777777777777777",
            provider="uniswap_v4",
            underlying_route_id="route_u",
            src_chain="base",
            dest_chain="base",
        )

    with pytest.raises(ValueError, match="unknown state 'NONEXISTENT_STATE'"):
        repo.create_settlement(
            conn,
            quote_id="q_unknown_s",
            wallet="0x7777777777777777777777777777777777777777",
            provider="jupiter",
            underlying_route_id="route_j",
            src_chain="sol",
            dest_chain="sol",
            initial_state="NONEXISTENT_STATE",
        )
    conn.close()


def test_idempotent_create_no_duplication(tmp_db: Path) -> None:
    """8. Idempotent create: calling create_settlement 2x with same quote_id returns 1 row."""
    conn = db.connect(tmp_db)
    r1 = repo.create_settlement(
        conn,
        quote_id="q_idempotent",
        wallet="0x8888888888888888888888888888888888888888",
        provider="jupiter",
        underlying_route_id="route_idem",
        src_chain="sol",
        dest_chain="sol",
    )
    assert r1 is not None
    token1 = r1["claim_token"]

    r2 = repo.create_settlement(
        conn,
        quote_id="q_idempotent",
        wallet="0x8888888888888888888888888888888888888888",
        provider="jupiter",
        underlying_route_id="route_idem",
        src_chain="sol",
        dest_chain="sol",
    )
    assert r2 is not None
    assert r2["claim_token"] == token1

    count = conn.execute("SELECT COUNT(*) AS c FROM settlement_state WHERE quote_id = 'q_idempotent'").fetchone()["c"]
    assert count == 1
    conn.close()


def test_events_written_per_transition(tmp_db: Path) -> None:
    """9. Audit trail: initial create + 2 transitions = 3 events in settlement_events."""
    conn = db.connect(tmp_db)
    repo.create_settlement(
        conn,
        quote_id="q_events_log",
        wallet="0x9999999999999999999999999999999999999999",
        provider="lifi",
        underlying_route_id="route_ev",
        src_chain="base",
        dest_chain="bnb",
        reason="Initial quote submit",
    )
    repo.transition(conn, quote_id="q_events_log", to_state="SOURCE_CONFIRMED", reason="Block 10 mined")
    repo.transition(
        conn,
        quote_id="q_events_log",
        to_state="STUCK_UNKNOWN",
        reason="Node uncontactable",
        stuck_reason="rpc_timeout",
    )

    events = repo.get_settlement_events(conn, quote_id="q_events_log", limit=10)
    assert len(events) == 3
    assert events[0]["event_type"] == "created"
    assert events[0]["state_to"] == "SUBMITTED_PENDING"
    assert events[1]["event_type"] == "transition_source_confirmed"
    assert events[1]["state_to"] == "SOURCE_CONFIRMED"
    assert events[2]["event_type"] == "transition_stuck_unknown"
    assert events[2]["state_to"] == "STUCK_UNKNOWN"
    conn.close()


@pytest.mark.anyio
async def test_parallel_transition_one_succeeds_one_fails(tmp_db: Path) -> None:
    """10. Two concurrent transitions competing for same state: exactly 1 succeeds, 1 errors."""
    conn_setup = db.connect(tmp_db)
    repo.create_settlement(
        conn_setup,
        quote_id="q_parallel_compete",
        wallet="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        provider="relay",
        underlying_route_id="route_parallel",
        src_chain="base",
        dest_chain="sol",
        initial_state="SUBMITTED_PENDING",
    )
    conn_setup.close()

    def attempt_a():
        conn = db.connect(tmp_db)
        try:
            return repo.transition(conn, quote_id="q_parallel_compete", to_state="SOURCE_CONFIRMED", reason="Tx A mined")
        finally:
            conn.close()

    def attempt_b():
        conn = db.connect(tmp_db)
        try:
            return repo.transition(conn, quote_id="q_parallel_compete", to_state="SOURCE_CONFIRMED", reason="Tx B mined")
        finally:
            conn.close()

    results = await asyncio.gather(
        asyncio.to_thread(attempt_a),
        asyncio.to_thread(attempt_b),
        return_exceptions=True,
    )

    successes = [r for r in results if not isinstance(r, Exception)]
    failures = [r for r in results if isinstance(r, Exception)]

    assert len(successes) == 1
    assert len(failures) == 1
    assert isinstance(failures[0], (repo.IllegalStateTransitionError, Exception))


def test_claim_token_generated(tmp_db: Path) -> None:
    """11. claim_token is generated and changes per transition."""
    conn = db.connect(tmp_db)
    s0 = repo.create_settlement(
        conn,
        quote_id="q_claim_tok",
        wallet="0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        provider="jupiter",
        underlying_route_id="route_c",
        src_chain="sol",
        dest_chain="sol",
    )
    assert s0 is not None
    t0 = s0["claim_token"]
    assert t0 is not None and len(t0) > 0

    s1 = repo.transition(conn, quote_id="q_claim_tok", to_state="SOURCE_CONFIRMED", reason="Confirmed on solana")
    t1 = s1["claim_token"]
    assert t1 is not None and t1 != t0

    s2 = repo.transition(conn, quote_id="q_claim_tok", to_state="DEST_CONFIRMED", reason="Mined destination")
    t2 = s2["claim_token"]
    assert t2 is not None and t2 != t1
    conn.close()


def test_endpoint_empty_db_404(client: TestClient, tmp_db: Path) -> None:
    """12. GET /api/v1/swap/settlement/{quote_id} on empty DB returns 404 and does NOT create row."""
    r = client.get("/api/v1/swap/settlement/q_non_existent")
    assert r.status_code == 404
    assert "not found" in r.json()["detail"]

    # Verify no row was created by the read endpoint
    conn = db.connect(tmp_db)
    count = conn.execute("SELECT COUNT(*) AS c FROM settlement_state WHERE quote_id = 'q_non_existent'").fetchone()["c"]
    conn.close()
    assert count == 0


def test_endpoint_no_network(client: TestClient, tmp_db: Path) -> None:
    """13. GET /api/v1/swap/settlement does NOT call external provider / simulation (DB-only read)."""
    conn = db.connect(tmp_db)
    repo.create_settlement(
        conn,
        quote_id="q_no_net",
        wallet="0xcccccccccccccccccccccccccccccccccccccccc",
        provider="jupiter",
        underlying_route_id="route_net",
        src_chain="sol",
        dest_chain="sol",
        source_tx_hash="sig_dummy_123",
    )
    conn.close()

    with patch.object(simulation, "simulate", side_effect=AssertionError("simulation must not be called")), \
         patch("urllib.request.urlopen", side_effect=AssertionError("network call attempted")):
        r = client.get("/api/v1/swap/settlement/q_no_net")
        assert r.status_code == 200
        j = r.json()
        assert j["quote_id"] == "q_no_net"
        assert j["state"] == "SUBMITTED_PENDING"
        assert j["source_explorer_link"] == "https://solscan.io/tx/sig_dummy_123"


def test_migration_v5_does_not_drop_v4(tmp_path: Path) -> None:
    """14. Schema v5 migration preserves v4 swap_quotes table without dropping it."""
    db_file = tmp_path / "v5_migration_check.db"
    conn = db.connect(db_file)
    db.init_schema(conn)

    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert "swap_quotes" in tables, "v4 table swap_quotes must exist"
    assert "settlement_state" in tables, "v5 table settlement_state must exist"
    assert "settlement_events" in tables, "v5 table settlement_events must exist"

    # Verify migration history has v1 through v5
    versions = [r[0] for r in conn.execute("SELECT version FROM schema_migrations ORDER BY version").fetchall()]
    assert versions == [1, 2, 3, 4, 5]
    conn.close()


def test_settlement_events_is_append_only() -> None:
    """15. Assert that production settlement_repository has NO SQL UPDATE or DELETE on settlement_events."""
    repo_source = inspect.getsource(repo)

    assert "UPDATE settlement_events" not in repo_source, (
        "settlement_events is append-only: UPDATE statement is strictly prohibited in production code"
    )
    assert "DELETE FROM settlement_events" not in repo_source, (
        "settlement_events is append-only: DELETE statement is strictly prohibited in production code"
    )
