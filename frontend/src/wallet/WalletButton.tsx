/* Wallet button — PROMPT-V4 M2: the picker lists wallets ACTUALLY DETECTED
   via EIP-6963 / Solana Wallet Standard (live, address-only) plus one
   labelled DEMO identity. Nothing is offered that cannot happen: a wallet
   that is not installed is not listed. */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
        <button type="button" className="ta-wallet-chip" onClick={() => setOpen(true)}
          title={liveKind ? `${session.label} — public address only, read-only build` : MOCK_TOOLTIP}
          aria-expanded={open} aria-label="wallet menu">
          <span className="dot" aria-hidden="true" />
          <span className="mono">{shorten(session.address)}</span>
          {!compact && <span className="ta-wallet-tag">{liveKind ? session.label.toUpperCase() : WALLET_LABEL}</span>}
        </button>
        {open && createPortal(
          <div className="wl-overlay" role="dialog" aria-modal="true" aria-label="wallet"
            onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
            <div className="wl-modal">
              <div className="wl-modal-hd">
                <b>{session.label.toUpperCase()}</b>
                <button type="button" className="wl-close" aria-label="close" onClick={() => setOpen(false)}>✕</button>
              </div>
              <p className="wl-sub mono">{shorten(session.address)}
                <button type="button" className="wl-copy" onClick={() => {
                  navigator.clipboard?.writeText(session.address)
                    .then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200) }, () => {})
                }}>{copied ? 'copied ✓' : 'copy'}</button>
              </p>
              <div className="wl-list">
                {Object.entries(session.balances).map(([chain, bal]) => (
                  <div className="wl-opt static" key={chain}>
                    <span className="wl-ico" aria-hidden="true">{chain === 'sol' ? '◎' : '⬡'}</span>
                    <span className="wl-name">{chain === 'sol' ? 'Solana' : 'EVM'}</span>
                    <span className="mono">{bal.toFixed(3)}</span>
                  </div>
                ))}
                <div className="wl-opt static">
                  <span className="wl-ico" aria-hidden="true">⛨</span>
                  <span className="wl-name">read-only build</span>
                  <span className="dim2">no signing, no execution</span>
                </div>
              </div>
              <button type="button" className="wl-disconnect" data-testid="wallet-disconnect"
                onClick={() => { disconnect(); setOpen(false) }}>DISCONNECT</button>
              <p className="wl-foot">No custody. No keys. The terminal cannot move funds.</p>
            </div>
          </div>,
          document.body,
        )}
      </div>
    )
  }

  return (
    <div className="ta-wallet" ref={ref}>
      <button type="button" className="ta-wallet-chip connect" data-testid="wallet-connect"
        onClick={() => setOpen(true)} aria-expanded={open} aria-label="connect wallet">
        {connecting ? <span className="pulse" aria-hidden="true" /> : null}
        {connecting ? 'CONNECTING…' : 'CONNECT WALLET'}
      </button>
      {open && !connecting && createPortal(
        <div className="wl-overlay" role="dialog" aria-modal="true" aria-label="connect a wallet"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="wl-modal">
            <div className="wl-modal-hd">
              <b>CONNECT A WALLET</b>
              <button type="button" className="wl-close" aria-label="close" onClick={() => setOpen(false)}>✕</button>
            </div>
            <p className="wl-sub">Address only — nothing is signed, nothing leaves read-only.</p>
            <div className="wl-list">
              {live.map((w) => (
                <button type="button" key={w.id} className="wl-opt" role="menuitem"
                  data-testid={`wallet-live-${w.id}`} onClick={() => { setOpen(false); connect(w.id) }}>
                  <span className="wl-ico" aria-hidden="true">{w.fam === 'solana' ? '◎' : '⬡'}</span>
                  <span className="wl-name">{w.name}</span>
                  <span className="ta-chain-tag">{w.fam === 'solana' ? 'SOL' : 'EVM'} · LIVE</span>
                </button>
              ))}
              <button type="button" className="wl-opt demo" role="menuitem" data-testid="wallet-demo"
                onClick={() => { setOpen(false); connectDemo() }}>
                <span className="wl-ico" aria-hidden="true">◇</span>
                <span className="wl-name">{WALLET_LABEL}</span>
                <span className="dim2">preview only</span>
              </button>
            </div>
            {error && <div className="wl-error mono" data-testid="wallet-error">{error}</div>}
            <p className="wl-foot">No custody. No keys. The terminal cannot move funds.</p>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
