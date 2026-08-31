/* Wallet button for the swap rail header (PROMPT-V Fase 2.2): CONNECT →
   picker → 800ms pulse → connected chip (shortened address + per-chain demo
   balances + copy/disconnect). Mock-only: tooltip says so on the address. */
import { useEffect, useRef, useState } from 'react'
import { shorten } from '../lib/liveFormat'
import { useWallet } from './WalletContext'
import { MOCK_TOOLTIP, REGISTRY, WALLET_LABEL } from './registry'

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { session, connecting, connect, disconnect } = useWallet()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  if (session) {
    return (
      <div className="ta-wallet on" ref={ref}>
        <button type="button" className="ta-wallet-chip" onClick={() => setOpen((o) => !o)}
          title={MOCK_TOOLTIP} aria-expanded={open} aria-label="wallet menu">
          <span className="dot" aria-hidden="true" />
          <span className="mono">{shorten(session.address)}</span>
          {!compact && <span className="ta-wallet-tag">{WALLET_LABEL}</span>}
        </button>
        {open && (
          <div className="ta-wallet-menu" role="menu">
            <div className="ta-wallet-row head">
              <span>{session.label}</span>
              <span className="mono dim2" title={MOCK_TOOLTIP}>mock</span>
            </div>
            {Object.entries(session.balances).map(([chain, bal]) => (
              <div className="ta-wallet-row" key={chain}>
                <span className="ta-chain-tag">{chain === 'sol' ? 'SOL' : 'EVM'}</span>
                <span className="mono">{bal.toFixed(3)}</span>
              </div>
            ))}
            <div className="ta-wallet-row acts">
              <button type="button" onClick={() => {
                navigator.clipboard?.writeText(session.address)
                  .then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200) }, () => {})
              }}>{copied ? 'copied ✓' : 'copy address'}</button>
              <button type="button" onClick={() => { disconnect(); setOpen(false) }}>disconnect</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="ta-wallet" ref={ref}>
      <button type="button" className="ta-wallet-chip connect"
        onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="connect wallet">
        {connecting ? <span className="pulse" aria-hidden="true" /> : null}
        {connecting ? 'CONNECTING…' : 'CONNECT WALLET'}
      </button>
      {open && !connecting && (
        <div className="ta-wallet-menu" role="menu">
          <div className="ta-wallet-row head"><span>pick a wallet</span><span className="dim2">preview only</span></div>
          {REGISTRY.map((p) => (
            <button type="button" key={p.id} className="ta-wallet-row btn" role="menuitem"
              onClick={() => { setOpen(false); connect(p.id) }}>
              <span>{p.label}</span>
              <span className="ta-chain-tag">{p.chainFam === 'solana' ? 'SOL' : 'EVM'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
