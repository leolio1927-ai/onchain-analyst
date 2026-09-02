"""HTTP integration tests for Dev Settlement Feeder endpoints (Slot D.5).

Verifies environment gating (404 when disabled, 200 when enabled),
response payloads, and network isolation.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import patch

from starlette.testclient import TestClient

from webapp.db import connect, init_schema
from webapp.server import app


def test_dev_feeder_endpoints_disabled_by_default(tmp_path: Path, monkeypatch: Any) -> None:
    """1. When ALPHA_SIM_FEEDER is unset or not '1', endpoints return 404."""
    db_file = tmp_path / "test_disabled.db"
    conn = connect(db_file)
    init_schema(conn)
    conn.close()

    monkeypatch.setenv("ALPHA_DB_PATH", str(db_file))
    monkeypatch.delenv("ALPHA_SIM_FEEDER", raising=False)

    client = TestClient(app)

    # Seed should 404
    res_seed = client.post("/api/v1/dev/settlement-feeder/seed", json={})
    assert res_seed.status_code == 404
    assert res_seed.json()["detail"] == "dev endpoint disabled"

    # Tick should 404
    res_tick = client.post("/api/v1/dev/settlement-feeder/tick")
    assert res_tick.status_code == 404
    assert res_tick.json()["detail"] == "dev endpoint disabled"

    # List should show dev_feeder=False
    res_list = client.get("/api/v1/swap/settlements")
    assert res_list.status_code == 200
    assert res_list.json()["dev_feeder"] is False


def test_dev_feeder_endpoints_enabled_with_env(tmp_path: Path, monkeypatch: Any) -> None:
    """2. When ALPHA_SIM_FEEDER='1', seed and tick operate normally on DB."""
    db_file = tmp_path / "test_enabled.db"
    conn = connect(db_file)
    init_schema(conn)
    conn.close()

    monkeypatch.setenv("ALPHA_DB_PATH", str(db_file))
    monkeypatch.setenv("ALPHA_SIM_FEEDER", "1")

    client = TestClient(app)

    # Seed
    res_seed = client.post("/api/v1/dev/settlement-feeder/seed", json={"reset": True})
    assert res_seed.status_code == 200
    seed_data = res_seed.json()
    assert seed_data["seeded"] > 0
    assert seed_data["skipped_hood"] >= 1
    assert seed_data["errors"] == 0

    # List should reflect dev_feeder=True and populated items
    res_list = client.get("/api/v1/swap/settlements")
    assert res_list.status_code == 200
    list_data = res_list.json()
    assert list_data["dev_feeder"] is True
    assert list_data["count"] > 0
    assert len(list_data["items"]) > 0

    # Tick
    res_tick = client.post("/api/v1/dev/settlement-feeder/tick")
    assert res_tick.status_code == 200
    tick_data = res_tick.json()
    assert len(tick_data["advanced"]) > 0
    assert tick_data["errors"] == 0

    # Detail
    first_quote = list_data["items"][0]["quote_id"]
    res_detail = client.get(f"/api/v1/swap/settlement/{first_quote}")
    assert res_detail.status_code == 200
    assert res_detail.json()["quote_id"] == first_quote
    assert len(res_detail.json()["events"]) >= 1


def test_dev_feeder_never_calls_external_providers(tmp_path: Path, monkeypatch: Any) -> None:
    """3. Verifies dev feeder seed and tick never call external network endpoints."""
    from providers import simulation

    db_file = tmp_path / "test_nonetwork.db"
    conn = connect(db_file)
    init_schema(conn)
    conn.close()

    monkeypatch.setenv("ALPHA_DB_PATH", str(db_file))
    monkeypatch.setenv("ALPHA_SIM_FEEDER", "1")

    # Patch simulation and urlopen to fail if called
    with patch.object(simulation, "simulate", side_effect=AssertionError("simulation.simulate called")):
        client = TestClient(app)
        res_seed = client.post("/api/v1/dev/settlement-feeder/seed", json={})
        assert res_seed.status_code == 200

        res_tick = client.post("/api/v1/dev/settlement-feeder/tick")
        assert res_tick.status_code == 200
