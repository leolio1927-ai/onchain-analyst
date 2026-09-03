"""HTTP integration tests for the settlement handoff endpoint (T2-F.0).

Contract checks (200/400/422/503) plus the hard network guard: the endpoint
must answer 200 with socket + http.client patched to raise — it is DB-only,
no provider, no RPC.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any
from unittest.mock import patch

from starlette.testclient import TestClient

from providers import settlement_repository as repo
from webapp.db import connect, init_schema
from webapp.server import app


def _client(tmp_path: Path, monkeypatch: Any) -> TestClient:
    db_file = tmp_path / "handoff_http.db"
    conn = connect(db_file)
    init_schema(conn)
    conn.close()
    monkeypatch.setenv("ALPHA_DB_PATH", str(db_file))
    return TestClient(app)


def _body(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "wallet": "0xhandoff00000000000000000000000000000000ff",
        "chain_id": "eip155:8453",
        "provider": "lifi",
        "integrator": "vilmei",
        "fee_bps": 30,
        "amount": "250.0 USDC",
    }
    body.update(overrides)
    return body


def test_endpoint_200_creates_rows_and_payload(tmp_path: Path, monkeypatch: Any) -> None:
    """200: legal state + INJECTED fee + unsigned payload, both rows persisted."""
    client = _client(tmp_path, monkeypatch)
    res = client.post("/api/v1/swap/handoff", json=_body())
    assert res.status_code == 200
    body = res.json()
    assert body["state"] == "QUOTE_ONLY"
    assert body["fee_status"] == "INJECTED"
    payload = body["unsigned_payload"]
    assert payload["unsigned"] is True
    assert payload["source_tx_hash"] is None
    assert payload["signature"] is None

    conn = connect(os.environ.get("ALPHA_DB_PATH", ""))
    try:
        assert repo.get_settlement(conn, quote_id=body["quote_id"]) is not None
        assert repo.get_fee_recon(conn, quote_id=body["quote_id"]) is not None
    finally:
        conn.close()


def test_endpoint_400_wallet_invalid(tmp_path: Path, monkeypatch: Any) -> None:
    """Missing/too-short wallet → 400 before any row is written."""
    client = _client(tmp_path, monkeypatch)
    res = client.post("/api/v1/swap/handoff", json=_body(wallet="0xabc"))
    assert res.status_code == 400
    assert "wallet" in res.json()["detail"]

    conn = connect(os.environ.get("ALPHA_DB_PATH", ""))
    try:
        assert conn.execute("SELECT COUNT(*) AS c FROM settlement_state").fetchone()["c"] == 0
    finally:
        conn.close()


def test_endpoint_422_fee_and_503_db_off(tmp_path: Path, monkeypatch: Any) -> None:
    """fee_bps > 3000 → 422 anti-rug; ALPHA_DB_PATH unset → honest 503."""
    client = _client(tmp_path, monkeypatch)
    assert client.post("/api/v1/swap/handoff", json=_body(fee_bps=3001)).status_code == 422

    monkeypatch.delenv("ALPHA_DB_PATH", raising=False)
    assert client.post("/api/v1/swap/handoff", json=_body()).status_code == 503


def test_endpoint_zero_network(tmp_path: Path, monkeypatch: Any) -> None:
    """socket + http.client patched to raise — handoff still 200 (DB-only)."""
    client = _client(tmp_path, monkeypatch)

    def _deny(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("network attempted")

    with patch("socket.socket.connect", side_effect=_deny), patch(
        "http.client.HTTPConnection.connect", side_effect=_deny
    ):
        res = client.post("/api/v1/swap/handoff", json=_body())
    assert res.status_code == 200
    assert res.json()["unsigned_payload"]["unsigned"] is True
