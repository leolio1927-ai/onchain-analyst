import { MEMEATCHI, SCANNER_ROWS } from '../mock/data'
import type { TokenData } from '../mock/data'
import { fetchTrending, toScannerRow } from './dexscreener'
import type { ScannerRow } from './dexscreener'

const FREEZE = (import.meta as any).env?.VITE_USE_MOCK_SCANNER === 'true'
const TTL = 60_000
let cache: { at: number; rows: ScannerRow[] | null } = { at: 0, rows: null }

/* Frozen/fallback rows are fake by contract (mock/data.ts: "EVERY number here
   is FAKE") — they keep the mock flag so the UI can label them visibly. */
const MOCK_ROWS: ScannerRow[] = SCANNER_ROWS.map((r) => ({ ...r, mock: true }))

export const dataService = {
  async getScannerRows(): Promise<ScannerRow[]> {
    if (FREEZE) return MOCK_ROWS
    if (cache.rows && Date.now() - cache.at < TTL) return cache.rows
    const live = await fetchTrending()
    if (live && live.length) { const rows = live.map(toScannerRow); cache = { at: Date.now(), rows }; return rows }
    return cache.rows ?? MOCK_ROWS
  },
  async search(q: string): Promise<ScannerRow[]> {
    const rows = await dataService.getScannerRows()
    const s = q.toLowerCase()
    return rows.filter((r) => r.symbol.toLowerCase().includes(s))
  },
  async getToken(address: string): Promise<TokenData> { return { ...MEMEATCHI, address } },
}
