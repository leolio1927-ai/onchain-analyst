/* dexscreener.ts — direct browser fetch adapter (public API, CORS *, no key).
   Fallback rule: every function returns null/[] on failure so callers can keep
   mock data alive. Backend :8000 stays the judge for /api/scan (heuristics +
   clustering must not run in a browser). */
const BASE = 'https://api.dexscreener.com'
const UI_CHAIN: Record<string, string> = { solana: 'sol', bsc: 'bnb', base: 'base',
  'avalanche': 'avax' }

export interface LiveRow {
  symbol: string; chain: string; pair: string; url: string; iconUrl: string;
  price: number; chg: number; liq: number; vol: number; created: number
}

async function jget(url: string, ms = 10000): Promise<any> {
  try {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), ms)
    const r = await fetch(url, { signal: ac.signal })
    clearTimeout(t)
    if (!r.ok) return null
    return await r.json()
  } catch { return null }
}

let a4 = ''
function toRow(p: any): LiveRow | null {
  const price = parseFloat(p?.priceUsd)
  if (!p?.baseToken?.symbol || !(price > 0)) return null
  const ct = p.pairCreatedAt || 0
  return {
    symbol: String(p.baseToken.symbol).slice(0, 14),
    chain: UI_CHAIN[p.chainId] ?? p.chainId ?? 'sol',
    pair: `${(a4 = p.baseToken.address ?? '') .slice(0, 4)}…${a4.slice(-4)} / ${p.quoteToken?.symbol ?? '?'}`,
    url: p.url ?? '', iconUrl: p.info?.imageUrl ?? '',
    price, chg: p.priceChange?.h24 ?? 0,
    liq: p.liquidity?.usd ?? 0, vol: p.volume?.h24 ?? 0, created: ct,
  }
}

/* One token can span many pairs — keep the deepest pool per chain, then rank. */
export function dedupe(rows: LiveRow[], perToken = 12): LiveRow[] {
  const best = new Map<string, LiveRow>()
  for (const r of rows) {
    const k = `${r.chain}:${r.pair.split(' /')[0]}`
    const cur = best.get(k)
    if (!cur || r.liq > cur.liq) best.set(k, r)
  }
  return [...best.values()].sort((a, b) => b.liq - a.liq).slice(0, perToken)
}

/* Trending: boosts/top token addresses -> one batched tokens/{csv} query. */
export async function fetchTrending(): Promise<LiveRow[] | null> {
  const boosts = await jget(`${BASE}/token-boosts/top/v1`)
  if (!Array.isArray(boosts)) return null
  const want = Object.keys(UI_CHAIN)
  const addrs = [...new Set(boosts.filter((b: any) => want.includes(b.chainId))
    .map((b: any) => b.tokenAddress).filter(Boolean))].slice(0, 30)
  if (!addrs.length) return null
  const data = await jget(`${BASE}/latest/dex/tokens/${addrs.join(',')}`)
  const pairs = Array.isArray(data?.pairs) ? data.pairs : []
  const rows = dedupe(pairs.map(toRow).filter(Boolean) as LiveRow[])
  return rows.length ? rows : null
}

/* Chain chips: pick the deepest per-chain pair of each native symbol. */
const CHAIN_QUERIES: Array<[string, string]> = [['sol', 'SOL'], ['bnb', 'BNB'],
  ['base', 'ETH'], ['avax', 'AVAX']]

export async function fetchChainTickers(): Promise<LiveRow[] | null> {
  const out: LiveRow[] = []
  for (const [chain, sym] of CHAIN_QUERIES) {
    const data = await jget(`${BASE}/latest/dex/search?q=${sym}`)
    const rows = ((data?.pairs) ?? []).map(toRow)
      .filter((r: any) => r && r.chain === chain) as LiveRow[]
    if (rows.length) out.push(dedupe(rows, 1)[0])
  }
  return out.length ? out : null
}

/* ── Contract shared with the Scanner UI ────────────────────────────────
   risk/spark are null on live rows until the deterministic engine has
   actually assessed the token (per-row /api/scan, phase 2). UI must render
   "n/a" — never a made-up number. */
export interface ScannerRow {
  symbol: string; chain: string; pair: string; price: number; chg: number;
  liq: number; vol: number; risk: number | null; age: string; spark: number | null;
  url?: string
}

const H = 3600_000
export function ageOf(created: number): string {
  if (!created) return '—'
  const d = Math.floor((Date.now() - created) / (24 * H))
  if (d > 0) return d < 7 ? `${d}d` : `${Math.floor(d / 7)}w`
  const h = Math.floor((Date.now() - created) / H)
  if (h > 0) return `${h}h`
  return `${Math.max(1, Math.floor((Date.now() - created) / 60000))}m`
}

export function toScannerRow(r: LiveRow): ScannerRow {
  return { symbol: r.symbol, chain: r.chain, pair: r.pair, price: r.price,
    chg: r.chg, liq: r.liq, vol: r.vol, risk: null, spark: null,
    age: ageOf(r.created), url: r.url }
}
