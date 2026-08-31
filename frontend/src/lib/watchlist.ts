/* PROMPT-V4 M4 — the account-less watchlist (VM-102). Up to 15 tokens across
   the five live chains persist in THIS browser only (vilmei.watchlist): no
   account, no keys, no server session. Positions (amounts) are typed by the
   user and never leave the machine; the server answers only market facts
   (/api/v1/portfolio/snapshot). Dep-free pub-sub via useSyncExternalStore,
   same shape as lib/tokenStore.ts. */
import { useSyncExternalStore } from 'react'
import type { LiveChain } from './liveApi'
import { LIVE_CHAINS } from './liveApi'

export interface WatchItem {
  chain: LiveChain
  token: string
  symbol?: string
  amount?: number
}

export const WATCH_CAP = 15
const KEY = 'vilmei.watchlist'

function isChain(c: string): c is LiveChain {
  return (LIVE_CHAINS as readonly string[]).includes(c)
}

function load(): WatchItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    const arr = raw ? (JSON.parse(raw) as WatchItem[]) : []
    if (!Array.isArray(arr)) return []
    return arr
      .filter((w) => w && isChain(w.chain) && typeof w.token === 'string' && w.token.length > 0)
      .slice(0, WATCH_CAP)
  } catch { return [] }
}

function persist(list: WatchItem[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* storage full/blocked — the watchlist is a nicety, never a crash */ }
}

let items: WatchItem[] = load()
const listeners = new Set<() => void>()

function commit(next: WatchItem[]): void {
  items = next
  persist(items)
  for (const l of listeners) l()
}

export function getWatchlist(): WatchItem[] {
  return items
}

export type AddResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-chain' | 'empty-token' | 'duplicate' | 'cap' }

export function addWatchItem(chain: string, token: string, symbol?: string): AddResult {
  if (!isChain(chain)) return { ok: false, reason: 'invalid-chain' }
  const t = token.trim()
  if (!t) return { ok: false, reason: 'empty-token' }
  if (items.some((w) => w.chain === chain && w.token === t)) return { ok: false, reason: 'duplicate' }
  if (items.length >= WATCH_CAP) return { ok: false, reason: 'cap' }
  const entry: WatchItem = { chain, token: t }
  if (symbol && symbol.trim()) entry.symbol = symbol.trim()
  commit([...items, entry])
  return { ok: true }
}

export function removeWatchItem(chain: LiveChain, token: string): void {
  commit(items.filter((w) => !(w.chain === chain && w.token === token)))
}

/* amount <= 0 / NaN / undefined clears the position — a blank position is an
   honest state (its value renders "–"), never a zero. */
export function setWatchAmount(chain: LiveChain, token: string, amount: number | undefined): void {
  commit(items.map((w) => {
    if (w.chain !== chain || w.token !== token) return w
    const next: WatchItem = { chain: w.chain, token: w.token }
    if (w.symbol !== undefined) next.symbol = w.symbol
    if (amount !== undefined && Number.isFinite(amount) && amount > 0) next.amount = amount
    return next
  }))
}

export function clearWatchlist(): void {
  commit([])
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function useWatchlist(): WatchItem[] {
  return useSyncExternalStore(subscribe, getWatchlist)
}
