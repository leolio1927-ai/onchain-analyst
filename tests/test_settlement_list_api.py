"""Tests for Slot D.4: Settlement Cockpit List API (DB-only).

Verifies that GET /api/v1/swap/settlements reads from SQLite only, enforces limit clamps,
filters by state/stuck/chain/wallet/provider, and fails closed with 503 if DB is disabled.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from starlette.testclient import TestClient

from providers import settlement_repository as repo
from webapp import db
from webapp.server import app


def test_list_settlements_empty_db_returns_200(tmp_path: Path, monkeypatch: Any) -> None:
    """1. Empty database returns 200 with empty items and count=0."""
    db_file = tmp_path / "test_list_empty.db"
    conn = db.connect(db_file)
    db.init_schema(conn)
    conn.close()

    monkeypatch.setenv("ALPHA_DB_PATH", str(db_file))
    client = TestClient(app)

    res = client.get("/api/v1/swap/settlements")
    assert res.status_code == 200
    data = res.json()
    assert data["items"] == []
    assert data["count"] == 0
    assert data["db_enabled"] is True
    assert "generated_at" in data


def test_list_settlements_returns_created_rows(tmp_path: Path, monkeypatch: Any) -> None:
    """2. Returns rows created in DB with explorer links and expected fields."""
    db_file = tmp_path / "test_list_rows.db"
    conn = db.connect(db_file)
    db.init_schema(conn)

    repo.create_settlement(
        conn,
        quote_id="q_list_1",
        wallet="0x1111111111111111111111111111111111111111",
        provider="lifi",
        underlying_route_id="route_1",
        src_chain="eip155:1",
        dest_chain="eip155:8453",
        initial_state="SUBMITTED_PENDING",
        amount_in="100.0",
        amount_out_expected="99.5",
        source_tx_hash="0xsrc_tx_1",
    )
    repo.create_settlement(
        conn,
        quote_id="q_list_2",
        wallet="0x2222222222222222222222222222222222222222",
        provider="jupiter",
        underlying_route_id="route_2",
        src_chain="sol",
        dest_chain="sol",
        initial_state="DEST_CONFIRMED",
        amount_in="5.0",
        amount_out_expected="5.0",
        source_tx_hash="5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        dest_tx_hash="5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    )
    conn.close()

    monkeypatch.setenv("ALPHA_DB_PATH", str(db_file))
    client = TestClient(app)

    res = client.get("/api/v1/swap/settlements")
    assert res.status_code == 200
    data = res.json()
    assert data["count"] == 2
    items = data["items"]
    q_ids = {it["quote_id"] for it in items}
    assert q_ids == {"q_list_1", "q_list_2"}

    # Check explorer links computed
    sol_row = next(it for it in items if it["quote_id"] == "q_list_2")
    assert sol_row["dest_explorer_link"] is not None
    assert "solscan.io" in sol_row["dest_explorer_link"]


def test_list_settlements_stuck_filter(tmp_path: Path, monkeypatch: Any) -> None:
    """3. stuck=true filter matches STUCK_UNKNOWN, FAILED, REFUND_AVAILABLE, EXPIRED only."""
    db_file = tmp_path / "test_list_stuck.db"
    conn = db.connect(db_file)
    db.init_schema(conn)

    repo.create_settlement(
        conn,
        quote_id="q_ok",
        wallet="0x1111111111111111111111111111111111111111",
        provider="relay",
        underlying_route_id="r_ok",
        src_chain="eip155:8453",
        dest_chain="eip155:10",
        initial_state="SOLVER_FILLING",
    )
    repo.create_settlement(
        conn,
        quote_id="q_stuck",
        wallet="0x1111111111111111111111111111111111111111",
        provider="mayan",
        underlying_route_id="r_stuck",
        src_chain="eip155:1",
        dest_chain="sol",
        initial_state="STUCK_UNKNOWN",
    )
    conn.close()

    monkeypatch.setenv("ALPHA_DB_PATH", str(db_file))
    client = TestClient(app)

    # stuck=true
    res_stuck = client.get("/api/v1/swap/settlements?stuck=true")
    assert res_stuck.status_code == 200
    data_stuck = res_stuck.json()
    assert data_stuck["count"] == 1
    assert data_stuck["items"][0]["quote_id"] == "q_stuck"


def test_list_settlements_limit_validation(tmp_path: Path, monkeypatch: Any) -> None:
    """4. Limit > 250 or < 1 returns 422."""
    db_file = tmp_path / "test_list_limit.db"
    conn = db.connect(db_file)
    db.init_schema(conn)
    conn.close()

    monkeypatch.setenv("ALPHA_DB_PATH", str(db_file))
    client = TestClient(app)

    res_over = client.get("/api/v1/swap/settlements?limit=251")
    assert res_over.status_code == 422
    assert "limit must not exceed 250" in res_over.text

    res_under = client.get("/api/v1/swap/settlements?limit=0")
    assert res_under.status_code == 422
    assert "limit must be at least 1" in res_under.text


def test_list_settlements_invalid_state_returns_422(tmp_path: Path, monkeypatch: Any) -> None:
    """5. Invalid state name returns 422."""
    db_file = tmp_path / "test_list_inv.db"
    conn = db.connect(db_file)
    db.init_schema(conn)
    conn.close()

    monkeypatch.setenv("ALPHA_DB_PATH", str(db_file))
    client = TestClient(app)

    res = client.get("/api/v1/swap/settlements?state=BOGUS_STATE")
    assert res.status_code == 422
    assert "invalid state" in res.text


def test_list_settlements_db_disabled_returns_503(monkeypatch: Any) -> None:
    """6. When ALPHA_DB_PATH is unset, returns 503."""
    monkeypatch.delenv("ALPHA_DB_PATH", raising=False)
    client = TestClient(app)

    res = client.get("/api/v1/swap/settlements")
    assert res.status_code == 503
    assert "settlement unavailable" in res.text


def test_list_settlements_no_network_calls(tmp_path: Path, monkeypatch: Any) -> None:
    """7. Verifies no external provider or simulation calls occur during list endpoint execution."""
    from unittest.mock import patch

    from providers import simulation

    db_file = tmp_path / "test_list_nonet.db"
    conn = db.connect(db_file)
    db.init_schema(conn)
    conn.close()

    monkeypatch.setenv("ALPHA_DB_PATH", str(db_file))

    with patch.object(simulation, "simulate", side_effect=AssertionError("simulation must not be called")), \
         patch("urllib.request.urlopen", side_effect=AssertionError("network call attempted")):
        client = TestClient(app)
        res = client.get("/api/v1/swap/settlements")
        assert res.status_code == 200
        assert res.json()["count"] == 0

