"""DexScreener adapter: chain filter, unknown-chain guard, best_pair, and the
launch_venue earliest-pairCreatedAt logic (zero tests before this audit patch)."""
import io
import json
import urllib.request

import pytest

from providers import dexscreener


class _StubResp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _urlopen_stub(payload: dict, calls: list | None = None):
    body = json.dumps(payload).encode()

    def _fake(req, timeout=10):
        if calls is not None:
            calls.append(req.full_url)
        return _StubResp(body)
    return _fake


def test_chain_ids_hood_verified_live():
    # verified live 2026-08-28: GET /latest/dex/search?q=robinhood returns 24
    # pairs with chainId "robinhood" (Robinhood Chain) — DexScreener chainId is real.
    assert dexscreener.CHAIN_IDS["hood"] == "robinhood"


def test_fetch_pairs_filters_by_chain(monkeypatch):
    payload = {"pairs": [
        {"chainId": "solana", "dexId": "raydium"},
        {"chainId": "bsc", "dexId": "pancakeswap"},
    ]}
    monkeypatch.setattr(urllib.request, "urlopen", _urlopen_stub(payload))
    out = dexscreener.fetch_pairs("sol", "ADDR")
    assert len(out) == 1 and out[0]["chainId"] == "solana"


def test_fetch_pairs_unknown_chain_raises_valueerror(monkeypatch):
    monkeypatch.setattr(urllib.request, "urlopen", _urlopen_stub({"pairs": []}))
    with pytest.raises(ValueError, match="no chainId for chain"):
        dexscreener.fetch_pairs("hype", "ADDR")


def test_best_pair_prefers_deepest_liquidity():
    pairs = [
        {"liquidity": {"usd": 100}},
        {"liquidity": {"usd": 900}},
        {"liquidity": None},
    ]
    assert dexscreener.best_pair(pairs)["liquidity"]["usd"] == 900
    assert dexscreener.best_pair([]) is None


def test_launch_venue_earliest_pair_wins():
    pairs = [
        {"dexId": "raydium", "pairCreatedAt": 2000},
        {"dexId": "pumpfun", "pairCreatedAt": 1000},
    ]
    assert dexscreener.launch_venue(pairs) == "pump.fun"


def test_launch_venue_ignores_pairs_without_timestamp():
    assert dexscreener.launch_venue([{"dexId": "raydium"}]) is None
    assert dexscreener.launch_venue([]) is None


def test_launch_venue_unknown_dex_passes_through():
    assert dexscreener.launch_venue([{"dexId": "weird-dex", "pairCreatedAt": 1}]) == "weird-dex"


def test_launch_venue_map_covers_known_launchpads():
    assert dexscreener.VENUE_MAP["pumpfun"] == "pump.fun"
    assert dexscreener.VENUE_MAP["launchlab"] == "bonk.fun (LaunchLab)"
