/* TokenPage identity + selection store (PROMPT-V Fase 1.1/3.1) — the ONE
   source of truth for the active pair. The 2026-08-30 bug class: the rail
   kept its own global BONK default while the header showed the page token.
   Now every surface (header, chart, rail, info, CTA, tabs) reads this store;
   there is no second default anywhere.
   Dep-free pub-sub via useSyncExternalStore; recents persist under the
   vilmei.* localStorage namespace (Fase 3.3 — namespaced for the planned
   settings migration). */
import { useSyncExternalStore } from 'react'
import type { LiveChain } from './liveApi'
import { LIVE_CHAINS } from './liveApi'

export interface ActivePair {
  chain: LiveChain
  tokenAddress: string
  pairAddress?: string | null
  symbol: string
  name?: string | null
  logo?: string | null
  dexId?: string | null
  url?: string | null
  source: 'default' | 'detect' | 'user'
}

/* Verified per-chain default tokens (committed 2026-08-29, SWAP_DEFAULT era):
   BONK (sol), CAKE (bnb), AERO (base), APU (hood). hype has no verified
   default → null → the page renders its honest no-token reason. */
const DEFAULT_TOKEN: Record<LiveChain, { token: string; symbol: string; name: string } | null> = {
  sol: { token: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK', name: 'Bonk' },
  bnb: { token: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', symbol: 'CAKE', name: 'PancakeSwap' },
  base: { token: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', symbol: 'AERO', name: 'Aerodrome' },
  hood: { token: '0x0f03df65dace80e5e727b6c2628889c6d8ea20a6', symbol: 'APU', name: 'Apu' },
  hype: null,
}

export function defaultPair(chain: LiveChain): ActivePair | null {
  const d = DEFAULT_TOKEN[chain]
  return d ? { chain, tokenAddress: d.token, symbol: d.symbol, name: d.name, source: 'default' } : null
}

interface TokenState {
  pair: ActivePair | null
  recents: ActivePair[]
}

const RECENTS_KEY = 'vilmei.recents'
const RECENTS_MAX = 8

/* P7 law: alpha.recents → vilmei.recents migration-once — recents survive
   the rename; the legacy key is removed after the move. */
function migrateRecentsOnce(): void {
  try {
    const legacy = localStorage.getItem('alpha.recents')
    if (legacy !== null) {
      if (localStorage.getItem(RECENTS_KEY) === null) localStorage.setItem(RECENTS_KEY, legacy)
      localStorage.removeItem('alpha.recents')
    }
  } catch { /* storage blocked — recents are a nicety, never a crash */ }
}

function loadRecents(): ActivePair[] {
  migrateRecentsOnce()
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    const arr = raw ? (JSON.parse(raw) as ActivePair[]) : []
    return Array.isArray(arr) ? arr.filter((p) => p && p.tokenAddress && p.symbol) : []
  } catch { return [] }
}

function persistRecents(list: ActivePair[]): void {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list)) } catch { /* storage full/blocked — recents are a nicety, never a crash */ }
}

let state: TokenState = { pair: defaultPair('sol'), recents: loadRecents() }
let generation = 0
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

/* P1 (PROMPT-V2): THE atomic identity mutation — (id, chain, meta, logo)
   commit together or not at all. No consumer may patch the active pair
   field-by-field (the partial-application interleaving that showed one
   token's logo beside another token's meta is structurally impossible
   here). Every commit bumps the generation; async loaders capture it and
   drop any response that lands after a newer commit. */
export function applySwapToken(next: ActivePair): void {
  generation += 1
  setPair(next)
}

export function getGeneration(): number {
  return generation
}

export function setPair(next: ActivePair): void {
  state = {
    pair: next,
    recents: [next, ...state.recents.filter((r) => !(r.chain === next.chain && r.tokenAddress === next.tokenAddress))].slice(0, RECENTS_MAX),
  }
  persistRecents(state.recents)
  emit()
}

export function resetStore(): void {
  state = { pair: defaultPair('sol'), recents: loadRecents() }
  emit()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function useActivePair(): ActivePair | null {
  return useSyncExternalStore(subscribe, () => state.pair)
}

export function useRecents(): ActivePair[] {
  return useSyncExternalStore(subscribe, () => state.recents)
}

export function useTokenGeneration(): number {
  return useSyncExternalStore(subscribe, getGeneration)
}

/* candidate → ActivePair for the search/detect flows */
export function candidateToPair(c: {
  chain: string; symbol: string | null; name: string | null
  token_address: string | null; pair_address: string | null
  dex_id: string | null; url: string | null
  logo?: string | null
}, source: ActivePair['source'] = 'detect'): ActivePair | null {
  if (!c.token_address || !c.symbol) return null
  if (!(LIVE_CHAINS as readonly string[]).includes(c.chain)) return null
  return {
    chain: c.chain as LiveChain,
    tokenAddress: c.token_address,
    pairAddress: c.pair_address,
    symbol: c.symbol,
    name: c.name,
    logo: c.logo ?? null,
    dexId: c.dex_id,
    url: c.url,
    source,
  }
}
