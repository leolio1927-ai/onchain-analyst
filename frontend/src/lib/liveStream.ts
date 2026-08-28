/* LiveEngine — simulated real-time market stream (backend swap point).
   Nanti tinggal ganti `startPolling()` dengan `new WebSocket(...)`
   dan emit event yang sama; semua komponen konsumen tidak berubah. */

export interface TokenTick {
  sym: string
  chain: 'SOL' | 'BNB' | 'BASE' | 'HYPE' | 'AVAX'
  px: number
  chg: number
  risk: number
}

export type FeedEvent =
  | { kind: 'SCAN'; sym: string; chain: string; risk: number }
  | { kind: 'RUG'; sym: string; chain: string; risk: number }
  | { kind: 'SAFE'; sym: string; chain: string; risk: number }
  | { kind: 'WHALE'; usd: number; wallet: string }
  | { kind: 'LOCK'; sym: string; pct: number }

const POOL: TokenTick[] = [
  { sym: '$MEMEATCHI', chain: 'SOL', px: 0.0042, chg: 24.6, risk: 68 },
  { sym: 'PEPEKING', chain: 'BNB', px: 0.0311, chg: 41.2, risk: 57 },
  { sym: 'BASEDGOD', chain: 'BASE', px: 0.0018, chg: 8.9, risk: 34 },
  { sym: 'WOJAK2.0', chain: 'SOL', px: 0.0009, chg: -12.4, risk: 81 },
  { sym: 'SNOWBALL', chain: 'AVAX', px: 0.0204, chg: -3.1, risk: 72 },
  { sym: 'MOONBOI', chain: 'SOL', px: 0.0067, chg: 5.2, risk: 49 },
  { sym: 'HYPERCAT', chain: 'HYPE', px: 0.0145, chg: 63.7, risk: 88 },
  { sym: 'GRINDBOG', chain: 'BASE', px: 0.0021, chg: -7.7, risk: 41 },
  { sym: '$LABUBU9', chain: 'BNB', px: 0.0089, chg: 12.1, risk: 63 },
  { sym: 'FROGZILLA', chain: 'SOL', px: 0.0033, chg: 33.4, risk: 76 },
]

const CHAIN_OF = { SOL: '7xKX…pump', BNB: '0x8f…3a2c', BASE: '0x41…9dE1', HYPE: '0x77…b2F0', AVAX: '0x3c…7a88' }

const listeners = new Set<(e: FeedEvent, ticks: TokenTick[]) => void>()
const state = { scanned: 12847, rugs: 12608, interval: 0 }

function rand(n: number) { return (Math.random() - 0.5) * 2 * n }

function step(): FeedEvent {
  const t = POOL[(Math.random() * POOL.length) | 0]
  t.px = Math.max(0.0001, t.px * (1 + rand(0.02)))
  t.chg = +(t.chg + rand(1.4)).toFixed(1)
  t.risk = Math.max(4, Math.min(97, t.risk + Math.round(rand(4))))
  state.scanned += 1 + ((Math.random() * 3) | 0)
  if (t.risk >= 70) state.rugs += 1
  const roll = Math.random()
  if (roll < 0.62) return { kind: t.risk >= 70 ? 'RUG' : t.risk <= 40 ? 'SAFE' : 'SCAN', sym: t.sym, chain: t.chain, risk: t.risk }
  if (roll < 0.85) return { kind: 'WHALE', usd: Math.round((4 + Math.random() * 180) * 1000), wallet: CHAIN_OF[t.chain] }
  return { kind: 'LOCK', sym: t.sym, pct: Math.round(90 + Math.random() * 9) }
}

function startPolling() {
  if (state.interval) return
  state.interval = window.setInterval(() => {
    if (document.hidden) return
    const e = step()
    listeners.forEach((fn) => fn(e, POOL.map((t) => ({ ...t }))))
  }, 1800)
}

export const stream = {
  subscribe(fn: (e: FeedEvent, ticks: TokenTick[]) => void) {
    listeners.add(fn)
    startPolling()
    fn({ kind: 'SCAN', sym: POOL[0].sym, chain: POOL[0].chain, risk: POOL[0].risk }, POOL.map((t) => ({ ...t })))
    return () => {
      listeners.delete(fn)
      if (listeners.size === 0) { clearInterval(state.interval); state.interval = 0 }
    }
  },
  stats() {
    return { scanned: state.scanned, rugs: state.rugs, caught: Math.round((state.rugs / state.scanned) * 1000) / 10 }
  },
}
