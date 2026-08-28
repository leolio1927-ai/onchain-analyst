/* Typed client for the Terminal Alpha backend (webapp/server.py).
   The server re-fetches + re-assesses evidence itself — the client never sends data. */

export const CHAINS = ['sol', 'bnb', 'base', 'avax', 'hood'] as const
export type Chain = (typeof CHAINS)[number]

export const CHAIN_LABEL: Record<Chain, string> = {
  sol: 'Solana',
  bnb: 'BNB Chain',
  base: 'Base',
  avax: 'Avalanche',
  hood: 'Robinhood Chain',
}

export interface Signal {
  key: string
  label: string
  weight: number
  severity: number | null
  evidence: string
}

export interface Assessment {
  level: 'low' | 'medium' | 'high' | 'nodata'
  level_label: string
  score: number | null
  signals: Signal[]
  notes: string[]
}

export interface Pair {
  pairAddress: string | null
  chainId: string | null
  dexId: string | null
  url: string | null
  baseToken: { address: string; symbol: string; name: string }
  quoteToken: { symbol: string }
  priceUsd: string | null
  liquidity: { usd: number | null }
  fdv: number | null
  marketCap: number | null
  volume: { h24?: number; h6?: number; h1?: number; m5?: number } | null
  priceChange: { m5?: number; h1?: number; h6?: number; h24?: number } | null
  txns: { h24?: { buys: number; sells: number } } | null
  pairCreatedAt: number | null
}

export interface Clustering {
  wallets: number
  buys: number
  severity: number | null
  evidence: string
}

export interface ScanResult {
  pair: Pair
  assessment: Assessment
  clustering: Clustering
  sources: string[]
  launch_venue: string | null
  ts: string
}

export interface ExplainResult {
  summary: string
  key_signals: { label: string; evidence: string }[]
  limitations: string
  parse_ok: boolean
  tier: string
  provider: string
}

export interface WhaleBalance {
  address: string
  sol: number
  tokens: { mint: string | null; amount: number }[]
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Network error — is the API server running?', 0)
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const j = await res.json()
      if (typeof j.detail === 'string') detail = j.detail
    } catch { /* keep HTTP code */ }
    throw new ApiError(detail, res.status)
  }
  return res.json() as Promise<T>
}

export const api = {
  scan: (chain: Chain, address: string, refresh = false) =>
    post<ScanResult>('/api/scan', { chain, address, refresh }),
  explain: (chain: Chain, address: string, provider: string) =>
    post<ExplainResult>('/api/explain', { chain, address, provider }),
  whale: (address: string) => post<WhaleBalance>('/api/whale', { address }),
  health: () => fetch('/api/health').then((r) => r.json()),
}
