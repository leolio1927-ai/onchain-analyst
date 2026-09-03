"""Wallet confirm tests for the handoff hash intake (D.8, DB-only)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from starlette.testclient import TestClient

from providers import settlement_repository as repo
from webapp.db import connect, init_schema
from webapp.server import app

_WALLET = "0xhandoff00000000000000000000000000000000ff"
_TX = "0x" + "ab" * 32
_TX_OTHER = "0x" + "cd" * 32


def _client(tmp_path: Path, monkeypatch: Any) -> TestClient:
    db_file = tmp_path / "handoff_confirm.db"
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


def test_confirm_200_sets_hash_and_submitted(tmp_path: Path, monkeypatch: Any) -> None:
    client = _client(tmp_path, monkeypatch)
    made = _handoff(client)
    res = client.post(
        "/api/v1/swap/handoff/confirm",
        json={"quote_id": made["quote_id"], "source_tx_hash": _TX, "wallet": _WALLET},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["state"] == "SUBMITTED_PENDING"
    assert body["source_tx_hash"] == _TX
    assert body["confirmations"] is None

    conn = connect(os.environ.get("ALPHA_DB_PATH", ""))
    try:
        stored = repo.get_settlement(conn, quote_id=made["quote_id"])
        assert stored is not None
        assert stored["state"] == "SUBMITTED_PENDING"
        assert stored["source_tx_hash"] == _TX
    finally:
        conn.close()


def test_confirm_hash_null_before_wallet_reports(tmp_path: Path, monkeypatch: Any) -> None:
    """Honest guard: a fresh handoff carries no hash until the wallet speaks."""
    client = _client(tmp_path, monkeypatch)
    made = _handoff(client)
    assert made["source_tx_hash"] is None
    seen = client.get(f"/api/v1/swap/monitor/{made['quote_id']}")
    assert seen.status_code == 200
    assert seen.json()["source_tx_hash"] is None


def test_confirm_404_unknown_quote(tmp_path: Path, monkeypatch: Any) -> None:
    client = _client(tmp_path, monkeypatch)
    res = client.post(
        "/api/v1/swap/handoff/confirm",
        json={"quote_id": "q_missing_confirm", "source_tx_hash": _TX, "wallet": _WALLET},
    )
    assert res.status_code == 404


def test_confirm_422_bad_hash(tmp_path: Path, monkeypatch: Any) -> None:
    client = _client(tmp_path, monkeypatch)
    made = _handoff(client)
    assert (
        client.post(
            "/api/v1/swap/handoff/confirm",
            json={"quote_id": made["quote_id"], "source_tx_hash": "0xabc", "wallet": _WALLET},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/swap/handoff/confirm",
            json={
                "quote_id": made["quote_id"],
                "source_tx_hash": "zz" + "ab" * 32,
                "wallet": _WALLET,
            },
        ).status_code
        == 422
    )


def test_confirm_400_wallet_mismatch(tmp_path: Path, monkeypatch: Any) -> None:
    client = _client(tmp_path, monkeypatch)
    made = _handoff(client)
    res = client.post(
        "/api/v1/swap/handoff/confirm",
        json={
            "quote_id": made["quote_id"],
            "source_tx_hash": _TX,
            "wallet": "0xintruder0000000000000000000000000000000001",
        },
    )
    assert res.status_code == 400
    assert "wallet" in res.json()["detail"]


def test_confirm_idempotent_same_hash_conflict_other(tmp_path: Path, monkeypatch: Any) -> None:
    client = _client(tmp_path, monkeypatch)
    made = _handoff(client)
    first = client.post(
        "/api/v1/swap/handoff/confirm",
        json={"quote_id": made["quote_id"], "source_tx_hash": _TX, "wallet": _WALLET},
    )
    assert first.status_code == 200
    again = client.post(
        "/api/v1/swap/handoff/confirm",
        json={"quote_id": made["quote_id"], "source_tx_hash": _TX, "wallet": _WALLET},
    )
    assert again.status_code == 200
    assert again.json()["source_tx_hash"] == _TX
    clash = client.post(
        "/api/v1/swap/handoff/confirm",
        json={"quote_id": made["quote_id"], "source_tx_hash": _TX_OTHER, "wallet": _WALLET},
    )
    assert clash.status_code == 409
