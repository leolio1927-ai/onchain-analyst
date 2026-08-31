/* PROMPT-V3 R4 — fee frontier FE gates.
   1. the fee strip renders ONLY inside ADVANCED, from ONE GET to
      /api/v1/fees/estimate (policy data, nothing charged);
   2. the honest copy ships verbatim; the five provider chips carry their
      matrix verdicts and only sol is SIAP-$0;
   3. the grep gate: zero execution wiring in TokenPage — no transaction,
      signature, or transfer verb, and the fee call is a plain GET. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TokenPage } from './TokenPage'
import { resetStore } from '../lib/tokenStore'

const FEE_RES = {
  data_mode: 'static', schema_version: '1.0',
  sources: ['policy:docs/FEE-MODELS-2026.md'],
  chain: 'sol', amount_usd: 1000, planned_rate_bps: 50,
  split_bps: { ops: 30, buyback: 10, rewards: 10 },
  estimate_usd: 5, split_usd: { ops: 3, buyback: 1, rewards: 1 },
  provider: { provider: 'jupiter-swap-api', mechanism: 'platformFeeBps on /quote + /swap', verdict: 'SIAP-$0', note: 'keyless probe' },
  matrix: {
    sol: { provider: 'jupiter-swap-api', mechanism: 'platformFeeBps on /quote + /swap', verdict: 'SIAP-$0', note: 'keyless probe 2026-08-31' },
    bnb: { provider: 'none-keyless', mechanism: 'self-deployed hook', verdict: 'TIDAK-ADA', note: 'hook path' },
    base: { provider: 'none-keyless', mechanism: 'hook or BD', verdict: 'TIDAK-ADA', note: 'aerodrome unreachable' },
    hype: { provider: 'hyperliquid-hip3', mechanism: 'builder codes', verdict: 'PERLU-AGREEMENT-BISNIS', note: 'builder application' },
    hood: { provider: 'none-public', mechanism: 'no public scheme', verdict: 'TIDAK-ADA', note: 'TBD' },
  },
  buyback_blocker: 'VM-fee-01 — the buyback slice has no engine',
  honest_note: 'planned — nothing is charged; VILMEI is read-only',
  provenance: { doc: 'docs/FEE-MODELS-2026.md', checked: '2026-08-31' },
  ts: '2026-08-31T00:00:00+00:00',
}

function mockFetch() {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (String(url).includes('/api/v1/fees/estimate')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(FEE_RES) } as Response)
    }
    return new Promise<Response>(() => {})   // every other feed stays pending
  }))
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetStore() })

describe('R4 fee strip — planned, inspectable, never charged', () => {
  it('the strip lives inside ADVANCED and renders the full policy', async () => {
    mockFetch()
    const { container, getByRole, getByTestId } = render(<TokenPage />)
    expect(container.querySelector('[data-testid="fee-strip"]'), 'closed rail shows no fee strip').toBeNull()
    fireEvent.click(getByRole('button', { name: /advanced/i }))
    await waitFor(() => expect(getByTestId('fee-strip').textContent).toContain('0.50%'))
    const strip = getByTestId('fee-strip')
    expect(strip.textContent).toContain('OPS 0.30')
    expect(strip.textContent).toContain('BUYBACK 0.10')
    expect(strip.textContent).toContain('REWARDS 0.10')
    expect(strip.textContent).toContain('planned — nothing is charged; VILMEI is read-only')
    expect(strip.textContent).toContain('VM-fee-01')
  })

  it('five provider chips, one verdict language, only sol is SIAP-$0', async () => {
    mockFetch()
    const { getByRole, getByTestId } = render(<TokenPage />)
    fireEvent.click(getByRole('button', { name: /advanced/i }))
    await waitFor(() => expect(getByTestId('fee-strip').querySelectorAll('.fee-chip').length).toBe(5))
    const chips = [...getByTestId('fee-strip').querySelectorAll('.fee-chip')]
    expect(chips.filter((c) => c.getAttribute('data-verdict') === 'SIAP-$0').length).toBe(1)
    expect(chips.filter((c) => c.getAttribute('data-verdict') === 'TIDAK-ADA').length).toBe(3)
    expect(chips.filter((c) => c.getAttribute('data-verdict') === 'PERLU-AGREEMENT-BISNIS').length).toBe(1)
    expect(chips.some((c) => c.className.includes('on') && c.textContent?.startsWith('SOL'))).toBe(true)
  })

  it('grep gate: TokenPage wires zero execution (no tx/sign/transfer verbs)', () => {
    const src = readFileSync(join(process.cwd(), 'src/pages/TokenPage.tsx'), 'utf8')
    for (const verb of ['sendTransaction', 'signTransaction', 'signMessage',
      'broadcast', 'executeTrade', 'createTransfer', 'submitOrder', 'privateKey']) {
      expect(src, `execution verb '${verb}' must never appear`).not.toContain(verb)
    }
    /* the ONLY fee call is a plain GET (no method option = GET) */
    const feeCall = src.match(/fetch\(\s*`\/api\/v1\/fees\/estimate[^`]*`/)
    expect(feeCall, 'fee strip fetches the estimator').toBeTruthy()
    expect(src.slice(feeCall!.index!, feeCall!.index! + 160)).not.toContain("method")
  })
})
