"""BE-F1 contract tests — the typed response layer, verified offline.

Covers the four required classes:
1. golden wire shape — scan + live captured through the offline stub
   (tests/stubs/provider_stub.py): the response models add fields, never
   rename or remove one;
2. absent-is-None — a stubbed upstream 429 degrades clustering to
   computed=False with None counts (a failed fetch observed nothing; 0 is a
   fact and a fact was not observed);
3. pagination contract — HistoryPage cursor semantics are None-terminated;
4. schema drift — /openapi.json is diffed against the committed snapshot
   (docs/reports/openapi-v1.snapshot.json); a deliberate contract change must
   regenerate it in its own commit.
Plus: banned register probe on the schema literals, /api/v1 alias parity and
deprecation headers, envelope ts is UTC, and zero-is-a-fact preservation.
"""
import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.stubs import provider_stub as stubs
from webapp import schemas, server

_ROOT = Path(__file__).resolve().parents[1]
_SNAPSHOT = _ROOT / "docs" / "reports" / "openapi-v1.snapshot.json"


@pytest.fixture(autouse=True)
def _clean():
    server._scan_cache.clear()   # TTL cache would otherwise leak a golden
    server._ai_hits.clear()      # payload into the 429-degrade test
    yield
    server._scan_cache.clear()
    server._ai_hits.clear()


@pytest.fixture
def client():
    return TestClient(server.app)

# the golden baselines — key sets captured from the pre-contract wire
# (webapp/server.py handlers as shipped before BE-F1)
_LEGACY_SCAN_KEYS = {"pair", "assessment", "clustering", "sources",
                     "launch_venue", "ts"}
_LEGACY_PAIR_KEYS = {"pairAddress", "chainId", "dexId", "baseToken",
                     "quoteToken", "url", "priceUsd", "liquidity", "fdv",
                     "marketCap", "volume", "priceChange", "txns",
                     "pairCreatedAt"}
_LEGACY_LIVE_KEYS = {"chain", "network_id", "live", "generated_at",
                     "cached", "stale", "items"}
_LEGACY_ITEM_KEYS = set(server.live.FIELDS)
_FOOTER = {"data_mode", "schema_version", "sources", "ts"}

_BANNED_REGISTER = ("mockup", "mock", "demo", "dummy", "fake",
                    "placeholder", "coming soon", "todo", "wip")


def _client() -> TestClient:
    return TestClient(server.app)


# ── 1. golden wire shape ─────────────────────────────────────────────────

def test_golden_scan_additive_no_renames(client, monkeypatch):
    stubs.install_scan(monkeypatch)
    stubs.install_enrichment(monkeypatch, mode="nokey")  # sol: sell_test canned-live
    r = client.post("/api/scan", json={"chain": "sol", "address": stubs.address()})
    assert r.status_code == 200
    j = r.json()
    assert _LEGACY_SCAN_KEYS <= set(j)                      # nothing removed
    assert set(j) == _LEGACY_SCAN_KEYS | {"data_mode", "schema_version", "context"}
    assert set(j["pair"]) == _LEGACY_PAIR_KEYS == set(schemas.Pair.model_fields)
    assert set(j["assessment"]) == set(schemas.RugAssessment.model_fields)
    assert set(j["clustering"]) == set(schemas.ClusteringBlock.model_fields)
    for s in j["assessment"]["signals"]:
        assert set(s) == set(schemas.SignalRow.model_fields)
    # verbatim values: upstream strings stay strings, never coerced
    assert j["pair"]["priceUsd"] == "0.001"
    assert isinstance(j["pair"]["fdv"], int)
    # footer: live data from two contributing upstreams, UTC stamp, pinned version
    # BE-F5a-R: the verdict half is fully live, the context block is
    # enriched-but-partial (keyless sell_test live, keyed providers absent)
    # → the envelope honestly says "partial"; the contract bumps to 1.1
    assert j["data_mode"] == "partial" and j["schema_version"] == "1.1"
    assert set(j["sources"]) == {"dexscreener", "geckoterminal"}
    assert set(j["context"]) == set(schemas.TokenContext.model_fields)
    assert datetime.fromisoformat(j["ts"]).utcoffset() == timedelta(0)


def test_golden_live_additive_no_renames(client, monkeypatch):
    stubs.install_live(monkeypatch)
    r = client.get("/api/v1/live/sol", params={"mode": "new", "limit": 5})
    assert r.status_code == 200
    j = r.json()
    assert _LEGACY_LIVE_KEYS <= set(j)
    assert set(j) == _LEGACY_LIVE_KEYS | _FOOTER
    assert set(j["items"][0]) == _LEGACY_ITEM_KEYS == set(schemas.FeedItem.model_fields)
    assert j["items"][0]["price_usd"] == "0.001"           # verbatim string
    assert isinstance(j["items"][0]["txns_24h"], int)
    assert j["items"][0]["socials"] is None                # absent stays absent
    assert j["data_mode"] == "live" and j["schema_version"] == "1.0"
    assert j["sources"] == ["geckoterminal"]               # DS contributed nothing here
    assert datetime.fromisoformat(j["ts"]).utcoffset() == timedelta(0)


# ── 2. absent-is-None on upstream failure ────────────────────────────────

def test_clustering_degrade_counts_are_none_not_zero(client, monkeypatch):
    stubs.install_scan(monkeypatch, fail_trades=True)  # GT answers 429
    r = client.post("/api/scan", json={"chain": "sol", "address": stubs.address()})
    assert r.status_code == 200
    j = r.json()
    cl = j["clustering"]
    assert cl["computed"] is False and cl["severity"] is None
    assert cl["wallets"] is None and cl["buys"] is None    # a failed fetch observed nothing
    assert 0 not in (cl["wallets"], cl["buys"])            # 0 must NOT appear
    assert "429" in cl["evidence"] and "unavailable" in cl["evidence"]
    # the pair half is still real data, and the keyless sell_test context
    # block is live (canned) → the envelope honestly reads "partial"
    assert j["data_mode"] == "partial"
    assert j["pair"]["baseToken"]["symbol"] == "TEST"


def test_zero_is_a_fact_when_observed():
    """The inverse guard: real zeros from upstream pass through untouched."""
    cl = schemas.ClusteringBlock.model_validate(
        {"wallets": 0, "buys": 0, "severity": None, "evidence": "0 wallets seen"})
    assert cl.wallets == 0 and cl.buys == 0                # observed zero stays zero
    assert cl.computed is False
    scored = schemas.SignalRow.model_validate({"key": "k", "severity": 0.0})
    healthy = scored.computed is True                      # 0.0 severity = scored, healthy
    unscored = schemas.SignalRow.model_validate({"key": "k", "severity": None})
    assert healthy and unscored.computed is False


# ── 3. pagination contract ───────────────────────────────────────────────

def test_history_page_cursor_none_terminated():
    more = schemas.HistoryPage(items=[schemas.OhlcvPoint(ts="t", close=1.0)],
                               next_cursor="c2")
    assert more.next_cursor == "c2"                        # a cursor ⇒ more pages exist
    end = schemas.HistoryPage(items=[schemas.OhlcvPoint(ts="t", close=2.0)],
                              next_cursor=None)
    assert end.next_cursor is None                         # None terminates the walk
    empty = schemas.HistoryPage()                          # absent history: empty + unwired
    assert empty.items == [] and empty.next_cursor is None
    assert empty.data_mode == "unwired" and empty.schema_version == "1.0"


# ── 4. schema drift gate ─────────────────────────────────────────────────

def test_openapi_matches_committed_snapshot():
    spec = _client().get("/openapi.json").json()
    committed = json.loads(_SNAPSHOT.read_text())
    assert spec == committed, (
        "the OpenAPI surface drifted from docs/reports/openapi-v1.snapshot.json — "
        "if this change is deliberate, regenerate the snapshot in its own commit "
        "and update llms.txt §Live API in the same change")


def test_snapshot_file_exists_and_has_v1_paths():
    committed = json.loads(_SNAPSHOT.read_text())
    for p in ("/api/scan", "/api/v1/scan", "/api/explain", "/api/v1/explain",
              "/api/whale", "/api/v1/whale", "/api/v1/live/{chain}",
              "/api/v1/discovery", "/api/health"):
        assert p in committed["paths"]


# ── banned register probe (schema literals are user/AI-visible) ──────────

def test_schema_source_banned_register_clean():
    src = (_ROOT / "webapp" / "schemas.py").read_text(encoding="utf-8").lower()
    hits = [w for w in _BANNED_REGISTER if w in src]
    assert hits == [], f"banned register leaked into contract literals: {hits}"


# ── F1a addendum: golden explain contract (local tier = deterministic) ───

def test_golden_explain_local_contract(client, monkeypatch):
    stubs.install_scan(monkeypatch)
    body = {"chain": "sol", "address": stubs.address(), "provider": "local"}
    r = client.post("/api/explain", json=body)
    assert r.status_code == 200
    j = r.json()
    assert set(j) == {"summary", "key_signals", "limitations", "parse_ok",
                      "tier", "provider",
                      "data_mode", "schema_version", "sources", "ts"}
    assert j["data_mode"] == "live" and j["schema_version"] == "1.0"
    assert j["parse_ok"] is True and j["tier"] == "local" and j["provider"] == "local"
    assert set(j["sources"]) == {"dexscreener", "geckoterminal"}  # evidence provenance
    assert j["summary"].startswith("[LOCAL")
    for ks in j["key_signals"]:
        assert set(ks) == {"label", "evidence"}
    assert datetime.fromisoformat(j["ts"]).utcoffset() == timedelta(0)
    # deterministic engine: same input → identical narrative on the v1 alias
    r2 = client.post("/api/v1/explain", json=body)
    assert r2.json()["summary"] == j["summary"]
    assert r2.json()["key_signals"] == j["key_signals"]


# ── /api/v1 alias parity + deprecation headers ───────────────────────────

def test_v1_scan_alias_same_engine_headers_flag_legacy(client, monkeypatch):
    stubs.install_scan(monkeypatch)
    body = {"chain": "sol", "address": stubs.address()}
    legacy = client.post("/api/scan", json=body)
    modern = client.post("/api/v1/scan", json=body)
    assert legacy.status_code == modern.status_code == 200
    assert legacy.json()["pair"] == modern.json()["pair"]   # one engine, one truth
    assert legacy.headers["Deprecation"] == "true"
    assert 'rel="successor-version"' in legacy.headers["Link"]
    assert "/api/v1/scan" in legacy.headers["Link"]
    assert "Deprecation" not in modern.headers


def test_v1_explain_alias_local_tier(client, monkeypatch):
    stubs.install_scan(monkeypatch)
    body = {"chain": "sol", "address": stubs.address(), "provider": "local"}
    legacy = client.post("/api/explain", json=body)
    modern = client.post("/api/v1/explain", json=body)
    assert legacy.status_code == modern.status_code == 200
    assert modern.json()["provider"] == "local"
    assert modern.json()["summary"] == legacy.json()["summary"]
    assert legacy.headers.get("Deprecation") == "true"
    assert "Deprecation" not in modern.headers


def test_v1_whale_alias_same_handler(client, monkeypatch):
    stubs.install_scan(monkeypatch)  # keep other provider paths offline
    body = {"address": stubs.address()}
    legacy = client.post("/api/whale", json=body)
    modern = client.post("/api/v1/whale", json=body)
    assert legacy.status_code == modern.status_code         # same handler, same fate
    if legacy.status_code == 200:
        assert legacy.json() == modern.json()
    assert legacy.headers.get("Deprecation") == "true"
    assert "Deprecation" not in modern.headers


def test_planned_surfaces_default_unwired():
    for model in (schemas.TokenMeta, schemas.QuoteResponse, schemas.WatchlistItem,
                  schemas.AlertRule, schemas.AlertEvent, schemas.HistoryPage):
        m = model()
        assert m.data_mode == "unwired"                     # honest: no engine yet
        assert m.schema_version == "1.0"
