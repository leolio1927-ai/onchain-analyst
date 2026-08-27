/* Service layer — the ONLY thing components import for data.
   Today: mockService (instant, simulated latency). Tomorrow: apiService hitting
   webapp/server.py. Same interface → zero UI redesign when the backend lands. */

import type { TokenData } from '../mock/data'
import { SCANNER_ROWS } from '../mock/data'

export interface DataApi {
  getToken(address: string): Promise<TokenData>
  search(q: string): Promise<typeof SCANNER_ROWS>
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false'

async function mockGetToken(_address: string): Promise<TokenData> {
  const { MEMEATCHI } = await import('../mock/data')
  await wait(650) // skeleton shimmer moment — feels like a real fetch
  return MEMEATCHI
}

async function mockSearch(_q: string) {
  await wait(250)
  return SCANNER_ROWS
}

async function apiGetToken(_address: string): Promise<TokenData> {
  // Field mapping (backend scan → TokenData) lands here when the backend is wired.
  throw new Error('REST adapter not wired yet — run with VITE_USE_MOCK=true (default)')
}

export const dataService: DataApi = USE_MOCK
  ? { getToken: mockGetToken, search: mockSearch }
  : { getToken: apiGetToken, search: mockSearch }
