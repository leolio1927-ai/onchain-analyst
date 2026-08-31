/* TokenPage render smoke + the Fase-1 identity law: header and rail read the
   SAME active pair from lib/tokenStore — no second default anywhere. */
import { render, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TokenPage } from './TokenPage'
import { applySwapToken, getGeneration, resetStore } from '../lib/tokenStore'
import type { ActivePair } from '../lib/tokenStore'

const CAKE_PAIR: ActivePair = {
  chain: 'bnb', tokenAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
  symbol: 'CAKE', name: 'PancakeSwap', source: 'detect',
}
const AERO_PAIR: ActivePair = {
  chain: 'base', tokenAddress: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
  symbol: 'AERO', name: 'Aerodrome', source: 'detect',
}

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 400, json: () => Promise.resolve(body) } as Response)
}

afterEach(() => {
  vi.unstubAllGlobals()
  resetStore()
})

describe('<TokenPage /> — single identity + honest panels', () => {
  it('mounts without throwing and shows the store token in header AND rail', () => {
    vi.stubGlobal('fetch', () => new Promise<Response>(() => {}))
    const { container } = render(<TokenPage />)
    expect(container.querySelector('.tk-root')).toBeTruthy()
    const text = container.textContent ?? ''
    /* default pair is BONK (sol) — header and rail must agree (the old bug
       showed FOMO in the header while the rail quoted BONK) */
    expect(text).toContain('BONK')
    expect(text).toContain('BONK / SOL')
    expect(text).toContain('YOU PAY')
    expect(text).toContain('YOU GET')
  })

  it('bonding shows an honest dash — no invented progress number', () => {
    vi.stubGlobal('fetch', () => new Promise<Response>(() => {}))
    const { container } = render(<TokenPage />)
    const bond = container.querySelector('.tk-bond')
    expect(bond?.textContent).toContain('—')
    expect(bond?.textContent).toContain('NOT IN FEED')
  })

  it('socials tab renders the honest empty state (never fake links)', async () => {
    vi.stubGlobal('fetch', (url: string) => {
      if (String(url).includes('/api/v1/socials')) {
        return jsonResponse({
          chain: 'sol', token: 'x', image_url: null, websites: [], links: [],
          provenance: { source: 'dexscreener', host: 'api.dexscreener.com', degraded: 'no pair found for this token in the dexscreener feed' },
        })
      }
      return new Promise<Response>(() => {})
    })
    const { container } = render(<TokenPage />)
    const tabs = [...container.querySelectorAll('.tk-tabsrow > span')]
    tabs.find((el) => el.textContent === 'SOCIALS')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await waitFor(() => expect(container.textContent).toContain('No official links in feed.'))
    await waitFor(() => expect(container.textContent).toContain('There will never be fake comments here'))
  })

  it('the read-only disclaimer ships verbatim and unbroken', () => {
    vi.stubGlobal('fetch', () => new Promise<Response>(() => {}))
    const { container } = render(<TokenPage />)
    expect(container.textContent).toContain(
      'Read-only terminal — the quote is live (DexScreener); execution never happens here, and chart/trades state is simulated where labeled.')
  })

  it('P1 identity race: two rapid token switches leave EVERY region on ONE id', () => {
    vi.stubGlobal('fetch', () => new Promise<Response>(() => {}))
    const { container } = render(<TokenPage />)
    act(() => {
      applySwapToken(CAKE_PAIR)
      applySwapToken(AERO_PAIR)        // second commit lands while the first's fetches are in flight
    })
    expect(getGeneration()).toBeGreaterThanOrEqual(2)
    const text = container.textContent ?? ''
    /* the final frame is AERO everywhere — no CAKE remnant can survive a
       commit (atomic store) and stale in-flight responses are dropped */
    expect(text).toContain('AERO')
    expect(text).not.toContain('CAKE')
    expect(text).not.toContain('PancakeSwap')
    /* the CA shown is AERO's, shortened by THE one helper (4…4) */
    expect(text).toContain('0x94…8631')
    expect(text).not.toContain('0x0E…')
  })

  it('P1 mixed-identity CA is structurally impossible via shorten()', () => {
    vi.stubGlobal('fetch', () => new Promise<Response>(() => {}))
    const { container } = render(<TokenPage />)
    applySwapToken(AERO_PAIR)
    const text = container.textContent ?? ''
    /* prefix of token A + suffix of token B can never appear: the only
       shortener cuts both ends from one string */
    expect(text).not.toMatch(/0x94…1cE82/)   // AERO head + CAKE tail
    expect(text).not.toMatch(/0x0E…8631/)   // CAKE head + AERO tail
  })
})
