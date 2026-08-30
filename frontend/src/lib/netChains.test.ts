/* Regression law (2026-08-30): the active chain surface is the founder
   five-chain lineup, and lib/netChains.ts is its single source of truth. */
import { describe, expect, it } from 'vitest'
import { LIVE_CHAINS } from './liveApi'
import { NET_CHAINS, colorOf } from './netChains'

describe('NET_CHAINS — founder five-chain lineup (avax parked 2026-08-30)', () => {
  it('serves exactly the five live chains, in founder order, no parked id', () => {
    expect(NET_CHAINS.map((c) => c.id)).toEqual(['sol', 'bnb', 'base', 'hype', 'hood'])
  })

  it('mirrors the live-feed allowlist (lib/liveApi LIVE_CHAINS)', () => {
    expect([...NET_CHAINS].map((c) => c.id).sort()).toEqual([...LIVE_CHAINS].sort())
  })

  it('every chain is live, with a hex accent and a stats line', () => {
    for (const c of NET_CHAINS) {
      expect(c.live).toBe(true)
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/i)
      expect(c.stats).toContain('keyless live feed')
    }
  })

  it('colorOf resolves every id — the record that replaced NET_CHAINS.find()!', () => {
    for (const c of NET_CHAINS) expect(colorOf[c.id]).toBe(c.color)
  })
})
