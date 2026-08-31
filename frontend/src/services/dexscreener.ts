/* dexscreener.ts — direct browser fetch adapter (public API, CORS *, no key).
   Fallback rule: every function returns null/[] on failure so callers can keep
   mock data alive. Backend :8000 stays the judge for /api/scan (heuristics +
   clustering must not run in a browser). */
const BASE = 'https://api.dexscreener.com'
/* 'avalanche' → 'avax' parked 2026-08-30 (founder: 5-chain lineup) — re-add
   the mapping (plus its NATIVE row below) to re-enable the browser tape. */
const UI_CHAIN: Record<string, string> = { solana: 'sol', bsc: 'bnb', base: 'base', hyperevm: 'hype' }

export interface LiveRow {
  symbol: string; chain: string; pair: string; url: string; iconUrl: string;
  price: number; chg: number; liq: number; vol: number; created: number
}

/* Minimal upstream shapes — DexScreener returns loose JSON; every field is
   optional and guarded before use (no `as any` casts on upstream data). */
interface DsToken { address?: string; symbol?: string; name?: string }
interface DsPair {
  chainId?: string; dexId?: string; url?: string;
  baseToken?: DsToken | null; quoteToken?: DsToken | null;
  priceUsd?: string; priceNative?: string;
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number } | null;
  liquidity?: { usd?: number | null } | null;
  volume?: { h24?: number } | null;
  txns?: { h24?: { buys?: number; sells?: number } | null } | null;
  marketCap?: number | null;
  pairCreatedAt?: number;
  info?: { imageUrl?: string } | null;
}
interface DsBoost { chainId?: string; tokenAddress?: string }

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
function isDsPair(v: unknown): v is DsPair { return isObj(v) }
function isDsBoost(v: unknown): v is DsBoost { return isObj(v) }
function isBoostArray(v: unknown): v is DsBoost[] {
  return Array.isArray(v) && v.every(isDsBoost)
}
function pairsOf(d: unknown): DsPair[] {
  if (!isObj(d) || !Array.isArray(d.pairs)) return []
  return d.pairs.filter(isDsPair)
}

async function jget(url: string, ms = 10000): Promise<unknown> {
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
function toRow(p: DsPair): LiveRow | null {
  const price = parseFloat(p.priceUsd ?? '')
  if (!p.baseToken?.symbol || !(price > 0)) return null
  const ct = p.pairCreatedAt || 0
  return {
    symbol: String(p.baseToken.symbol).slice(0, 14),
    chain: (p.chainId && UI_CHAIN[p.chainId]) || p.chainId || 'sol',
    pair: `${(a4 = p.baseToken.address ?? '').slice(0, 4)}…${a4.slice(-4)} / ${p.quoteToken?.symbol ?? '?'}`,
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

/* Trending: per-chain balanced. Boost addresses grouped by chainId; a chain
   with no boost coverage falls back to native-asset search (SOL/BNB/ETH/HYPE)
   so EVERY target chain always contributes its top-3 deepest pairs. */
export async function fetchTrending(): Promise<LiveRow[] | null> {
  const boosts = await jget(`${BASE}/token-boosts/top/v1`)
  const byChain: Record<string, string[]> = {}
  if (isBoostArray(boosts)) for (const b of boosts) {
    const c = b.chainId, a = b.tokenAddress
    if (c && a && UI_CHAIN[c]) (byChain[c] ??= []).push(a)
  }
  const nat: Record<string, string> = { solana: 'SOL', bsc: 'BNB', base: 'ETH', hyperevm: 'HYPE' }
  const lists = await Promise.all(Object.keys(UI_CHAIN).map(async (c) => {
    const addrs = (byChain[c] ?? []).slice(0, 8)
    const d = addrs.length
      ? await jget(`${BASE}/latest/dex/tokens/${addrs.join(',')}`)
      : await jget(`${BASE}/latest/dex/search?q=${encodeURIComponent(nat[c] ?? c)}`)
    const ps = pairsOf(d).filter((p) => p.chainId === c)
    return ps.map(toRow).filter((r): r is LiveRow => r !== null).sort((a, b) => b.liq - a.liq).slice(0, 3)
  }))
  const rows = dedupe(lists.flat(), 12)
  return rows.length ? rows : null
}
/* ── Chain cards v2: native wrapper contracts, probed live 2026-08-28 ───
   /tokens/{wrapper} beats symbol search: search returns wrapped cross-chain
   fakes (BNB "on solana", liq $721M). HYPE's deepest pair is USDC/WHYPE —
   wrapper as QUOTE, so price = base.priceUsd / priceNative (inverted); a
   null /tokens answer falls back to the fb symbol search, same chain only. */
const NATIVE: Array<{ cid: string; addr: string; sym: string; fb: string[] }> = [
  { cid: 'solana',    addr: 'So11111111111111111111111111111111111111112', sym: 'SOL',  fb: [] },
  { cid: 'bsc',       addr: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', sym: 'BNB',  fb: [] },
  { cid: 'base',      addr: '0x4200000000000000000000000000000000000006', sym: 'ETH',  fb: [] },
  { cid: 'hyperevm',  addr: '0x5555555555555555555555555555555555555555', sym: 'HYPE', fb: [] },
]

function nativeFromPair(p: DsPair, cid: string, addr: string, sym: string): LiveRow | null {
  const b = p.baseToken, q = p.quoteToken
  if (!b?.address || !q?.address || p.chainId !== cid) return null
  const al = addr.toLowerCase()
  const baseIs = b.address.toLowerCase() === al
  if (!baseIs && q.address.toLowerCase() !== al) return null
  const pu = parseFloat(p.priceUsd ?? ''), pn = parseFloat(p.priceNative ?? '')
  if (!isFinite(pu) || !isFinite(pn) || pn === 0) return null
  const price = baseIs ? pu : pu / pn // wrapper-as-quote: invert the base rate
  // pair priceChange tracks the base token; negate when wrapper is quote
  const chg = (baseIs ? 1 : -1) * (p.priceChange?.h24 ?? 0)
  const r = toRow(p); if (!r) return null
  return { ...r, symbol: sym, pair: `${baseIs ? b.symbol : q.symbol}/${baseIs ? q.symbol : b.symbol}`, price, chg }
}

export async function fetchChainTickers(): Promise<LiveRow[] | null> {
  const lists = await Promise.all(NATIVE.map(async ({ cid, addr, sym, fb }) => {
    try {
      const d = await jget(`${BASE}/latest/dex/tokens/${addr}`)
      const ps = pairsOf(d).filter((x) => x.chainId === cid)
      const cand = ps.map((x) => nativeFromPair(x, cid, addr, sym)).filter((r): r is LiveRow => r !== null)
      if (cand.length) return cand.sort((a, b) => b.liq - a.liq)[0]
      for (const q of fb) { // honest fallback: same wrapper contract via search
        const sr = await jget(`${BASE}/latest/dex/search?q=${q}`)
        const sp = pairsOf(sr).filter((x) => x.chainId === cid)
          .map((x) => nativeFromPair(x, cid, addr, sym)).filter((r): r is LiveRow => r !== null)
        if (sp.length) return sp.sort((a, b) => b.liq - a.liq)[0]
      }
      return null
    } catch { return null }
  }))
  const rows = lists.filter((r): r is LiveRow => r !== null)
  return rows.length ? rows : null
}

/* ── Swap quote (UI-3): a REAL pair rate, never a mock echo ─────────────
   Returns the deepest pair for a token on a chain, preferring a pair whose
   quote is the chain's native wrapper so the rail can read "1 native = N
   token" straight from priceNative. priceUsd rides along for the USD line.
   null = no pair / no finite rate → the caller shows an honest reason. */
export interface SwapQuote {
  token: string
  quote: string
  priceNative: number
  priceUsd: number | null
  url: string
  dexId: string
  liq: number
  /* PROMPT-V Fase 4 (2026-08-30, additive): real pair facts for the token
     page panels — verbatim from the same deepest pair the quote came from. */
  change?: { m5?: number | null; h1?: number | null; h6?: number | null; h24?: number | null } | null
  pairCreatedAt?: number | null
  marketCap?: number | null
  vol24?: number | null
  txns24?: { buys?: number; sells?: number } | null
  tokenAddress?: string | null
  tokenName?: string | null
  logoUrl?: string | null
}

const SWAP_DS_CHAIN: Record<string, string> = {
  sol: 'solana', bnb: 'bsc', base: 'base', hood: 'robinhood', hype: 'hyperevm',
}
const SWAP_WRAP: Record<string, string[]> = {
  solana: ['SOL', 'WSOL'], bsc: ['WBNB', 'BNB'], base: ['WETH', 'ETH'],
  robinhood: ['WETH', 'ETH'], hyperevm: ['WHYPE', 'HYPE'],
}

export async function fetchSwapQuote(chain: string, address: string): Promise<SwapQuote | null> {
  const cid = SWAP_DS_CHAIN[chain]
  if (!cid || !address) return null
  const d = await jget(`${BASE}/latest/dex/tokens/${address}`)
  const ps = pairsOf(d).filter((p) => p.chainId === cid)
  if (!ps.length) return null
  const wraps = SWAP_WRAP[cid] ?? []
  const withLiq = ps.map((p) => ({ p, liq: p.liquidity?.usd ?? 0 }))
  const native = withLiq.filter((x) => wraps.includes(String(x.p.quoteToken?.symbol ?? '')))
  const pool = native.length ? native : withLiq
  pool.sort((a, b) => b.liq - a.liq)
  const pick = pool[0]
  const pn = parseFloat(pick.p.priceNative ?? '')
  if (!isFinite(pn) || pn <= 0) return null
  return {
    token: String(pick.p.baseToken?.symbol ?? '?'),
    quote: String(pick.p.quoteToken?.symbol ?? '?'),
    priceNative: pn,
    priceUsd: parseFloat(pick.p.priceUsd ?? '') || null,
    url: pick.p.url ?? '',
    dexId: pick.p.dexId ?? '?',
    liq: pick.liq,
    change: pick.p.priceChange ?? null,
    pairCreatedAt: pick.p.pairCreatedAt ?? null,
    marketCap: pick.p.marketCap ?? null,
    vol24: pick.p.volume?.h24 ?? null,
    txns24: pick.p.txns?.h24 ?? null,
    tokenAddress: pick.p.baseToken?.address ?? null,
    tokenName: pick.p.baseToken?.name ?? null,
    logoUrl: pick.p.info?.imageUrl ?? null,
  }
}

/* ── Contract shared with the Scanner UI ────────────────────────────────
   risk/spark are null on live rows until the deterministic engine has
   actually assessed the token (per-row /api/scan, phase 2). UI must render
   "n/a" — never a made-up number. */
export interface ScannerRow {
  symbol: string; chain: string; pair: string; price: number; chg: number;
  liq: number; vol: number; risk: number | null; age: string; spark: number | null;
  url?: string;
  mock?: boolean  // set on frozen/fallback rows — fake data must never pass for live
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
