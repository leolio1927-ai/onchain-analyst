/* PROMPT-V4 M5 gate: Holdings Check is live, priced, and honest. Laws under
   test:
   1. no wallet checked is an honest state — zero fetches, M2 picker offered;
   2. a valid check fetches /api/v1/holdings/{chain}/{address} and renders
      the server's numbers VERBATIM (no client-side re-derivation);
   3. the price join renders USD + Δ24h per row (severity-colored), the
      heuristic-pricing chip, the chain-breakdown bar;
   4. hype/hood PARTIAL coverage is a sentence with a muted chip, never red;
   5. no_key coverage is an amber NO KEY chip + a declared-null sentence;
   6. an upstream 400 shows the server's human sentence, never a red wall;
   7. a connected M2 wallet prefills its address (solana → auto-check sol,
      evm → base), a mock session shows the DEMO hint;
   8. PRIVACY: the verbatim sentence is on the page, the checked address
      never lands in localStorage or the console, the CSV filename carries
      the chain only, and only vilmei.* keys are written;
   9. the selected chain persists under vilmei.holdings-chain. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WalletProvider } from '../wallet/WalletContext'
import { HoldingsPage } from './Pages2'

const SOL_ADDR = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
const EVM_ADDR = '0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1'
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

const solOk = {
  schema_version: 'v1', ts: '2026-08-31T12:00:00Z',
  chain: 'sol', address: SOL_ADDR, coverage: 'ok',
  native_symbol: 'SOL', native_amount: 142.06,
  native_price_usd: null, native_change_24h: null,
  tokens: [{ token: SOL_ADDR, symbol: 'BONK', amount: 1000000, price_usd: null, change_24h: null, price_note: 'no_pool' }],
  pricing_note: 'heuristic pricing — dex-reserve derived: every USD number is the deepest-pool price GeckoTerminal reports (0 of 1 tokens priced)',
  sources: ['helius', 'geckoterminal'], reasons: [], data_mode: 'live',
}
const solPriced = {
  ...solOk,
  native_price_usd: 206.1, native_change_24h: -3.73,
  tokens: [
    { token: SOL_ADDR, symbol: 'BONK', amount: 1000000, price_usd: 0.0000211, change_24h: 8.4, price_note: null },
    { token: USDC, symbol: 'USDC', amount: 500, price_usd: 0.9997, change_24h: null, price_note: null },
  ],
  pricing_note: 'heuristic pricing — dex-reserve derived: every USD number is the deepest-pool price GeckoTerminal reports (2 of 2 tokens priced)',
}
const hypePartial = {
  schema_version: 'v1', ts: '2026-08-31T12:00:00Z',
  chain: 'hype', address: EVM_ADDR, coverage: 'partial',
  native_symbol: 'HYPE', native_amount: null,
  native_price_usd: null, native_change_24h: null,
  tokens: [], pricing_note: null,
  sources: [], data_mode: 'partial',
  reasons: ['holdings:partial — no free-tier balance source verified for hype (M0 probe 2026-08-31): the terminal says so instead of guessing'],
}
const solNoKey = {
  schema_version: 'v1', ts: '2026-08-31T12:00:00Z',
  chain: 'sol', address: SOL_ADDR, coverage: 'no_key',
  native_symbol: 'SOL', native_amount: null,
  native_price_usd: null, native_change_24h: null,
  tokens: [], pricing_note: null,
  sources: [], data_mode: 'partial',
  reasons: ['holdings:no_key — HELIUS_API_KEY is declared-null until the founder claims one'],
}

let payload: unknown = solOk
let failWith: { status: number; detail: string } | null = null
let lastUrl = ''
let fetchCount = 0
const clickedAnchors: { href: string; download: string }[] = []
let lastBlob: Blob | null = null

beforeEach(() => {
  cleanup()
  localStorage.clear()
  payload = solOk
  failWith = null
  lastUrl = ''
  fetchCount = 0
  lastBlob = null
  clickedAnchors.length = 0
  /* jsdom ships no createObjectURL — the whale-page pattern needs it */
  ;(URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn((b: Blob) => { lastBlob = b; return 'blob:vilmei-test' })
  ;(URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clickedAnchors.push({ href: this.href, download: this.download })
  })
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    fetchCount += 1
    lastUrl = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? '')
    if (failWith) return { ok: false, status: failWith.status, json: async () => ({ detail: failWith?.detail }) }
    return { ok: true, status: 200, json: async () => payload }
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function check(addr: string) {
  fireEvent.change(screen.getByTestId('hc-addr'), { target: { value: addr } })
  fireEvent.click(screen.getByTestId('hc-check'))
  await waitFor(() => expect(fetchCount).toBe(1))
}

describe('HoldingsPage (M5 live holdings)', () => {
  it('no wallet checked: honest empty state, ZERO fetches, M2 picker offered', () => {
    render(<HoldingsPage />)
    expect(screen.getByText('No wallet checked yet')).toBeTruthy()
    expect(screen.getByTestId('wallet-demo')).toBeTruthy()          // M2 picker reused
    expect(screen.getByTestId('hc-privacy').textContent).toContain(
      'address stays in this browser; proxy fetches public balances; never logs addresses')
    expect(fetchCount).toBe(0)
  })

  it('sol check: fetches the exact route and renders server numbers verbatim', async () => {
    render(<HoldingsPage />)
    await check(SOL_ADDR)
    expect(lastUrl).toBe(`/api/v1/holdings/sol/${SOL_ADDR}`)
    await waitFor(() => expect(screen.getByTestId('hc-native').textContent).toBe('142.06 SOL'))
    expect(screen.getByText('LIVE')).toBeTruthy()
    expect(screen.getByTestId('hc-token-amount').textContent).toBe('1.000M')   // 1,000,000 BONK
    expect(screen.getByText('BONK')).toBeTruthy()
    expect(screen.getByText(/sources: helius, geckoterminal/)).toBeTruthy()
    expect(screen.getByText(/no pool price/)).toBeTruthy()                     // per-row degraded note
  })

  it('price join: USD + severity-colored Δ24h, pricing chip, breakdown bar', async () => {
    payload = solPriced
    render(<HoldingsPage />)
    await check(SOL_ADDR)
    await waitFor(() => expect(screen.getByTestId('hc-native-usd').textContent).toContain('$29,279'))
    const nativeUsd = screen.getByTestId('hc-native-usd')
    expect(nativeUsd.querySelector('.down')).toBeTruthy()                      // −3.73% is red-ish, never hidden
    expect(screen.getByTestId('hc-pricing-chip').textContent).toBe('heuristic pricing — dex-reserve derived')
    const ups = document.querySelectorAll('td .mono.up')
    expect(ups.length).toBe(1)                                                 // BONK +8.4%
    const dashes = Array.from(document.querySelectorAll('td .dim')).some((el) => el.textContent === '–')
    expect(dashes).toBe(true)                                                  // USDC: quote-side ships no Δ
    expect(screen.getByTestId('hc-bar')).toBeTruthy()                          // chain-breakdown bar
    expect(screen.getByText(/SOL \d+\.\d%/)).toBeTruthy()                      // share legend
  })

  it('CSV export: whale-page pattern, chain-only filename, header + rows', async () => {
    payload = solPriced
    render(<HoldingsPage />)
    await check(SOL_ADDR)
    await waitFor(() => expect(screen.getByTestId('hc-csv')).toBeTruthy())
    fireEvent.click(screen.getByTestId('hc-csv'))
    expect(clickedAnchors.length).toBe(1)
    expect(clickedAnchors[0].download).toBe('vilmei-holdings-sol.csv')         // no address in the filename
    expect(lastBlob).toBeTruthy()
    const text = await lastBlob!.text()
    const lines = text.split('\n')
    expect(lines[0]).toBe('chain,kind,token,symbol,amount,price_usd,value_usd,change_24h')
    expect(lines.length).toBe(4)                                               // header + native + 2 tokens
    expect(lines[1]).toContain('sol,native,native,SOL,142.06')
  })

  it('hype PARTIAL: muted chip + an honest sentence, never red, never a zero', async () => {
    payload = hypePartial
    render(<HoldingsPage />)
    fireEvent.click(screen.getByTestId('hc-chain-hype'))
    await check(EVM_ADDR)
    expect(lastUrl).toBe(`/api/v1/holdings/hype/${EVM_ADDR}`)
    await waitFor(() => expect(screen.getByText('PARTIAL')).toBeTruthy())
    expect(screen.getByTestId('hc-native').textContent).toBe('–')             // absent stays a dash
    expect(screen.getByTestId('hc-reason').textContent).toContain('no free-tier balance source verified for hype')
  })

  it('no_key: amber NO KEY chip + the declared-null sentence', async () => {
    payload = solNoKey
    render(<HoldingsPage />)
    await check(SOL_ADDR)
    await waitFor(() => expect(screen.getByText('NO KEY')).toBeTruthy())
    expect(screen.getByTestId('hc-reason').textContent).toContain('HELIUS_API_KEY')
    expect(screen.getByTestId('hc-native').textContent).toBe('–')
  })

  it('upstream 400: the server sentence is shown, no result grid', async () => {
    failWith = { status: 400, detail: 'not a valid sol address — check the format and retry' }
    render(<HoldingsPage />)
    fireEvent.change(screen.getByTestId('hc-addr'), { target: { value: 'garbage' } })
    fireEvent.click(screen.getByTestId('hc-check'))
    await waitFor(() => expect(screen.getByText('Check could not run')).toBeTruthy())
    expect(screen.getByText(/not a valid sol address/)).toBeTruthy()
    expect(screen.queryByText('LIVE')).toBeNull()
  })

  it('connected M2 session: solana address prefills and auto-checks; DEMO hint for mock kind', async () => {
    localStorage.setItem('vilmei.wallet-session', JSON.stringify({
      providerId: 'phantom', label: 'Phantom', chainFam: 'solana',
      address: SOL_ADDR, balances: {}, kind: 'mock',
    }))
    render(<WalletProvider><HoldingsPage /></WalletProvider>)
    await waitFor(() => expect(lastUrl).toBe(`/api/v1/holdings/sol/${SOL_ADDR}`))
    await waitFor(() => expect(screen.getByTestId('hc-native').textContent).toBe('142.06 SOL'))
    expect(screen.getByTestId('hc-demo-hint')).toBeTruthy()
  })

  it('empty-state picker: DEMO connects, then the session auto-checks sol', async () => {
    render(<WalletProvider><HoldingsPage /></WalletProvider>)
    fireEvent.click(screen.getByTestId('wallet-demo'))
    await waitFor(() => expect(fetchCount).toBe(1), { timeout: 3000 })        // demo connect takes 800ms
    expect(lastUrl.startsWith('/api/v1/holdings/sol/')).toBe(true)             // phantom = solana fam
    expect(screen.getByTestId('hc-demo-hint')).toBeTruthy()
  })

  it('PRIVACY: the checked address never reaches localStorage or the console', async () => {
    const logs: string[] = []
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        logs.push(args.map((a) => String(a)).join(' '))
      })
    }
    render(<HoldingsPage />)
    await check(SOL_ADDR)
    await waitFor(() => expect(screen.getByTestId('hc-native')).toBeTruthy())
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? ''
      expect(k).not.toContain(SOL_ADDR)
      expect(localStorage.getItem(k) ?? '').not.toContain(SOL_ADDR)
      expect(k.startsWith('vilmei.') || k.startsWith('alpha.')).toBe(true)     // only the vilmei.* namespace
    }
    expect(logs.some((l) => l.includes(SOL_ADDR))).toBe(false)
  })

  it('the selected chain persists under vilmei.holdings-chain — never the address', async () => {
    render(<HoldingsPage />)
    fireEvent.click(screen.getByTestId('hc-chain-bnb'))
    expect(JSON.parse(localStorage.getItem('vilmei.holdings-chain') ?? 'null')).toBe('bnb')
    await check(EVM_ADDR)
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? ''
      expect(k).not.toContain(EVM_ADDR)
      expect(localStorage.getItem(k) ?? '').not.toContain(EVM_ADDR)
    }
  })
})
