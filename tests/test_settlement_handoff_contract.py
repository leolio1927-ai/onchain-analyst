"""Contract tests for the settlement handoff receipt (T2-F.0).

Receipt law: legal initial state from the repo enum, INJECTED fee track,
unsigned payload with null hashes — plus honest 422/404 boundaries.
DB-only: the 200 path answers with loopback blocked.
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
    db_file = tmp_path / "handoff_contract.db"
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


def test_contract_state_fee_payload(tmp_path: Path, monkeypatch: Any) -> None:
    client = _client(tmp_path, monkeypatch)
    res = client.post("/api/v1/swap/handoff", json=_body())
    assert res.status_code == 200
    body = res.json()
    assert body["state"] in repo.SETTLEMENT_STATES
    assert body["state"] == "QUOTE_ONLY"
    assert body["fee_status"] == "INJECTED"
    assert body["source_tx_hash"] is None
    payload = body["unsigned_payload"]
    assert payload["unsigned"] is True
    assert payload["source_tx_hash"] is None
    assert payload["signature"] is None
    assert payload["quote_id"] == body["quote_id"]

    conn = connect(os.environ.get("ALPHA_DB_PATH", ""))
    try:
        stored = repo.get_settlement(conn, quote_id=body["quote_id"])
        assert stored is not None
        assert stored["state"] == "QUOTE_ONLY"
        assert stored["source_tx_hash"] is None
        fee = repo.get_fee_recon(conn, quote_id=body["quote_id"])
        assert fee is not None
        assert fee["status"] == "INJECTED"
        assert fee["fee_injected_bps"] == 30
    finally:
        conn.close()

    detail = client.get(f"/api/v1/swap/settlement/{body['quote_id']}")
    assert detail.status_code == 200
    assert detail.json()["quote_id"] == body["quote_id"]


def test_contract_422_fee_boundary(tmp_path: Path, monkeypatch: Any) -> None:
    client = _client(tmp_path, monkeypatch)
    assert client.post("/api/v1/swap/handoff", json=_body(fee_bps=3000)).status_code == 200
    assert client.post("/api/v1/swap/handoff", json=_body(fee_bps=3001)).status_code == 422


def test_contract_404_unknown_provider(tmp_path: Path, monkeypatch: Any) -> None:
    client = _client(tmp_path, monkeypatch)
    res = client.post("/api/v1/swap/handoff", json=_body(provider="nope-dex"))
    assert res.status_code == 404
    assert client.get("/api/v1/swap/settlement/q_missing_handoff").status_code == 404


def test_contract_db_only_loopback_blocked(tmp_path: Path, monkeypatch: Any) -> None:
    client = _client(tmp_path, monkeypatch)

    def _deny(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("network attempted")

    with patch("socket.socket.connect", side_effect=_deny):
        res = client.post("/api/v1/swap/handoff", json=_body())
    assert res.status_code == 200
    assert res.json()["unsigned_payload"]["unsigned"] is True
