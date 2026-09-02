"""Suite-wide guarantees (BE-F5a-R / BE-ALL-LIVE).

The offline rule, enforced once instead of remembered everywhere: jupiter,
blockscout and goplus are all KEYLESS, so any unstubbed scan would silently
hit the live APIs. This autouse fixture cans all three offline for every
test; tests that exercise the enrichment paths in earnest use
provider_stub.install_enrichment, which re-patches with full mode control.
"""
import pytest

from providers import blockscout, evm, goplus, jupiter, swap_quotes
from webapp import swap_exec, swap_quote_state, swap_shadow, swap_throttle

_CANNED_CREATOR = "0xcanned0000000000000000000000000000000001"


@pytest.fixture(autouse=True)
def _swap_side_effects_isolated(tmp_path, monkeypatch):
    """Every test writes swap ledgers into its own tmp dir and starts every
    swap limiter/cache empty — the repo's logs/ and data/ files must never
    gain lines from a test run, and one test's request burst must never
    throttle the next test."""
    monkeypatch.setattr(swap_shadow, "SHADOW_PATH", tmp_path / "swap_quotes.jsonl")
    monkeypatch.setattr(swap_exec, "EXEC_PATH", tmp_path / "swap_exec.jsonl")
    swap_exec.reset_for_tests()
    swap_quote_state.reset_for_tests()
    swap_throttle.reset_for_tests()
    swap_quotes.reset_quote_cache_for_tests()
    yield
    swap_exec.reset_for_tests()
    swap_quote_state.reset_for_tests()
    swap_throttle.reset_for_tests()
    swap_quotes.reset_quote_cache_for_tests()


@pytest.fixture(autouse=True)
def _offline_keyless_providers(monkeypatch):
    jupiter._cache.clear()
    blockscout._cache.clear()
    goplus._cache.clear()
    monkeypatch.setattr(jupiter, "_get", lambda path: {"outAmount": "282271"})
    monkeypatch.setattr(blockscout, "_get", lambda path: {
        "creator_address_hash": _CANNED_CREATOR,
        "creation_transaction_hash": "0xcannedtx"})
    monkeypatch.setattr(evm, "rpc", _canned_rpc)
    monkeypatch.setattr(goplus, "_get", lambda url: {
        "code": 1,
        "result": {_token_from_url(url): {
            "creator_address": _CANNED_CREATOR, "is_honeypot": "0"}}})
    # swap T2: live quoting is best_quote/urllib network — OFF in every test;
    # quote-endpoint tests re-enable it explicitly with stubbed best_quote.
    monkeypatch.setenv("VILMEI_SWAP_LIVE", "0")
    monkeypatch.delenv("VILMEI_SWAP_KILL", raising=False)
    yield
    jupiter._cache.clear()
    blockscout._cache.clear()
    goplus._cache.clear()


def _token_from_url(url: str) -> str:
    return url.split("contract_addresses=")[-1].split("&")[0].lower()


def _canned_rpc(chain, method, params):
    if method == "eth_getTransactionByHash":
        return {"to": None, "from": _CANNED_CREATOR}   # law-3: verified
    if method == "eth_getCode":
        return "0x"
    return {}
