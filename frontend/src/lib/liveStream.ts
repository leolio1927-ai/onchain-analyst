/* LiveStream — real-time feed over the backend /ws/snap WebSocket (B4b).
   Every number comes from the server Snap proven live in B4a; nothing is simulated.
   Fresh tokens may carry null px/chg/risk — passed through as-is, never zero-filled. */
import { CHAINS as API_CHAINS } from '../api'

export interface TokenTick {
  sym: string
  chain: 'SOL' | 'BNB' | 'BASE' | 'HOOD'
  address?: string
  px: number | null
  chg: number | null
  risk: number | null
  ts?: string
}

export type FeedEvent =
  | { kind: 'SCAN'; sym: string; chain: string; risk: number }
  | { kind: 'RUG'; sym: string; chain: string; risk: number }
  | { kind: 'SAFE'; sym: string; chain: string; risk: number }
  | { kind: 'WHALE'; usd: number; wallet: string }
  | { kind: 'LOCK'; sym: string; pct: number }

/* WHALE/LOCK stay in the union (landing.tsx view() is exhaustive over it),
   but the backend does not produce them yet — no event is ever fabricated. */

/* Gate mirrors the backend chain allowlist — api.ts is the single source of
   truth; the server emits uppercase chain keys in every tick. */
const CHAINS: readonly string[] = API_CHAINS.map((c) => c.toUpperCase())
type Listener = (e: FeedEvent, ticks: TokenTick[]) => void

const listeners = new Set<Listener>()
let ws: WebSocket | null = null
let backoff = 1000
let reconnectTimer = 0

/* First-sight / rescan gate: emit only when a token is new to this session
   or its server ts changed (a real rescan). Otherwise stay silent. */
const seen = new Map<string, string | undefined>()

interface Snap {
  now: string
  scans: number
  uptime_s: number
  clients: number
  ticks: TokenTick[]
}

function eventOf(t: TokenTick): FeedEvent | null {
  const key = t.address || t.sym
  if (seen.has(key) && seen.get(key) === t.ts) return null
  seen.set(key, t.ts)
  // cap the session map — a long-lived feed must not grow without bound
  if (seen.size > 200) {
    const oldest = seen.keys().next().value
    if (oldest !== undefined) seen.delete(oldest)
  }
  if (t.risk == null) return null
  if (t.risk >= 70) return { kind: 'RUG', sym: t.sym, chain: t.chain, risk: t.risk }
  if (t.risk <= 40) return { kind: 'SAFE', sym: t.sym, chain: t.chain, risk: t.risk }
  return { kind: 'SCAN', sym: t.sym, chain: t.chain, risk: t.risk }
}

function connect() {
  if (ws) return
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/snap`
  ws = new WebSocket(url)
  ws.onopen = () => { backoff = 1000 }
  ws.onmessage = (msg) => {
    let snap: Snap
    try { snap = JSON.parse(String(msg.data)) as Snap } catch { return }
    if (!snap || !Array.isArray(snap.ticks)) return
    lastSnap = snap
    const ticks: TokenTick[] = snap.ticks.filter((t) => CHAINS.includes(t.chain)).map((t) => ({ ...t }))
    snap.ticks.forEach((t) => {
      const e = eventOf(t)
      if (e) listeners.forEach((fn) => fn(e, ticks))
    })
  }
  ws.onclose = () => {
    ws = null
    if (listeners.size > 0 && reconnectTimer === 0) {
      reconnectTimer = window.setTimeout(() => { reconnectTimer = 0; connect() }, backoff)
      backoff = Math.min(backoff * 2, 30000)
    }
  }
  ws.onerror = () => ws?.close()
}

let lastSnap: Snap | null = null

export const stream = {
  subscribe(fn: Listener) {
    listeners.add(fn)
    connect()
    return () => {
      listeners.delete(fn)
      if (listeners.size === 0) {
        if (ws) { ws.close(); ws = null }
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = 0 }
      }
    }
  },
  stats() {
    if (!lastSnap) return { scanned: 0, rugs: 0, caught: 0 }
    const rugs = lastSnap.ticks.filter((t) => t.risk != null && t.risk >= 70).length
    const caught = lastSnap.scans > 0 ? Math.round((rugs / lastSnap.scans) * 1000) / 10 : 0
    return { scanned: lastSnap.scans, rugs, caught }
  },
}
