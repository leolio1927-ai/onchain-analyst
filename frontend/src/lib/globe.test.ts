/* Globe geometry regression: the 2026-08-30 white-screen crash was an arc
   referencing a parked chain id. NODE_LL/ARCS are typed Record<ChainId,…> /
   [ChainId, ChainId][] at compile time — these tests hold the line at
   runtime for anyone who widens the types. */
import { describe, expect, it } from 'vitest'
import { ARCS, NET_CHAINS, NODE_LL } from './netChains'

const ids = NET_CHAINS.map((c) => c.id)

describe('globe geometry (ChainId-typed)', () => {
  it('every arc endpoint is a served chain id', () => {
    expect(ARCS.length).toBeGreaterThan(0)
    for (const [a, b] of ARCS) {
      expect(ids).toContain(a)
      expect(ids).toContain(b)
    }
  })

  it('a lat/lon exists for every served chain — and for nothing else', () => {
    expect(Object.keys(NODE_LL).sort()).toEqual([...ids].sort())
  })

  it('the packed geometry carries no parked chain id', () => {
    expect(JSON.stringify({ NODE_LL, ARCS })).not.toMatch(/avax/i)
  })
})
