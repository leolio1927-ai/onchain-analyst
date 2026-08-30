/* Mock dataset for the institutional dashboard.
   EVERY number here is FAKE but shaped like real output. Swap dataService → apiService
   later without touching any component (same interfaces). */
import { CHAINS as API_CHAINS, CHAIN_LABEL } from '../api'

export interface ChainInfo {
  id: string
  label: string
  color: string
  live: boolean
}

/* Single source of truth is the backend chain allowlist via api.ts — the mock
   layer only decorates it with colors and never invents its own chain list. */
const CHAIN_COLOR: Record<string, string> = {
  sol: '#22d3ee', bnb: '#fbbf24', base: '#3b82f6',
}

export const CHAINS: ChainInfo[] = API_CHAINS.map((id) => ({
  id, label: CHAIN_LABEL[id], color: CHAIN_COLOR[id] ?? '#8a91b4', live: true,
}))

export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }

export interface RugCheckItem { label: string; value: string; ok: boolean | 'warn' }

export interface WhaleTx {
  wallet: string
  action: 'Buy' | 'Sell'
  usd: number
  time: string
  chain: string
}

export interface Cluster {
  id: number
  label: string
  wallets: number
  sharePct: number
  color: string
  nodes: { x: number; y: number; r: number }[]
}

export interface TokenData {
  address: string
  symbol: string
  name: string
  chain: string
  dex: string
  tag: 'MEME' | 'DEGEN' | 'NEW'
  price: number
  change24h: number
  liquidity: number
  fdv: number
  marketCap: number
  volume24h: number
  volumeChange: number
  txns24h: number
  txnsChange: number
  buySell: [number, number]
  holders: number
  holdersChange: number
  top10Pct: number
  age: string
  liquidityLock: string
  liquidityLockPct: number
  candles: Candle[]
  risk: { score: number; level: 'LOW RISK' | 'MEDIUM RISK' | 'HIGH RISK'; radar: number[] }
  rugCheck: { items: RugCheckItem[]; score: number }
  clusters: { risk: number; groups: Cluster[] }
  whales: WhaleTx[]
  ai: {
    mode: 'FREE' | 'DEEP'
    assessment: { level: string; score: number; paragraph: string; concerns: string }
    insights: string[]
    recommendation: string[]
    levels: { support: string; resistance: string; note: string }
  }
}

/* deterministic PRNG so every reload looks identical (institutional stability) */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function genCandles(seed: number, base: number, n = 96): Candle[] {
  const r = rng(seed)
  const out: Candle[] = []
  let p = base / (1 + 0.245)
  const now = Date.now()
  for (let i = 0; i < n; i++) {
    const drift = i > n * 0.55 ? 0.0045 : i > n * 0.3 ? -0.0015 : 0.0006
    const o = p
    const c = Math.max(base * 0.55, o * (1 + drift + (r() - 0.5) * 0.02))
    const h = Math.max(o, c) * (1 + r() * 0.012)
    const l = Math.min(o, c) * (1 - r() * 0.012)
    const v = 40_000 + r() * 260_000 * (i > n * 0.6 ? 1.8 : 1)
    out.push({ t: now - (n - i) * 15 * 60_000, o, h, l, c, v })
    p = c
  }
  // pin the last close to the advertised price
  out[out.length - 1].c = base
  return out
}

export const MEMEATCHI: TokenData = {
  address: '7xKXt…pump',
  symbol: '$MEMEATCHI',
  name: 'Memeatchi',
  chain: 'sol',
  dex: 'Pump.fun',
  tag: 'MEME',
  price: 0.0001423,
  change24h: 24.58,
  liquidity: 142_300,
  fdv: 1_420_000,
  marketCap: 1_420_000,
  volume24h: 3_420_000,
  volumeChange: 127.5,
  txns24h: 8_428,
  txnsChange: 156.3,
  buySell: [63, 37],
  holders: 2_843,
  holdersChange: 23.1,
  top10Pct: 22.43,
  age: '2d 14h',
  liquidityLock: '98.6%',
  liquidityLockPct: 98.6,
  candles: genCandles(42, 0.0001423),
  risk: { score: 68, level: 'MEDIUM RISK', radar: [0.78, 0.42, 0.55, 0.83, 0.61] },
  rugCheck: {
    score: 72,
    items: [
      { label: 'Liquidity Locked', value: 'Yes (98.6%)', ok: true },
      { label: 'Liquidity Lock Time', value: '364 days', ok: true },
      { label: 'Top 10 Holders', value: '22.43%', ok: 'warn' },
      { label: 'Ownership Renounced', value: 'Yes', ok: true },
      { label: 'Mint Authority', value: 'No', ok: false },
      { label: 'Freeze Authority', value: 'No', ok: false },
      { label: 'Honeypot Check', value: 'Clean', ok: true },
    ],
  },
  clusters: {
    risk: 64,
    groups: [
      { id: 1, label: 'Cluster 1', wallets: 15, sharePct: 42.3, color: '#a78bfa', nodes: [] },
      { id: 2, label: 'Cluster 2', wallets: 8, sharePct: 18.7, color: '#fb923c', nodes: [] },
      { id: 3, label: 'Cluster 3', wallets: 6, sharePct: 11.2, color: '#22d3ee', nodes: [] },
      { id: 4, label: 'Others', wallets: 23, sharePct: 27.8, color: '#34d399', nodes: [] },
    ],
  },
  whales: [
    { wallet: '7xKX…pump', action: 'Buy', usd: 125_300, time: '2m', chain: 'sol' },
    { wallet: 'GvR5…ysA8', action: 'Buy', usd: 98_700, time: '11m', chain: 'sol' },
    { wallet: '9hJ2…Lk3m', action: 'Sell', usd: 76_200, time: '19m', chain: 'sol' },
    { wallet: 'B2q7…mnO9', action: 'Buy', usd: 55_100, time: '27m', chain: 'sol' },
    { wallet: '8kL1…aPz2', action: 'Buy', usd: 43_800, time: '34m', chain: 'sol' },
    { wallet: 'Qm4T…vX8d', action: 'Sell', usd: 31_400, time: '51m', chain: 'sol' },
  ],
  ai: {
    mode: 'DEEP',
    assessment: {
      level: 'MEDIUM RISK',
      score: 68,
      paragraph:
        'This token presents MEDIUM RISK (68/100). Key strengths: Liquidity is locked, ownership renounced, and no malicious mint/freeze authority detected.',
      concerns:
        'Key concerns: High wallet clustering detected in early trading pattern, top 10 holders concentration slightly above average.',
    },
    insights: [
      '3 clusters detected in first 2 hours after launch',
      'Cluster 1 controls 42.3% (15 wallets)',
      'Coordinated buying pattern observed',
      'Volume spikes align with cluster activity',
      'Liquidity appears healthy with good lock duration',
    ],
    recommendation: [
      'Proceed with caution. Monitor these key levels:',
      'Support: $0.000125',
      'Resistance: $0.000158',
      'Watch for: Unusual whale movements',
    ],
    levels: { support: '$0.000125', resistance: '$0.000158', note: 'Unusual whale movements' },
  },
}

export const SCANNER_ROWS = [
  { symbol: '$MEMEATCHI', chain: 'sol', pair: '7xKX…pump / SOL', price: 0.0001423, chg: 24.58, liq: 142_300, vol: 3_420_000, risk: 68, age: '2d', spark: 42 },
  { symbol: 'WOJAK2.0', chain: 'sol', pair: 'Fg9H…bond / SOL', price: 0.00000871, chg: -12.4, liq: 61_200, vol: 890_000, risk: 81, age: '9h', spark: 7 },
  { symbol: 'PEPEKING', chain: 'bnb', pair: '0x3a…d91f / WBNB', price: 0.00000031, chg: 41.2, liq: 88_400, vol: 1_240_000, risk: 57, age: '1d 3h', spark: 91 },
  { symbol: 'BASEDGOD', chain: 'base', pair: '0x91…c04a / ETH', price: 0.0000412, chg: 8.9, liq: 231_000, vol: 2_100_000, risk: 34, age: '5d 6h', spark: 66 },
  { symbol: 'HYPERCAT', chain: 'hype', pair: '0xfe…11aa / WHYPE', price: 0.0000917, chg: 63.7, liq: 19_900, vol: 640_000, risk: 88, age: '4h', spark: 99 },
  { symbol: 'MOONBOI', chain: 'sol', pair: 'Kk2P…moon / SOL', price: 0.0000210, chg: 5.2, liq: 77_700, vol: 980_000, risk: 49, age: '1d 18h', spark: 55 },
]

export const ALERTS = [
  { sev: 'HIGH', title: 'Cluster formation detected', body: '$MEMEATCHI — 3 clusters formed within 2h of launch (42.3% supply).', time: '2m', unread: true },
  { sev: 'MED', title: 'Whale accumulation', body: 'GvR5…ysA8 bought $98.7K in 3 tranches over 11 minutes.', time: '11m', unread: true },
  { sev: 'LOW', title: 'Liquidity added', body: 'BASEDGOD liquidity +$42K (total $231K, lock 180d).', time: '1h', unread: true },
  { sev: 'HIGH', title: 'Top holder movement', body: 'WOJAK2.0 — top-1 holder moved 6.2% supply to CEX.', time: '2h', unread: false },
  { sev: 'MED', title: 'Volume anomaly', body: 'PEPEKING vol/liq ratio 14x — wash-trading pattern suspected.', time: '3h', unread: false },
  { sev: 'LOW', title: 'New listing', body: 'HYPERCAT (HyperEVM) appeared on scanner — risk 88/100.', time: '5h', unread: false },
]

export const PORTFOLIO = [
  { symbol: '$MEMEATCHI', chain: 'sol', amount: 12_500_000, value: 1_778.75, chg: 24.58, risk: 68, spark: 42 },
  { symbol: 'BASEDGOD', chain: 'base', amount: 8_100_000, value: 333.72, chg: 8.9, risk: 34, spark: 66 },
  { symbol: 'PEPEKING', chain: 'bnb', amount: 900_000_000, value: 279.0, chg: 41.2, risk: 57, spark: 91 },
  { symbol: 'MOONBOI', chain: 'sol', amount: 21_000_000, value: 441.0, chg: 5.2, risk: 49, spark: 55 },
]

export const WHALES_TOP = [
  { wallet: '7xKX…pump', chain: 'sol', bought24h: 318_400, sold24h: 0, net: 318_400, tokens: 6 },
  { wallet: 'GvR5…ysA8', chain: 'sol', bought24h: 98_700, sold24h: 0, net: 98_700, tokens: 3 },
  { wallet: '9hJ2…Lk3m', chain: 'bnb', bought24h: 12_000, sold24h: 88_200, net: -76_200, tokens: 4 },
  { wallet: 'B2q7…mnO9', chain: 'base', bought24h: 55_100, sold24h: 0, net: 55_100, tokens: 2 },
  { wallet: 'Qm4T…vX8d', chain: 'sol', bought24h: 5_000, sold24h: 36_400, net: -31_400, tokens: 5 },
]

export const SYSTEM_STATUS = [
  { name: 'API Connection', state: 'Healthy', ok: true },
  { name: 'Data Indexing', state: 'Live', ok: true },
  { name: 'AI Services', state: 'Online', ok: true },
  { name: 'Alert System', state: 'Active', ok: true },
]

export function buildClusters(seed: number) {
  const r = rng(seed)
  const centers = MEMEATCHI.clusters.groups.map((_g, gi) => ({
    x: 0.22 + gi * 0.19 + (r() - 0.5) * 0.06,
    y: 0.3 + (gi % 2 === 0 ? 0.16 : -0.14) + (r() - 0.5) * 0.08,
  }))
  return MEMEATCHI.clusters.groups.map((g, gi) => {
    const nodes = Array.from({ length: g.wallets }, () => ({
      x: Math.min(0.96, Math.max(0.04, centers[gi].x + (r() - 0.5) * 0.17)),
      y: Math.min(0.94, Math.max(0.05, centers[gi].y + (r() - 0.5) * 0.34)),
      r: 2.4 + r() * 4.2,
    }))
    return { ...g, nodes }
  })
}
