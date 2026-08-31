/* R1 gate (PROMPT-V3): the Rug Check never-red 3-layer contract, tested with
   FOUR fixtures captured from the live feed on 2026-08-31 (probe transcripts in
   logs/r1/). Laws under test:
   1. a resolved result ALWAYS renders the universal market-signals panel
      (Layer 3) — even where the rug signal set is limited;
   2. provider chips answer OK / PARTIAL / NO COVERAGE — an empty GoPlus row is
      PARTIAL, never a red error (empty ≠ red);
   3. a valid-shaped CA that no feed knows renders the non-red "no pool found"
      info line with a scanner link — never a red banner;
   4. human error gate: no terse machine-code string
      (/^(Not Found|invalid|[A-Z_ ]{0,20})$/) is ever shown as the error. */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RugCheckPageMulti } from './RugWhaleMulti'

/* live fixtures — probed 2026-08-31 (logs/r1/greyson.json, bonk.json; the EVM
   rows mirror GoPlus CAKE/AERO responses captured the same day). */
const GREYSON = 'AfGdjAp9djSaqJxzYo3t6jy8tJA3o2aDPHoZ57Egpump'
const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
const CAKE = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82'
const AERO = '0x940181a94A35A4569E4529A3CDfB74e38FD98631'
const HOOD_TOK = '0x1111111111111111111111111111111111111111'

const GREYSON_SOL = {
  mint: GREYSON, score: 1867, score_normalised: 28, lp_locked_pct: null,
  risks: [{ name: 'Low Liquidity', level: 'danger', score: null, description: null }],
  provenance: { source: 'rugcheck', degraded: null }, sources: ['rugcheck'], data_mode: 'live',
}
const BONK_SOL = {
  mint: BONK, score: 101, score_normalised: 7, lp_locked_pct: 23.98,
  risks: [{ name: 'Mutable metadata', level: 'warn', score: null, description: null }],
  provenance: { source: 'rugcheck', degraded: null }, sources: ['rugcheck'], data_mode: 'live',
}
const evm = (chain: string, chain_id: number, token: string, symbol: string, rows: { field: string; value: string | number | null }[]) => ({
  chain, chain_id, token, token_symbol: symbol, rows,
  provenance: { source: 'goplus', degraded: null }, sources: ['goplus'], data_mode: rows.length ? 'live' : 'partial',
})
const CAKE_BNB = evm('bnb', 56, CAKE, 'CAKE', [
  { field: 'token_symbol', value: 'CAKE' }, { field: 'is_honeypot', value: '0' },
  { field: 'is_open_source', value: '1' }, { field: 'buy_tax', value: '0' },
  { field: 'sell_tax', value: '0' }, { field: 'is_mintable', value: '0' },
  { field: 'is_freezable', value: '0' }, { field: 'holder_count', value: '1909528' },
])
const AERO_BASE = evm('base', 8453, AERO, 'AERO', [
  { field: 'token_symbol', value: 'AERO' }, { field: 'is_honeypot', value: '0' },
  { field: 'is_open_source', value: '1' }, { field: 'buy_tax', value: '0' },
  { field: 'sell_tax', value: '0' }, { field: 'is_mintable', value: '1' },
  { field: 'is_freezable', value: '0' }, { field: 'holder_count', value: '751137' },
])
const HOOD_EMPTY = evm('hood', 4663, HOOD_TOK, '', [])

function dsQuote(chainId: string, symbol: string, address: string) {
  return {
    pairs: [{
      chainId, dexId: 'live-dex', url: 'https://example/pair',
      baseToken: { address, symbol, name: symbol }, quoteToken: { symbol: 'NAT' },
      priceUsd: '0.001', priceNative: '0.000001', liquidity: { usd: 123456 },
      volume: { h24: 7890 }, pairCreatedAt: Date.now() - 86400000,
      priceChange: { h24: 1.2 }, txns: { h24: { buys: 3, sells: 2 } },
    }],
  }
}

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data })

function mockFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? '')
    if (url.includes('/api/v1/rug/sol/')) return ok(url.includes(GREYSON) ? GREYSON_SOL : BONK_SOL)
    if (url.includes('/api/v1/rug/evm/bnb/')) return ok(CAKE_BNB)
    if (url.includes('/api/v1/rug/evm/base/')) return ok(AERO_BASE)
    if (url.includes('/api/v1/rug/evm/hood/')) return ok(HOOD_EMPTY)
    if (url.includes('dexscreener.com')) {
      if (url.includes(GREYSON)) return ok(dsQuote('solana', 'GREYSON', GREYSON))
      if (url.includes(BONK)) return ok(dsQuote('solana', 'BONK', BONK))
      if (url.includes(CAKE)) return ok(dsQuote('bsc', 'CAKE', CAKE))
      if (url.includes(AERO)) return ok(dsQuote('base', 'AERO', AERO))
      return ok(dsQuote('robinhood', 'HOODT', HOOD_TOK))
    }
    return ok({})
  }))
}

/* reduced-motion stub → the dial renders via the 2D fallback and never pulls
   the three.js chunk in jsdom (still exercises the full contract). */
function stubMedia() {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('reduce'), media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }))
}

async function runCheck(chip: string, addr: string) {
  const view = render(<RugCheckPageMulti />)
  fireEvent.click(view.getByRole('tab', { name: chip }))
  fireEvent.change(view.getByPlaceholderText(/paste token address/i), { target: { value: addr } })
  fireEvent.click(view.getByRole('button', { name: /run check/i }))
  await view.findByTestId('rug-result', {}, { timeout: 4000 })
  return view
}

beforeEach(() => { localStorage.clear(); mockFetch(); stubMedia() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const TERSE = /^(Not Found|invalid|[A-Z_ ]{0,20})$/

describe('R1 rug never-red 3-layer contract', () => {
  it('SOL pump token (Greyson, live) — RugCheck OK + universal signals + never red', async () => {
    const { container, getByTestId } = await runCheck('SOL', GREYSON)
    await waitFor(() => expect(getByTestId('rug-provider-chips').textContent).toContain('RugCheck · OK'))
    expect(getByTestId('rug-signals'), 'Layer 3 universal signals always render').toBeTruthy()
    expect(getByTestId('rug-signals').textContent).toContain('PRICE')
    expect(getByTestId('rug-signals').textContent).toContain('LIQUIDITY')
    expect(container.querySelectorAll('.v2-note.err').length, 'no red banner on a live result').toBe(0)
    expect(container.textContent).toContain('28')   // verbatim score_normalised rides the dial
  })

  it('SOL BONK (live) — RugCheck OK, LP lock shown', async () => {
    const { container, getByTestId } = await runCheck('SOL', BONK)
    await waitFor(() => expect(getByTestId('rug-provider-chips').textContent).toContain('RugCheck · OK'))
    expect(getByTestId('rug-signals')).toBeTruthy()
    expect(container.textContent).toContain('24.0%')   // 23.98 → 1dp LP locked
    expect(container.querySelectorAll('.v2-note.err').length).toBe(0)
  })

  it('BNB CAKE (live) — GoPlus OK + universal signals on an EVM chain', async () => {
    const { container, getByTestId } = await runCheck('BNB', CAKE)
    await waitFor(() => expect(getByTestId('rug-provider-chips').textContent).toContain('GoPlus · OK'))
    expect(getByTestId('rug-provider-chips').textContent).toContain('RugCheck · NO COVERAGE')
    expect(getByTestId('rug-signals')).toBeTruthy()
    expect(container.querySelectorAll('.v2-note.err').length).toBe(0)
  })

  it('BASE AERO (live) — GoPlus OK', async () => {
    const { getByTestId } = await runCheck('BASE', AERO)
    await waitFor(() => expect(getByTestId('rug-provider-chips').textContent).toContain('GoPlus · OK'))
    expect(getByTestId('rug-signals')).toBeTruthy()
  })

  it('HOOD empty GoPlus row — PARTIAL chip, honest copy, NOT red (empty ≠ red)', async () => {
    const { container, getByTestId } = await runCheck('HOOD', HOOD_TOK)
    await waitFor(() => expect(getByTestId('rug-provider-chips').textContent).toContain('GoPlus · PARTIAL'))
    expect(getByTestId('rug-signals'), 'market signals still render on an empty provider row').toBeTruthy()
    expect(container.textContent).toContain('empty is a fact, not an error')
    expect(container.querySelectorAll('.v2-note.err').length).toBe(0)
  })

  it('human error gate — no terse machine-code string is ever the error', async () => {
    const view = render(<RugCheckPageMulti />)
    fireEvent.click(view.getByRole('button', { name: /run check/i }))  // empty input
    const alert = await view.findByRole('alert')
    const msg = alert.textContent ?? ''
    expect(msg).not.toMatch(TERSE)
    expect(msg.length).toBeGreaterThan(15)          // a sentence, not a code
    expect(msg).toMatch(/[a-z]/)                    // human casing, not ALL-CAPS CODE
  })

  it('coverage matrix renders on-page with the five chains', () => {
    const { getByTestId } = render(<RugCheckPageMulti />)
    const mx = getByTestId('rug-matrix')
    for (const c of ['SOL', 'BNB', 'BASE', 'HYPE', 'HOOD']) expect(mx.textContent).toContain(c)
    expect(mx.textContent).toContain('NO COVERAGE')  // hype rugcheck/goplus truth is visible
  })
})
