/* Typed client for the Terminal Alpha backend (webapp/server.py).
   The server re-fetches + re-assesses evidence itself — the client never sends data. */

export const CHAINS = ['sol', 'bnb', 'base', 'hood'] as const  // avax parked 2026-08-30 (founder: 5-chain lineup)
export type Chain = (typeof CHAINS)[number]

export const CHAIN_LABEL: Record<Chain, string> = {
  sol: 'Solana',
  bnb: 'BNB Chain',
  base: 'Base',
  // avax: 'Avalanche',  <- parked 2026-08-30
  hood: 'Robinhood Chain',
}

export interface Signal {
  key: string
  label: string
  weight: number
  severity: number | null
  evidence: string
  computed?: boolean
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
  data_mode: 'live' | 'partial'
  schema_version: string
  context: ScanContext
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

/* Rug flags ride the scan context block (BE-F5a-R). Every value is verbatim
   from the source: sol = helius DAS (update_authorities + mutable), bnb/base
   = GoPlus security fields as their own strings; absent fields stay null. */
export interface RugFlags {
  update_authorities: string[]
  mutable: boolean | null
  is_honeypot: string | number | null
  buy_tax: string | number | null
  sell_tax: string | number | null
  mintable: string | number | null
  freezable: string | number | null
  holder_count: string | number | null
}

export interface ScanContext {
  deployer: string | null
  deployer_kind: string | null
  deployer_source: string | null
  top10_share: number | null
  sell_test: { routable: boolean | null; checked_via: string | null; note: string | null } | null
  rug_flags: RugFlags | null
  notes: string[]
  data_mode: string
  sources: string[]
  data_sources?: string[]
  ts: string
}

/* BE-F4 chain capability catalog — the single source of truth for which
   chain can do what. Parked chains (avax) never appear here. */
export interface ChainCatalogRow {
  chain: string
  name: string
  symbol: string | null
  scan: boolean
  clustering: boolean
  socials: boolean
  live_feed: boolean
  venues: string[]
}

export interface ChainCapability {
  source: string | null
  reason?: string
}

/* BE-ALL-LIVE F3 whale tracker. data_mode: "live" = helius answered (an
   empty transfers list is a quiet window, still live); "unwired" = the chain
   has no $0 trade feed and data_sources carries the probe reason verbatim. */
export interface WhaleTransfer {
  wallet: string
  amount: number
  direction: string
  ts: string | number | null
  tx: string | null
  usd: number | null
}

export interface WhaleNetflow {
  wallet: string
  net_amount: number
  direction: string
  net_usd: number | null
}

export interface WhalesResult {
  chain: string
  token: string
  price_usd: number | null
  threshold_usd: number
  window_txs: number
  transfers: WhaleTransfer[]
  netflow: WhaleNetflow[]
  data_mode: string
  data_sources: string[]
  sources: string[]
  ts: string
}

export interface ChainsCatalog {
  chains: ChainCatalogRow[]
  capabilities: Record<string, Record<string, ChainCapability>>
  data_mode: string
  ts: string
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

async function get<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url)
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
  whales: (chain: string, token: string, thresholdUsd = 1000, limit = 25) =>
    get<WhalesResult>(`/api/v1/whales/${encodeURIComponent(chain)}/${encodeURIComponent(token)}?threshold_usd=${thresholdUsd}&limit=${limit}`),
  health: () => fetch('/api/health').then((r) => r.json()),
  chains: () => fetch('/api/v1/chains').then((r) => r.json()) as Promise<ChainsCatalog>,
}
