"""Offline provider stubs for contract tests (BE-F1) — zero network, zero keys.

Canned payloads mirror the real upstream shapes: DexScreener token-pairs
(providers/dexscreener.fetch_pairs), GeckoTerminal pool trades
(providers/geckoterminal.fetch_trades) and the GT pool feed raw envelope
(providers/geckoterminal._get). install_*() patch exactly the call sites
webapp.server uses, so the full engine runs offline and the response
contracts are exercised end-to-end. Test-only — never imported by app code.
"""
from __future__ import annotations

import urllib.error
from datetime import UTC, datetime, timedelta

_ADDRESS = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"


def address() -> str:
    return _ADDRESS


def pair() -> dict:
    """DexScreener pair — same field shape tests/test_webapp_api.py uses,
    self-contained here so the golden wire capture is stable."""
    created_ms = int((datetime.now(UTC) - timedelta(days=90)).timestamp() * 1000)
    return {
        "pairAddress": "PAIR1", "chainId": "solana", "dexId": "raydium",
        "baseToken": {"address": "T1", "symbol": "TEST", "name": "Test"},
        "quoteToken": {"symbol": "SOL"}, "priceUsd": "0.001",
        "liquidity": {"usd": 500_000}, "fdv": 2_000_000, "marketCap": 2_000_000,
        "volume": {"h24": 300_000, "h6": 80_000, "h1": 20_000, "m5": 1_000},
        "priceChange": {"m5": 0.1, "h1": 0.5, "h6": 1.0, "h24": 2.0},
        "txns": {"h24": {"buys": 500, "sells": 480}},
        "pairCreatedAt": created_ms,
        "url": "https://dexscreener.com/x",
    }


def trades(n: int = 25) -> list[dict]:
    """GT pool trades, normalized shape (wallet/kind/ts/usd/base_token)."""
    t0 = datetime.now(UTC).timestamp()
    return [{"wallet": f"W{i}", "kind": "buy",
             "ts": datetime.fromtimestamp(t0 + i * 2.5, tz=UTC).isoformat(),
             "usd": 100.0 + i, "base_token": "T1"} for i in range(n)]


def http_429():
    """A real urllib HTTPError — the honest-degrade paths key on this type."""
    return urllib.error.HTTPError("https://stub.invalid", 429, "Too Many Requests", None, None)


def gt_feed_raw(n: int = 3) -> dict:
    """GT pool-feed envelope with include=base_token (mirrors Stage-0 shape)."""
    data, included = [], []
    for i in range(n):
        tok_id = f"solana_TOK{i}"
        data.append({"id": f"solana_POOL{i}", "type": "pool",
                     "attributes": {"address": f"POOL{i}", "name": f"TEST{i} / SOL",
                                    "base_token_price_usd": "0.001",
                                    "volume_usd": {"h24": "1000"},
                                    "price_change_percentage": {"h24": "1.5"},
                                    "reserve_in_usd": "5000", "fdv_usd": "9000",
                                    "pool_created_at": "2026-08-29T00:00:00Z",
                                    "transactions": {"h24": {"buys": 10, "sells": 5}}},
                     "relationships": {"base_token": {"data": {"id": tok_id}},
                                       "dex": {"data": {"id": "pump-fun"}}}})
        included.append({"id": tok_id, "type": "token",
                         "attributes": {"symbol": "TST", "name": f"Test {i}",
                                        "image_url": "https://img.example/x.png"}})
    return {"data": data, "included": included}


def install_scan(monkeypatch, *, fail_trades: bool = False) -> None:
    """Patch the scan pipeline's two provider call sites. fail_trades=True
    raises GT HTTP 429 → exercises the honest clustering-degrade path."""
    from providers import dexscreener, geckoterminal

    monkeypatch.setattr(dexscreener, "fetch_pairs", lambda chain, addr: [pair()])
    if fail_trades:
        def boom(chain, pool):
            raise http_429()
        monkeypatch.setattr(geckoterminal, "fetch_trades", boom)
    else:
        monkeypatch.setattr(geckoterminal, "fetch_trades", lambda chain, pool: trades())


def install_live(monkeypatch) -> None:
    """Patch the live feed's GT fetch + DS socials lookup (no entries →
    socials stay absent → sources lists exactly what contributed)."""
    from providers import geckoterminal as gt
    from providers import live

    live._feed_cache.clear()
    live._socials_cache.clear()
    monkeypatch.setattr(gt, "_get", lambda path: gt_feed_raw())
    monkeypatch.setattr(live, "_ds_get", lambda path: [])
