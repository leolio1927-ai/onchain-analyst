"""Discovery feed contract (offline) — gt._get is monkeypatched, zero network.

The canned pool mirrors the LIVE GeckoTerminal v2 response captured
2026-08-28: dex id under relationships.dex.data.id, numbers as strings,
h24 sub-objects. Contract: exact field whitelist, limit clamp, and
absent-factors-stay-absent (None, never fabricated zeros)."""
from __future__ import annotations

import asyncio

import pytest

from providers import discovery
from providers import geckoterminal as gt


def _pool(id: str, name: str | None = "Pink Pill / SOL", dex: str | None = "pump-fun",
          **attr_overrides) -> dict:
    attrs: dict = {"base_token_price_usd": "0.0000029", "name": name,
                   "pool_created_at": "2026-08-29T03:20:25Z", "fdv_usd": "2906.42",
                   "price_change_percentage": {"h24": "12.5"},
                   "volume_usd": {"h24": "0.1026"}}
    if name is None:
        del attrs["name"]
    attrs.update(attr_overrides)
    e = {"id": id, "type": "pool", "attributes": attrs}
    if dex is not None:
        e["relationships"] = {"dex": {"data": {"id": dex, "type": "dex"}}}
    return e


def _payload(n: int = 3) -> dict:
    return {"data": [_pool(f"solana_POOL{i}") for i in range(n)]}


def _run(monkeypatch, fn, chain: str = "sol", limit: int = 20, payload: dict | None = None):
    got: dict = {}

    def fake_get(path: str) -> dict:
        got["path"] = path
        return payload if payload is not None else _payload()

    monkeypatch.setattr(gt, "_get", fake_get)
    return asyncio.run(fn(chain, limit)), got.get("path")


def test_field_contract_exact_keys_and_copies(monkeypatch):
    items, _ = _run(monkeypatch, discovery.trending_pools)
    assert len(items) == 3
    assert set(items[0]) == set(discovery.FIELDS)
    assert items[0] == {
        "pool_address": "POOL0", "pair": "Pink Pill / SOL", "dex": "pump-fun",
        "price_usd": "0.0000029", "volume_24h": "0.1026", "change_24h": "12.5",
        "fdv_usd": "2906.42", "created_at": "2026-08-29T03:20:25Z"}
    assert items[2]["pool_address"] == "POOL2"


def test_trending_hits_trending_path_and_slices_default_limit(monkeypatch):
    items, path = _run(monkeypatch, discovery.trending_pools, payload=_payload(25))
    assert path == "/networks/solana/trending_pools"
    assert len(items) == 20  # default limit=20 — 25 fetched, 20 served


def test_new_hits_new_path(monkeypatch):
    items, path = _run(monkeypatch, discovery.new_pools)
    assert path == "/networks/solana/new_pools"
    assert items[0]["pair"] == "Pink Pill / SOL"


def test_limit_clamped_both_sides(monkeypatch):
    big, _ = _run(monkeypatch, discovery.trending_pools, limit=10 ** 9)
    assert len(big) == 3  # huge limit must not crash — slice caps at payload

    one, _ = _run(monkeypatch, discovery.trending_pools, limit=0)
    assert len(one) == 1  # 0 → clamp to 1

    neg, _ = _run(monkeypatch, discovery.trending_pools, limit=-7)
    assert len(neg) == 1

    two, _ = _run(monkeypatch, discovery.trending_pools, limit=2)
    assert len(two) == 2


def test_absent_fields_stay_absent(monkeypatch):
    # bare pool: attributes carry only the name; no relationships at all
    bare = {"id": "solana_BARE", "type": "pool", "attributes": {"name": "Bare / SOL"}}
    items, _ = _run(monkeypatch, discovery.trending_pools, payload={"data": [bare]})
    first = items[0]
    for absent in ("price_usd", "volume_24h", "change_24h", "fdv_usd",
                   "created_at", "dex"):
        assert first[absent] is None, f"{absent} must stay absent, not zero-filled"

    # null-valued attributes must not crash either — still honest None
    nulled = _pool("solana_NULL", price_change_percentage=None, volume_usd=None)
    items, _ = _run(monkeypatch, discovery.trending_pools, payload={"data": [nulled]})
    assert items[0]["change_24h"] is None and items[0]["volume_24h"] is None


def test_unnamed_pool_dropped_not_fabricated(monkeypatch):
    payload = {"data": [_pool("solana_A"), _pool("solana_B", name=None), _pool("solana_C")]}
    items, _ = _run(monkeypatch, discovery.trending_pools, payload=payload)
    assert [i["pool_address"] for i in items] == ["A", "C"]
    assert all(i["pair"] for i in items)  # never a made-up pair label


def test_unknown_chain_raises_readable_error(monkeypatch):
    with pytest.raises(ValueError, match="moonchain"):
        asyncio.run(discovery.trending_pools("moonchain"))
