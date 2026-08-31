"""Whale tracker (BE-ALL-LIVE F3) — large transfers + per-wallet netflow.

The HELIUS SIGNED-DELTA VIEW (solana only, keyed): per-wallet token deltas
parsed from enhanced transactions. Since PROMPT-V3 R2 (probe 2026-08-31) a
keyless $0 trade tape ALSO exists on all five chains — GeckoTerminal pool
trades, served by providers/whale_windows.py at GET /api/v1/whale/windows.
This module stays the solana signed-delta surface; other chains point there.

USD sizing uses the DexScreener pair price (keyless, existing provider) —
when no pair/price exists the transfers still ship with token-amount
truthfully set and usd absent (null), never a fabricated price × amount.

Honesty notes: a quiet token (zero parsed transfers) is DATA, not absence;
netflow sums the SAME signed deltas shown per transfer — nothing is
re-derived from a different window behind the caller's back.
"""
from __future__ import annotations

from providers import dexscreener, helius


def whales(chain: str, token: str, threshold_usd: float = 1000.0,
           limit: int = 25) -> tuple[dict | None, str | None]:
    """→ {"price_usd", "threshold_usd", "window_txs", "transfers", "netflow"}
    | None with a machine-readable note (whales:chain_unsupported,
    whales:not_configured, whales:provider_error …)."""
    if chain != "sol":
        return None, ("whales:null on this chain — the signed-delta view is "
                      "helius-only; the keyless whale tape for all five "
                      "chains rides GT pool trades at /api/v1/whale/windows "
                      "(PROMPT-V3 R2, probe 2026-08-31)")
    txs, note = helius.transfers(chain, token)
    if txs is None:
        return None, note
    transfers = txs.get("transfers") or []

    price = None
    try:
        pair = dexscreener.fetch_pair(chain, token)
        if pair:
            price = (pair.get("priceUsd") or {}).get("usd") if isinstance(
                pair.get("priceUsd"), dict) else pair.get("priceUsd")
    except Exception:  # noqa: BLE001 — a price failure must not kill the transfers
        price = None
    try:
        price = float(price) if price is not None else None
    except (TypeError, ValueError):
        price = None

    rows = []
    for t in transfers:
        usd = abs(t["amount"]) * price if price is not None else None
        if usd is not None and usd < threshold_usd:
            continue
        rows.append({"wallet": t["wallet"], "amount": t["amount"],
                     "direction": t["direction"], "ts": t["ts"], "tx": t["tx"],
                     "usd": usd, "price_usd": price})
    rows.sort(key=lambda r: -(r["usd"] if r["usd"] is not None
                              else abs(r["amount"])))

    net: dict[str, float] = {}
    for t in transfers:                       # netflow over the SAME window
        net[t["wallet"]] = net.get(t["wallet"], 0.0) + t["amount"]
    netflow = [{"wallet": w, "net_amount": v,
                "direction": "in" if v >= 0 else "out",
                "net_usd": v * price if price is not None else None}
               for w, v in net.items()]
    netflow.sort(key=lambda r: -abs(r["net_amount"]))

    return {"price_usd": price, "threshold_usd": threshold_usd,
            "window_txs": txs.get("txs_seen", 0),
            "transfers": rows[:max(1, min(int(limit), 100))],
            "netflow": netflow[:max(1, min(int(limit), 100))]}, None
