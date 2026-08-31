/* P1 regression: THE one shortener — prefix and suffix always come from the
   SAME address with the same separator (the "8KApump…PONS" mixed-token bug). */
import { describe, expect, it } from 'vitest'
import { shorten } from './liveFormat'

const CAKE = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82'
const PONS = '8KApumpPUmpPumpPumpPumpPumpPumpPumpPumpPonS'

describe('shorten — single address shortener', () => {
  it('prefix and suffix always belong to the same address', () => {
    for (const a of [CAKE, PONS]) {
      const s = shorten(a)
      expect(s.startsWith(a.slice(0, 4))).toBe(true)
      expect(s.endsWith(a.slice(-4))).toBe(true)
    }
    /* the historic bug: mixing two addresses can never reproduce the format */
    const mixed = `${CAKE.slice(0, 4)}…${PONS.slice(-4)}`
    expect(shorten(CAKE)).not.toBe(mixed)
    expect(shorten(PONS)).not.toBe(mixed)
  })

  it('always carries the … separator for long addresses', () => {
    expect(shorten(CAKE)).toMatch(/…/)
    expect(shorten(PONS)).toMatch(/…/)
  })

  it('short or empty input passes through honestly', () => {
    expect(shorten('PONS')).toBe('PONS')
    expect(shorten(null)).toBe('–')
    expect(shorten('')).toBe('–')
  })
})
