/* Wallet live discovery (PROMPT-V4 M2, 2026-08-31) — ADDRESS-ONLY by law.
   Two 2026 standards, hand-rolled, ZERO dependencies (docs/TECH-DECISIONS.md
   §MANDATE 0-V4 rows 144-147):
   1. EIP-6963 (Final): dapps dispatch `eip6963:requestProvider` and collect
      `eip6963:announceProvider` details {info{uuid,name,icon,rdns}, provider}.
   2. Solana Wallet Standard: dapps dispatch `wallet-standard:app-ready` with
      a register callback and listen for `wallet-standard:register-wallet`;
      a wallet's `standard:connect` feature yields accounts[0].address bytes.
   The only permission ever requested is ACCOUNT VISIBILITY:
   `eth_requestAccounts` (EVM) / `standard:connect` (Solana). No sign*, no
   send*, no execution path exists in this file — the V1 read-only law. */
import type { ChainFam } from './registry'

export interface LiveWallet {
  id: string            // uuid (evm) or name (solana) — stable per extension
  name: string
  icon?: string
  fam: ChainFam
  rdns?: string         // reverse-DNS of the extension (EIP-6963 provenance)
  connect(): Promise<string>   // resolves the PUBLIC address only
}

/* ── base58 (hand-rolled, Solana address bytes → string) ───────────────── */
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function b58encode(bytes: Uint8Array): string {
  let n = 0n
  for (const b of bytes) n = n * 256n + BigInt(b)
  let out = ''
  while (n > 0n) {
    out = B58_ALPHABET[Number(n % 58n)] + out
    n /= 58n
  }
  for (const b of bytes) {
    if (b !== 0) break
    out = '1' + out                      // leading zero bytes are literal '1's
  }
  return out
}

/* ── EIP-6963 (EVM) ────────────────────────────────────────────────────── */
interface EIP1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}
interface EIP6963Detail {
  info: { uuid: string; name: string; icon: string; rdns: string }
  provider: EIP1193
}

function evmWallet(detail: EIP6963Detail): LiveWallet {
  return {
    id: detail.info.uuid,
    name: detail.info.name,
    icon: detail.info.icon,
    fam: 'evm',
    rdns: detail.info.rdns,
    async connect() {
      // the ONLY request this build ever makes to an EVM provider
      const accounts = await detail.provider.request({ method: 'eth_requestAccounts' })
      const first = Array.isArray(accounts) ? accounts[0] : null
      if (typeof first !== 'string' || !first.startsWith('0x')) {
        throw new Error(`${detail.info.name}: no public address returned`)
      }
      return first
    },
  }
}

/* ── Solana Wallet Standard ────────────────────────────────────────────── */
interface WsAccount { address: Uint8Array | string; label?: string }
interface WsFeature {
  version: string
  connect(): Promise<{ accounts: WsAccount[] }>
}
interface WsWallet {
  name: string
  icon?: string
  chains: readonly string[]
  features: Record<string, WsFeature | undefined>
}

function solWallet(w: WsWallet): LiveWallet | null {
  if (!w.chains.some((c) => c.startsWith('solana:'))) return null
  const feat = w.features['standard:connect']
  if (!feat) return null
  return {
    id: `ws:${w.name}`,
    name: w.name,
    icon: w.icon,
    fam: 'solana',
    async connect() {
      // the ONLY feature this build ever calls on a Solana wallet
      const { accounts } = await feat.connect()
      const acc = accounts[0]
      if (!acc) throw new Error(`${w.name}: no account returned`)
      return typeof acc.address === 'string' ? acc.address : b58encode(acc.address)
    },
  }
}

/* ── discovery — one listener set, keeps a de-duped live list ──────────── */
export function discoverWallets(onUpdate: (wallets: LiveWallet[]) => void): () => void {
  const seen = new Map<string, LiveWallet>()
  const publish = () => onUpdate(Array.from(seen.values()))

  const add = (w: LiveWallet | null) => {
    if (w && !seen.has(w.id)) { seen.set(w.id, w); publish() }
  }

  const onAnnounce = (e: Event) => {
    const detail = (e as CustomEvent<EIP6963Detail>).detail
    if (detail?.info && detail.provider) add(evmWallet(detail))
  }
  const onRegister = (e: Event) => {
    for (const w of (e as CustomEvent<WsWallet[]>).detail ?? []) add(solWallet(w))
  }

  window.addEventListener('eip6963:announceProvider', onAnnounce)
  window.addEventListener('wallet-standard:register-wallet', onRegister)
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  // Wallet Standard: wallets that loaded BEFORE us re-register on app-ready
  window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', {
    detail: (...wallets: WsWallet[]) => wallets.forEach((w) => add(solWallet(w))),
  }))

  return () => {
    window.removeEventListener('eip6963:announceProvider', onAnnounce)
    window.removeEventListener('wallet-standard:register-wallet', onRegister)
  }
}
