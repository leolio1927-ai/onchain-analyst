"""Triage & export ops tests (Slot D.7, DB-only).

Every test runs against a temp SQLite file. Network guards patch the real
socket/http.client boundary — if anything tried to leave the machine, these
tests fail loudly instead of pretending.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any
from unittest.mock import patch

from starlette.testclient import TestClient

from providers import settlement_repository as repo
from webapp.db import connect, init_schema
from webapp.server import app

STUCK_STATES = ("STUCK_UNKNOWN", "FAILED", "REFUND_AVAILABLE", "EXPIRED")


def _db(tmp_path: Path) -> sqlite3.Connection:
    conn = connect(tmp_path / "triage.db")
    init_schema(conn)
    return conn


def _add_row(
    conn: sqlite3.Connection,
    quote_id: str,
    state: str,
    *,
    src_chain: str = "eip155:1",
    dest_chain: str = "eip155:8453",
    provider: str = "lifi",
    updated_at: str = "2026-09-02T10:00:00Z",
    src_tx: str | None = None,
    dst_tx: str | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO settlement_state (
            quote_id, wallet, provider, underlying_route_id, src_chain, dest_chain,
            state, source_tx_hash, dest_tx_hash, created_at, updated_at
        ) VALUES (?, '0xtriage0000000000000000000000000000000001', ?, 'route-1', ?, ?, ?, ?, ?, datetime('now'), ?)
        """,
        (quote_id, provider, src_chain, dest_chain, state, src_tx, dst_tx, updated_at),
    )


def _add_event(
    conn: sqlite3.Connection,
    quote_id: str,
    *,
    state_from: str,
    state_to: str,
    created_at: str,
    evidence_ref: str | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO settlement_events (quote_id, state_from, state_to, event_type, reason, evidence_ref, created_at)
        VALUES (?, ?, ?, 'transition', NULL, ?, ?)
        """,
        (quote_id, state_from, state_to, evidence_ref, created_at),
    )


def test_list_events_ordered_asc_and_empty(tmp_path: Path) -> None:
    """list_events: [] when the quote has no trail; oldest-first otherwise."""
    conn = _db(tmp_path)
    try:
        assert repo.list_events(conn, quote_id="q_none") == []

        _add_row(conn, "q_trail", "SUBMITTED_PENDING")
        _add_event(conn, "q_trail", state_from="SUBMITTED_PENDING", state_to="SOURCE_CONFIRMED",
                   created_at="2026-09-02T10:02:00Z")
        _add_event(conn, "q_trail", state_from="QUOTE_ONLY", state_to="SUBMITTED_PENDING",
                   created_at="2026-09-02T10:01:00Z")
        _add_event(conn, "q_trail", state_from="SOURCE_CONFIRMED", state_to="DEST_CONFIRMED",
                   created_at="2026-09-02T10:03:00Z")
        conn.commit()

        events = repo.list_events(conn, quote_id="q_trail")
        assert [ev["created_at"] for ev in events] == [
            "2026-09-02T10:01:00Z",
            "2026-09-02T10:02:00Z",
            "2026-09-02T10:03:00Z",
        ]
    finally:
        conn.close()


def test_events_endpoint_404_and_200(tmp_path: Path, monkeypatch: Any) -> None:
    """Events route: 404 'quote not found' when absent; 200 with mapped
    from/to/evidence/next_poll_at when the settlement exists."""
    db_file = tmp_path / "events_http.db"
    conn = connect(db_file)
    init_schema(conn)
    _add_row(conn, "q_ev", "SOURCE_CONFIRMED", src_tx="0xsrc123", updated_at="2026-09-02T10:00:00Z")
    conn.execute("UPDATE settlement_state SET next_poll_at = '2026-09-02T10:05:00Z' WHERE quote_id = 'q_ev'")
    _add_event(conn, "q_ev", state_from="QUOTE_ONLY", state_to="SUBMITTED_PENDING",
               created_at="2026-09-02T10:00:30Z")
    _add_event(conn, "q_ev", state_from="SUBMITTED_PENDING", state_to="SOURCE_CONFIRMED",
               created_at="2026-09-02T10:01:00Z", evidence_ref='{"tx": "0xsrc123", "block": 42}')
    conn.commit()
    conn.close()
    monkeypatch.setenv("ALPHA_DB_PATH", str(db_file))

    client = TestClient(app)

    res_missing = client.get("/api/v1/swap/settlements/q_ghost/events")
    assert res_missing.status_code == 404
    assert res_missing.json()["detail"] == "quote not found"

    res = client.get("/api/v1/swap/settlements/q_ev/events")
    assert res.status_code == 200
    body = res.json()
    assert len(body["events"]) == 2
    first, second = body["events"]
    assert first["from_state"] == "QUOTE_ONLY" and first["to_state"] == "SUBMITTED_PENDING"
    assert second["from_state"] == "SUBMITTED_PENDING" and second["to_state"] == "SOURCE_CONFIRMED"
    assert second["evidence"] == {"tx": "0xsrc123", "block": 42}  # JSON parsed
    assert first["evidence"] is None
    assert all(ev["next_poll_at"] == "2026-09-02T10:05:00Z" for ev in body["events"])


def test_export_stuck_filter(tmp_path: Path, monkeypatch: Any) -> None:
    """stuck_only=True exports only STUCK_UNKNOWN/FAILED/REFUND_AVAILABLE/EXPIRED."""
    db_file = tmp_path / "stuck_export.db"
    conn = connect(db_file)
    init_schema(conn)
    _add_row(conn, "q_stuck", "STUCK_UNKNOWN")
    _add_row(conn, "q_failed", "FAILED")
    _add_row(conn, "q_refund", "REFUND_AVAILABLE")
    _add_row(conn, "q_expired", "EXPIRED")
    _add_row(conn, "q_done", "COMPLETED")
    _add_row(conn, "q_fresh", "SUBMITTED_PENDING")
    conn.commit()
    conn.close()
    monkeypatch.setenv("ALPHA_DB_PATH", str(db_file))

    client = TestClient(app)
    res = client.get("/api/v1/swap/settlements/export?stuck=1")
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 4
    assert body["truncated"] is False
    assert {row["state"] for row in body["rows"]} == set(STUCK_STATES)


def test_export_truncated_and_422(tmp_path: Path, monkeypatch: Any) -> None:
    """Limit hit → truncated=True honestly; limit>2000 → 422."""
    db_file = tmp_path / "trunc_export.db"
    conn = connect(db_file)
    init_schema(conn)
    for i in range(3):
        _add_row(conn, f"q_t{i}", "SUBMITTED_PENDING", updated_at=f"2026-09-02T1{i}:00:00Z")
    conn.commit()
    conn.close()
    monkeypatch.setenv("ALPHA_DB_PATH", str(db_file))

    client = TestClient(app)

    res = client.get("/api/v1/swap/settlements/export?limit=2")
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 2
    assert body["truncated"] is True

    res_bad = client.get("/api/v1/swap/settlements/export?limit=2001")
    assert res_bad.status_code == 422

    res_state = client.get("/api/v1/swap/settlements/export?state=NOT_A_STATE")
    assert res_state.status_code == 400


def test_export_and_events_zero_network(tmp_path: Path, monkeypatch: Any) -> None:
    """socket + http.client patched to raise — export and events still 200."""
    db_file = tmp_path / "nonet_export.db"
    conn = connect(db_file)
    init_schema(conn)
    _add_row(conn, "q_nn", "STUCK_UNKNOWN", src_tx="0xnn")
    _add_event(conn, "q_nn", state_from="QUOTE_ONLY", state_to="SUBMITTED_PENDING",
               created_at="2026-09-02T10:00:00Z")
    conn.commit()
    conn.close()
    monkeypatch.setenv("ALPHA_DB_PATH", str(db_file))

    def _deny(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("network attempted")

    with patch("socket.socket.connect", side_effect=_deny), patch(
        "http.client.HTTPConnection.connect", side_effect=_deny
    ):
        client = TestClient(app)
        res_export = client.get("/api/v1/swap/settlements/export?stuck=1")
        res_events = client.get("/api/v1/swap/settlements/q_nn/events")
    assert res_export.status_code == 200
    assert res_export.json()["count"] == 1
    assert res_export.json()["rows"][0]["events"][0]["to_state"] == "SUBMITTED_PENDING"
    assert res_events.status_code == 200
