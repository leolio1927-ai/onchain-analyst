/* Wallet context — PROMPT-V Fase 2.2 mock flow, upgraded by PROMPT-V4 M2
   (2026-08-31) to LIVE discovery: EIP-6963 + Solana Wallet Standard, zero
   deps, ADDRESS-ONLY (no signing, no execution — the V1 read-only law).
   The session persists under vilmei.wallet-session and is restored on load;
   a live session is just a public address, so restoring it costs nothing.
   The mock path stays as the labelled DEMO identity for previews. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getWalletSession, setWalletSession } from '../lib/prefs'
import { discoverWallets } from './live'
import type { LiveWallet } from './live'
import { REGISTRY, connectMock } from './registry'
import type { WalletSession } from './registry'

interface WalletCtx {
  session: WalletSession | null
  connecting: string | null
  error: string | null
  live: LiveWallet[]
  connect: (id: string) => void
  connectDemo: () => void
  disconnect: () => void
}

const Ctx = createContext<WalletCtx>({
  session: null,
  connecting: null,
  error: null,
  live: [],
  connect: () => { /* replaced by the provider */ },
  connectDemo: () => { /* replaced by the provider */ },
  disconnect: () => { /* replaced by the provider */ },
})

function restored(): WalletSession | null {
  const s = getWalletSession()
  if (!s) return null
  return { ...s, kind: s.kind === 'live' ? 'live' : 'mock', balances: s.balances ?? {} }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WalletSession | null>(restored)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState<LiveWallet[]>([])

  useEffect(() => discoverWallets(setLive), [])

  const connect = useCallback((id: string) => {
    const wallet = live.find((w) => w.id === id)
    if (!wallet || session || connecting) return
    setConnecting(id)
    setError(null)
    wallet.connect().then((address) => {
      const s: WalletSession = {
        providerId: wallet.id, label: wallet.name, chainFam: wallet.fam,
        // balance-less on purpose — real holdings arrive in M5, never demo numbers
        address, balances: {} as WalletSession['balances'], kind: 'live', rdns: wallet.rdns,
      }
      setSession(s)
      setWalletSession(s)
    }).catch((e: unknown) => {
      // a user refusal or a silent extension is data, never a red wall
      setError(`${wallet.name}: ${e instanceof Error ? e.message : 'no public address returned'}`)
    }).finally(() => setConnecting(null))
  }, [live, session, connecting])

  const connectDemo = useCallback(() => {
    if (session || connecting) return
    const provider = REGISTRY[0]
    setConnecting('demo')
    setError(null)
    window.setTimeout(() => {
      setConnecting(null)
      const s = connectMock(provider)
      setSession(s)
      setWalletSession(s)
    }, 800)
  }, [session, connecting])

  const disconnect = useCallback(() => {
    setSession(null)
    setWalletSession(null)
  }, [])

  const value = useMemo(() => ({ session, connecting, error, live, connect, connectDemo, disconnect }),
    [session, connecting, error, live, connect, connectDemo, disconnect])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWallet(): WalletCtx {
  return useContext(Ctx)
}
