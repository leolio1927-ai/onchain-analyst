"""HTTP integration tests for the fee reconciliation endpoint (Slot D.6).

Verifies the 200/404/503 contract and network isolation: the endpoint is
DB-only and must succeed even with socket.connect patched to raise.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import patch

from starlette.testclient import TestClient

from providers import settlement_repository as repo
from webapp.db import connect, init_schema
from webapp.server import app


def _setup(tmp_path: Path, monkeypatch: Any) -> Path:
    db_file = tmp_path / "fee_http.db"
    conn = connect(db_file)
    init_schema(conn)
    created = repo.create_settlement(
        conn,
        quote_id="q_fee_01",
        wallet="0xfee0000000000000000000000000000000000001",
        provider="lifi",
        underlying_route_id="route-fee-1",
        src_chain="eip155:1",
        dest_chain="eip155:8453",
    )
    assert created is not None
    conn.close()
    monkeypatch.setenv("ALPHA_DB_PATH", str(db_file))
    return db_file


def _seed_fee(db_file: Path) -> None:
    conn = connect(db_file)
    try:
        repo.upsert_fee_recon(
            conn, quote_id="q_fee_01", chain_id="eip155:1", asset_id="usdc", provider="lifi",
            fee_expected_bps=10, fee_injected_bps=8,
        )
    finally:
        conn.close()


def test_endpoint_200(tmp_path: Path, monkeypatch: Any) -> None:
    """Settlement + fee row present → 200 with derived revenue_leak flag."""
    db_file = _setup(tmp_path, monkeypatch)
    _seed_fee(db_file)

    client = TestClient(app)
    res = client.get("/api/v1/swap/settlements/q_fee_01/fee-reconciliation")
    assert res.status_code == 200
    body = res.json()
    assert body["quote_id"] == "q_fee_01"
    assert body["chain_id"] == "eip155:1"
    assert body["asset_id"] == "usdc"
    assert body["provider"] == "lifi"
    assert body["fee_expected_bps"] == 10
    assert body["fee_injected_bps"] == 8
    assert body["status"] == "PENDING"
    assert body["revenue_leak"] is True  # exp=10 > inj=8
    assert body["note"] is None


def test_endpoint_404_no_settlement(tmp_path: Path, monkeypatch: Any) -> None:
    """No settlement row at all → 404 'quote not found'."""
    _setup(tmp_path, monkeypatch)

    client = TestClient(app)
    res = client.get("/api/v1/swap/settlements/q_unknown/fee-reconciliation")
    assert res.status_code == 404
    assert res.json()["detail"] == "quote not found"


def test_endpoint_404_no_fee(tmp_path: Path, monkeypatch: Any) -> None:
    """Settlement exists but fee track unseeded → 404 'fee track not seeded'."""
    _setup(tmp_path, monkeypatch)

    client = TestClient(app)
    res = client.get("/api/v1/swap/settlements/q_fee_01/fee-reconciliation")
    assert res.status_code == 404
    assert res.json()["detail"] == "fee track not seeded"


def test_endpoint_503_db_off(tmp_path: Path, monkeypatch: Any) -> None:
    """ALPHA_DB_PATH unset → 503, honest persistence-off behavior."""
    monkeypatch.delenv("ALPHA_DB_PATH", raising=False)

    client = TestClient(app)
    res = client.get("/api/v1/swap/settlements/q_fee_01/fee-reconciliation")
    assert res.status_code == 503


def test_endpoint_zero_network(tmp_path: Path, monkeypatch: Any) -> None:
    """socket.connect patched to raise — endpoint still answers 200 (DB-only)."""
    db_file = _setup(tmp_path, monkeypatch)
    _seed_fee(db_file)

    with patch("socket.socket.connect", side_effect=AssertionError("network attempted")):
        client = TestClient(app)
        res = client.get("/api/v1/swap/settlements/q_fee_01/fee-reconciliation")
    assert res.status_code == 200
    assert res.json()["revenue_leak"] is True
