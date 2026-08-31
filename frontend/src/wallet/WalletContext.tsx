/* Wallet context (PROMPT-V Fase 2.2) — mock connect flow, client-only, zero
   requests to any extension. The 800ms "connecting" pulse is honest UI for a
   deterministic local computation: it communicates state, not network. */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { REGISTRY, connectMock } from './registry'
import type { WalletSession } from './registry'

interface WalletCtx {
  session: WalletSession | null
  connecting: string | null
  connect: (providerId: string) => void
  disconnect: () => void
}

const Ctx = createContext<WalletCtx>({
  session: null,
  connecting: null,
  connect: () => { /* replaced by the provider */ },
  disconnect: () => { /* replaced by the provider */ },
})

export function WalletProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WalletSession | null>(null)
  const [connecting, setConnecting] = useState<string | null>(null)

  const connect = useCallback((providerId: string) => {
    const provider = REGISTRY.find((p) => p.id === providerId)
    if (!provider || session || connecting) return
    setConnecting(providerId)
    window.setTimeout(() => {
      setConnecting(null)
      setSession(connectMock(provider))
    }, 800)
  }, [session, connecting])

  const disconnect = useCallback(() => setSession(null), [])

  const value = useMemo(() => ({ session, connecting, connect, disconnect }),
    [session, connecting, connect, disconnect])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWallet(): WalletCtx {
  return useContext(Ctx)
}
