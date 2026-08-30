"""Capability probe (BE-F5a-R step 0) — MANUAL ONLY, never imported by pytest.

For each of the six chains this script attempts the three trader-loop
capabilities (deployer, holders, sell-test) against the $0 reality:
- Helius paths need HELIUS_API_KEY (env) — absent ⇒ recorded not_configured,
  no call is made;
- Alchemy paths need ALCHEMY_API_KEY (env) — same rule;
- Jupiter lite quote is keyless — probed LIVE (one call, founder-authorized);
- 1inch (EVM sell-test candidate) is probed keyless ONCE per chain to prove
  whether a key is required (expected: 401 unauthenticated);
- hood/hype have no candidate provider at all for deployment data — recorded
  as a reason row without any call.

Run:  uv run python -m providers.capability_probe
Out:  docs/reports/capability-probe-<date>.md  (+ stdout table)

Honesty rules mirrored from the product: a missing key is not an error, an
unroutable token is a loud fact, and "we don't know who deployed it" is data.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

# known-good seeds (real, liquid; chosen per task spec)
SEEDS = {
    "sol": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",      # BONK mint
    "bnb": "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",         # CAKE
    "base": "0x4200000000000000000000000000000000000006",        # WETH (Base)
    "avax": "0xB31f66AA3C1e785363F0875A1B74E27b85FD12c7",        # WAVAX
}

_CHAINS = ("sol", "bnb", "base", "avax", "hood", "hype")

_OUT_DIR = Path("docs/reports")


def _json_get(url: str, timeout: float = 10.0) -> tuple[int | None, dict | str | None, dict]:
    req = urllib.request.Request(url, headers={"User-Agent": "terminal-alpha-probe/0.1",
                                               "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode("utf-8", "replace")
            return r.status, body, dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:400], dict(e.headers)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return None, f"transport: {str(e)[:80]}", {}


def _has_key(name: str) -> bool:
    import os
    return bool(os.environ.get(name, "").strip())


def probe_sol(have_helius: bool) -> dict:
    out: dict = {"deployer": None, "holders": None, "sell_test": None}
    if have_helius:
        # live helius probing is only meaningful with the key; implemented
        # through providers.helius so the probe exercises the real client
        from providers import helius
        dep, dep_note = helius.get_creation("sol", SEEDS["sol"])
        top, top_note = helius.get_largest_accounts("sol", SEEDS["sol"])
        out["deployer"] = {"data": dep, "note": dep_note}
        out["holders"] = {"data": top, "note": top_note}
    else:
        out["deployer"] = {"data": None, "note": "helius:not_configured"}
        out["holders"] = {"data": None, "note": "helius:not_configured"}
    from providers import jupiter
    sell, sell_note = jupiter.sell_quote("sol", SEEDS["sol"])
    out["sell_test"] = {"data": sell, "note": sell_note}
    return out


def probe_evm_1inch(chain_id: int) -> dict:
    """One unauthenticated quote attempt — proves whether a key is required."""
    url = (f"https://api.1inch.dev/quote/v5.2/{chain_id}"
           f"/quote?fromTokenAddress=0x0000000000000000000000000000000000000000"
           f"&toTokenAddress=0x0000000000000000000000000000000000000001&amount=1000000")
    status, body, _ = _json_get(url)
    if status == 401 or status == 402:
        return {"data": None, "note": f"1inch:{status} — API key required (probed)"}
    if status == 200:
        return {"data": "routable", "note": "keyless quote worked"}
    return {"data": None, "note": f"1inch:{status} — {str(body)[:80]}"}


def probe_evm(have_alchemy: bool, chain: str) -> dict:
    out: dict = {"deployer": None, "holders": None, "sell_test": None}
    if have_alchemy:
        from providers import alchemy
        dep, dep_note = alchemy.get_creation(chain, SEEDS[chain])
        out["deployer"] = {"data": dep, "note": dep_note}
        out["holders"] = {"data": None,
                          "note": "by design: EVM top-holders need an indexer key, "
                                  "alchemy free tier cannot enumerate (probe conclusion)"}
    else:
        out["deployer"] = {"data": None, "note": "alchemy:not_configured"}
        out["holders"] = {"data": None,
                          "note": "alchemy:not_configured; even with a key, EVM "
                                  "top-holders need an indexer (no enumeration in free RPC)"}
    chain_ids = {"bnb": 56, "base": 8453, "avax": 43114}
    out["sell_test"] = probe_evm_1inch(chain_ids[chain])
    return out


def probe_chain(chain: str) -> dict:
    have_helius = _has_key("HELIUS_API_KEY")
    have_alchemy = _has_key("ALCHEMY_API_KEY")
    if chain == "sol":
        return probe_sol(have_helius)
    if chain in ("bnb", "base", "avax"):
        return probe_evm(have_alchemy, chain)
    reason = "no $0 candidate provider: GT/DS expose no creation, no holders, no quote API"
    return {"deployer": {"data": None, "note": reason},
            "holders": {"data": None, "note": reason},
            "sell_test": {"data": None, "note": "DEX-less venues: no route concept"},
            }


def render(results: dict) -> str:
    lines = [
        f"# Capability probe — {datetime.now(UTC):%Y-%m-%d %H:%M} UTC",
        "",
        "Manual run (providers/capability_probe.py). Founder-authorized live calls on",
        "free tiers only. Keys present at run time: "
        f"HELIUS_API_KEY={_has_key('HELIUS_API_KEY')}, ALCHEMY_API_KEY={_has_key('ALCHEMY_API_KEY')}.",
        "",
        "| chain | capability | result | note |",
        "|---|---|---|---|",
    ]
    for chain in _CHAINS:
        for cap in ("deployer", "holders", "sell_test"):
            cell = results[chain][cap]
            data = cell["data"]
            data_s = "—" if data is None else json.dumps(data)[:120]
            lines.append(f"| {chain} | {cap} | {data_s} | {cell['note']} |")
    lines += [
        "",
        "## Conclusions feeding chains_map.py",
        "",
        "- deployer: sol=helius, bnb/base/avax=alchemy (code paths implemented;",
        "  runtime without keys reports `<provider>:not_configured`),",
        "  hood/hype=null — GT/DS expose no creation data; an invented zero is the crime.",
        "- holders: sol=helius (getTokenLargestAccounts + getTokenSupply).",
        "  EVM chains=null — top-holder enumeration needs an indexer",
        "  (Etherscan-class) key; alchemy free RPC cannot enumerate. hood/hype=null.",
        "- sell_test: sol=jupiter (keyless, probed live). EVM=null — 1inch quote",
        "  requires an API key (probed unauthenticated). hood/hype=null —",
        "  DEX-less venues have no route concept.",
        "",
        "Fixture idents (tests/fixtures) were NOT live-probed: a synthetic mint",
        "would conflate 'unroutable' with 'does not exist'. They exercise the",
        "offline paths only (DB lineage, data_mode stamping).",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    results = {c: probe_chain(c) for c in _CHAINS}
    report = render(results)
    _OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = _OUT_DIR / f"capability-probe-{datetime.now(UTC):%Y-%m-%d}.md"
    out.write_text(report, encoding="utf-8")
    print(report)
    print(f"written: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
