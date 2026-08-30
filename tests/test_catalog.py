"""BE-F4 chain capability catalog tests — config ⇄ provider equivalence.

The catalog is TODAY'S TRUTH about what each provider can serve per chain.
The honesty-critical rows: hood clustering is impossible (GT has no
robinhood network) and hype scan/socials/clustering are unavailable
(unverified DS chainId, no GT network, DS does not list hyperevm). The
equivalence guard fails the suite if a provider constant changes without a
conscious catalog update — no silent drift.
"""
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from providers import dexscreener, geckoterminal, live
from webapp import chains, server


@pytest.fixture()
def client():
    return TestClient(server.app)


# ── the catalog itself ───────────────────────────────────────────────────

def test_all_six_chains_present():
    assert sorted(chains.CHAIN_CATALOG) == ["avax", "base", "bnb", "hood",
                                            "hype", "sol"]


def test_known_false_cells_are_exactly_false():
    """Honesty-critical rows: today's impossibilities, stated as False."""
    hood = chains.CHAIN_CATALOG["hood"]
    hype = chains.CHAIN_CATALOG["hype"]
    assert hood["clustering"] is False      # GT has no robinhood network
    assert hype["scan"] is False            # DS chainId unverified
    assert hype["clustering"] is False      # GT has no hyperevm in NETWORKS
    assert hype["socials"] is False         # DS does not list hyperevm
    # every other capability cell is True — and stays a real bool
    for cid, info in chains.CHAIN_CATALOG.items():
        for cell in ("scan", "clustering", "socials", "live_feed"):
            expected = not ((cid == "hood" and cell == "clustering")
                            or (cid == "hype" and cell in ("scan", "clustering",
                                                           "socials")))
            assert info[cell] is expected is not None and isinstance(info[cell], bool)
            assert info[cell] == expected


def test_guard_passes_against_real_providers():
    chains.validate_against_providers()      # must not raise today


def test_guard_fails_when_a_provider_grows(monkeypatch):
    """The drift-kill property: add a network provider-side without touching
    the catalog → the guard must fail loudly."""
    monkeypatch.setattr(dexscreener, "CHAIN_IDS",
                        {**dexscreener.CHAIN_IDS, "hype": "hyperevm"})
    with pytest.raises(AssertionError, match="hype"):
        chains.validate_against_providers()


def test_guard_fails_when_a_provider_shrinks(monkeypatch):
    monkeypatch.setattr(geckoterminal, "NETWORKS",
                        {k: v for k, v in geckoterminal.NETWORKS.items()
                         if k != "base"})
    with pytest.raises(AssertionError, match="base"):
        chains.validate_against_providers()


def test_guard_fails_when_live_feed_chain_disappears(monkeypatch):
    monkeypatch.setattr(live, "CHAINS",
                        {k: v for k, v in live.CHAINS.items() if k != "hood"})
    with pytest.raises(AssertionError, match="catalog chains"):
        chains.validate_against_providers()


# ── the route: golden wire ───────────────────────────────────────────────

def test_chains_route_golden_wire(client):
    r = client.get("/api/v1/chains")
    assert r.status_code == 200
    j = r.json()
    assert j["data_mode"] == "static"        # config, not an observed response
    assert j["sources"] == ["chains.py"]
    assert j["note"] == "reflects verified provider support"
    assert datetime.fromisoformat(j["ts"]).utcoffset() == timedelta(0)
    assert j["schema_version"] == "1.0"
    assert len(j["chains"]) == 6
    for info in j["chains"]:
        assert set(info) == {"chain", "name", "symbol", "scan", "clustering",
                             "socials", "live_feed", "venues", "logo_ref"}


def test_hood_and_hype_rows_wire_truthfully(client):
    j = client.get("/api/v1/chains").json()
    rows = {c["chain"]: c for c in j["chains"]}
    assert rows["hood"]["clustering"] is False and rows["hood"]["scan"] is True
    assert rows["hype"]["scan"] is False and rows["hype"]["live_feed"] is True


def test_chains_route_in_openapi(client):
    spec = client.get("/openapi.json").json()
    assert "/api/v1/chains" in spec["paths"]
    body = spec["paths"]["/api/v1/chains"]["get"]
    assert body.get("description")           # every public op documents itself


def test_metrics_chains_additive(client):
    m = client.get("/api/metrics").json()
    assert m["chains"] == 6                  # additive; F2/F3 keys untouched
    assert {"scans", "tokens", "labels"} <= set(m)
