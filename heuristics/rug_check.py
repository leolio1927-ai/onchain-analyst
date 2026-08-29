"""Deterministic risk heuristics — not AI, not an audit.

Work notes §2.6: a verdict is NEVER binary from one signal —
always a weighted combination; when data is lacking → an honest "INSUFFICIENT DATA".
Every threshold & weight below is VISIBLE and auditable by anyone.
"""
from __future__ import annotations

import time

LEVEL_LABELS = {"low": "LOW", "medium": "CAUTION", "high": "HIGH RISK", "nodata": "INSUFFICIENT DATA"}

WEIGHTS = {"liquidity": 0.30, "fdv_liq": 0.25, "vol_liq": 0.15, "buy_ratio": 0.15, "age": 0.15,
           "clustering": 0.20}
MIN_SIGNALS = 3  # below this → nodata, never a guess


def _now_ms() -> int:
    return int(time.time() * 1000)


def _sig(key, label, weight, sev, ev):
    return {"key": key, "label": label, "weight": weight, "severity": sev, "evidence": ev}


def _liquidity(liq):
    if liq is None:
        return None, ""
    if liq < 2_000:
        return 1.0, f"${liq:,.0f} < $2k — extreme slippage"
    if liq < 10_000:
        return 0.8, f"${liq:,.0f} < $10k — very thin"
    if liq < 50_000:
        return 0.5, f"${liq:,.0f} < $50k — thin"
    if liq < 150_000:
        return 0.2, f"${liq:,.0f} < $150k — not comfortable yet"
    return 0.0, f"${liq:,.0f} — adequate"


def _fdv_liq(fdv, liq):
    if not fdv or not liq:
        return None, ""
    r = fdv / liq
    if r > 500:
        return 1.0, f"FDV/liquidity {r:,.0f}x > 500x — exit liquidity near zero"
    if r > 100:
        return 0.85, f"FDV/liquidity {r:,.0f}x > 100x — severely skewed"
    if r > 50:
        return 0.65, f"FDV/liquidity {r:,.0f}x > 50x — skewed"
    if r > 20:
        return 0.35, f"FDV/liquidity {r:,.0f}x — above 20x"
    return 0.05, f"FDV/liquidity {r:,.1f}x — reasonable"


def _vol_liq(vol, liq):
    if vol is None or not liq:
        return None, ""
    r = vol / liq
    if r > 15:
        return 0.75, f"24h vol {r:,.0f}x liquidity — wash-trade-like pattern"
    if r > 8:
        return 0.45, f"24h vol {r:,.1f}x liquidity — somewhat high"
    if r < 0.02:
        return 0.6, f"24h vol {r:.3f}x liquidity — nearly dead"
    if r < 0.2:
        return 0.3, f"24h vol {r:.2f}x liquidity — quiet"
    return 0.0, f"24h vol {r:.2f}x liquidity — healthy"


def _buy_ratio(txns):
    h = (txns or {}).get("h24") or {}
    b, s = h.get("buys"), h.get("sells")
    if b is None or s is None:
        return None, ""
    tot = b + s
    if tot < 10:
        return None, f"only {tot} 24h txns — small sample"
    r = b / tot
    if r > 0.9:
        return 0.7, f"buys {b}/sells {s} ({r:.0%}) — one-sided, stay suspicious"
    if r > 0.75:
        return 0.3, f"buys {b}/sells {s} ({r:.0%}) — buy-leaning"
    return 0.0, f"buys {b}/sells {s} ({r:.0%}) — balanced"


def _age(created_ms):
    if not created_ms:
        return None, ""
    hrs = max(0.0, (_now_ms() - created_ms) / 3_600_000)
    if hrs < 1:
        return 0.9, f"pair age {hrs * 60:.0f} min — most fragile launch window"
    if hrs < 6:
        return 0.65, f"pair age {hrs:.1f} h"
    if hrs < 24:
        return 0.4, f"pair age {hrs:.1f} h"
    if hrs < 24 * 7:
        return 0.15, f"pair age {hrs / 24:.1f} days"
    return 0.0, f"pair age {hrs / 24 / 7:.1f} weeks"


def assess(pair: dict, clustering_result: dict | None = None) -> dict:
    """Score 0-100 (the higher, the riskier) + evidence per signal.

    clustering_result: the output of heuristics.clustering.analyze (or the
    honest-degrade dict from the UI). None = clustering not attempted → the 5
    signals as usual. A None severity inside it = attempted but not scored →
    displayed honestly.
    """
    liq = (pair.get("liquidity") or {}).get("usd")
    fdv = pair.get("fdv") or pair.get("marketCap")
    signals = [
        _sig("liquidity", "Liquidity", WEIGHTS["liquidity"], *_liquidity(liq)),
        _sig("fdv_liq", "FDV vs Liquidity", WEIGHTS["fdv_liq"], *_fdv_liq(fdv, liq)),
        _sig("vol_liq", "Volume vs Liquidity", WEIGHTS["vol_liq"],
             *_vol_liq((pair.get("volume") or {}).get("h24"), liq)),
        _sig("buy_ratio", "24h Buys vs Sells", WEIGHTS["buy_ratio"], *_buy_ratio(pair.get("txns"))),
        _sig("age", "Pair age", WEIGHTS["age"], *_age(pair.get("pairCreatedAt"))),
    ]
    if clustering_result is not None:
        signals.append(_sig("clustering", "Wallet coordination", WEIGHTS["clustering"],
                            clustering_result.get("severity"),
                            clustering_result.get("evidence", "")))
    computed = [s for s in signals if s["severity"] is not None]
    notes = []
    if len(computed) < MIN_SIGNALS:
        notes.append(f"only {len(computed)}/{len(signals)} signals computed — data not sufficient for a verdict")
        return {"level": "nodata", "level_label": LEVEL_LABELS["nodata"], "score": None,
                "signals": signals, "notes": notes}
    totw = sum(s["weight"] for s in computed)
    score = 100.0 * sum(s["severity"] * s["weight"] for s in computed) / totw
    level = "high" if score >= 65 else "medium" if score >= 40 else "low"
    notes.append("combined heuristics — not an audit; fair-launch/airdrop/KOL calls can mirror these patterns")
    return {"level": level, "level_label": LEVEL_LABELS[level], "score": round(score, 1),
            "signals": signals, "notes": notes}
