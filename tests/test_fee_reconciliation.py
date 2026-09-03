"""Fee reconciliation repository logic tests (Slot D.6, DB-only).

Zero network: every test runs against a temp SQLite file through
settlement_repository only.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

import pytest

from providers import settlement_repository as repo
from webapp.db import _MIGRATIONS, connect, init_schema


def _db(tmp_path: Path) -> sqlite3.Connection:
    conn = connect(tmp_path / "fee_recon.db")
    init_schema(conn)
    return conn


def _seed_settlement(conn: sqlite3.Connection, quote_id: str = "q_fee_01") -> None:
    created = repo.create_settlement(
        conn,
        quote_id=quote_id,
        wallet="0xfee0000000000000000000000000000000000001",
        provider="lifi",
        underlying_route_id="route-fee-1",
        src_chain="eip155:1",
        dest_chain="eip155:8453",
    )
    assert created is not None


def test_upsert_match_inject_mismatch_tbd(tmp_path: Path) -> None:
    """status=None auto-derives the honest status from the three fee numbers."""
    conn = _db(tmp_path)
    try:
        matched = repo.upsert_fee_recon(
            conn, quote_id="q_m", chain_id="eip155:1", asset_id="usdc", provider="lifi",
            fee_expected_bps=10, fee_injected_bps=10, status=None,
        )
        assert matched["status"] == "MATCHED"

        injected = repo.upsert_fee_recon(
            conn, quote_id="q_i", chain_id="eip155:1", asset_id="usdc", provider="lifi",
            fee_injected_bps=12, status=None,
        )
        assert injected["status"] == "INJECTED"

        mismatch = repo.upsert_fee_recon(
            conn, quote_id="q_x", chain_id="eip155:1", asset_id="usdc", provider="lifi",
            fee_expected_bps=10, fee_injected_bps=8, status=None,
        )
        assert mismatch["status"] == "MISMATCH"

        tbd = repo.upsert_fee_recon(
            conn, quote_id="q_t", chain_id="solana", asset_id="usdc", provider="jupiter",
            fee_quoted_bps=25, status=None,
        )
        assert tbd["status"] == "TBD"
        assert tbd["reason"] == "fee_model_unverified_draft"
    finally:
        conn.close()


def test_seeded_fee_row_survive_settlement_absent(tmp_path: Path) -> None:
    """An orphan fee row (no settlement_state row) is stored and returned by
    the repo layer — the endpoint layer owns the 404 pairing decision."""
    conn = _db(tmp_path)
    try:
        repo.upsert_fee_recon(
            conn, quote_id="q_orphan", chain_id="eip155:1", asset_id="usdc", provider="lifi",
            fee_expected_bps=10, fee_injected_bps=8,
        )
        assert repo.get_settlement(conn, quote_id="q_orphan") is None
        orphan = repo.get_fee_recon(conn, quote_id="q_orphan")
        assert orphan is not None
        assert orphan["fee_expected_bps"] == 10
    finally:
        conn.close()


def test_revenue_leak_helper(tmp_path: Path) -> None:
    """exp>0 & inj<exp & inj>=0 = leak; absent numbers are never a leak."""
    assert repo.is_revenue_leak(10, 8) is True
    assert repo.is_revenue_leak(10, 9) is True
    assert repo.is_revenue_leak(10, 10) is False
    assert repo.is_revenue_leak(10, 11) is False
    assert repo.is_revenue_leak(10, None) is False
    assert repo.is_revenue_leak(None, 8) is False
    assert repo.is_revenue_leak(None, None) is False
    assert repo.is_revenue_leak(0, 0) is False  # exp>0 required
    assert repo.is_revenue_leak(10, -1) is False  # inj>=0 required


def test_migrates_v5_to_v6_without_loss(tmp_path: Path, monkeypatch: Any) -> None:
    """A database frozen at v5 upgrades to v6 additively; v5 rows survive."""
    db_file = tmp_path / "legacy_v5.db"
    conn = connect(db_file)
    monkeypatch.setattr("webapp.db._MIGRATIONS", tuple(m for m in _MIGRATIONS if m[0] <= 5))
    init_schema(conn)

    created = repo.create_settlement(
        conn,
        quote_id="q_legacy_1",
        wallet="0xlegacy00000000000000000000000000000000ff",
        provider="relay",
        underlying_route_id="route-legacy",
        src_chain="eip155:8453",
        dest_chain="eip155:42161",
    )
    assert created is not None

    monkeypatch.setattr("webapp.db._MIGRATIONS", _MIGRATIONS)
    init_schema(conn)  # applies v6 additively on the legacy file

    assert repo.get_settlement(conn, quote_id="q_legacy_1") is not None
    row = repo.upsert_fee_recon(
        conn, quote_id="q_legacy_1", chain_id="eip155:8453", asset_id="usdc", provider="relay",
        fee_expected_bps=10, fee_injected_bps=10, status=None,
    )
    assert row["status"] == "MATCHED"
    conn.close()


def test_upsert_overwrites_existing_row(tmp_path: Path) -> None:
    """Upsert on the same quote_id updates in place — PK, never duplicates."""
    conn = _db(tmp_path)
    try:
        _seed_settlement(conn)
        first = repo.upsert_fee_recon(
            conn, quote_id="q_fee_01", chain_id="eip155:1", asset_id="usdc", provider="lifi",
            fee_expected_bps=10, fee_injected_bps=8,
        )
        assert first["status"] == "PENDING"  # explicit status param, not derived

        second = repo.upsert_fee_recon(
            conn, quote_id="q_fee_01", chain_id="eip155:1", asset_id="usdc", provider="lifi",
            fee_expected_bps=10, fee_injected_bps=10, status=None,
        )
        assert second["status"] == "MATCHED"
        count = conn.execute(
            "SELECT COUNT(*) AS c FROM fee_reconciliation WHERE quote_id = 'q_fee_01'"
        ).fetchone()["c"]
        assert count == 1
    finally:
        conn.close()


def test_unknown_status_rejected(tmp_path: Path) -> None:
    """Bogus status is refused in code — never silently persisted."""
    conn = _db(tmp_path)
    try:
        with pytest.raises(ValueError, match="unknown fee recon status"):
            repo.upsert_fee_recon(
                conn, quote_id="q_bad", chain_id="eip155:1", asset_id="usdc", provider="lifi",
                status="BOGUS",
            )
        assert repo.get_fee_recon(conn, quote_id="q_bad") is None
    finally:
        conn.close()
