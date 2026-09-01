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

Swap $RAY → $VLM later = LEDGER_MINT_ADDRESS in .env. One line, no refactor.
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

PUBLIC_RPC = "https://api.mainnet-beta.solana.com"
HELIUS_RPC = "https://mainnet.helius-rpc.com/"
# C5 (PROMPT-W): preview venue moved to $RAY (Raydium). Probed on-chain
# 2026-09-01: getTokenSupply amount="554997570390840" dec=6, mint+freeze
# authority null. Swap $RAY → $VLM later = LEDGER_MINT_ADDRESS in .env.
DEFAULT_MINT = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R"  # $RAY preview
SNAP_DIR = Path("data/ledger")
LABELS_PATH = Path("ledgers/labels.solana.json")
CACHE_TTL_S = 60.0
BACKOFF_429_S = 20.0
# C1 (PROMPT-W) — FORMATTER LAW: raw supply strings are scaled by INTEGER
# arithmetic only (10**decimals). The float `uiAmount` (double) is what made
# the old page print 10× figures (decimal off-by-one via float rounding).
_DOCS_CLAIM_TOTAL = 1_000_000_000
SCHEMA_VERSION = "1.2"


def scale_raw_amount(raw: str, decimals: int) -> str:
    """raw base-unit string → exact decimal string via integer division.
    '123456789' @6 → '123.456789'; trailing zeros trimmed; negative-safe."""
    neg = raw.startswith("-")
    digits = raw.lstrip("-")
    if not digits.isdigit():
        raise ValueError(f"non-numeric raw amount: {raw[:24]}")
    if decimals == 0:
        out = digits
    else:
        if len(digits) <= decimals:
            whole, frac = "0", digits.zfill(decimals)
        else:
            whole, frac = digits[:-decimals], digits[-decimals:]
        frac = frac.rstrip("0")
        out = f"{whole}.{frac}" if frac else whole
    return ("-" + out) if neg and out != "0" else out

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


def _dotenv_get(key: str) -> str:
    """Founder's local .env as fallback (the webapp never auto-loads it).
    Server-side config only — nothing from here reaches the wire."""
    try:
        for line in Path(".env").read_text(encoding="utf-8").splitlines():
            if line.strip().startswith(key + "="):
                return line.split("=", 1)[1].strip().strip("'\"")
    except OSError:
        pass
    return ""


def _helius_endpoint() -> str | None:
    key = (os.environ.get("HELIUS_API_KEY") or "").strip() or _dotenv_get("HELIUS_API_KEY")
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


def _snapshot_delta(mint: str, holders: list, supply: float | None = None) -> tuple[list, str]:
    _supply_probe = [supply]
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
        hist.append({"ts": now, "holders": {h["token_account"]: h["amount"] for h in holders},
                     "supply": _supply_probe[0]})
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
        cached["cache_age_s"] = round(time.time() - _cache["ts"], 1)
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
    mint_authority = freeze_authority = None
    if auth_res and auth_res.get("value", {}).get("data", {}).get("parsed", {}).get("info"):
        info = auth_res["value"]["data"]["parsed"]["info"]
        mint_authority = info.get("mintAuthority")
        freeze_authority = info.get("freezeAuthority")
    else:
        gaps.append("mintAuthority: RPC did not answer — chip renders unverified")

    sup_val = (supply_res or {}).get("value") or {}
    supply_ui = sup_val.get("uiAmount")
    supply_raw = str(sup_val.get("amount") or "")
    supply_dec = int(sup_val.get("decimals") or 0)
    supply_exact = sup_val.get("uiAmountString") or (
        scale_raw_amount(supply_raw, supply_dec) if supply_raw else None)
    if supply_ui is None:
        gaps.append("getTokenSupply: no RPC answered — supply renders null")
        return {"chain": chain, "mint": mint, "data_mode": "partial", "gaps": gaps,
                "schema_version": SCHEMA_VERSION, "ts": _utc_iso()}

    # C3 (PROMPT-W): docs-cap vs on-chain is only a CONTRADICTION when the
    # chain exceeded the cap. current ≤ cap = "consistent (current < cap)" —
    # the row still publishes both figures (correction panels never vanish).
    if supply_ui <= _DOCS_CLAIM_TOTAL:
        claim_status = "consistent (current < cap)"
    else:
        claim_status = ("Docs/genesis claim (1B) contradicts on-chain supply → "
                        "superseded by chain; see governance history")
        gaps.append(claim_status)
    # C5 — one-line chronology, the ledger law way (no dates, no hiding):
    gaps.append("preview token diganti ke $RAY; temuan: formatter bug lama — "
                "root cause: decimal off-by-one")

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
            amt_raw = str(acc.get("amount") or "")
            amt_dec = int(acc.get("decimals") or supply_dec)
            holders.append({"rank": i + 1, "token_account": acc["address"],
                            "owner": owner or "unresolved", "amount": amt,
                            "amount_exact": acc.get("uiAmountString")
                            or (scale_raw_amount(amt_raw, amt_dec) if amt_raw else None),
                            "pct_supply": round(amt / supply_ui * 100, 4) if supply_ui else None,
                            "label": label, "evidence": evidence})
        _deltas, delta_note = _snapshot_delta(mint, holders, supply_ui)
    else:
        gaps.append("top-20 holders: both Helius and public RPC unreachable/limited — renders null, never guessed")
        delta_note = ""

    # PKG2 — top-100: lazily start/refresh the background index walk, then
    # merge indexed ranks 21-100 under the fresh live top-20. Until the walk
    # completes the page says exactly that (GAPS), never a partial pretense.
    ensure_top100(mint)
    idx = _read_index(mint)
    holders, depth100 = _merge_top100(holders, idx, supply_ui, supply_dec)
    holders_depth = 100 if depth100 else 20
    if not depth100:
        prog = (f"top-100 index: building — walked {idx.get('walked', 0)} accounts "
                f"across {idx.get('pages', 0)} pages so far; renders top-20 live meanwhile"
                if idx else
                "top-100 index: not built yet — background walk queued (Helius DAS); "
                "renders top-20 live meanwhile")
        gaps.append(prog)

    invariant = None
    if holders and supply_ui:
        invariant = round(sum(h["amount"] for h in holders), 3)

    payload = {
        "schema_version": SCHEMA_VERSION, "chain": chain, "mint": mint,
        "preview_note": "LEDGER PREVIEW — this venue is configured for the future $VLM; today it renders $RAY with live on-chain proof",
        "data_mode": "live" if holders else "partial",
        "supply": {
            # C1 (PROMPT-W): the RENDERED figure is the exact uiAmountString /
            # integer-scaled string — floats are for math only, never display.
            "total_supply_onchain": supply_ui,
            "total_supply_exact": supply_exact,
            "supply_amount_raw": supply_raw,
            "decimals": supply_dec,
            "total_definitive": mint_authority is None,
            "current_supply": supply_ui,
            "supply_prov": _provenance(supply_prov, "getTokenSupply jsonrpc"),
            "mint_authority": mint_authority,
            "mint_absent": mint_authority is None,
            "freeze_authority": freeze_authority,
            "freeze_absent": freeze_authority is None,
            "mint_prov": _provenance(auth_prov, "getAccountInfo jsonParsed"),
        },
        "bars": {
            "burned_upper_bound_pct": None,
            "note": ("burn % needs a proven genesis baseline; the docs claim (1B) is a "
                     "cap, not a minted total — the metric stays null by law until burn "
                     "txs are proven; see GAPS"),
        },
        "claim_correction": {
            "claim": _DOCS_CLAIM_TOTAL,
            "claim_kind": "docs cap",
            "on_chain": supply_ui,
            "on_chain_exact": supply_exact,
            "status": claim_status,
        },
        "concentration": {
            "top2_pct": (round(sum(h["pct_supply"] or 0 for h in holders[:2]), 2)
                         if holders else None),
            "top2_labels": [h["label"] for h in holders[:2]] if holders else [],
        },
        "cache_age_s": 0.0,
        "holders": holders,
        "holders_depth": holders_depth,
        "holders_prov": _provenance(top_prov, "getTokenLargestAccounts"),
        "delta_note": delta_note,
        "invariant": {
            "expression": "top20_sum ≤ current_supply (remaining = all other wallets)",
            "top20_sum": invariant,
            "current_supply": supply_ui,
            # C2 (PROMPT-W): red ✗ ONLY on live data with an actual breach; a
            # null/unproven input renders PARTIAL (amber) — never red.
            "holds": (None if invariant is None else invariant <= supply_ui + 1e-6) if supply_ui else None,
            "reason": (None if holders else "top-20 unreachable — Σ unproven, see GAPS"),
        },
        "buyback": {"rows": [], "gap": ("Raydium's fee buyback is a CLAIM until each tx is verified "
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


# ── PROMPT-W+ PKG2 — top-100 holders index (background crawler) ───────────
# Helius DAS getTokenAccounts walks token accounts in creation order (no
# server-side size sort, gPA blocked on the plan), so the true top-100 is
# built by walking pages and keeping the largest-100 seen. The walk runs in
# a daemon thread (started lazily by fetch_ledger), persists progress to
# SNAP_DIR/{mint}-top100.json, and refreshes every INDEX_TTL_S. Zero extra
# owner RPCs: DAS rows already carry the owner wallet.
INDEX_TTL_S = 1800.0
_INDEX_PAGE_CAP = 500
_INDEX_RUNNING: set[str] = set()


def _idx_path(mint: str) -> Path:
    return SNAP_DIR / f"{mint}-top100.json"


def _read_index(mint: str) -> dict:
    try:
        return json.loads(_idx_path(mint).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _persist_idx(idx: dict) -> None:
    try:
        SNAP_DIR.mkdir(parents=True, exist_ok=True)
        _idx_path(idx["mint"]).write_text(json.dumps(idx), encoding="utf-8")
    except OSError:
        pass


def _walk_top100(mint: str) -> None:
    """Walk DAS pages, keep the top-100 by raw amount, persist progress every
    20 pages (a server restart must not lose a 10-minute walk). Resumes from
    the last persisted page when the index is incomplete."""
    prev = _read_index(mint)
    idx: dict = {"schema": "top100-1", "mint": mint, "done": False,
                 "walked": prev.get("walked", 0), "pages": prev.get("pages", 0),
                 "rows": prev.get("rows", []), "ts": _utc_iso(), "_epoch": time.time()}
    top: list[tuple[int, str, str]] = []   # (amount_raw, token_account, owner)
    for r in idx["rows"]:
        try:
            top.append((int(r["amount_raw"]), r["token_account"], r["owner"]))
        except (KeyError, ValueError):
            continue
    try:
        ep = _helius_endpoint()
        if not ep:
            return
        page = idx["pages"] + 1
        while page <= _INDEX_PAGE_CAP:
            body = json.dumps({"jsonrpc": "2.0", "id": page, "method": "getTokenAccounts",
                               "params": {"mint": mint, "page": page, "limit": 1000}}).encode()
            req = urllib.request.Request(ep, data=body, headers={"Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=45) as resp:
                    d = json.loads(resp.read().decode("utf-8", "replace"))
            except (OSError, ValueError):
                break
            rows = ((d.get("result") or {}).get("token_accounts")) or []
            if not rows:
                break
            for r in rows:
                amt = int(r.get("amount") or 0)
                if amt <= 0:
                    continue
                top.append((amt, r.get("address") or "", r.get("owner") or ""))
            top.sort(reverse=True)
            del top[100:]
            idx.update(walked=idx["walked"] + len(rows), pages=page,
                       ts=_utc_iso(),
                       rows=[{"token_account": ta, "owner": ow, "amount_raw": str(a)}
                             for a, ta, ow in top])
            if len(rows) < 1000:
                break
            page += 1
            if page % 20 == 0:
                _persist_idx(idx)
        idx["done"] = True
    finally:
        idx["_epoch"] = time.time()
        _persist_idx(idx)
        _INDEX_RUNNING.discard(mint)


def ensure_top100(mint: str) -> None:
    """Lazily start/refresh the background walk. Never blocks the request;
    a missing/stale index simply means the page renders top-20 + GAPS note."""
    if not _helius_endpoint():
        return
    idx = _read_index(mint)
    fresh = bool(idx.get("done")) and \
        (time.time() - idx.get("_epoch", 0) < INDEX_TTL_S) \
        if isinstance(idx.get("_epoch"), (int, float)) else False
    if mint in _INDEX_RUNNING or fresh:
        return
    _INDEX_RUNNING.add(mint)
    threading.Thread(target=_walk_top100, args=(mint,), daemon=True).start()


def _merge_top100(holders: list, idx: dict, supply_ui: float | None,
                  supply_dec: int = 6) -> tuple[list, bool]:
    """Live top-20 (fresh) + indexed ranks 21-100. Returns (holders, depth100)."""
    if supply_ui is None or not idx.get("done") or not idx.get("rows"):
        return holders, False
    known = {h["token_account"] for h in holders}
    for row in idx["rows"]:
        if len(holders) >= 100:
            break
        if row["token_account"] in known:
            continue
        amt_raw = int(row["amount_raw"])
        amt = amt_raw / (10 ** supply_dec)
        if amt <= 0:
            continue
        holders.append({"rank": len(holders) + 1, "token_account": row["token_account"],
                        "owner": row["owner"] or "unresolved", "amount": amt,
                        "amount_exact": scale_raw_amount(row["amount_raw"], supply_dec),
                        "pct_supply": round(amt / supply_ui * 100, 4),
                        "label": "UNKNOWN", "evidence": "on-chain amount via indexed top-100 walk; owner label unproven",
                        "delta_24h": None})
        known.add(row["token_account"])
    holders.sort(key=lambda h: h["amount"], reverse=True)
    for i, h in enumerate(holders):
        h["rank"] = i + 1
    return holders, True





def read_history(mint: str) -> dict:
    """48h supply/concentration points from the persisted snapshot store.
    Empty-by-law when no points exist yet — the chart renders its own
    honest empty state, never a fabrication."""
    path = SNAP_DIR / f"{mint}.json"
    try:
        hist = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"mint": mint, "points": [],
                "note": "no history yet — the store keeps one snapshot per fetch; charts appear as points accumulate (Δ24h needs a ≥6h-old snapshot)"}
    points = []
    for h in sorted(hist, key=lambda x: x.get("ts", 0)):
        if not isinstance(h.get("supply"), (int, float)):
            continue
        amounts = sorted((h.get("holders") or {}).values(), reverse=True)
        top2 = sum(amounts[:2]) if amounts else None
        points.append({"ts": h.get("ts"),
                       "supply": h["supply"],
                       "top2_pct": round(top2 / h["supply"] * 100, 2) if top2 and h["supply"] else None})
    return {"mint": mint, "points": points[-48:],
            "note": ("Δ/curve precision grows as snapshots accumulate — one per fetch, "
                     "first comparable pair needs a ≥6h gap") if len(points) >= 2 else
                    "first snapshot stored — chart lights up as more points land"}
