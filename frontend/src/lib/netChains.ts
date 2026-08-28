/* Chain metadata for the landing globe/cards — lives outside the visuals
   module so it can be imported without pulling canvas components into
   fast-refresh scope (one export kind per file). */

export interface NetChain { id: string; label: string; color: string; live: boolean; stats: string }

export const NET_CHAINS: NetChain[] = [
  { id: 'sol', label: 'SOLANA', color: '#8dffcf', live: true, stats: '1,900+ pairs indexed · live scanning' },
  { id: 'bnb', label: 'BNB CHAIN', color: '#ffd98a', live: true, stats: 'PancakeSwap pools · live scanning' },
  { id: 'base', label: 'BASE', color: '#93c5fd', live: true, stats: 'Aerodrome pools · live scanning' },
  { id: 'hype', label: 'HYPEREVM', color: '#cbb8ff', live: false, stats: 'chainId pending verification — honest by policy' },
  { id: 'avax', label: 'AVALANCHE', color: '#ffabab', live: true, stats: 'TraderJoe pools · live scanning' },
]
