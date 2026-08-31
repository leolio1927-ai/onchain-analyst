/* Wallet button — PROMPT-V4 M2: the picker lists wallets ACTUALLY DETECTED
   via EIP-6963 / Solana Wallet Standard (live, address-only) plus one
   labelled DEMO identity. Nothing is offered that cannot happen: a wallet
   that is not installed is not listed. */
import { useEffect, useRef, useState } from 'react'
import { shorten } from '../lib/liveFormat'
import { useWallet } from './WalletContext'
import { MOCK_TOOLTIP, WALLET_LABEL } from './registry'

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { session, connecting, error, live, connect, connectDemo, disconnect } = useWallet()
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
    const liveKind = session.kind === 'live'
    return (
      <div className="ta-wallet on" ref={ref}>
        <button type="button" className="ta-wallet-chip" onClick={() => setOpen((o) => !o)}
          title={liveKind ? `${session.label} — public address only, read-only build` : MOCK_TOOLTIP}
          aria-expanded={open} aria-label="wallet menu">
          <span className="dot" aria-hidden="true" />
          <span className="mono">{shorten(session.address)}</span>
          {!compact && <span className="ta-wallet-tag">{liveKind ? session.label.toUpperCase() : WALLET_LABEL}</span>}
        </button>
        {open && (
          <div className="ta-wallet-menu" role="menu">
            <div className="ta-wallet-row head">
              <span>{session.label}</span>
              <span className="mono dim2" title={liveKind ? undefined : MOCK_TOOLTIP}>
                {liveKind ? 'live · address-only' : 'mock'}
              </span>
            </div>
            {Object.entries(session.balances).map(([chain, bal]) => (
              <div className="ta-wallet-row" key={chain}>
                <span className="ta-chain-tag">{chain === 'sol' ? 'SOL' : 'EVM'}</span>
                <span className="mono">{bal.toFixed(3)}</span>
              </div>
            ))}
            {liveKind && (
              <div className="ta-wallet-row">
                <span className="mono dim2">no signing, no execution — read-only build</span>
              </div>
            )}
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
      <button type="button" className="ta-wallet-chip connect" data-testid="wallet-connect"
        onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="connect wallet">
        {connecting ? <span className="pulse" aria-hidden="true" /> : null}
        {connecting ? 'CONNECTING…' : 'CONNECT WALLET'}
      </button>
      {open && !connecting && (
        <div className="ta-wallet-menu" role="menu">
          <div className="ta-wallet-row head">
            <span>pick a wallet</span>
            <span className="dim2">address only — nothing is signed</span>
          </div>
          {live.map((w) => (
            <button type="button" key={w.id} className="ta-wallet-row btn" role="menuitem"
              data-testid={`wallet-live-${w.id}`} onClick={() => { setOpen(false); connect(w.id) }}>
              <span>{w.name}</span>
              <span className="ta-chain-tag">{w.fam === 'solana' ? 'SOL' : 'EVM'} · LIVE</span>
            </button>
          ))}
          <button type="button" className="ta-wallet-row btn" role="menuitem" data-testid="wallet-demo"
            onClick={() => { setOpen(false); connectDemo() }}>
            <span>{WALLET_LABEL}</span>
            <span className="dim2">preview only</span>
          </button>
          {error && <div className="ta-wallet-row mono dim2" data-testid="wallet-error">{error}</div>}
        </div>
      )}
    </div>
  )
}
