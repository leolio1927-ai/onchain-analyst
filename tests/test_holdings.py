"""PROMPT-V4 M5 gate — holdings check: read-only balances for PUBLIC
addresses + the GeckoTerminal price join. Laws under test:
1. facts flow verbatim from the wired source (sol Helius / bnb Alchemy /
   base Alchemy-or-keyless-Blockscout);
2. a missing key is an honest no_key sentence — the address never travels;
3. hype/hood are PARTIAL sentences, never red, never zeros;
4. invalid addresses / unknown chains get human 400/404 sentences;
5. the price join reads each token's OWN pool side — base reads base price
   + Δ24h, quote reads quote price and NO Δ (GT exposes no quote-side
   change, probe 2026-08-31: the attribute is absent);
6. pricing misses are per-row notes + ONE aggregate sentence, never red;
   the cap guards the GT free tier (~10 calls/min);
7. addresses never reach the access log (formatter redacts the path);
8. the schema is the contract (model_validate passes on every shape)."""
import logging
import urllib.error

import pytest
from fastapi.testclient import TestClient

from providers import alchemy, blockscout, helius, holdings
from providers import geckoterminal as gt
from webapp import schemas, server

SOL_ADDR = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
EVM_ADDR = "0x" + "a1" * 20
CAKE = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"
USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
WSOL = "So11111111111111111111111111111111111111112"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("HELIUS_API_KEY", "test-key")
    monkeypatch.setenv("ALCHEMY_API_KEY", "test-key")
    return TestClient(server.app)


def quiet_gt(monkeypatch):
    """No pools anywhere → every price is an honest dash; keeps the
    balance-contract tests deterministic and network-free."""
    monkeypatch.setattr(gt, "fetch_pools", lambda chain, token: [])
    monkeypatch.setattr(gt, "search_pools_v2", lambda query, chain: [])


def test_sol_ok_verbatim(client, monkeypatch):
    quiet_gt(monkeypatch)
    monkeypatch.setattr(helius, "fetch_balances", lambda a: {
        "address": a, "sol": 142.06,
        "tokens": [{"mint": USDC, "amount": 250.5}]})
    r = client.get(f"/api/v1/holdings/sol/{SOL_ADDR}")
    assert r.status_code == 200
    b = r.json()
    assert b["coverage"] == "ok" and b["data_mode"] == "live"
    assert b["sources"] == ["helius", "geckoterminal"]
    assert b["native_symbol"] == "SOL" and b["native_amount"] == 142.06
    assert b["tokens"] == [{"token": USDC, "symbol": None, "amount": 250.5,
                            "price_usd": None, "change_24h": None,
                            "price_note": "no_pool"}]
    assert "heuristic pricing" in b["pricing_note"]
    schemas.HoldingsResponse.model_validate(b)


def test_sol_no_key_is_a_sentence_not_an_error(client, monkeypatch):
    monkeypatch.delenv("HELIUS_API_KEY", raising=False)

    def _raise(_a):
        raise helius.NoKeyError("HELIUS_API_KEY not set")
    monkeypatch.setattr(helius, "fetch_balances", _raise)
    r = client.get(f"/api/v1/holdings/sol/{SOL_ADDR}")
    assert r.status_code == 200
    b = r.json()
    assert b["coverage"] == "no_key" and b["data_mode"] == "partial"
    assert b["native_amount"] is None
    assert "HELIUS_API_KEY" in b["reasons"][0]
    assert "geckoterminal" not in b["sources"]      # no pricing without balances


def test_bnb_ok_via_alchemy(client, monkeypatch):
    quiet_gt(monkeypatch)
    monkeypatch.setattr(alchemy, "get_balances", lambda c, a: (
        {"native": 3.2, "tokens": [{"token": CAKE, "symbol": None, "amount": 10.0}]},
        None))
    r = client.get(f"/api/v1/holdings/bnb/{EVM_ADDR}")
    b = r.json()
    assert b["coverage"] == "ok" and b["sources"][0] == "alchemy"
    assert b["native_symbol"] == "BNB" and b["native_amount"] == 3.2
    assert b["tokens"][0]["amount"] == 10.0
    assert b["tokens"][0]["price_note"] == "no_pool"


def test_bnb_no_key_is_declared_null(client, monkeypatch):
    monkeypatch.setattr(alchemy, "get_balances",
                        lambda c, a: (None, "alchemy:not_configured"))
    b = client.get(f"/api/v1/holdings/bnb/{EVM_ADDR}").json()
    assert b["coverage"] == "no_key" and b["data_mode"] == "partial"
    assert "ALCHEMY_API_KEY" in b["reasons"][0]


def test_base_falls_back_to_keyless_blockscout(client, monkeypatch):
    quiet_gt(monkeypatch)
    monkeypatch.setattr(holdings.alchemy, "_key", lambda: None)
    monkeypatch.setattr(blockscout, "get_balances", lambda c, a: (
        {"native": 0.5, "tokens": [{"token": CAKE, "symbol": "USDC", "amount": 12.0}],
         "tokens_note": None}, None))
    b = client.get(f"/api/v1/holdings/base/{EVM_ADDR}").json()
    assert b["coverage"] == "ok" and b["sources"][0] == "blockscout"
    assert b["native_amount"] == 0.5
    assert any("keyless" in s for s in b["reasons"])
    assert b["tokens"][0]["symbol"] == "USDC"


def test_base_blockscout_tokens_note_rides_along(client, monkeypatch):
    quiet_gt(monkeypatch)
    monkeypatch.setattr(holdings.alchemy, "_key", lambda: None)
    monkeypatch.setattr(blockscout, "get_balances", lambda c, a: (
        {"native": 0.5, "tokens": [],
         "tokens_note": "blockscout:tokens_unavailable — the ERC-20 page failed"},
        None))
    b = client.get(f"/api/v1/holdings/base/{EVM_ADDR}").json()
    assert b["coverage"] == "ok" and b["native_amount"] == 0.5
    assert any("tokens_unavailable" in s for s in b["reasons"])


def test_hype_and_hood_are_honest_partial(client):
    for chain in ("hype", "hood"):
        b = client.get(f"/api/v1/holdings/{chain}/{EVM_ADDR}").json()
        assert b["coverage"] == "partial" and b["data_mode"] == "partial"
        assert b["native_amount"] is None and b["tokens"] == []
        assert chain in b["reasons"][0]
        schemas.HoldingsResponse.model_validate(b)


def test_upstream_error_is_a_sentence(client, monkeypatch):
    monkeypatch.setattr(alchemy, "get_balances",
                        lambda c, a: (None, "alchemy:http_500"))
    b = client.get(f"/api/v1/holdings/bnb/{EVM_ADDR}").json()
    assert b["coverage"] == "upstream_error" and b["data_mode"] == "live"
    assert "alchemy:http_500" in b["reasons"][0]


def test_unknown_chain_404_and_bad_address_400(client):
    r = client.get(f"/api/v1/holdings/avax/{EVM_ADDR}")
    assert r.status_code == 404 and "pick sol|bnb|base|hype|hood" in r.json()["detail"]
    r = client.get("/api/v1/holdings/sol/not-base58-0OIl")
    assert r.status_code == 400 and "not a valid sol address" in r.json()["detail"]
    r = client.get("/api/v1/holdings/base/0x123")
    assert r.status_code == 400 and "not a valid base address" in r.json()["detail"]


# ── the price join (N1): USD + Δ24h from each token's OWN pool side ──────

def _pool(name: str, chain: str, base: str, quote: str, *, reserve: str,
          base_px=None, quote_px=None, h24=None) -> dict:
    attrs: dict = {"name": name, "reserve_in_usd": reserve}
    if base_px is not None:
        attrs["base_token_price_usd"] = base_px
    if quote_px is not None:
        attrs["quote_token_price_usd"] = quote_px
    if h24 is not None:
        attrs["price_change_percentage"] = {"h24": h24}
    net = gt.NETWORKS[chain]
    return {"attributes": attrs,
            "relationships": {
                "base_token": {"data": {"id": f"{net}_{base}".lower()}},
                "quote_token": {"data": {"id": f"{net}_{quote}".lower()}}}}


def test_price_join_reads_the_tokens_own_side_base(client, monkeypatch):
    """A token that is the pool's BASE prices from base_token_price_usd and
    carries GT's h24 change verbatim."""
    bonk_pool = _pool("Bonk / USDC", "sol", SOL_ADDR, USDC, reserve="149465",
                      base_px="0.000002969909945", h24="-0.17")

    def fake_pools(chain, token):
        return [bonk_pool] if token == SOL_ADDR else []
    monkeypatch.setattr(gt, "fetch_pools", fake_pools)
    monkeypatch.setattr(gt, "search_pools_v2", lambda q, c: [])
    monkeypatch.setattr(helius, "fetch_balances", lambda a: {
        "address": a, "sol": 1.0, "tokens": [{"mint": SOL_ADDR, "amount": 500.0}]})
    b = client.get(f"/api/v1/holdings/sol/{SOL_ADDR}").json()
    row = b["tokens"][0]
    assert row["price_usd"] == pytest.approx(0.000002969909945)
    assert row["change_24h"] == pytest.approx(-0.17)
    assert row["price_note"] is None
    # the wrapped-native lookup also rode the base side (WSOL pool absent →
    # native USD is a dash with a sentence, balances untouched)
    assert b["native_price_usd"] is None
    assert any("native_price_unavailable" in s for s in b["reasons"])


def test_price_join_quote_side_prices_without_delta(client, monkeypatch):
    """A quote-side holding (USDC in SOL/USDC) prices from
    quote_token_price_usd — and ships NO Δ24h, because GT exposes no
    quote-side change (probe 2026-08-31). Absence stays absence."""
    usdc_pool = _pool("SOL / USDC", "sol", WSOL, USDC, reserve="24606065",
                      base_px="206.1", quote_px="0.999714", h24="-3.73")

    def fake_pools(chain, token):
        if token == USDC:
            return [usdc_pool]
        if token == WSOL:
            return [_pool("SOL / USDC", "sol", WSOL, USDC, reserve="24606065",
                          base_px="206.1", quote_px="0.999714", h24="-3.73")]
        return []
    monkeypatch.setattr(gt, "fetch_pools", fake_pools)
    monkeypatch.setattr(helius, "fetch_balances", lambda a: {
        "address": a, "sol": 2.0, "tokens": [{"mint": USDC, "amount": 100.0}]})
    b = client.get(f"/api/v1/holdings/sol/{SOL_ADDR}").json()
    row = b["tokens"][0]
    assert row["price_usd"] == pytest.approx(0.999714)
    assert row["change_24h"] is None                    # GT has no quote-side Δ
    assert row["price_note"] is None
    assert b["native_price_usd"] == pytest.approx(206.1)
    assert b["native_change_24h"] == pytest.approx(-3.73)


def test_price_join_deepest_pool_wins(client, monkeypatch):
    small = _pool("T / USDC small", "sol", SOL_ADDR, USDC, reserve="100",
                  base_px="9.99", h24="50")
    deep = _pool("T / USDC deep", "sol", SOL_ADDR, USDC, reserve="900000",
                 base_px="1.23", h24="-5.5")
    monkeypatch.setattr(gt, "fetch_pools",
                        lambda c, t: [small, deep] if t == SOL_ADDR else [])
    monkeypatch.setattr(helius, "fetch_balances", lambda a: {
        "address": a, "sol": 0.0, "tokens": [{"mint": SOL_ADDR, "amount": 1.0}]})
    row = client.get(f"/api/v1/holdings/sol/{SOL_ADDR}").json()["tokens"][0]
    assert row["price_usd"] == pytest.approx(1.23)
    assert row["change_24h"] == pytest.approx(-5.5)


def test_price_join_rate_limit_is_one_sentence_never_red(client, monkeypatch):
    def boom(chain, token):
        raise urllib.error.HTTPError("https://api.geckoterminal.com", 429,
                                     "rate limited", None, None)
    monkeypatch.setattr(gt, "fetch_pools", boom)
    monkeypatch.setattr(gt, "search_pools_v2", lambda q, c: [])
    monkeypatch.setattr(helius, "fetch_balances", lambda a: {
        "address": a, "sol": 1.0, "tokens": [{"mint": USDC, "amount": 5.0}]})
    b = client.get(f"/api/v1/holdings/sol/{SOL_ADDR}").json()
    assert b["coverage"] == "ok"                        # balances survived the 429
    assert b["tokens"][0]["price_note"] == "rate_limited"
    agg = [s for s in b["reasons"] if "pricing_rate_limited" in s]
    assert len(agg) == 1 and "2 price lookups" in agg[0]   # native + token


def test_price_cap_guards_the_free_tier(client, monkeypatch):
    """10 held tokens → first 8 priced, rest 'capped', ONE sentence."""
    mints = [f"Mint{i}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" for i in range(10)]
    quiet_gt(monkeypatch)
    monkeypatch.setattr(helius, "fetch_balances", lambda a: {
        "address": a, "sol": 1.0,
        "tokens": [{"mint": m, "amount": 1.0} for m in mints]})
    b = client.get(f"/api/v1/holdings/sol/{SOL_ADDR}").json()
    notes = [t["price_note"] for t in b["tokens"]]
    assert notes.count("capped") == len(mints) - holdings.PRICE_CAP
    assert all(n == "no_pool" for n in notes if n != "capped")
    assert any("pricing_capped" in s and "first 8 of 10" in s
               for s in b["reasons"])


def test_bnb_native_price_rides_the_wbnb_search(client, monkeypatch):
    """GT serves no bsc token page for WBNB (probe: 404) — the native price
    comes from a 'WBNB / …' pool found by v2 search, base side."""
    quiet_gt(monkeypatch)
    wbnb_pool = _pool("WBNB / BUSD", "bnb",
                      "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
                      "0xe9e7cea3dedca5984780bafc599bd69add087d56",
                      reserve="8850926", base_px="685.88", h24="1.2")
    monkeypatch.setattr(gt, "search_pools_v2",
                        lambda q, c: [wbnb_pool] if (q.lower(), c) == ("wbnb", "bnb")
                        else [])
    monkeypatch.setattr(alchemy, "get_balances", lambda c, a: (
        {"native": 3.2, "tokens": []}, None))
    b = client.get(f"/api/v1/holdings/bnb/{EVM_ADDR}").json()
    assert b["native_price_usd"] == pytest.approx(685.88)
    assert b["native_change_24h"] == pytest.approx(1.2)


# ── privacy law: addresses never reach the access log ────────────────────

def test_access_log_redacts_holdings_addresses():
    fmt = server.HoldingsRedactAccessFormatter(
        '%(client_addr)s - "%(request_line)s" %(status_code)s')

    def line(path: str) -> str:
        rec = logging.LogRecord("uvicorn.access", logging.INFO, "uvicorn", 0,
                                '%s - "%s %s HTTP/%s" %d',
                                ("127.0.0.1", "GET", path, "1.1", 200), None)
        return fmt.format(rec)

    out = line(f"/api/v1/holdings/sol/{SOL_ADDR}")
    assert "/api/v1/holdings/sol/REDACTED" in out
    assert SOL_ADDR not in out
    out = line(f"/api/v1/holdings/base/{EVM_ADDR}?x=1")
    assert "/api/v1/holdings/base/REDACTED" in out and EVM_ADDR not in out
    # everything else logs verbatim — only holdings paths carry addresses
    out = line("/api/v1/portfolio/snapshot?items=sol:x")
    assert "/api/v1/portfolio/snapshot?items=sol:x" in out
