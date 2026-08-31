/* Indicator determinism (Fase 4): same candles in → same lines out. */
import { describe, expect, it } from 'vitest'
import { ema, rsi, vwap } from './indicators'

const CANDLES = Array.from({ length: 40 }, (_, i) => ({
  ts: 1_700_000_000 + i * 900,
  o: 1 + i * 0.01, h: 1.05 + i * 0.01, l: 0.95 + i * 0.01,
  c: 1.02 + i * 0.01, v: 100 + i,
}))

describe('EMA / VWAP / RSI — honesty by construction', () => {
  it('ema seeds with SMA and stays null before the period', () => {
    const line = ema(CANDLES.map((c) => c.c), 12)
    expect(line.slice(0, 11).every((v) => v === null)).toBe(true)
    expect(line[11]).toBeCloseTo(CANDLES.slice(0, 12).reduce((a, c) => a + c.c, 0) / 12, 10)
    expect(line.every((v, i) => v === null || i >= 11)).toBe(true)
  })

  it('vwap of a flat series equals the typical price; zero volume → null', () => {
    const flat = CANDLES.map((c) => ({ ...c, o: 1, h: 1, l: 1, c: 1 }))
    const line = vwap(flat)
    expect(line[line.length - 1]).toBe(1)
    expect(vwap(CANDLES.map((c) => ({ ...c, v: 0 })))[5]).toBeNull()
  })

  it('rsi is bounded and deterministic; rising closes → >50', () => {
    const line = rsi(CANDLES.map((c) => c.c))
    const defined = line.filter((v): v is number => v != null)
    expect(defined.length).toBeGreaterThan(0)
    expect(defined.every((v) => v >= 0 && v <= 100)).toBe(true)
    expect(defined[defined.length - 1]).toBeGreaterThan(50)
    expect(line).toEqual(rsi(CANDLES.map((c) => c.c)))
  })
})
