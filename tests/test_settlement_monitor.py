"""Live-monitor read tests for handoff settlement state (D.8, DB-only)."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any
from unittest.mock import patch

from starlette.testclient import TestClient

from webapp.db import connect, init_schema
from webapp.server import app

_WALLET = "0xhandoff00000000000000000000000000000000ff"
_TX = "0x" + "ab" * 32


def _client(tmp_path: Path, monkeypatch: Any) -> TestClient:
    db_file = tmp_path / "handoff_monitor.db"
    conn = connect(db_file)
    init_schema(conn)
    conn.close()
    monkeypatch.setenv("ALPHA_DB_PATH", str(db_file))
    return TestClient(app)


def _handoff(client: TestClient) -> dict[str, Any]:
    res = client.post(
        "/api/v1/swap/handoff",
        json={
            "wallet": _WALLET,
            "chain_id": "eip155:8453",
            "provider": "lifi",
            "integrator": "vilmei",
            "fee_bps": 30,
            "amount": "250.0 USDC",
        },
    )
    assert res.status_code == 200
    return res.json()


def test_monitor_200_pending_nulls(tmp_path: Path, monkeypatch: Any) -> None:
    client = _client(tmp_path, monkeypatch)
    made = _handoff(client)
    res = client.get(f"/api/v1/swap/monitor/{made['quote_id']}")
    assert res.status_code == 200
    body = res.json()
    assert body["quote_id"] == made["quote_id"]
    assert body["state"] == "QUOTE_ONLY"
    assert body["source_tx_hash"] is None
    assert body["fee_status"] == "INJECTED"
    assert body["confirmations"] is None


def test_monitor_reflects_confirm(tmp_path: Path, monkeypatch: Any) -> None:
    client = _client(tmp_path, monkeypatch)
    made = _handoff(client)
    assert (
        client.post(
            "/api/v1/swap/handoff/confirm",
            json={"quote_id": made["quote_id"], "source_tx_hash": _TX, "wallet": _WALLET},
        ).status_code
        == 200
    )
    res = client.get(f"/api/v1/swap/monitor/{made['quote_id']}")
    assert res.status_code == 200
    body = res.json()
    assert body["state"] == "SUBMITTED_PENDING"
    assert body["source_tx_hash"] == _TX


def test_monitor_404_unknown(tmp_path: Path, monkeypatch: Any) -> None:
    client = _client(tmp_path, monkeypatch)
    assert client.get("/api/v1/swap/monitor/q_missing_monitor").status_code == 404


def test_monitor_updated_at_iso(tmp_path: Path, monkeypatch: Any) -> None:
    client = _client(tmp_path, monkeypatch)
    made = _handoff(client)
    body = client.get(f"/api/v1/swap/monitor/{made['quote_id']}").json()
    assert body["updated_at"] is not None
    datetime.fromisoformat(body["updated_at"])


def test_monitor_db_only_loopback_blocked(tmp_path: Path, monkeypatch: Any) -> None:
    client = _client(tmp_path, monkeypatch)
    made = _handoff(client)

    def _deny(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("network attempted")

    with patch("socket.socket.connect", side_effect=_deny):
        res = client.get(f"/api/v1/swap/monitor/{made['quote_id']}")
    assert res.status_code == 200
    assert res.json()["state"] == "QUOTE_ONLY"
