/* User preferences (PROMPT-V2 P5/P7): one localStorage namespace, vilmei.*,
   with a ONE-TIME migration from the legacy alpha.* keys (preserve, then
   remove the old key — migration runs once, evidenced by the test).
   Stored: risk display mode + wallet mock session (address-only, mock). */
import { useSyncExternalStore } from 'react'
import type { LiveChain } from './liveApi'
import { LIVE_CHAINS } from './liveApi'
import type { WalletSession } from '../wallet/registry'

const NS = 'vilmei'
const LEGACY = 'alpha'

type PrefKey = 'risk-mode' | 'wallet-session' | 'holdings-chain'

function key(k: PrefKey): string {
  return `${NS}.${k}`
}

/* P7 law: alpha.* → vilmei.* migration-once. Runs at module init; a legacy
   value is PRESERVED under the new key and the legacy key is removed. */
function migrateOnce(k: PrefKey): void {
  try {
    const legacy = localStorage.getItem(`${LEGACY}.${k}`)
    if (legacy !== null && localStorage.getItem(key(k)) === null) {
      localStorage.setItem(key(k), legacy)
    }
    if (legacy !== null) localStorage.removeItem(`${LEGACY}.${k}`)
  } catch { /* storage blocked — prefs are a nicety, never a crash */ }
}

const listeners = new Set<() => void>()

function read<T>(k: PrefKey, fallback: T): T {
  migrateOnce(k)
  try {
    const raw = localStorage.getItem(key(k))
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function write<T>(k: PrefKey, value: T): void {
  try { localStorage.setItem(key(k), JSON.stringify(value)) } catch { /* ignore */ }
  for (const l of listeners) l()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export type RiskMode = 'dial' | 'tape' | 'field' | 'log'
const RISK_MODES: RiskMode[] = ['dial', 'tape', 'field', 'log']

export function getRiskMode(): RiskMode {
  const m = read<string>('risk-mode', 'dial')
  return (RISK_MODES as string[]).includes(m) ? (m as RiskMode) : 'dial'
}

export function setRiskMode(m: RiskMode): void {
  write('risk-mode', m)
}

export function useRiskMode(): [RiskMode, (m: RiskMode) => void] {
  const mode = useSyncExternalStore(subscribe, getRiskMode)
  return [mode, setRiskMode]
}

/* wallet mock session persistence (address-only; the session object carries
   no secret by construction — see wallet/registry.ts law) */
export function getWalletSession(): WalletSession | null {
  return read<WalletSession | null>('wallet-session', null)
}

export function setWalletSession(s: WalletSession | null): void {
  write('wallet-session', s)
}

/* Holdings Check (PROMPT-V4 M5): the SELECTED CHAIN persists, the address
   never does — it lives in the request URL and nowhere else. */
export function getHoldingsChain(): LiveChain {
  const c = read<string>('holdings-chain', 'sol')
  return (LIVE_CHAINS as readonly string[]).includes(c) ? (c as LiveChain) : 'sol'
}

export function setHoldingsChain(c: LiveChain): void {
  write('holdings-chain', c)
}
