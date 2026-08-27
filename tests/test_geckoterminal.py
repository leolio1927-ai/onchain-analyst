"""Parser trade feed harus cocok dengan response asli (fixture dari live 2026-08-27)."""
import json
from pathlib import Path

from providers import geckoterminal

FIX = json.loads((Path(__file__).parent / "fixtures" / "geckoterminal_trades.json").read_text())


def _with(monkeypatch, payload):
    monkeypatch.setattr(geckoterminal, "_get", lambda path: payload)


def test_normalisasi_trade(monkeypatch):
    _with(monkeypatch, FIX)
    trades = geckoterminal.fetch_trades("sol", "POOLX")
    assert len(trades) == 10  # 11 item, 1 tanpa volume_in_usd → di-skip
    first = trades[0]
    assert set(first) == {"wallet", "kind", "ts", "usd", "base_token"}
    assert first["wallet"] == "WA1"
    assert first["kind"] == "buy"
    assert first["ts"].startswith("2026-08-27T06:00:05")
    assert isinstance(first["usd"], float) and first["usd"] == 250.10
    assert first["base_token"] == "BASE1"  # buy → base = to_token_address
    assert all(t["base_token"] == "BASE1" for t in trades if t["kind"] == "sell")


def test_trade_rusak_dilewati(monkeypatch):
    _with(monkeypatch, {"data": [
        {"attributes": {"tx_from_address": "W", "kind": "buy",
                        "block_timestamp": "2026-08-27T06:00:00Z"}},                # tanpa usd
        {"attributes": {"tx_from_address": None, "kind": "buy",
                        "block_timestamp": "2026-08-27T06:00:01Z", "volume_in_usd": "1"}},  # tanpa wallet
        {"attributes": {"tx_from_address": "W", "kind": "swap",
                        "block_timestamp": "2026-08-27T06:00:02Z", "volume_in_usd": "1"}},  # kind asing
        {"attributes": {"tx_from_address": "W", "kind": "buy",
                        "volume_in_usd": "bukan-angka"}},                            # usd rusak
    ]})
    assert geckoterminal.fetch_trades("sol", "P") == []


def test_best_pool_pilih_reserve_terbesar():
    pools = [
        {"attributes": {"address": "A", "reserve_in_usd": "100"}},
        {"attributes": {"address": "B", "reserve_in_usd": "900"}},
        {"attributes": {"address": "C", "reserve_in_usd": None}},
    ]
    assert geckoterminal.best_pool(pools)["attributes"]["address"] == "B"
    assert geckoterminal.best_pool([]) is None
