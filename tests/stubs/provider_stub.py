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

from providers import alchemy, helius, jupiter

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


# ── BE-F5a-R: trader-loop enrichment stubs (helius / alchemy / jupiter) ──
# Modes: "live" (canned payloads through the real parse paths),
# "nokey" (env keys removed → the honest not_configured notes),
# "timeout" (transport raises → the honest timeout notes). No network.

def _helius_live(monkeypatch) -> None:
    monkeypatch.setenv("HELIUS_API_KEY", "stub-helius-key")
    helius._cache.clear()

    def canned_call(url, body=None):
        if body and body.get("method") == "getTokenLargestAccounts":
            return {"result": {"value": [
                {"uiAmount": 900.0}, {"uiAmount": 50.0}]}}
        if body and body.get("method") == "getTokenSupply":
            return {"result": {"value": {"uiAmount": 1000.0}}}
        return [{"type": "CREATE", "signature": "SIG1", "feePayer": "DEP1",
                 "timestamp": 1_700_000_000}]

    monkeypatch.setattr(helius, "_call", canned_call)


def _alchemy_live(monkeypatch) -> None:
    monkeypatch.setenv("ALCHEMY_API_KEY", "stub-alchemy-key")
    alchemy._cache.clear()

    def canned_rpc(chain, method, params):
        if method == "alchemy_getAssetTransfers":
            return {"transfers": [{"fromAddress": "DEPEVM",
                                   "metadata": {"blockTimestamp": "2026-08-01T00:00:00Z"}}]}
        if method == "eth_getCode":
            return "0x"      # deployer is an EOA
        raise AssertionError(f"unexpected rpc {method}")

    monkeypatch.setattr(alchemy, "_rpc", canned_rpc)


def _jupiter_live(monkeypatch, *, routable: bool = True) -> None:
    jupiter._cache.clear()
    if routable:
        monkeypatch.setattr(jupiter, "_get",
                            lambda path: {"outAmount": "282271"})
    else:
        def no_route(path):
            raise jupiter._JupiterError("no-route:Could not find any route")
        monkeypatch.setattr(jupiter, "_get", no_route)


def install_enrichment(monkeypatch, *, mode: str = "live",
                       jupiter_mode: str | None = None) -> None:
    """Patch all three provider transports at once.

    mode:        "live" | "nokey" | "timeout"          (helius + alchemy)
    jupiter_mode: None → follows `mode` with "live" meaning routable;
                  or "routable" | "unroutable" | "timeout" | "nokey".
    """
    from providers import alchemy, helius, jupiter

    helius._cache.clear()
    alchemy._cache.clear()
    jupiter._cache.clear()

    jmode = jupiter_mode or {"live": "routable", "nokey": "routable",
                             "timeout": "timeout"}[mode]
    # jupiter is keyless: "nokey" does not exist for it — the canned
    # routable path keeps the suite network-free in every mode

    if mode == "nokey":
        monkeypatch.delenv("HELIUS_API_KEY", raising=False)
        monkeypatch.delenv("ALCHEMY_API_KEY", raising=False)
    elif mode == "live":
        _helius_live(monkeypatch)
        _alchemy_live(monkeypatch)
    elif mode == "timeout":
        monkeypatch.setenv("HELIUS_API_KEY", "stub-helius-key")
        monkeypatch.setenv("ALCHEMY_API_KEY", "stub-alchemy-key")

        def timeout_call(url, body=None):
            raise helius._HeliusError("timeout")
        monkeypatch.setattr(helius, "_call", timeout_call)

        def timeout_rpc(chain, method, params):
            raise alchemy._AlchemyError("timeout")
        monkeypatch.setattr(alchemy, "_rpc", timeout_rpc)
    else:
        raise ValueError(f"unknown enrichment mode {mode!r}")

    if jmode == "nokey":
        pass  # jupiter is keyless — nothing to remove
    elif jmode == "routable":
        _jupiter_live(monkeypatch, routable=True)
    elif jmode == "unroutable":
        _jupiter_live(monkeypatch, routable=False)
    elif jmode == "timeout":
        def timeout_get(path):
            raise jupiter._JupiterError("timeout")
        monkeypatch.setattr(jupiter, "_get", timeout_get)
    else:
        raise ValueError(f"unknown jupiter mode {jmode!r}")
