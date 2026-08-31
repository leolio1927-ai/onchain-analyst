"""Helius adapter: key required; balances ride standard RPC (getBalance +
getTokenAccountsByOwner jsonParsed — probe 2026-08-31, the old REST
/v0/addresses/{a}/balances endpoint 404s now). Defensive parse: a token row
whose uiAmount cannot be read is skipped — never zeroed, never guessed."""
import io
import json
import urllib.request

import pytest

from providers import helius


class _StubResp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _urlopen_stub(payloads: list[dict], capture: dict):
    def _fake(req, timeout=10):
        capture.setdefault("bodies", []).append(json.loads(req.data.decode()))
        capture.setdefault("urls", []).append(req.full_url)
        capture.setdefault("headers", []).append(dict(req.headers))
        return _StubResp(json.dumps(payloads[len(capture["bodies"]) - 1]).encode())
    return _fake


def test_no_key_raises_nokeyerror(monkeypatch):
    monkeypatch.delenv("HELIUS_API_KEY", raising=False)
    with pytest.raises(helius.NoKeyError):
        helius.fetch_balances("WALLET")


def test_rpc_parse_skips_unreadable_rows(monkeypatch):
    capture: dict = {}
    native = {"jsonrpc": "2.0", "id": "ta",
              "result": {"context": {}, "value": 2_000_000_000}}
    accounts = {"jsonrpc": "2.0", "id": "ta", "result": {"context": {}, "value": [
        {"pubkey": "P1", "account": {"data": {"program": "spl-token", "parsed": {
            "info": {"mint": "M1", "owner": "WALLET",
                     "tokenAmount": {"amount": "150", "decimals": 2,
                                     "uiAmount": 1.5}}}}}},
        {"pubkey": "P2", "account": {"data": {"program": "spl-token", "parsed": {
            "info": {"mint": "BAD", "tokenAmount": {"uiAmount": None}}}}}},
    ]}}
    monkeypatch.setenv("HELIUS_API_KEY", "sk-test-123")
    monkeypatch.setattr(urllib.request, "urlopen",
                        _urlopen_stub([native, accounts], capture))
    out = helius.fetch_balances("WALLET")

    assert out["sol"] == 2.0
    assert out["tokens"] == [{"mint": "M1", "amount": 1.5}]   # BAD row skipped
    methods = [b["method"] for b in capture["bodies"]]
    assert methods == ["getBalance", "getTokenAccountsByOwner"]
    assert all(u.startswith(helius.BASE) for u in capture["urls"])
    # hygiene law: the key rides the header, NEVER the URL (probe 2026-08-31;
    # urllib error messages embed the request URL, so a query-string key leaks)
    assert all("api-key" not in u for u in capture["urls"])
    assert all(h.get("X-api-key") == "sk-test-123" for h in capture["headers"])
