/* Deterministic chart indicators (PROMPT-V Fase 4) — computed in the FE over
   the live OHLCV array only: same candles in, same lines out ("honesty by
   construction"). One-line formulas live next to each function so the chart
   legend can quote them verbatim. */
export interface Candle { ts: number; o: number; h: number; l: number; c: number; v: number }

/* EMA: ema_t = v_t·k + ema_{t-1}·(1−k), k = 2/(period+1), seeded with SMA(period) */
export function ema(vals: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1)
  const out: (number | null)[] = vals.map(() => null)
  if (vals.length < period) return out
  let prev = vals.slice(0, period).reduce((a, b) => a + b, 0) / period
  out[period - 1] = prev
  for (let i = period; i < vals.length; i++) {
    prev = vals[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

/* VWAP (cumulative): Σ(typical·volume)/Σ(volume), typical = (h+l+c)/3 */
export function vwap(cs: Candle[]): (number | null)[] {
  let pv = 0
  let vol = 0
  return cs.map((c) => {
    const v = Number.isFinite(c.v) ? c.v : 0
    pv += ((c.h + c.l + c.c) / 3) * v
    vol += v
    return vol > 0 ? pv / vol : null
  })
}

/* RSI(14): 100 − 100/(1+RS), RS = avgGain/avgLoss (Wilder smoothing) */
export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null)
  if (closes.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  gain /= period
  loss /= period
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    gain = (gain * (period - 1) + Math.max(0, d)) / period
    loss = (loss * (period - 1) + Math.max(0, -d)) / period
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  return out
}

export const INDICATOR_LEGEND = [
  { id: 'ema', label: 'EMA 12', formula: 'ema = c·k + ema₋₁·(1−k), k=2/13 — source: live OHLCV closes' },
  { id: 'vwap', label: 'VWAP', formula: 'Σ((h+l+c)/3 · v)/Σv — source: live OHLCV candles' },
  { id: 'rsi', label: 'RSI 14', formula: '100−100/(1+RS), Wilder smoothing — source: live OHLCV closes' },
] as const
