/* PROMPT-V4 M4 gate: Portfolio Watch is live and honest. Laws under test:
   1. an empty watchlist is an honest state — no fetch, no fake numbers;
   2. adding a contract fetches /api/v1/portfolio/snapshot with the
      watchlist's chain:token pairs (and only those);
   3. value = amount × price is computed CLIENT-side from verbatim server
      facts — no amount or no price → "–", never a zero;
   4. no_pool and rate_limited rows are sentences, never red, never guessed
      (rate limits aggregate into ONE banner, M1 law);
   5. the 15-item cap is enforced with a human sentence;
   6. remove deletes the row and persists. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PortfolioPage } from './Pages2'
import { WATCH_CAP, addWatchItem, clearWatchlist } from '../lib/watchlist'

const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
const CAKE = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82'

const okRow = {
  chain: 'sol', token: BONK, status: 'ok', pool: 'POOL1', pool_name: 'BONK / SOL',
  price_usd: 0.00002, liquidity_usd: 900000, volume_24h: 120000, change_24h: -4.2,
}
const noPoolRow = {
  chain: 'bnb', token: CAKE, status: 'no_pool',
  note: 'portfolio:no_pool — GT lists no pool for this contract on bnb (fact, not an error)',
}

function snap(rows: unknown[], rateLimited: string[] = []) {
  return {
    data_mode: 'live', sources: ['geckoterminal'], rows,
    rate_limited: rateLimited,
    pools_walked: rows.filter((r) => (r as { status: string }).status === 'ok').length,
    data_sources: [], ts: '2026-08-31T12:00:00Z',
  }
}

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data })

let payload = snap([okRow])
let lastUrl = ''
let fetchCount = 0

function mockFetch() {
  fetchCount = 0
  lastUrl = ''
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    fetchCount += 1
    lastUrl = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? '')
    return ok(payload)
  }))
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  clearWatchlist()
  payload = snap([okRow])
  mockFetch()
})

describe('PortfolioPage (M4 live watchlist)', () => {
  it('empty watchlist: honest empty state and ZERO fetches', () => {
    render(<PortfolioPage />)
    expect(screen.getByText('No tokens watched yet')).toBeTruthy()
    expect(fetchCount).toBe(0)
    expect(screen.getAllByText('–').length).toBeGreaterThanOrEqual(2)   // totals are dashes, never $0
  })

  it('add → snapshot fetched with the exact chain:token pair → facts render verbatim', async () => {
    render(<PortfolioPage />)
    fireEvent.change(screen.getByTestId('pf-ca'), { target: { value: BONK } })
    fireEvent.click(screen.getByTestId('pf-add'))
    await waitFor(() => expect(screen.getByText('BONK / SOL')).toBeTruthy())
    expect(decodeURIComponent(lastUrl)).toContain(`/api/v1/portfolio/snapshot?items=sol:${BONK}`)
    expect(screen.getByText('$0.00002')).toBeTruthy()          // price verbatim
    expect(screen.getAllByText('−4.2%').length).toBe(2)        // TOP MOVER card + row, real minus sign
    expect(screen.getAllByText('DezX…B263').length).toBe(2)    // ONE shortener in TOP MOVER + token cell
  })

  it('value = amount × price computed client-side; without an amount the value stays "–"', async () => {
    addWatchItem('sol', BONK)
    render(<PortfolioPage />)
    await waitFor(() => expect(screen.getByText('BONK / SOL')).toBeTruthy())
    const valueCell = screen.getByTestId('pf-value-sol')
    expect(valueCell.textContent).toBe('–')
    fireEvent.change(screen.getByTestId(`pf-amount-sol-${BONK}`), { target: { value: '1000000' } })
    expect(valueCell.textContent).toBe('$20.0')                // 1,000,000 × $0.00002
    expect(screen.getByText('1 of 1 positions valued')).toBeTruthy()
  })

  it('no_pool rows are sentences, and genuine 429s aggregate into ONE banner', async () => {
    payload = snap([okRow, noPoolRow, { chain: 'base', token: '0xBASETOKEN', status: 'rate_limited' }], ['base:0xBASETOKEN'])
    addWatchItem('sol', BONK)
    addWatchItem('bnb', CAKE)
    addWatchItem('base', '0xBASETOKEN')
    render(<PortfolioPage />)
    await waitFor(() => expect(screen.getByText(/RATE LIMITED · 1 of 3 tokens/)).toBeTruthy())
    expect(screen.getByTestId('pf-note-bnb').textContent).toContain('no pool for this contract on bnb')
    expect(screen.getByText('awaiting the public window — no facts invented')).toBeTruthy()
  })

  it('the 15-item cap refuses the 16th with a human sentence', () => {
    for (let i = 0; i < WATCH_CAP; i += 1) addWatchItem('sol', `TOKEN${i}`)
    payload = snap([])
    render(<PortfolioPage />)
    fireEvent.change(screen.getByTestId('pf-ca'), { target: { value: 'ONE_TOO_MANY' } })
    fireEvent.click(screen.getByTestId('pf-add'))
    expect(screen.getByTestId('pf-add-note').textContent).toContain('Watchlist cap is 15 items')
  })

  it('remove deletes the row and persists the change', async () => {
    addWatchItem('sol', BONK)
    render(<PortfolioPage />)
    await waitFor(() => expect(screen.getByText('BONK / SOL')).toBeTruthy())
    fireEvent.click(screen.getByTestId('pf-remove-sol'))
    await waitFor(() => expect(screen.queryByText('BONK / SOL')).toBeNull())
    expect(localStorage.getItem('vilmei.watchlist')).toBe('[]')
    expect(screen.getByText('No tokens watched yet')).toBeTruthy()
  })
})
