"""Helius adapter: key required, key travels in a header (never the URL),
defensive parse skips malformed token rows."""
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


def _urlopen_stub(payload: dict, capture: dict):
    def _fake(req, timeout=10):
        capture["url"] = req.full_url
        capture["headers"] = {k.lower(): v for k, v in req.header_items()}
        return _StubResp(json.dumps(payload).encode())
    return _fake


def test_no_key_raises_nokeyerror(monkeypatch):
    monkeypatch.delenv("HELIUS_API_KEY", raising=False)
    with pytest.raises(helius.NoKeyError):
        helius.fetch_balances("WALLET")


def test_parse_and_key_placement(monkeypatch):
    capture: dict = {}
    payload = {
        "native_balance": {"lamports": 2_000_000_000},
        "tokens": [
            {"mint": "M1", "amount": "150", "decimals": 2},   # 1.5
            {"mint": "BAD", "amount": "x", "decimals": 0},    # malformed → skip
            {"mint": "ZERO", "amount": None, "decimals": None},  # missing → kept as 0 ("show as-is" contract)
        ],
    }
    monkeypatch.setenv("HELIUS_API_KEY", "sk-test-123")
    monkeypatch.setattr(urllib.request, "urlopen", _urlopen_stub(payload, capture))
    out = helius.fetch_balances("WALLET")

    assert out["sol"] == 2.0
    assert out["tokens"] == [{"mint": "M1", "amount": 1.5}, {"mint": "ZERO", "amount": 0.0}]
    # the key must never leak through the URL (urllib errors embed the URL)
    assert "sk-test-123" not in capture["url"]
    assert capture["headers"]["x-api-key"] == "sk-test-123"
