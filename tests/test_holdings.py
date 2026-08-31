"""PROMPT-V4 M5 gate — holdings check: read-only balances for PUBLIC
addresses. Laws under test:
1. facts flow verbatim from the wired source (sol Helius / bnb Alchemy /
   base Alchemy-or-keyless-Blockscout);
2. a missing key is an honest no_key sentence — the address never travels;
3. hype/hood are PARTIAL sentences, never red, never zeros;
4. invalid addresses / unknown chains get human 400/404 sentences;
5. the schema is the contract (model_validate passes on every shape)."""
import pytest
from fastapi.testclient import TestClient

from providers import alchemy, blockscout, helius, holdings
from webapp import schemas, server

SOL_ADDR = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
EVM_ADDR = "0x" + "a1" * 20
CAKE = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("HELIUS_API_KEY", "test-key")
    monkeypatch.setenv("ALCHEMY_API_KEY", "test-key")
    return TestClient(server.app)


def test_sol_ok_verbatim(client, monkeypatch):
    monkeypatch.setattr(helius, "fetch_balances", lambda a: {
        "address": a, "sol": 142.06,
        "tokens": [{"mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                    "amount": 250.5}]})
    r = client.get(f"/api/v1/holdings/sol/{SOL_ADDR}")
    assert r.status_code == 200
    b = r.json()
    assert b["coverage"] == "ok" and b["data_mode"] == "live"
    assert b["sources"] == ["helius"]
    assert b["native_symbol"] == "SOL" and b["native_amount"] == 142.06
    assert b["tokens"] == [{"token": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                            "symbol": None, "amount": 250.5}]
    schemas.HoldingsResponse.model_validate(b)


def test_sol_no_key_is_a_sentence_not_an_error(client, monkeypatch):
    def _raise(_a):
        raise helius.NoKeyError("HELIUS_API_KEY not set")
    monkeypatch.setattr(helius, "fetch_balances", _raise)
    r = client.get(f"/api/v1/holdings/sol/{SOL_ADDR}")
    assert r.status_code == 200
    b = r.json()
    assert b["coverage"] == "no_key" and b["data_mode"] == "partial"
    assert b["native_amount"] is None
    assert "HELIUS_API_KEY" in b["reasons"][0]


def test_bnb_ok_via_alchemy(client, monkeypatch):
    monkeypatch.setattr(alchemy, "get_balances", lambda c, a: (
        {"native": 3.2, "tokens": [{"token": CAKE, "symbol": None, "amount": 10.0}]},
        None))
    r = client.get(f"/api/v1/holdings/bnb/{EVM_ADDR}")
    b = r.json()
    assert b["coverage"] == "ok" and b["sources"] == ["alchemy"]
    assert b["native_symbol"] == "BNB" and b["native_amount"] == 3.2
    assert b["tokens"][0]["amount"] == 10.0


def test_bnb_no_key_is_declared_null(client, monkeypatch):
    monkeypatch.setattr(alchemy, "get_balances",
                        lambda c, a: (None, "alchemy:not_configured"))
    b = client.get(f"/api/v1/holdings/bnb/{EVM_ADDR}").json()
    assert b["coverage"] == "no_key" and b["data_mode"] == "partial"
    assert "ALCHEMY_API_KEY" in b["reasons"][0]


def test_base_falls_back_to_keyless_blockscout(client, monkeypatch):
    monkeypatch.setattr(holdings.alchemy, "_key", lambda: None)
    monkeypatch.setattr(blockscout, "get_balances", lambda c, a: (
        {"native": 0.5, "tokens": [{"token": CAKE, "symbol": "USDC", "amount": 12.0}],
         "tokens_note": None}, None))
    b = client.get(f"/api/v1/holdings/base/{EVM_ADDR}").json()
    assert b["coverage"] == "ok" and b["sources"] == ["blockscout"]
    assert b["native_amount"] == 0.5
    assert any("keyless" in s for s in b["reasons"])


def test_base_blockscout_tokens_note_rides_along(client, monkeypatch):
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
