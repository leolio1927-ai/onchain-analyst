/* TokenPage render smoke + the Fase-1 identity law: header and rail read the
   SAME active pair from lib/tokenStore — no second default anywhere. */
import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TokenPage } from './TokenPage'
import { resetStore } from '../lib/tokenStore'

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
})
