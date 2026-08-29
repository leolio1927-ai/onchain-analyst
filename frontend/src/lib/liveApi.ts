/* Typed client for the /api/v1/live/* feed (webapp/server.py → providers/live.py).
   Fetch only — no retries inside; the caller owns retry policy (60s cool-down).
   Absent fields stay null end-to-end: the UI renders "–", never a zero. */

export const LIVE_CHAINS = ['sol', 'bnb', 'base', 'hype', 'hood', 'avax'] as const
export type LiveChain = (typeof LIVE_CHAINS)[number]

/* Founder-locked display order lives in LIVE_CHAINS. */
export const LIVE_CHAIN_LABEL: Record<LiveChain, string> = {
  sol: 'Solana',
  bnb: 'BNB Chain',
  base: 'Base',
  hype: 'HyperEVM',
  hood: 'Robinhood Chain',
  avax: 'Avalanche',
}

export const LIVE_MODES = ['new', 'trending', 'volume', 'alpha'] as const
export type LiveMode = (typeof LIVE_MODES)[number]

export interface LiveItem {
  pool_address: string | null
  token_symbol: string | null
  token_name: string | null
  pair: string | null
  logo: string | null
  price_usd: string | null
  volume_24h: string | null
  change_24h: string | null
  liquidity_usd: string | null
  txns_24h: number | null
  fdv_usd: string | null
  created_at: string | null
  dex_id: string | null
  launchpad: string | null
}

export interface LiveFeed {
  chain: string
  network_id: string | null
  live: boolean
  generated_at: string
  cached: boolean
  stale: boolean
  items: LiveItem[]
}

export type LiveErrorKind =
  | 'not-found'    // 404 — unknown chain
  | 'bad-request'  // 400 — bad mode/limit
  | 'upstream'     // 502 — upstream failed (GeckoTerminal 429 lives here)
  | 'network'      // server unreachable
  | 'http'         // any other non-200

export class LiveFeedError extends Error {
  kind: LiveErrorKind
  status: number

  constructor(kind: LiveErrorKind, status: number, message: string) {
    super(message)
    this.kind = kind
    this.status = status
  }
}

export async function fetchLiveFeed(
  chain: string,
  mode: LiveMode,
  limit: number,
  signal?: AbortSignal,
): Promise<LiveFeed> {
  let res: Response
  try {
    res = await fetch(
      `/api/v1/live/${encodeURIComponent(chain)}?mode=${mode}&limit=${limit}`,
      { signal },
    )
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new LiveFeedError('network', 0, 'Network error — is the API server running?')
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const j = (await res.json()) as { detail?: unknown }
      if (typeof j.detail === 'string') detail = j.detail
    } catch { /* non-JSON error body — keep the HTTP code line */ }
    const kind: LiveErrorKind =
      res.status === 404 ? 'not-found'
      : res.status === 400 ? 'bad-request'
      : res.status === 502 ? 'upstream'
      : 'http'
    throw new LiveFeedError(kind, res.status, detail)
  }
  try {
    return (await res.json()) as LiveFeed
  } catch {
    throw new LiveFeedError('http', res.status, 'Malformed response from the API')
  }
}
