"""BE-ALL-LIVE F2 — EVM deployer composition tests (offline, canned).

The law-3 gate: a creator claim ships ONLY with on-chain proof (to=null &&
from==claim). Blockscout gives the tx → fully verifiable. GoPlus does not →
its claims always ship flagged unverified-tx. Failures cascade honestly:
blockscout (500 / missing row / failed verify) → goplus fallback → null with
both reason lines.
"""
import pytest

from providers import blockscout, evm, evm_deployer, goplus

_CREATOR = "0xcanned0000000000000000000000000000000001"
_TOKEN = "0x" + "a" * 40


@pytest.fixture(autouse=True)
def _clear_caches():
    blockscout._cache.clear()
    goplus._cache.clear()
    evm._verify_cache.clear()   # the law-3 verdict cache must not leak scenarios
    yield
    blockscout._cache.clear()
    goplus._cache.clear()
    evm._verify_cache.clear()


def _patch_blockscout(monkeypatch, *, mode="live"):
    if mode == "live":
        monkeypatch.setattr(blockscout, "_get", lambda path: {
            "creator_address_hash": _CREATOR,
            "creation_transaction_hash": "0xdeaddeploytx"})
    elif mode == "http500":
        def boom500(path):
            raise blockscout._BlockscoutError("http_500:transient")
        monkeypatch.setattr(blockscout, "_get", boom500)
    elif mode == "no_row":
        def norow(path):
            raise blockscout._BlockscoutError("no_creation_row")
        monkeypatch.setattr(blockscout, "_get", norow)


def _patch_verify(monkeypatch, *, to=None, frm=_CREATOR):
    def canned_rpc(chain, method, params):
        if method == "eth_getTransactionByHash":
            return {"to": to, "from": frm}
        if method == "eth_getCode":
            return "0x"
        return {}
    monkeypatch.setattr(evm, "rpc", canned_rpc)


def _patch_goplus(monkeypatch, *, mode="live"):
    if mode == "live":
        monkeypatch.setattr(goplus, "_get", lambda url: {
            "code": 1, "result": {_TOKEN: {"creator_address": _CREATOR,
                                           "is_honeypot": "0"}}})
    elif mode == "no_row":
        monkeypatch.setattr(goplus, "_get", lambda url: {"code": 1, "result": {}})
    elif mode == "timeout":
        def boom_timeout(url):
            raise goplus._GoPlusError("timeout")
        monkeypatch.setattr(goplus, "_get", boom_timeout)


def test_base_blockscout_verified_ships_with_evidence(monkeypatch):
    _patch_blockscout(monkeypatch, mode="live")
    _patch_verify(monkeypatch, to=None, frm=_CREATOR)
    data, note = evm_deployer.get_creation("base", _TOKEN)
    assert data["deployer"] == _CREATOR and data["deployer_source"] == "blockscout"
    assert data["verified"] is True and data["deployer_kind"] == "eoa"
    assert "verified on-chain" in data["data_source"] and note is None


def test_base_verification_failure_falls_back_to_goplus(monkeypatch):
    """A factory deploy (to != null) FAILS the law-3 gate → goplus fallback,
    shipped flagged unverified-tx with the verbatim failure line."""
    _patch_blockscout(monkeypatch, mode="live")
    _patch_verify(monkeypatch, to="0x" + "f" * 40, frm=_CREATOR)
    _patch_goplus(monkeypatch, mode="live")
    data, note = evm_deployer.get_creation("base", _TOKEN)
    assert data["deployer"] == _CREATOR and data["deployer_source"] == "goplus"
    assert data["verified"] is False
    assert "verification FAILED" in note and "NOT on-chain-verifiable" in data["data_source"]


def test_base_blockscout_500_falls_back_to_goplus(monkeypatch):
    _patch_blockscout(monkeypatch, mode="http500")
    _patch_verify(monkeypatch)
    _patch_goplus(monkeypatch, mode="live")
    data, note = evm_deployer.get_creation("base", _TOKEN)
    assert data["deployer"] == _CREATOR and data["deployer_source"] == "goplus"
    assert "http_500" in note and data["verified"] is False


def test_base_blockscout_no_row_falls_back(monkeypatch):
    _patch_blockscout(monkeypatch, mode="no_row")
    _patch_verify(monkeypatch)
    _patch_goplus(monkeypatch, mode="live")
    data, _ = evm_deployer.get_creation("base", _TOKEN)
    assert data["deployer_source"] == "goplus"


def test_base_both_sources_dead_is_null_with_both_reasons(monkeypatch):
    _patch_blockscout(monkeypatch, mode="http500")
    _patch_verify(monkeypatch)
    _patch_goplus(monkeypatch, mode="no_row")
    data, note = evm_deployer.get_creation("base", _TOKEN)
    assert data is None
    assert "http_500" in note and "goplus:no_row" in note


def test_bnb_is_goplus_only_and_always_flagged_unverified(monkeypatch):
    _patch_blockscout(monkeypatch, mode="live")     # must NOT be consulted
    _patch_verify(monkeypatch)
    _patch_goplus(monkeypatch, mode="live")
    data, _note = evm_deployer.get_creation("bnb", _TOKEN)
    assert data["deployer_source"] == "goplus" and data["verified"] is False
    assert "NOT on-chain-verifiable" in data["data_source"]


def test_bnb_goplus_timeout_is_null_with_reason(monkeypatch):
    _patch_goplus(monkeypatch, mode="timeout")
    data, note = evm_deployer.get_creation("bnb", _TOKEN)
    assert data is None and "goplus:timeout" in note


def test_unsupported_chain_refused():
    data, note = evm_deployer.get_creation("hood", _TOKEN)
    assert data is None and "chain_unsupported" in note
