"""Heuristik harus deterministik: input sama → verdict sama, selamanya."""
import time

from heuristics import rug_check


def _pair(**over):
    now_ms = int(time.time() * 1000)
    p = {
        "chainId": "solana", "dexId": "raydium", "pairAddress": "PAIR1",
        "baseToken": {"address": "T1", "symbol": "TEST", "name": "Test"},
        "quoteToken": {"symbol": "SOL"}, "priceUsd": "0.001",
        "liquidity": {"usd": 500_000}, "fdv": 2_000_000, "marketCap": 2_000_000,
        "volume": {"h24": 300_000, "h6": 80_000, "h1": 20_000, "m5": 1_000},
        "priceChange": {"m5": 0.1, "h1": 0.5, "h6": 1.0, "h24": 2.0},
        "txns": {"h24": {"buys": 500, "sells": 480}},
        "pairCreatedAt": now_ms - 90 * 24 * 3600 * 1000,
    }
    p.update(over)
    return p


def test_sehat_rendah():
    r = rug_check.assess(_pair())
    assert r["level"] == "low"
    assert r["score"] is not None


def test_polamerah_tinggi():
    r = rug_check.assess(_pair(
        liquidity={"usd": 1_500}, fdv=5_000_000, marketCap=5_000_000,
        volume={"h24": 0, "h6": 0, "h1": 0, "m5": 0},
        txns={"h24": {"buys": 60, "sells": 0}},
        pairCreatedAt=int(time.time() * 1000) - 20 * 60 * 1000,
    ))
    assert r["level"] == "high"
    assert len(r["signals"]) == 5


def test_data_kurang_jujur():
    r = rug_check.assess({"baseToken": {"symbol": "X"}})
    assert r["level"] == "nodata"
    assert r["score"] is None
