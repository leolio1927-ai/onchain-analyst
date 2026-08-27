"""Heuristik risiko deterministik — bukan AI, bukan audit.

Catatan kerja §2.6: verdict TIDAK pernah biner dari satu sinyal —
selalu gabungan berbobot; kalau data kurang → jujur "DATA KURANG".
Semua threshold & bobot di bawah KELIHATAN dan bisa diaudit siapa pun.
"""
from __future__ import annotations

import time

LEVEL_LABELS = {"low": "RENDAH", "medium": "WASPADA", "high": "BAHAYA", "nodata": "DATA KURANG"}

WEIGHTS = {"liquidity": 0.30, "fdv_liq": 0.25, "vol_liq": 0.15, "buy_ratio": 0.15, "age": 0.15,
           "clustering": 0.20}
MIN_SIGNALS = 3  # di bawah ini → nodata, bukan nebak


def _now_ms() -> int:
    return int(time.time() * 1000)


def _sig(key, label, weight, sev, ev):
    return {"key": key, "label": label, "weight": weight, "severity": sev, "evidence": ev}


def _liquidity(liq):
    if liq is None:
        return None, ""
    if liq < 2_000:
        return 1.0, f"${liq:,.0f} < $2rb — slippage ekstrem"
    if liq < 10_000:
        return 0.8, f"${liq:,.0f} < $10rb — sangat tipis"
    if liq < 50_000:
        return 0.5, f"${liq:,.0f} < $50rb — tipis"
    if liq < 150_000:
        return 0.2, f"${liq:,.0f} < $150rb — belum nyaman"
    return 0.0, f"${liq:,.0f} — memadai"


def _fdv_liq(fdv, liq):
    if not fdv or not liq:
        return None, ""
    r = fdv / liq
    if r > 500:
        return 1.0, f"FDV/likuiditas {r:,.0f}x > 500x — exit liquidity nyaris nol"
    if r > 100:
        return 0.85, f"FDV/likuiditas {r:,.0f}x > 100x — sangat timpang"
    if r > 50:
        return 0.65, f"FDV/likuiditas {r:,.0f}x > 50x — timpang"
    if r > 20:
        return 0.35, f"FDV/likuiditas {r:,.0f}x — di atas 20x"
    return 0.05, f"FDV/likuiditas {r:,.1f}x — wajar"


def _vol_liq(vol, liq):
    if vol is None or not liq:
        return None, ""
    r = vol / liq
    if r > 15:
        return 0.75, f"vol24 {r:,.0f}x likuiditas — pola wash-like"
    if r > 8:
        return 0.45, f"vol24 {r:,.1f}x likuiditas — agak tinggi"
    if r < 0.02:
        return 0.6, f"vol24 {r:.3f}x likuiditas — nyaris mati"
    if r < 0.2:
        return 0.3, f"vol24 {r:.2f}x likuiditas — sepi"
    return 0.0, f"vol24 {r:.2f}x likuiditas — sehat"


def _buy_ratio(txns):
    h = (txns or {}).get("h24") or {}
    b, s = h.get("buys"), h.get("sells")
    if b is None or s is None:
        return None, ""
    tot = b + s
    if tot < 10:
        return None, f"txn24 cuma {tot} — sampel kecil"
    r = b / tot
    if r > 0.9:
        return 0.7, f"buys {b}/sells {s} ({r:.0%}) — one-sided, perlu curiga"
    if r > 0.75:
        return 0.3, f"buys {b}/sells {s} ({r:.0%}) — condong beli"
    return 0.0, f"buys {b}/sells {s} ({r:.0%}) — seimbang"


def _age(created_ms):
    if not created_ms:
        return None, ""
    hrs = max(0.0, (_now_ms() - created_ms) / 3_600_000)
    if hrs < 1:
        return 0.9, f"pair umur {hrs * 60:.0f} mnt — fase launch paling rawan"
    if hrs < 6:
        return 0.65, f"pair umur {hrs:.1f} jam"
    if hrs < 24:
        return 0.4, f"pair umur {hrs:.1f} jam"
    if hrs < 24 * 7:
        return 0.15, f"pair umur {hrs / 24:.1f} hari"
    return 0.0, f"pair umur {hrs / 24 / 7:.1f} minggu"


def assess(pair: dict, clustering_result: dict | None = None) -> dict:
    """Skor 0-100 (makin tinggi makin berisiko) + evidence per sinyal.

    clustering_result: hasil heuristics.clustering.analyze (atau dict degrade
    dari UI). None = clustering tidak dicoba → 5 sinyal seperti biasa.
    severity None di dalamnya = dicoba tapi tidak diskor → tampil jujur.
    """
    liq = (pair.get("liquidity") or {}).get("usd")
    fdv = pair.get("fdv") or pair.get("marketCap")
    signals = [
        _sig("liquidity", "Likuiditas", WEIGHTS["liquidity"], *_liquidity(liq)),
        _sig("fdv_liq", "FDV vs Likuiditas", WEIGHTS["fdv_liq"], *_fdv_liq(fdv, liq)),
        _sig("vol_liq", "Volume vs Likuiditas", WEIGHTS["vol_liq"],
             *_vol_liq((pair.get("volume") or {}).get("h24"), liq)),
        _sig("buy_ratio", "Beli vs Jual 24j", WEIGHTS["buy_ratio"], *_buy_ratio(pair.get("txns"))),
        _sig("age", "Umur pair", WEIGHTS["age"], *_age(pair.get("pairCreatedAt"))),
    ]
    if clustering_result is not None:
        signals.append(_sig("clustering", "Koordinasi wallet", WEIGHTS["clustering"],
                            clustering_result.get("severity"),
                            clustering_result.get("evidence", "")))
    computed = [s for s in signals if s["severity"] is not None]
    notes = []
    if len(computed) < MIN_SIGNALS:
        notes.append(f"hanya {len(computed)}/{len(signals)} sinyal terhitung — data belum cukup untuk vonis")
        return {"level": "nodata", "level_label": LEVEL_LABELS["nodata"], "score": None,
                "signals": signals, "notes": notes}
    totw = sum(s["weight"] for s in computed)
    score = 100.0 * sum(s["severity"] * s["weight"] for s in computed) / totw
    level = "high" if score >= 65 else "medium" if score >= 40 else "low"
    notes.append("gabungan heuristik — bukan audit; fair-launch/airdrop/KOL call bisa mirror pola mirip")
    return {"level": level, "level_label": LEVEL_LABELS[level], "score": round(score, 1),
            "signals": signals, "notes": notes}
