/* PROMPT-V4 M5 gate: Holdings Check is live and honest. Laws under test:
   1. no wallet checked is an honest state — zero fetches;
   2. a valid check fetches /api/v1/holdings/{chain}/{address} and renders
      the server's numbers VERBATIM (no client-side re-derivation);
   3. hype/hood PARTIAL coverage is a sentence with a muted chip, never red;
   4. no_key coverage is an amber NO KEY chip + a declared-null sentence;
   5. an upstream 400 shows the server's human sentence, never a red wall. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HoldingsPage } from './Pages2'

const SOL_ADDR = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
const EVM_ADDR = '0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1'

const solOk = {
  schema_version: 'v1', ts: '2026-08-31T12:00:00Z',
  chain: 'sol', address: SOL_ADDR, coverage: 'ok',
  native_symbol: 'SOL', native_amount: 142.06,
  tokens: [{ token: SOL_ADDR, symbol: 'BONK', amount: 1000000 }],
  sources: ['helius'], reasons: [], data_mode: 'live',
}
const hypePartial = {
  schema_version: 'v1', ts: '2026-08-31T12:00:00Z',
  chain: 'hype', address: EVM_ADDR, coverage: 'partial',
  native_symbol: 'HYPE', native_amount: null, tokens: [],
  sources: [], data_mode: 'partial',
  reasons: ['holdings:partial — no free-tier balance source verified for hype (M0 probe 2026-08-31): the terminal says so instead of guessing'],
}
const solNoKey = {
  schema_version: 'v1', ts: '2026-08-31T12:00:00Z',
  chain: 'sol', address: SOL_ADDR, coverage: 'no_key',
  native_symbol: 'SOL', native_amount: null, tokens: [],
  sources: [], data_mode: 'partial',
  reasons: ['holdings:no_key — HELIUS_API_KEY is declared-null until the founder claims one'],
}

let payload: unknown = solOk
let failWith: { status: number; detail: string } | null = null
let lastUrl = ''
let fetchCount = 0

beforeEach(() => {
  cleanup()
  payload = solOk
  failWith = null
  lastUrl = ''
  fetchCount = 0
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    fetchCount += 1
    lastUrl = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? '')
    if (failWith) return { ok: false, status: failWith.status, json: async () => ({ detail: failWith?.detail }) }
    return { ok: true, status: 200, json: async () => payload }
  }))
})

async function check(addr: string) {
  fireEvent.change(screen.getByTestId('hc-addr'), { target: { value: addr } })
  fireEvent.click(screen.getByTestId('hc-check'))
  await waitFor(() => expect(fetchCount).toBe(1))
}

describe('HoldingsPage (M5 live holdings)', () => {
  it('no wallet checked: honest empty state and ZERO fetches', () => {
    render(<HoldingsPage />)
    expect(screen.getByText('No wallet checked yet')).toBeTruthy()
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
    expect(screen.getByText(/sources: helius/)).toBeTruthy()
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
})
