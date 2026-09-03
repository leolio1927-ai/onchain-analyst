"""Wallet broadcast simulator tests (SLOT W-SIM).

The simulator runs against TestClient(app) transports: full
PENDING -> confirm -> SUBMITTED -> monitor -> DEST_CONFIRMED loop plus
the honest exit codes. No live chain is ever touched.
"""

from __future__ import annotations

import importlib.util
import time
from pathlib import Path
from typing import Any

from starlette.testclient import TestClient

from providers import settlement_repository as repo
from webapp.db import connect, init_schema
from webapp.server import app

_SIM_PATH = Path(__file__).resolve().parents[1] / "scripts" / "wallet_sim.py"
_spec = importlib.util.spec_from_file_location("wallet_sim", _SIM_PATH)
assert _spec is not None and _spec.loader is not None
wallet_sim = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(wallet_sim)

_WALLET = "0xhandoff00000000000000000000000000000000ff"
_TX = "0x" + "ab" * 32
_TX_DEST = "0x" + "cd" * 32


def _client(tmp_path: Path, monkeypatch: Any) -> tuple[TestClient, str]:
    db_file = tmp_path / "wallet_sim.db"
    conn = connect(db_file)
    init_schema(conn)
    conn.close()
    monkeypatch.setenv("ALPHA_DB_PATH", str(db_file))
    return TestClient(app), str(db_file)


def _transport(client: TestClient) -> tuple[Any, Any]:
    def get(path: str) -> tuple[int, dict[str, Any]]:
        res = client.get("/api/v1" + path)
        try:
            body = res.json()
        except ValueError:
            body = {"detail": res.text}
        return res.status_code, body

    def post(path: str, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        res = client.post("/api/v1" + path, json=body)
        try:
            payload = res.json()
        except ValueError:
            payload = {"detail": res.text}
        return res.status_code, payload

    return get, post


def _handoff(client: TestClient) -> str:
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
    assert res.json()["source_tx_hash"] is None
    return res.json()["quote_id"]


def test_happy_pending_to_dest_exit_0(tmp_path: Path, monkeypatch: Any) -> None:
    client, db_path = _client(tmp_path, monkeypatch)
    quote_id = _handoff(client)
    get, real_post = _transport(client)

    def post(path: str, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        code, payload = real_post(path, body)
        if path == "/swap/handoff/confirm" and code == 200:
            conn = connect(db_path)
            try:
                repo.transition(conn, quote_id=quote_id, to_state="SOURCE_CONFIRMED",
                                reason="chain saw source")
                repo.transition(conn, quote_id=quote_id, to_state="DEST_CONFIRMED",
                                reason="dest filled", dest_tx=_TX_DEST)
            finally:
                conn.close()
        return code, payload

    code = wallet_sim.run_sim(
        quote_id=quote_id, wallet=_WALLET, tx_hash=_TX,
        interval=0.0, max_wait=30.0, get=get, post=post,
    )
    assert code == 0


def test_no_quote_404_exit_4(tmp_path: Path, monkeypatch: Any) -> None:
    client, _ = _client(tmp_path, monkeypatch)
    get, post = _transport(client)
    code = wallet_sim.run_sim(
        quote_id="q_missing_sim", wallet=_WALLET, tx_hash=_TX,
        interval=0.0, max_wait=5.0, get=get, post=post,
    )
    assert code == 4


def test_bad_hash_422_exit_5(tmp_path: Path, monkeypatch: Any) -> None:
    client, _ = _client(tmp_path, monkeypatch)
    quote_id = _handoff(client)
    get, post = _transport(client)
    code = wallet_sim.run_sim(
        quote_id=quote_id, wallet=_WALLET, tx_hash="0xabc",
        interval=0.0, max_wait=5.0, get=get, post=post,
    )
    assert code == 5


def test_wallet_mismatch_400_exit_5(tmp_path: Path, monkeypatch: Any) -> None:
    client, _ = _client(tmp_path, monkeypatch)
    quote_id = _handoff(client)
    get, post = _transport(client)
    code = wallet_sim.run_sim(
        quote_id=quote_id,
        wallet="0xintruder0000000000000000000000000000000001",
        tx_hash=_TX, interval=0.0, max_wait=5.0, get=get, post=post,
    )
    assert code == 5


def test_timeout_exit_3(tmp_path: Path, monkeypatch: Any) -> None:
    monkeypatch.setattr(time, "sleep", lambda _s: None)
    calls = {"post": 0}

    def get(_path: str) -> tuple[int, dict[str, Any]]:
        return 200, {"quote_id": "q_stuck_sim", "state": "SUBMITTED_PENDING",
                     "source_tx_hash": _TX, "confirmations": None}

    def post(_path: str, _body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        calls["post"] += 1
        raise AssertionError("confirm must not run without a hash")

    code = wallet_sim.run_sim(
        quote_id="q_stuck_sim", interval=0.0, max_wait=0.01, get=get, post=post,
    )
    assert code == 3
    assert calls["post"] == 0


def test_confirmations_threshold_auto_dest_exit_0(tmp_path: Path, monkeypatch: Any) -> None:
    _ = tmp_path, monkeypatch
    calls = {"post": 0}

    def get(_path: str) -> tuple[int, dict[str, Any]]:
        return 200, {"quote_id": "q_final_sim", "state": "SUBMITTED_PENDING",
                     "source_tx_hash": _TX, "confirmations": 20}

    def post(_path: str, _body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        calls["post"] += 1
        raise AssertionError("chain-final needs no confirm")

    code = wallet_sim.run_sim(
        quote_id="q_final_sim", threshold=12,
        interval=0.0, max_wait=5.0, get=get, post=post,
    )
    assert code == 0
    assert calls["post"] == 0


def test_fee_stays_injected_after_confirm(tmp_path: Path, monkeypatch: Any) -> None:
    client, _ = _client(tmp_path, monkeypatch)
    quote_id = _handoff(client)
    get, post = _transport(client)
    code = wallet_sim.run_sim(
        quote_id=quote_id, wallet=_WALLET, tx_hash=_TX,
        interval=0.0, max_wait=0.0, get=get, post=post,
    )
    assert code == 3
    fee = client.get(f"/api/v1/swap/settlements/{quote_id}/fee-reconciliation")
    assert fee.status_code == 200
    assert fee.json()["status"] == "INJECTED"


def test_failed_state_exit_2(tmp_path: Path, monkeypatch: Any) -> None:
    client, db_path = _client(tmp_path, monkeypatch)
    quote_id = _handoff(client)
    conn = connect(db_path)
    try:
        repo.transition(conn, quote_id=quote_id, to_state="FAILED", reason="simulated")
    finally:
        conn.close()
    get, post = _transport(client)
    code = wallet_sim.run_sim(
        quote_id=quote_id, interval=0.0, max_wait=5.0, get=get, post=post,
    )
    assert code == 2
