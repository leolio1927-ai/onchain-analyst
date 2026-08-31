/* Wallet registry (PROMPT-V Fase 2, 2026-08-30) — ADDRESS-ONLY by law.
   This is a READ-ONLY BUILD: detect() answers false without ever touching a
   browser extension global, and connect() always throws ReadOnlyBuildError.
   enable with founder approval when execution lands
   The mock wallet below is the only connect path in this build: it yields a
   deterministic per-provider address + demo balances, makes ZERO network
   requests, and never asks for a signature. No wallet library of any kind is
   imported and no extension global is referenced — the PROMPT-V grep gate
   audits those bans by name in the report. */
import type { LiveChain } from '../lib/liveApi'
import { LIVE_CHAINS } from '../lib/liveApi'

export type ChainFam = 'solana' | 'evm'

export interface WalletProvider {
  id: string
  label: string
  chainFam: ChainFam
  detect(): boolean
  connect(): Promise<{ address: string }>
  disconnect(): void
}

export class ReadOnlyBuildError extends Error {
  readonly code = 'READ_ONLY_BUILD'
  constructor(provider: string) {
    super(`${provider}: this terminal is read-only — wallet connection is disabled in this build`)
    this.name = 'ReadOnlyBuildError'
  }
}

function stubProvider(id: string, label: string, chainFam: ChainFam): WalletProvider {
  return {
    id,
    label,
    chainFam,
    detect: () => false,
    connect: () => Promise.reject(new ReadOnlyBuildError(label)),
    disconnect: () => { /* no session exists in a read-only build */ },
  }
}

export const REGISTRY: WalletProvider[] = [
  stubProvider('phantom', 'Phantom', 'solana'),
  stubProvider('solflare', 'Solflare', 'solana'),
  stubProvider('backpack', 'Backpack', 'solana'),
  stubProvider('metamask', 'MetaMask', 'evm'),
  stubProvider('trustwallet', 'Trust Wallet', 'evm'),
]

/* ── deterministic mock identities (preview-only, labeled everywhere) ───── */

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rng(seed: number): () => number {
  let s = seed || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

/* valid-SHAPE addresses: base58 (44) for solana fam, 0x+40hex for evm */
export function mockAddress(providerId: string, fam: ChainFam): string {
  const r = rng(hash32(`vilmei:addr:${providerId}`))
  if (fam === 'evm') {
    let hex = ''
    for (let i = 0; i < 40; i++) hex += Math.floor(r() * 16).toString(16)
    return `0x${hex}`
  }
  let out = ''
  for (let i = 0; i < 44; i++) out += B58[Math.floor(r() * B58.length)]
  return out
}

/* demo balances: one deterministic number per (wallet, chain) — the SAME
   number feeds the header chip and the swap rail (single source, Fase 1.2) */
export function demoBalance(providerId: string, chain: LiveChain): number {
  const r = rng(hash32(`vilmei:bal:${providerId}:${chain}`))
  if (chain === 'sol') return Math.round((0.5 + r() * 6) * 1000) / 1000
  return Math.round((0.2 + r() * 2.5) * 1000) / 1000
}

/* demo TOKEN balance for the swap side (SELL): seeded by wallet+token CA so
   it is stable per identity, never random per render */
export function demoTokenBalance(providerId: string, tokenAddress: string): number {
  const r = rng(hash32(`vilmei:tok:${providerId}:${tokenAddress}`))
  return Math.round((1000 + r() * 900000) * 100) / 100
}

export interface WalletSession {
  providerId: string
  label: string
  chainFam: ChainFam
  address: string
  balances: Record<LiveChain, number>
  /* M2: 'live' = a real extension returned this public address (EIP-6963 /
     Wallet Standard, address-only); 'mock' = deterministic demo identity.
     Pre-M2 persisted sessions carry no kind and read back as 'mock'. */
  kind: 'mock' | 'live'
  rdns?: string
}

export function connectMock(provider: WalletProvider): WalletSession {
  const address = mockAddress(provider.id, provider.chainFam)
  const balances = {} as Record<LiveChain, number>
  for (const c of LIVE_CHAINS) balances[c] = demoBalance(provider.id, c)
  return { providerId: provider.id, label: provider.label, chainFam: provider.chainFam, address, balances, kind: 'mock' }
}

export const MOCK_TOOLTIP = 'mock — preview only'
export const WALLET_LABEL = 'DEMO WALLET'
