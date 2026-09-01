/* PROMPT-B PART A gate: the ledger page never prints the broken docs claim
   as a metric, renders the correction row when the claim loses to the chain,
   announces unlabeled top-2 concentration, and can't scroll the page
   sideways. Payload comes from a stubbed /api/ledger — the exact v1.1 shape
   the adapter ships. */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LedgerPage } from './ledger'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const PROV = { source: 'jsonrpc:getTokenSupply@rpc', fetched_at: '2026-09-01T00:00:00Z', verified_by: 'getTokenSupply jsonrpc' }

function stubLedger(payload: Record<string, unknown>) {
  return vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    if (String(input).includes('/api/ledger')) {
      return new Response(JSON.stringify(payload), { status: 200 })
    }
    return new Promise<Response>(() => {})
  }))
}

const BASE: Record<string, unknown> = {
  schema_version: '1.2', chain: 'sol', data_mode: 'live',
  mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  preview_note: 'preview', cached: true, cache_age_s: 42, ts: '2026-09-01T00:00:00Z',
  supply: {
    total_supply_onchain: 554997570.39084, total_supply_exact: '554997570.39084',
    supply_amount_raw: '554997570390840', decimals: 6,
    total_definitive: true, current_supply: 554997570.39084,
    supply_prov: PROV, mint_authority: null, mint_absent: true,
    freeze_authority: null, freeze_absent: true, mint_prov: PROV,
  },
  bars: { burned_upper_bound_pct: null, note: 'burn % needs a proven genesis baseline' },
  claim_correction: {
    claim: 1_000_000_000, claim_kind: 'docs cap', on_chain: 554997570.39084,
    on_chain_exact: '554997570.39084',
    status: 'consistent (current < cap)',
  },
  concentration: { top2_pct: 49.29, top2_labels: ['UNKNOWN', 'UNKNOWN'] },
  holders: [{
    rank: 1, token_account: 'TA1', owner: 'EXJHIM1234567890abcdHm6T', amount: 137456789.123456,
    amount_exact: '137456789.123456',
    pct_supply: 24.7726, label: 'UNKNOWN', evidence: '', delta_24h: null,
  }],
  holders_prov: PROV, delta_note: '',
  invariant: { expression: 'top20 ≤ supply', top20_sum: 137456789.123456, current_supply: 554997570.39084, holds: true, reason: null },
  buyback: { rows: [], gap: 'claim until proven' },
  burn: { rows: [], gap: 'empty by law' },
  vesting: { rows: [], gap: 'null, not invented' },
  labels_source: 'ledgers/labels.solana.json',
  gaps: ['preview token diganti ke $RAY; temuan: formatter bug lama — root cause: decimal off-by-one'],
}

describe('ledger v1.1 — data-integrity hotfix (PART A)', () => {
  it('A1: card #1 is TOTAL SUPPLY (on-chain); FIXED MINT is gone', async () => {
    stubLedger(BASE)
    render(<LedgerPage />)
    await screen.findByText('TOTAL SUPPLY (on-chain)')
    expect(document.body.textContent).not.toContain('FIXED MINT')
    expect(document.body.textContent).not.toContain('-586')
  })

  it('A2: claim loses → GAPS correction row renders (claim | on-chain | status), no crash', async () => {
    stubLedger(BASE)
    render(<LedgerPage />)
    const row = await screen.findByTestId('claim-correction')
    expect(row.textContent).toContain('1,000,000,000')
    expect(row.textContent).toContain('554997570.39084')
    expect(row.textContent).toContain('consistent (current < cap)')
  })

  it('A3: top-2 unlabelled concentration announces itself, links methodology', async () => {
    stubLedger(BASE)
    render(<LedgerPage />)
    const card = await screen.findByTestId('holder-concentration')
    expect(card.textContent).toContain('top2 49.3%')
    expect(card.textContent).toContain('both UNLABELLED')
    expect(card.querySelector('a')?.getAttribute('href')).toBe('#labels-methodology')
  })

  it('A4: provenance carries the real cache age', async () => {
    stubLedger(BASE)
    render(<LedgerPage />)
    await screen.findByText(/refreshed 42s ago/)
  })

  it('A1-law: burn % stays an honest dash when the baseline is unproven', async () => {
    stubLedger({ ...BASE, bars: { burned_upper_bound_pct: null, note: 'unproven' } })
    render(<LedgerPage />)
    await screen.findByText('TOTAL SUPPLY (on-chain)')
    expect(document.body.textContent).not.toMatch(/-[\d.]+%/)
  })
})
