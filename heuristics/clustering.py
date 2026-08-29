"""Clustering v0 — burst timing + amount uniformity (work notes §6).

Deterministic, visible thresholds, input = normalized trades from
providers.geckoterminal.fetch_trades. Samples under MIN_WALLETS wallets are
NOT scored (honest, §2.6). Fair-launch/airdrop/KOL-call patterns can mirror
this — a decision-support heuristic, not a verdict.
"""
from __future__ import annotations

from datetime import datetime
from statistics import mean, pstdev

MIN_WALLETS = 8        # below this → not scored (work notes §6)
MIN_BUYS = 5           # a nominal CV needs a minimum sample
BURST_WINDOW_S = 60    # rolling window for burst detection
MIN_BURST_ABS = 6      # a burst only means something at ≥6 buys in the window (sparse data ≠ burst)


def _epoch(ts: str) -> float | None:
    try:
        return datetime.fromisoformat(str(ts)).timestamp()  # py>=3.11 parses "Z" directly
    except (ValueError, TypeError):
        return None


def _burst(times: list[float]) -> tuple[float | None, int]:
    """(max trades in a 60s window vs the per-window average, max window)."""
    times.sort()
    n = len(times)
    span = times[-1] - times[0]
    if span <= 0:
        return None, n
    n_windows = max(1, int(span // BURST_WINDOW_S) + 1)
    avg = n / n_windows
    if avg <= 0:
        return None, n
    best = 0
    for i, t in enumerate(times):
        j = i
        while j < n and times[j] - t <= BURST_WINDOW_S:
            j += 1
        best = max(best, j - i)
    return best / avg, best


def _cv(amounts: list[float]) -> float | None:
    """Coefficient of variation of buy amounts — the smaller, the more uniform (scripted)."""
    if len(amounts) < MIN_BUYS:
        return None
    m = mean(amounts)
    if m <= 0:
        return None
    return pstdev(amounts) / m


def analyze(trades: list[dict]) -> dict:
    """→ {"wallets", "buys", "severity", "evidence"} — rug_check-signal compatible.

    severity: 0.0 = healthy pattern, None = not scored (insufficient / unparseable sample).
    """
    buys = [t for t in trades if t.get("kind") == "buy"]
    wallets = {t.get("wallet") for t in trades if t.get("wallet")}
    n_buys = len(buys)

    if len(wallets) < MIN_WALLETS or n_buys == 0:
        return {"wallets": len(wallets), "buys": n_buys, "severity": None,
                "evidence": f"{len(wallets)} wallets seen (min {MIN_WALLETS}) — insufficient sample, not scored"}

    times = [e for e in (_epoch(t.get("ts")) for t in buys) if e is not None]
    amounts = [t["usd"] for t in buys if isinstance(t.get("usd"), (int, float))]

    burst_ratio, burst_max = _burst(times) if times else (None, 0)
    cv = _cv(amounts)

    sev_burst = 0.0
    if burst_ratio is not None and burst_max >= MIN_BURST_ABS:
        if burst_ratio >= 8:
            sev_burst = 0.8
        elif burst_ratio >= 4:
            sev_burst = 0.5
        elif burst_ratio >= 2.5:
            sev_burst = 0.25

    sev_uni = None
    if cv is not None:
        if cv < 0.15:
            sev_uni = 0.8
        elif cv < 0.30:
            sev_uni = 0.45
        else:
            sev_uni = 0.0

    cands = [s for s in (sev_burst, sev_uni) if s is not None]
    severity = max(cands) if cands else None

    parts = [f"{len(wallets)} wallets · {n_buys} buys"]
    if burst_ratio is not None:
        parts.append(f"60s burst max {burst_max} ({burst_ratio:.1f}x average)")
    if cv is not None:
        parts.append(f"buy amount CV {cv:.2f}")
    return {"wallets": len(wallets), "buys": n_buys, "severity": severity,
            "evidence": " · ".join(parts)}
