"""PROMPT-V2 P3 rug surface — offline contract tests (providers monkeypatched,
zero network). Shapes mirror the 2026-08-31 live probes: RugCheck summary
{score, score_normalised, lpLockedPct, risks[]} and GoPlus token_security
{result: {addr: {is_honeypot, ...}}}."""
import pytest
from fastapi.testclient import TestClient

from providers import rugcheck
from webapp import server

CAKE = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"
AERO = "0x940181a94A35A4569E4529A3CDfB74e38FD98631"
BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"


@pytest.fixture(autouse=True)
def _clean():
    rugcheck._cache.clear()
    yield
    rugcheck._cache.clear()


@pytest.fixture
def client():
    return TestClient(server.app)


def test_rug_sol_summary_verbatim_with_provenance(client, monkeypatch):
    monkeypatch.setattr(rugcheck, "summary", lambda m: ({
        "score": 101, "score_normalised": 7, "lpLockedPct": 23.9169,
        "risks": [{"name": "Mutable metadata", "level": "warn", "score": 100,
                   "description": "Token metadata can be changed by the owner"}]}, None))
    r = client.get(f"/api/v1/rug/sol/{BONK}")
    assert r.status_code == 200
    b = r.json()
    assert b["score_normalised"] == 7
    assert b["lp_locked_pct"] == 23.9169
    assert b["risks"][0]["level"] == "warn"
    assert b["provenance"]["source"] == "rugcheck"
    assert b["provenance"]["degraded"] is None
    assert b["sources"] == ["rugcheck"]


def test_rug_sol_missing_report_degraded_not_invented(client, monkeypatch):
    monkeypatch.setattr(rugcheck, "summary",
                        lambda m: (None, "rugcheck: no report for this mint (404) — unindexed token"))
    b = client.get(f"/api/v1/rug/sol/{BONK}").json()
    assert b["score"] is None and b["risks"] == []
    assert "no report" in b["provenance"]["degraded"]


def test_rug_sol_bad_mint_400(client):
    assert client.get("/api/v1/rug/sol/notbase58!").status_code == 400


def test_rug_evm_rows_verbatim_with_provider(client, monkeypatch):
    def fake(chain, token):
        return {"token_symbol": "Cake", "is_honeypot": 0, "is_open_source": 1,
                "buy_tax": None, "sell_tax": None, "is_mintable": 1,
                "is_freezable": None, "holder_count": 1909528,
                "contract_creator": "0xdeadbeef"}, None

    from providers import goplus
    monkeypatch.setattr(goplus, "token_security", fake)
    r = client.get(f"/api/v1/rug/evm/bnb/{CAKE}")
    assert r.status_code == 200
    b = r.json()
    assert b["chain_id"] == 56 and b["token_symbol"] == "Cake"
    fields = {row["field"]: row["value"] for row in b["rows"]}
    assert fields["is_honeypot"] == 0 and fields["holder_count"] == 1909528
    assert b["provenance"]["source"] == "goplus"


def test_rug_evm_unsupported_chain_is_400_not_silent(client):
    """hype/hood: no $0 provider — 400 with the documented reason; the FE
    renders the honest limited panel, never invented rows."""
    r = client.get("/api/v1/rug/evm/hype/0x" + "1" * 40)
    assert r.status_code == 400
    assert "no free provider coverage" in r.json()["detail"]


def test_rug_evm_bad_address_400(client):
    assert client.get("/api/v1/rug/evm/bnb/0x123").status_code == 400
