"""Whale windows on the GeckoTerminal trade tape (PROMPT-V3 R2).

The $0 whale feed now rides GT pool trades on ALL FIVE chains (probe
2026-08-31: solana/bsc/base/hyperevm/robinhood all 200 keyless, 300
trades/page). A whale here is a LABELLED HEURISTIC: one tape trade with
volume_in_usd ≥ the chain threshold — never an on-chain label.

Thresholds (all heuristics, all stated in the payload):
  sol        = $50,000 fixed
  bnb, base  = $30,000 fixed
  hype, hood = native_qty × LIVE native price (frontier chains anchor to
               native — no stable USD convention yet): 500 × WHYPE on hype,
               12 × WETH on hood; when the native price is unobtainable the
               $30,000 fallback ships with a sentence saying so.

Windows are 1h/6h/24h over the walked tape; net flow = Σ whale buy_usd −
Σ whale sell_usd per window. A quiet tape is an honest empty result.
"""
from __future__ import annotations

import time
from datetime import UTC, datetime

from providers import geckoterminal as gt

WINDOWS: tuple[tuple[str, float], ...] = (("1h", 3600.0), ("6h", 21600.0),
                                          ("24h", 86400.0))
WINDOW_MAX_S = 86400.0
TAPE_MAX_ROWS = 200          # whale rows shipped to the surface (CSV source)
TOP_WALLETS = 10

FIXED_THRESHOLD_USD = {"sol": 50_000.0, "bnb": 30_000.0, "base": 30_000.0}
NATIVE_QTY = {"hype": 500.0, "hood": 12.0}     # labelled heuristic quantities
FALLBACK_THRESHOLD_USD = 30_000.0


def threshold_usd(chain: str) -> tuple[float, str]:
    """Chain threshold + the sentence of how it was derived (provenance)."""
    if chain in FIXED_THRESHOLD_USD:
        return FIXED_THRESHOLD_USD[chain], (
            f"{chain}: fixed ${int(FIXED_THRESHOLD_USD[chain]):,} heuristic "
            f"threshold (PROMPT-V3 R2)")
    qty = NATIVE_QTY.get(chain)
    if qty is None:
        return FALLBACK_THRESHOLD_USD, (
            f"{chain}: no threshold rule — ${int(FALLBACK_THRESHOLD_USD):,} "
            f"fallback heuristic")
    price = gt.native_price_usd(chain)
    if price is None:
        return FALLBACK_THRESHOLD_USD, (
            f"{chain}: live native price unobtainable right now — "
            f"${int(FALLBACK_THRESHOLD_USD):,} fallback heuristic")
    return qty * price, (
        f"{chain}: {int(qty)} native × live native price "
        f"${price:,.2f} (GT trending quote, probed at request time)")


def _epoch(ts: str) -> float | None:
    try:
        return datetime.fromisoformat(ts).timestamp()
    except (TypeError, ValueError):
        return None


def whale_windows(chain: str, ca: str, pool: str | None = None,
                  pool_name: str | None = None) -> tuple[dict | None, str | None]:
    """One chain's whale windows for one contract. → (payload, None) on
    success | (None, machine-readable note): whale_windows:chain_unsupported,
    whale_windows:no_pool, whale_windows:tape_failed (…)"""
    if chain not in gt.NETWORKS:
        return None, (f"whale_windows:chain_unsupported — GT serves "
                      f"{', '.join(sorted(gt.NETWORKS))}")
    if not pool:
        try:
            pool_row = gt.best_pool(gt.fetch_pools(chain, ca))
        except Exception as e:  # noqa: BLE001 — pool resolution failure is a note
            return None, f"whale_windows:pool_lookup_failed ({str(e)[:40]})"
        if pool_row is None:
            return None, (f"whale_windows:no_pool — GT lists no pool for this "
                          f"contract on {chain} (fact, not an error)")
        pool = (pool_row.get("id") or "").split("_")[-1]
        pool_name = (pool_row.get("attributes") or {}).get("name")
    try:
        tape, pages = gt.fetch_trades_window(chain, pool, within_s=WINDOW_MAX_S)
    except Exception as e:  # noqa: BLE001 — a tape failure is a note, not a 500
        return None, f"whale_windows:tape_failed ({str(e)[:40]})"

    th, th_note = threshold_usd(chain)
    now = time.time()
    epochs = [(t, _epoch(t["ts"])) for t in tape]
    windows: dict[str, dict] = {}
    for label, secs in WINDOWS:
        cutoff = now - secs
        in_win = [t for t, e in epochs if e is not None and e >= cutoff]
        whales = [t for t in in_win if t["usd"] >= th]
        buy = sum(t["usd"] for t in whales if t["kind"] == "buy")
        sell = sum(t["usd"] for t in whales if t["kind"] == "sell")
        windows[label] = {"trades": len(in_win), "whale_trades": len(whales),
                          "buy_usd": buy, "sell_usd": sell,
                          "net_usd": buy - sell}
    whale_rows = [t for t, e in epochs
                  if e is not None and e >= now - WINDOW_MAX_S and t["usd"] >= th]
    whale_rows.sort(key=lambda t: t["ts"], reverse=True)

    agg: dict[str, dict] = {}
    for t in whale_rows[:TAPE_MAX_ROWS * 4]:     # netflow from the walked tape
        row = agg.setdefault(t["wallet"], {"net_usd": 0.0, "buys": 0, "sells": 0,
                                           "trades": 0})
        row["net_usd"] += t["usd"] if t["kind"] == "buy" else -t["usd"]
        row["trades"] += 1
        row["buys" if t["kind"] == "buy" else "sells"] += 1
    top = sorted(agg.items(), key=lambda kv: -abs(kv[1]["net_usd"]))[:TOP_WALLETS]

    oldest = min((e for _, e in epochs if e is not None), default=None)
    return {"chain": chain, "network": gt.NETWORKS[chain], "token": ca,
            "pool": pool, "pool_name": pool_name,
            "threshold_usd": th, "threshold_note": th_note,
            "windows": windows,
            "tape": [{"wallet": t["wallet"], "kind": t["kind"], "ts": t["ts"],
                      "usd": t["usd"], "tx": t.get("tx")}
                     for t in whale_rows[:TAPE_MAX_ROWS]],
            "top_wallets": [{"wallet": w, **v} for w, v in top],
            "tape_trades_seen": len(tape), "tape_pages": pages,
            "tape_oldest_ts": (datetime.fromtimestamp(oldest, UTC).isoformat()
                               if oldest is not None else None),
            "data_mode": "live",
            "data_sources": [
                (f"whale tape: geckoterminal /networks/{gt.NETWORKS[chain]}/pools/"
                 f"{pool}/trades ({len(tape)} trades over {pages} page(s), "
                 f"24h max depth)"),
                f"threshold: {th_note}"]}, None


def whale_auto(ca: str, trending_limit: int = 5) -> dict:
    """AUTO mode: resolve the CA across networks via GT search, run windows
    on every chain that lists it, and add the trending top-N as candidates.
    Every failure is a sentence in data_sources — never a red wall."""
    srcs: list[str] = []
    results: list[dict] = []
    try:
        hits = gt.search_pools(ca)
    except Exception as e:  # noqa: BLE001
        hits, srcs = [], [f"whale_auto:search_failed ({str(e)[:40]})"]
    best: dict[str, dict] = {}
    for h in hits:                       # one pool per chain — the deepest
        cur = best.get(h["chain"])
        if cur is None or (h.get("liquidity_usd") or 0) > (cur.get("liquidity_usd") or 0):
            best[h["chain"]] = h
    for chain, h in best.items():
        payload, note = whale_windows(chain, ca, pool=h["pool"],
                                      pool_name=h.get("name"))
        if payload is not None:
            results.append(payload)
        else:
            srcs.append(note or f"whale_auto:{chain} unanswered")
    if not hits and not srcs:
        srcs.append("whale_auto:search found no pool for this contract on any "
                    "of the five chains — check the address (fact, not an error)")

    trending: list[dict] = []
    for chain in gt.NETWORKS:                     # small N, one call per chain
        if len(trending) >= trending_limit:
            break
        try:
            data = gt.fetch_trending(chain)
        except Exception as e:  # noqa: BLE001 — a rate-limited chain skips honestly
            srcs.append(f"whale_auto:trending_{chain} skipped ({str(e)[:30]})")
            continue
        for p in data.get("data") or []:
            a = p.get("attributes") or {}
            try:
                liq = float(a.get("reserve_in_usd")) if a.get("reserve_in_usd") is not None else None
            except (TypeError, ValueError):
                liq = None
            try:
                vol = float((a.get("volume_usd") or {}).get("h24")) if isinstance(a.get("volume_usd"), dict) else None
            except (TypeError, ValueError):
                vol = None
            trending.append({"chain": chain, "network": gt.NETWORKS[chain],
                             "pool": (p.get("id") or "").split("_")[-1],
                             "name": a.get("name"), "liquidity_usd": liq,
                             "volume_24h": vol, "price_usd": None})
            break                                   # top-1 per chain keeps N small
    return {"results": results, "candidates": [
        {"chain": h["chain"], "network": h["network"], "pool": h["pool"],
         "name": h.get("name"), "liquidity_usd": h.get("liquidity_usd"),
         "volume_24h": h.get("volume_24h"), "price_usd": h.get("price_usd")}
        for h in best.values()],
        "trending": trending, "data_sources": srcs}
