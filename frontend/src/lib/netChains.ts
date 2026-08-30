/* Chain metadata for the landing globe/cards — lives outside the visuals
   module so it can be imported without pulling canvas components into
   fast-refresh scope (one export kind per file).
   All five founder-locked chains are LIVE on the GeckoTerminal feed (avax parked 2026-08-30)
   (stage-0 verified 2026-08-29, providers/live.py CHAINS): the network_id
   slugs below mirror that file exactly — no chain invented, none hidden.
   NET_CHAINS is `as const` on purpose: ChainId is the literal id union, so
   NODE_LL/ARCS/colorOf below reject a parked id at compile time. */

export const NET_CHAINS = [
  { id: 'sol', label: 'SOLANA', color: '#8dffcf', live: true, stats: 'network_id: solana · keyless live feed' },
  { id: 'bnb', label: 'BNB CHAIN', color: '#ffd98a', live: true, stats: 'network_id: bsc · keyless live feed' },
  { id: 'base', label: 'BASE', color: '#93c5fd', live: true, stats: 'network_id: base · keyless live feed' },
  { id: 'hype', label: 'HYPEREVM', color: '#cbb8ff', live: true, stats: 'network_id: hyperevm · keyless live feed' },
  { id: 'hood', label: 'ROBINHOOD CHAIN', color: '#7dff9e', live: true, stats: 'network_id: robinhood · keyless live feed' },
  // { id: 'avax', ... } parked 2026-08-30 (founder: 5-chain lineup)
] as const

export type ChainId = (typeof NET_CHAINS)[number]['id']

export interface NetChain { id: ChainId; label: string; color: string; live: boolean; stats: string }

/* id → founder accent. Lookups go through this record (never NET_CHAINS.find()
   + non-null assertion): a parked id is a type error here, not a frame-0 throw. */
export const colorOf = Object.fromEntries(NET_CHAINS.map((c) => [c.id, c.color])) as Record<ChainId, string>

/* Globe geometry (landing S7): lat/lon per chain + great-circle arcs.
   Record<ChainId, …> demands EVERY live id and forbids any parked one —
   the two arc slots freed by the parked chain moved to base↔hype and
   hood↔base so the five-chain globe keeps its density. */
export const NODE_LL: Record<ChainId, [number, number]> = {
  sol: [0.38, 0.7], bnb: [-0.2, 2.6], base: [0.55, 4.4], hype: [-0.55, 5.5], hood: [-0.42, 1.6],
}
export const ARCS: [ChainId, ChainId][] = [
  ['sol', 'bnb'], ['bnb', 'base'], ['base', 'sol'], ['sol', 'hype'], ['base', 'hype'],
  ['hood', 'sol'], ['hood', 'bnb'], ['hood', 'base'], ['hype', 'hood'],
]
