/* PROMPT-V3 R2 gate: the whale tracker on the GT trade tape, tested with
   fixtures shaped verbatim like the backend payloads (webapp/schemas.py
   WhaleWindowsResponse/WhaleAutoResponse). Laws under test:
   1. the sparkline, per-chain bars and merged list all read the SAME tape —
      window math comes from the server payload verbatim (parity);
   2. threshold chips carry the server's derivation sentence (provenance);
   3. no pool / quiet tape are honest states (seeding chip + note), never red;
   4. AUTO renders FOUND-ON candidates + trending top-N chips;
   5. the CSV export is REAL — the blob contains the merged whale rows;
   6. the mandatory copy rides the page: a whale is a heuristic on the trade
      tape, never an on-chain label. */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WhalePageMulti } from './RugWhaleMulti'

const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
const iso = (ageMs: number) => new Date(Date.now() - ageMs).toISOString()

function win(trades: number, whales: number, buy: number, sell: number) {
  return { trades, whale_trades: whales, buy_usd: buy, sell_usd: sell, net_usd: buy - sell }
}

const SOL_NOTE = 'sol: fixed $50,000 heuristic threshold (PROMPT-V3 R2)'
const SOL_LIVE = {
  chain: 'sol', network: 'solana', token: BONK, pool: 'POOL1', pool_name: 'BONK / SOL',
  threshold_usd: 50000, threshold_note: SOL_NOTE,
  windows: { '1h': win(40, 1, 60000, 0), '6h': win(210, 2, 60000, 80000), '24h': win(500, 2, 60000, 80000) },
  tape: [
    { wallet: 'WhaleWallet1111111111111111111111111111', kind: 'buy', ts: iso(1800e3), usd: 60000, tx: 'SIGBUY1' },
    { wallet: 'WhaleWallet2222222222222222222222222222', kind: 'sell', ts: iso(7200e3), usd: 80000, tx: 'SIGSELL1' },
  ],
  top_wallets: [{ wallet: 'WhaleWallet2222222222222222222222222222', net_usd: -80000, buys: 0, sells: 1, trades: 1 }],
  tape_trades_seen: 500, tape_pages: 2, tape_oldest_ts: iso(80000e3),
  data_mode: 'live', sources: ['geckoterminal'], ts: iso(0),
  data_sources: ['whale tape: geckoterminal /networks/solana/pools/POOL1/trades (500 trades over 2 page(s), 24h max depth)', `threshold: ${SOL_NOTE}`],
}
const QUIET_SOL = { ...SOL_LIVE, tape: [], top_wallets: [], windows: { '1h': win(3, 0, 0, 0), '6h': win(9, 0, 0, 0), '24h': win(21, 0, 0, 0) } }
const NO_POOL_BNB = {
  chain: 'bnb', token: BONK, data_mode: 'unwired', sources: [], ts: iso(0),
  data_sources: ['whale_windows:no_pool — GT lists no pool for this contract on bnb (fact, not an error)'],
}
const AUTO = {
  token: BONK, results: [SOL_LIVE, NO_POOL_BNB],
  candidates: [
    { chain: 'sol', network: 'solana', pool: 'POOL1', name: 'BONK / SOL', liquidity_usd: 900000, volume_24h: 120000, price_usd: 0.00002 },
    { chain: 'bnb', network: 'bsc', pool: 'PB1', name: 'BONK / BNB', liquidity_usd: 400, volume_24h: null, price_usd: null },
  ],
  trending: [{ chain: 'bnb', network: 'bsc', pool: 'TP1', name: 'HOT / BNB', liquidity_usd: 777, volume_24h: null, price_usd: null }],
  data_mode: 'live', sources: ['geckoterminal'], ts: iso(0), data_sources: [],
}

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data })

let autoPayload: typeof AUTO = AUTO
let windowsByChain: Record<string, unknown> = {}

function mockFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? '')
    if (url.includes('/api/v1/whale/auto')) return ok(autoPayload)
    if (url.includes('/api/v1/whale/windows')) {
      const m = url.match(/chain=([a-z]+)/)
      return ok(windowsByChain[m?.[1] ?? ''] ?? SOL_LIVE)
    }
    return ok({})
  }))
}

function stubMedia() {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('reduce'), media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }))
}

const createObjectURL = vi.fn((_b: Blob) => 'blob:mock')
const revokeObjectURL = vi.fn()

async function scan(chip?: string) {
  const view = render(<WhalePageMulti />)
  if (chip) fireEvent.click(view.getByRole('tab', { name: chip }))
  fireEvent.click(view.getByRole('button', { name: /scan whales/i }))
  await view.findByTestId('whale-mandate')
  return view
}

beforeEach(() => {
  localStorage.clear()
  autoPayload = AUTO
  windowsByChain = {}
  createObjectURL.mockClear(); revokeObjectURL.mockClear()
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
  mockFetch(); stubMedia()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('R2 whale tracker on the GT tape', () => {
  it('AUTO — sparkline, per-chain bars and merged list read one tape; window math verbatim', async () => {
    const { container, getByTestId } = await scan()
    await waitFor(() => expect(getByTestId('whale-spark')).toBeTruthy())
    const text = container.textContent ?? ''
    // 24h net = 60k buy − 80k sell = −$20K on the live chain (server math)
    expect(text).toContain('−$20K')
    expect(text).not.toContain('NO LIVE WHALE TAPE')   // one live chain → no null card
    // merged tape rows with chain chips (2 whale trades on the walked tape)
    expect(text).toContain('MERGED TAPE — 2 WHALE TRADES')
    expect(text).toContain('BUY')
    expect(text).toContain('SELL')
    // the unwired chain states its reason verbatim, never red
    expect(text).toContain('whale_windows:no_pool')
    expect(container.querySelectorAll('.v2-note.err').length).toBe(0)
  })

  it('threshold chips carry the server derivation sentence (provenance)', async () => {
    const { getByTestId } = await scan()
    await waitFor(() => expect(getByTestId('whale-thresholds')).toBeTruthy())
    const chips = getByTestId('whale-thresholds')
    expect(chips.textContent).toContain('SOL ≥ $50K · heuristic')
    const sol = Array.from(chips.querySelectorAll('span')).find((s) => s.textContent?.includes('SOL ≥'))
    expect(sol?.getAttribute('title')).toBe(SOL_NOTE)
  })

  it('mandatory copy — a whale is a heuristic on the trade tape, not an on-chain label', async () => {
    const { getByTestId } = render(<WhalePageMulti />)
    expect(getByTestId('whale-mandate').textContent)
      .toContain('whale = heuristic on trade tape (≥$50K/$30K), not an on-chain label')
  })

  it('no pool on a single chain — DECLARED NULL with the reason, never red', async () => {
    windowsByChain = { bnb: NO_POOL_BNB }
    const { container } = await scan('BNB')
    await waitFor(() => expect(container.textContent).toContain('NO LIVE WHALE TAPE FOR THIS CA'))
    expect(container.textContent).toContain('whale_windows:no_pool')
    expect(container.textContent).toContain('fact, not an error')
    expect(container.querySelectorAll('.v2-note.err').length).toBe(0)
  })

  it('quiet tape is data — seeding chip + honest note, no fake zeros', async () => {
    windowsByChain = { sol: QUIET_SOL }
    const { container, getByTestId } = await scan('SOL')
    await waitFor(() => expect(getByTestId('whale-quiet')).toBeTruthy())
    expect(container.textContent).toContain('SEEDING — quiet tape')
    expect(container.textContent).toContain('a quiet tape is data, not absence')
    expect(container.querySelectorAll('.v2-note.err').length).toBe(0)
  })

  it('AUTO cards — FOUND-ON candidates + trending top-N chips render', async () => {
    const { getByTestId } = await scan()
    const cards = await waitFor(() => getByTestId('whale-auto-cards'))
    expect(cards.textContent).toContain('FOUND ON — DEEPEST POOL PER CHAIN')
    expect(cards.textContent).toContain('BONK / SOL')
    expect(cards.textContent).toContain('TRENDING CANDIDATES — TOP-N')
    expect(cards.textContent).toContain('HOT / BNB')
  })

  it('the CSV export is REAL — the blob holds the merged whale rows', async () => {
    const { getByTestId, findByText } = await scan()
    await findByText(/MERGED TAPE — 2 WHALE TRADES/)
    fireEvent.click(getByTestId('whale-csv'))
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0][0] as Blob
    const text = await blob.text()
    const lines = text.split('\n')
    expect(lines[0]).toBe('chain,pool,wallet,kind,usd,ts,tx')
    expect(lines).toHaveLength(3)                       // header + 2 whale rows
    expect(text).toContain('sol,POOL1,WhaleWallet1111111111111111111111111111,buy,60000,')
    expect(text).toContain('sell,80000,')
    expect(revokeObjectURL).toHaveBeenCalled()
  })
})
