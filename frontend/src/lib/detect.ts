/* Local auto-detect classify (PROMPT-V Fase 3.1) — the browser twin of
   providers/market.py classify. Same regexes, probed law (2026-08-30):
   base58 32-44 → solana-shaped, 0x+40hex → EVM-ambiguous, else $TICKER. */
export type QueryKind = 'base58' | 'evm-ambiguous' | 'ticker' | 'invalid'

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const EVM = /^0x[a-fA-F0-9]{40}$/
const TICKER = /^\$?[A-Za-z0-9]{1,24}$/

export function classifyQuery(q: string): QueryKind {
  const s = (q || '').trim()
  if (BASE58.test(s)) return 'base58'
  if (EVM.test(s)) return 'evm-ambiguous'
  if (TICKER.test(s)) return 'ticker'
  return 'invalid'
}

export interface DetectCandidate {
  chain: string
  chain_id: string | null
  symbol: string | null
  name: string | null
  token_address: string | null
  pair_address: string | null
  dex_id: string | null
  liquidity_usd: number | null
  price_usd: string | number | null
  url: string | null
}

export interface DetectResult {
  query: string
  kind: QueryKind | string
  candidates: DetectCandidate[]
  provenance?: {
    source: string | null
    host: string | null
    degraded: string | null
  }
}

/* GET /api/v1/detect — never silently defaults: the CALLER must render the
   candidate set when candidates.length > 1 (Fase-1 identity bug, inverted). */
export async function fetchDetect(query: string, signal?: AbortSignal): Promise<DetectResult> {
  const res = await fetch(`/api/v1/detect?address=${encodeURIComponent(query)}`, { signal })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const j = (await res.json()) as { detail?: unknown }
      if (typeof j.detail === 'string') detail = j.detail
    } catch { /* keep the HTTP code line */ }
    throw new Error(detail)
  }
  return (await res.json()) as DetectResult
}
