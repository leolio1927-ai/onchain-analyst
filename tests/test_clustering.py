"""Clustering deterministik: input sama → verdict sama; sampel kurang → jujur."""
from datetime import UTC, datetime

from heuristics import clustering

BASE_TS = 1787839200  # epoch detik, acak tapi tetap


def _t(wallet, dt, usd, kind="buy"):
    ts = datetime.fromtimestamp(BASE_TS + dt, tz=UTC).isoformat()
    return {"wallet": wallet, "kind": kind, "ts": ts, "usd": usd, "base_token": "BASE"}


def test_sampel_kecil_tidak_diskor():
    r = clustering.analyze([_t(f"W{i}", i * 10, 100) for i in range(5)])
    assert r["severity"] is None
    assert "tidak diskor" in r["evidence"]


def test_burst_terkoordinasi():
    trades = [_t(f"W{i}", i * 2.5, 100 + i) for i in range(20)]           # 20 beli dalam 50 dtk
    trades += [_t(f"W{i + 20}", 600 * (i + 1), 300 + i) for i in range(5)]  # sebar sisanya
    r = clustering.analyze(trades)
    assert r["wallets"] == 25
    assert r["severity"] is not None and r["severity"] >= 0.5
    assert "burst" in r["evidence"]


def test_nominal_seragam():
    trades = [_t(f"W{i}", i * 700, 250.0) for i in range(10)]  # waktu sebar, nominal identik
    r = clustering.analyze(trades)
    assert r["severity"] is not None and r["severity"] >= 0.45
    assert "CV nominal" in r["evidence"]


def test_organik_sehat():
    trades = [_t(f"W{i}", i * 600, 20 + i * 37) for i in range(15)]
    r = clustering.analyze(trades)
    assert r["severity"] == 0.0


def test_kosong():
    r = clustering.analyze([])
    assert r["severity"] is None and r["wallets"] == 0
