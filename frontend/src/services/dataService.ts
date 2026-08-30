/* Live data service (BE-ALL-LIVE F5) — every field comes from the backend
   (webapp/server.py). Fields the backend does not have are null and the UI
   renders "–" / an honest empty state; NOTHING is filled from mock data. */
import { api } from '../api'
import type { ScanResult } from '../api'
import { fetchTrending, toScannerRow } from './dexscreener'
import type { ScannerRow } from './dexscreener'

const TTL = 60_000
let cache: { at: number; rows: ScannerRow[] | null } = { at: 0, rows: null }

export interface LiveToken {
  chain: string
  address: string
  symbol: string | null
  name: string | null
  pair: string | null
  dex: string | null
  price: number | null
  change24h: number | null
  liquidity: number | null
  fdv: number | null
  marketCap: number | null
  volume24h: number | null
  txns24h: number | null
  buySell: [number, number] | null
  age: string | null
  launchVenue: string | null
  score: number | null
  levelLabel: string | null
  signals: { label: string; weight: number; severity: number | null;
             evidence: string; computed: boolean }[]
  clusteringEvidence: string | null
  clusteringComputed: boolean | null
  dataSources: string[]
}

export interface WhalesPayload {
  chain: string
  token: string
  price_usd: number | null
  threshold_usd: number
  window_txs: number
  transfers: { wallet: string; amount: number; direction: string;
               ts: string | number | null; tx: string | null; usd: number | null }[]
  netflow: { wallet: string; net_amount: number; direction: string;
             net_usd: number | null }[]
  data_mode: string
  data_sources: string[]
}

const num = (v: string | number | null | undefined): number | null => {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v !== '' && !isNaN(parseFloat(v))) return parseFloat(v)
  return null
}

export function toLiveToken(r: ScanResult): LiveToken {
  const p = r.pair
  const a = r.assessment
  const h24 = p.txns?.h24
  const buys = h24?.buys
  const sells = h24?.sells
  const ageH = p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 3_600_000 : null
  const age = ageH == null ? null
    : ageH < 1 ? `${Math.round(ageH * 60)} min`
    : ageH < 24 ? `${ageH.toFixed(1)} h`
    : ageH < 168 ? `${(ageH / 24).toFixed(1)} days`
    : `${(ageH / 168).toFixed(1)} weeks`
  return {
    chain: p.chainId ?? '',
    address: p.baseToken?.address ?? '',
    symbol: p.baseToken?.symbol ?? null,
    name: p.baseToken?.name ?? null,
    pair: p.pairAddress ?? null,
    dex: p.dexId ?? null,
    price: num(p.priceUsd),
    change24h: num(p.priceChange?.h24),
    liquidity: num(p.liquidity?.usd),
    fdv: num(p.fdv) ?? num(p.marketCap),
    marketCap: num(p.marketCap),
    volume24h: num(p.volume?.h24),
    txns24h: typeof buys === 'number' && typeof sells === 'number' ? buys + sells : null,
    buySell: typeof buys === 'number' && typeof sells === 'number' && buys + sells > 0
      ? [Math.round((buys / (buys + sells)) * 100), Math.round((sells / (buys + sells)) * 100)]
      : null,
    age,
    launchVenue: r.launch_venue ?? null,
    score: a.score ?? null,
    levelLabel: a.level_label ?? null,
    signals: (a.signals ?? []).map((s) => ({
      label: s.label, weight: s.weight, severity: s.severity,
      evidence: s.evidence, computed: (s as { computed?: boolean }).computed
        ?? s.severity !== null,
    })),
    clusteringEvidence: r.clustering?.evidence ?? null,
    clusteringComputed: (r.clustering as { computed?: boolean } | null)?.computed ?? null,
    dataSources: [`scan contract v${r.schema_version} (${r.data_mode})`],
  }
}

export const dataService = {
  /* Scanner rows are LIVE DexScreener trending data (keyless, CORS *). A
     failed fetch returns [] — an honest empty state, never fake rows. */
  async getScannerRows(): Promise<ScannerRow[]> {
    if (cache.rows && Date.now() - cache.at < TTL) return cache.rows
    const live = await fetchTrending()
    if (live && live.length) {
      const rows = live.map(toScannerRow)
      cache = { at: Date.now(), rows }
      return rows
    }
    return []
  },

  async search(q: string): Promise<ScannerRow[]> {
    const rows = await dataService.getScannerRows()
    const s = q.toLowerCase()
    return rows.filter((r) => r.symbol.toLowerCase().includes(s))
  },

  /* Real scan — the backend re-fetches and re-assesses server-side. */
  async getScan(chain: 'sol' | 'bnb' | 'base' | 'hood', address: string): Promise<LiveToken> {
    const r = await api.scan(chain, address)
    return toLiveToken(r)
  },

  /* Whale tracker (F3): sol = helius enhanced txs; other chains answer with
     data_sources reason sentences — surfaced as-is, never masked. */
  async getWhales(chain: string, token: string,
                  thresholdUsd = 1000): Promise<WhalesPayload | null> {
    try {
      const r = await fetch(`/api/v1/whales/${chain}/${token}?threshold_usd=${thresholdUsd}`)
      if (!r.ok) return null
      return (await r.json()) as WhalesPayload
    } catch {
      return null
    }
  },
}
