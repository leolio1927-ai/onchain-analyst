/* Fase 2 law: this is a READ-ONLY BUILD — extension adapters exist as typed
   stubs, never execute, and the audit gate keeps the banned imports out. */
import { describe, expect, it } from 'vitest'
import { ReadOnlyBuildError, REGISTRY, demoBalance, mockAddress } from './registry'
import { LIVE_CHAINS } from '../lib/liveApi'

describe('wallet registry — address-only, read-only build', () => {
  it('every adapter connect() throws READ_ONLY_BUILD and detect() is false', async () => {
    for (const p of REGISTRY) {
      expect(p.detect()).toBe(false)
      await expect(p.connect()).rejects.toMatchObject({ code: 'READ_ONLY_BUILD' })
      await expect(p.connect()).rejects.toBeInstanceOf(ReadOnlyBuildError)
    }
  })

  it('mock addresses are valid SHAPE per family (no extension globals touched)', () => {
    for (const p of REGISTRY) {
      const a = mockAddress(p.id, p.chainFam)
      if (p.chainFam === 'evm') expect(a).toMatch(/^0x[a-fA-F0-9]{40}$/)
      else expect(a).toMatch(/^[1-9A-HJ-NP-Za-km-z]{44}$/)
    }
  })

  it('demo balances are deterministic per (wallet, chain) and cover all five', () => {
    expect(Object.keys(demoBalance('phantom', 'sol'))).toBeDefined()
    expect(demoBalance('phantom', 'sol')).toBe(demoBalance('phantom', 'sol'))
    expect(LIVE_CHAINS).toHaveLength(5)
  })
})
