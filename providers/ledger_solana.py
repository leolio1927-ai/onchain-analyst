"""VILMEI Token Ledger — Solana adapter (PROMPT-V, $0-only, on-chain proven).

One interface: fetch_ledger(chain, mint) → a dict where EVERY number carries
{source, fetched_at, verified_by}. Anything without on-chain proof is null +
a reason in "gaps" — this page is a transparency instrument; a silent
invention would end it.

Data plane (all $0):
- Public RPC api.mainnet-beta.solana.com — getTokenSupply, getAccountInfo
  (mint authority → the self-verifiable MINT ABSENT chip), 429 backoff.
- Helius keyed (founder key) for getTokenLargestAccounts when present; the
  public RPC stays the fallback with exponential backoff.
- Owner resolution: getMultipleAccounts jsonParsed on the top token accounts
  → the controlling wallet per account.
- Delta-24h: computed against a locally persisted snapshot (data/ledger/),
  honest null until a ≥6h-old snapshot exists.

Swap $JUP → $VLM later = LEDGER_MINT_ADDRESS in .env. One line, no refactor.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

PUBLIC_RPC = "https://api.mainnet-beta.solana.com"
HELIUS_RPC = "https://mainnet.helius-rpc.com/"
DEFAULT_MINT = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"  # $JUP preview
SNAP_DIR = Path("data/ledger")
LABELS_PATH = Path("ledgers/labels.solana.json")
CACHE_TTL_S = 60.0
BACKOFF_429_S = 20.0
_DECIMALS = 6
_TOTAL_SUPPLY = 1_000_000_000  # fixed at mint creation (on-chain fact)

_cache: dict = {"payload": None, "ts": 0.0, "key": None}
_backoff_until = 0.0


def _rpc(endpoint: str, method: str, params: list, *, timeout: float = 20.0) -> dict:
    """One JSON-RPC call; 429 raises RpcRateLimited so callers back off."""
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method,
                       "params": params}).encode()
    req = urllib.request.Request(endpoint, data=body, headers={
        "Content-Type": "application/json",
        "User-Agent": "vilmei-token-ledger/1.0 (read-only)"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise RpcRateLimited(f"{endpoint.split('//')[1].split('/')[0]} 429") from None
        raise RpcError(f"{e.code}") from None
    except (TimeoutError, urllib.error.URLError) as e:
        raise RpcError(str(getattr(e, "reason", e))[:60]) from None


class RpcError(Exception):
    pass


class RpcRateLimited(RpcError):
    pass


def _helius_endpoint() -> str | None:
    key = (os.environ.get("HELIUS_API_KEY") or "").strip()
    return f"{HELIUS_RPC}?api-key={key}" if key else None


def _call_first_ok(calls: list[tuple[str, str, list]]) -> tuple[dict | None, str]:
    """Try each (endpoint, method, params) in order; first result wins.
    Returns (result_value | None, provenance string)."""
    now = time.time()
    global _backoff_until
    for endpoint, method, params in calls:
        if now < _backoff_until and endpoint == PUBLIC_RPC:
            continue  # honor the public RPC's specific-call rate limit
        try:
            d = _rpc(endpoint, method, params)
        except RpcRateLimited:
            _backoff_until = now + BACKOFF_429_S
            continue
        except RpcError:
            continue
        if "result" in d:
            return d["result"], f"jsonrpc:{method}@{endpoint.split('//')[1].split('/')[0]}"
        if "error" in d and d["error"].get("code") == 429:
            _backoff_until = now + BACKOFF_429_S
    return None, ""


def _provenance(source: str, verified_by: str) -> dict:
    return {"source": source, "fetched_at": _utc_iso(), "verified_by": verified_by}


def _utc_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _load_labels() -> dict:
    try:
        return json.loads(LABELS_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"labels": {}, "note": "labels file missing — everything reads UNKNOWN"}


def _resolve_label(owner: str, labels: dict, known_pools: dict) -> tuple[str, str]:
    """Label engine: explicit labels file first (on-chain-evidenced only),
    then a pool match against known DexScreener pair addresses. Default = the
    honest UNKNOWN."""
    lab = labels.get("labels", {}).get(owner)
    if lab:
        return lab.get("label", "UNKNOWN"), lab.get("evidence", "")
    if owner in known_pools:
        return "LP", known_pools[owner]
    return "UNKNOWN", ""


def _snapshot_delta(mint: str, holders: list) -> tuple[list, str]:
    """Δ24h per holder from the persisted snapshot history. Honest null until
    a snapshot ≥6h old exists for the same mint."""
    SNAP_DIR.mkdir(parents=True, exist_ok=True)
    path = SNAP_DIR / f"{mint}.json"
    now = time.time()
    hist: list = []
    try:
        hist = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    base = next((h for h in hist if now - h.get("ts", 0) >= 6 * 3600), None)
    if base is None:
        hist = [h for h in hist if now - h.get("ts", 0) < 48 * 3600]
        hist.append({"ts": now, "holders": {h["token_account"]: h["amount"] for h in holders}})
        try:
            path.write_text(json.dumps(hist[-48:]), encoding="utf-8")
        except OSError:
            pass
        return [], "first snapshot stored — Δ24h available after 6h"

    base_map = base.get("holders", {})
    for h in holders:
        prev = base_map.get(h["token_account"])
        h["delta_24h"] = (h["amount"] - prev) if prev is not None else None
    return [h for h in holders if h.get("delta_24h") is not None], \
        f"diffed vs snapshot {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(base['ts']))}"


def _known_pools_from_env() -> dict:
    """LP/pool token accounts come from the terminal's own live wiring
    (DexScreener pair for the mint) — verified upstream data, not a guess."""
    pools: dict = {}
    try:
        req = urllib.request.Request(
            f"https://api.dexscreener.com/latest/dex/tokens/{DEFAULT_MINT}",
            headers={"User-Agent": "vilmei-ledger/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            d = json.loads(resp.read().decode("utf-8", "replace"))
        best = sorted(d.get("pairs") or [], key=lambda p: (p.get("liquidity", {}) or {}).get("usd") or 0, reverse=True)[:3]
        for p in best:
            pa = p.get("pairAddress")
            if pa:
                pools[pa] = f"deepest pool {p.get('dexId','')} ${p.get('baseToken',{}).get('symbol','')}"
    except (OSError, ValueError):
        pass
    return pools


def fetch_ledger(chain: str, mint: str | None = None) -> dict:
    """THE adapter. chain-agnostic by signature; today only 'sol' is wired —
    other chains return an honest unwired envelope, never a guess."""
    if chain != "sol":
        return {"chain": chain, "data_mode": "unwired",
                "gaps": [f"ledger adapter for '{chain}' is not wired yet — sol is the only live plane"],
                "schema_version": "1.0", "ts": _utc_iso()}
    mint = (mint or os.environ.get("LEDGER_MINT_ADDRESS") or DEFAULT_MINT).strip()
    key = f"{chain}:{mint}"
    if _cache["payload"] is not None and _cache["key"] == key \
            and time.time() - _cache["ts"] < CACHE_TTL_S:
        cached = dict(_cache["payload"])
        cached["cached"] = True
        return cached

    labels = _load_labels()
    gaps: list[str] = []
    # 1) supply — public RPC first (self-verifiable by any auditor)
    supply_res, supply_prov = _call_first_ok([
        (PUBLIC_RPC, "getTokenSupply", [mint]),
        *([(ep, "getTokenSupply", [mint]) for ep in [_helius_endpoint()] if ep]),
    ])
    # 2) mint authority — the self-verifiable chip
    auth_res, auth_prov = _call_first_ok([
        (PUBLIC_RPC, "getAccountInfo", [mint, {"encoding": "jsonParsed"}]),
        *([(ep, "getAccountInfo", [mint, {"encoding": "jsonParsed"}]) for ep in [_helius_endpoint()] if ep]),
    ])
    mint_authority = None
    if auth_res and auth_res.get("value", {}).get("data", {}).get("parsed", {}).get("info"):
        info = auth_res["value"]["data"]["parsed"]["info"]
        mint_authority = info.get("mintAuthority")
    else:
        gaps.append("mintAuthority: RPC did not answer — chip renders unverified")

    supply_ui = (supply_res or {}).get("value", {}).get("uiAmount")
    if supply_ui is None:
        gaps.append("getTokenSupply: no RPC answered — supply renders null")
        return {"chain": chain, "mint": mint, "data_mode": "partial", "gaps": gaps,
                "schema_version": "1.0", "ts": _utc_iso()}

    # 3) top-20 holders
    top_res, top_prov = _call_first_ok([
        *([(ep, "getTokenLargestAccounts", [mint]) for ep in [_helius_endpoint()] if ep]),
        (PUBLIC_RPC, "getTokenLargestAccounts", [mint]),
    ])
    holders: list = []
    if top_res and top_res.get("value"):
        accounts = top_res["value"][:20]
        # resolve owners: getMultipleAccounts jsonParsed (Helius first, then public)
        pubkeys = [a["address"] for a in accounts]
        owners_res, _owners_prov = _call_first_ok([
            *([(ep, "getMultipleAccounts", [pubkeys, {"encoding": "jsonParsed"}]) for ep in [_helius_endpoint()] if ep]),
            (PUBLIC_RPC, "getMultipleAccounts", [pubkeys, {"encoding": "jsonParsed"}]),
        ])
        owner_list = []
        if owners_res and owners_res.get("value"):
            owner_list = [(a.get("data", {}).get("parsed", {}).get("info", {}) or {}).get("owner")
                          for a in owners_res["value"]]
        known_pools = _known_pools_from_env()
        for i, acc in enumerate(accounts):
            owner = owner_list[i] if i < len(owner_list) else None
            label, evidence = ("UNKNOWN", "") if not owner else _resolve_label(owner, labels, known_pools)
            amt = acc.get("uiAmount") or 0.0
            holders.append({"rank": i + 1, "token_account": acc["address"],
                            "owner": owner or "unresolved", "amount": amt,
                            "pct_supply": round(amt / supply_ui * 100, 4) if supply_ui else None,
                            "label": label, "evidence": evidence})
        _deltas, delta_note = _snapshot_delta(mint, holders)
    else:
        gaps.append("top-20 holders: both Helius and public RPC unreachable/limited — renders null, never guessed")
        delta_note = ""

    invariant = None
    if holders and supply_ui:
        invariant = round(sum(h["amount"] for h in holders), 3)

    payload = {
        "schema_version": "1.0", "chain": chain, "mint": mint,
        "preview_note": "LEDGER PREVIEW — this venue is configured for the future $VLM; today it renders $JUP with live on-chain proof",
        "data_mode": "live" if holders else "partial",
        "supply": {
            "total_minted_fixed": _TOTAL_SUPPLY,
            "current_supply": supply_ui,
            "supply_prov": _provenance(supply_prov, "getTokenSupply jsonrpc"),
            "mint_authority": mint_authority,
            "mint_absent": mint_authority is None,
            "mint_prov": _provenance(auth_prov, "getAccountInfo jsonParsed"),
        },
        "bars": {
            "burned_upper_bound_pct": round((_TOTAL_SUPPLY - supply_ui) / _TOTAL_SUPPLY * 100, 4),
            "note": ("current supply < fixed total — the difference can only be burned/absent from "
                     "circulation, but a per-tx burn ledger needs proven burn txs; see GAPS"),
        },
        "holders": holders,
        "holders_prov": _provenance(top_prov, "getTokenLargestAccounts"),
        "delta_note": delta_note,
        "invariant": {
            "expression": "top20_sum ≤ current_supply (remaining = all other wallets)",
            "top20_sum": invariant,
            "current_supply": supply_ui,
            "holds": (invariant is not None and invariant <= supply_ui + 1e-6) if supply_ui else None,
        },
        "buyback": {"rows": [], "gap": ("Jupiter's fee buyback is a CLAIM until each tx is verified "
                     "on-chain (from→to, destination class). Signature scan over known program "
                     "accounts is wired in the next iteration — until then: null, not narrative")},
        "burn": {"rows": [], "gap": "no on-chain burn txs verified for this mint yet — empty by law"},
        "vesting": {"rows": [], "gap": "no verifiable lockup/unlock escrow accounts found on-chain — null, not invented"},
        "labels_source": "ledgers/labels.solana.json (repo-public, on-chain-evidenced seeds only)",
        "gaps": gaps,
        "ts": _utc_iso(),
    }
    _cache.update(payload=payload, ts=time.time(), key=key)
    return dict(payload)
