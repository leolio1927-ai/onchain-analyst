/* Chain metadata for the landing globe/cards — lives outside the visuals
   module so it can be imported without pulling canvas components into
   fast-refresh scope (one export kind per file).
   All six founder-locked chains are LIVE on the GeckoTerminal feed
   (stage-0 verified 2026-08-29, providers/live.py CHAINS): the network_id
   slugs below mirror that file exactly — no chain invented, none hidden. */

export interface NetChain { id: string; label: string; color: string; live: boolean; stats: string }

export const NET_CHAINS: NetChain[] = [
  { id: 'sol', label: 'SOLANA', color: '#8dffcf', live: true, stats: 'network_id: solana · keyless live feed' },
  { id: 'bnb', label: 'BNB CHAIN', color: '#ffd98a', live: true, stats: 'network_id: bsc · keyless live feed' },
  { id: 'base', label: 'BASE', color: '#93c5fd', live: true, stats: 'network_id: base · keyless live feed' },
  { id: 'hype', label: 'HYPEREVM', color: '#cbb8ff', live: true, stats: 'network_id: hyperevm · keyless live feed' },
  { id: 'hood', label: 'ROBINHOOD CHAIN', color: '#7dff9e', live: true, stats: 'network_id: robinhood · keyless live feed' },
  { id: 'avax', label: 'AVALANCHE', color: '#ffabab', live: true, stats: 'network_id: avax · keyless live feed' },
]
