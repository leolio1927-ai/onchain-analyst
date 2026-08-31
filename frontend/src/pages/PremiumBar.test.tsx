/* R3 gate (PROMPT-V3): the PREMIUM-BAR laws (docs/PREMIUM-BAR.md), tested.
   1. SevSpark parity — the scanner sparkline bars ARE .rd-bin elements, so the
      8-bin ramp colors come from the SAME selectors as the RiskDisplay tape
      (one color source; empty profile = dashed gap bins, never fake bars);
   2. MiniBadge parity — one .rd-coin[data-level] selector per verdict level,
      all reading the same --sev-* tokens;
   3. scanner row = sparkline + chain chip + 3D mini-badge (founder's variasi);
   4. PB-4 skeleton shimmer while loading (scanner + rug + whale);
   5. PB-2 empty state = styled content with clickable real CAs;
   6. PB-8 reduced motion — the shimmer stops, the contract holds in CSS. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MiniBadge, SevSpark } from '../components/RiskDisplay'
import { ScannerPage } from './AnalysisPages'
import { RugCheckPageMulti, WhalePageMulti } from './RugWhaleMulti'

const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
const css = readFileSync(join(process.cwd(), 'src/components/risk-display.css'), 'utf8')
const appCss = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8')

const SCAN_RES = {
  pair: {
    chainId: 'solana', pairAddress: 'PAIR1234567890abcdef',
    baseToken: { address: 'TOKADDR', symbol: 'GREY' }, quoteToken: { symbol: 'SOL' },
    priceUsd: '0.001', priceChange: { h24: 5.2 },
    liquidity: { usd: 120000 }, volume: { h24: 50000 },
  },
  assessment: {
    score: 82, level_label: 'HIGH RISK',
    signals: [
      { key: 'liq', label: 'Liquidity', severity: 0.9, weight: 2, evidence: 'x' },
      { key: 'age', label: 'Age', severity: 0.2, weight: 1, evidence: 'y' },
      { key: 'clus', label: 'Clustering', severity: null, weight: 1, evidence: 'z' },
    ],
    notes: [],
  },
  sources: ['local'], clustering: { wallets: 3, buys: 5, severity: 2, evidence: 'e' },
  launch_venue: null, ts: '2026-08-31T00:00:00Z', schema_version: '1.0', data_mode: 'live',
}

/* feed fetches stay pending (loading state) unless a test wants rows */
function mockFetch(scanRes: unknown = null) {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? '')
    if (url.includes('/api/scan') && scanRes) {
      return { ok: true, status: 200, json: async () => scanRes }
    }
    return new Promise<Response>(() => {})   // pending: keeps blocks in shimmer
  }))
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('R3 PREMIUM-BAR — one severity source', () => {
  it('SevSpark bars ARE .rd-bin elements (tape-parity by construction)', () => {
    const { container } = render(<SevSpark sevs={[0.9, 0.2]} />)
    const bars = container.querySelectorAll('.rd-spark .rd-bin')
    expect(bars.length).toBe(8)
    expect(container.querySelectorAll('.rd-spark .rd-bin.gap').length).toBe(6)
    /* 0.9 → bin 7, 0.2 → bin 1: the ramp positions the tape quantizer picks */
    expect(container.querySelector('.rd-bin[data-bin="7"]:not(.gap)')).toBeTruthy()
    expect(container.querySelector('.rd-bin[data-bin="1"]:not(.gap)')).toBeTruthy()
  })

  it('an unscanned row renders dashed gap bins — never a fabricated profile', () => {
    const { container } = render(<SevSpark sevs={null} />)
    expect(container.querySelectorAll('.rd-spark .rd-bin.gap').length).toBe(8)
    expect(container.textContent).toBe('')
    expect(container.querySelector('.rd-spark')?.getAttribute('aria-label')).toBe('no engine run yet')
  })

  it('MiniBadge has one --sev-driven selector per verdict level (parity)', () => {
    for (const lvl of ['low', 'medium', 'high', 'nodata']) {
      expect(css).toContain(`.rd-coin[data-level='${lvl}']`)
    }
    const { container } = render(<MiniBadge level="high" />)
    expect(container.querySelector('.rd-coin')?.getAttribute('data-level')).toBe('high')
  })

  it('the medallion hero glow + shimmer stop ship without keyframes in the risk css', () => {
    expect(css).toContain('.rd-dial-wrap')
    expect(css).toContain('drop-shadow')
    expect(css).not.toMatch(/@keyframes/)          // compositor law holds
    expect(appCss).toMatch(/prefers-reduced-motion: reduce\) \{ \.ta-skel \{ animation: none/)
  })
})

describe('R3 PREMIUM-BAR — the pages', () => {
  it('scanner: skeleton shimmer while the feed is in flight (PB-4)', () => {
    mockFetch()
    const { getByTestId } = render(<ScannerPage />)
    expect(getByTestId('sc-loading').querySelectorAll('.ta-skel').length).toBeGreaterThanOrEqual(6)
  })

  it('scanner: a scanned row = sev sparkline + chain chip + 3D mini-badge', async () => {
    mockFetch(SCAN_RES)
    const { container, getByPlaceholderText, getByRole } = render(<ScannerPage />)
    fireEvent.change(getByPlaceholderText(/paste token address/i), { target: { value: BONK } })
    fireEvent.click(getByRole('button', { name: /scan token/i }))
    await waitFor(() => expect(container.querySelector('.ta-table tbody tr')).toBeTruthy())
    const row = container.querySelector('.ta-table tbody tr')!
    expect(row.querySelector('.rd-spark .rd-bin:not(.gap)'), 'sev sparkline in the row').toBeTruthy()
    /* the chip shows the full chain label uppercased (SOLANA, not SOL) */
    expect(row.querySelector('.sc-chain[data-chain="sol"]')?.textContent).toBe('SOLANA')
    expect(row.querySelector('.rd-coin[data-level="high"]'), 'mini-badge from the engine verdict').toBeTruthy()
    expect(row.textContent).toContain('82')       // numeric badge stays (parity)
  })

  it('scanner: empty feed = styled content with 3 real example CAs (PB-2)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
    const { getByTestId } = render(<ScannerPage />)
    await waitFor(() => expect(getByTestId('sc-empty')).toBeTruthy())
    const cands = getByTestId('sc-empty').querySelectorAll('.v2-cand')
    expect(cands.length).toBe(3)
  })

  it('rug: skeleton shimmer while the check runs (PB-4)', () => {
    mockFetch()
    const { getByTestId, getByPlaceholderText, getByRole } = render(<RugCheckPageMulti />)
    fireEvent.change(getByPlaceholderText(/paste token address/i), { target: { value: BONK } })
    fireEvent.click(getByRole('button', { name: /run check/i }))
    expect(getByTestId('rug-loading').querySelectorAll('.ta-skel').length).toBeGreaterThanOrEqual(6)
  })

  it('whale: skeleton shimmer while the tape walk runs (PB-4)', () => {
    mockFetch()
    const { getByTestId, getByRole } = render(<WhalePageMulti />)
    fireEvent.click(getByRole('button', { name: /scan whales/i }))
    expect(getByTestId('whale-loading').querySelectorAll('.ta-skel').length).toBeGreaterThanOrEqual(4)
  })
})
