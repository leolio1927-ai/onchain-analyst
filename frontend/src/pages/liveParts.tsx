/* Shared building blocks for the Memecoin Live pages (board + chain view):
   token logo with initial-block fallback, copy-address control, semantic
   change badge (pos/neg — never neutral), the founder-mandated TRADE
   COMING SOON popup, and honest state views (skeletons / error+retry with
   60s cool-down / empty). No fabricated numbers anywhere: absent → "–". */
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { LiveChain, LiveItem } from '../lib/liveApi'
import { fmtPct, truncAddr } from '../lib/liveFormat'

/* Founder-mandated CHAIN ACCENT MAP (exact hexes) — mirrored in live.css
   [data-chain] fallbacks; passed inline per card/column root as
   --chain-accent so borders/glow/chips all derive from one property. */
export const CHAIN_ACCENT: Record<LiveChain, string> = {
  sol: '#14F195',
  bnb: '#F0B90B',
  base: '#4D8DFF',
  hype: '#2DD4BF',
  hood: '#00C805',
  avax: '#E84142',
}

export function accentStyle(chain: LiveChain): CSSProperties {
  return { '--chain-accent': CHAIN_ACCENT[chain] } as CSSProperties
}

export function TokenLogo({ src, symbol }: { src: string | null; symbol: string | null }) {
  const [broken, setBroken] = useState(false)
  const initial = (symbol ?? '?').slice(0, 1).toUpperCase()
  if (!src || broken) {
    return <span className="lx-logo fb" aria-hidden="true">{initial}</span>
  }
  return <img className="lx-logo" src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
}

function copyViaTextarea(text: string): boolean {
  /* clipboard API fallback for non-secure contexts */
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

export function CopyAddr({ address }: { address: string | null }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(t)
  }, [copied])
  if (!address) return <span className="lx-copy" style={{ cursor: 'default' }}>–</span>
  const onCopy = (e: React.MouseEvent) => {
    e.stopPropagation() // rows are clickable (trade popup) — copy must not trigger them
    const done = () => setCopied(true)
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(address).then(done, () => { if (copyViaTextarea(address)) done() })
    } else if (copyViaTextarea(address)) {
      done()
    }
  }
  return (
    <button type="button" className={`lx-copy${copied ? ' ok' : ''}`}
      onClick={onCopy} title={`copy pool address ${address}`}>
      {copied ? '✓ copied' : `${truncAddr(address)} ⧉`}
    </button>
  )
}

/* Semantic 24h change: pos (green) / neg (rose) — an actual value is never
   neutral; absent renders the honest dash. */
export function ChgBadge({ value }: { value: string | number | null }) {
  const n = value === null
    ? null
    : typeof value === 'number' ? value : Number(value)
  const cls = n === null || !Number.isFinite(n) ? 'flat' : n < 0 ? 'neg' : 'pos'
  return <span className={`lx-chg ${cls}`}>{fmtPct(value)}</span>
}

/* Founder addendum: clicking a token card opens the honest TRADE — COMING
   SOON popup. Escape / backdrop / × all close it. */
export function TradeComingModal({ item, onClose }: { item: LiveItem | null; onClose: () => void }) {
  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [item, onClose])
  if (!item) return null
  return (
    <div className="lx-modal" role="presentation" onClick={onClose}>
      <div className="lx-modal-card" role="dialog" aria-modal="true" aria-label="Trade coming soon"
        onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lx-modal-x" onClick={onClose} aria-label="Close">×</button>
        <div className="lx-modal-kicker">TRADE</div>
        <div className="lx-modal-title">COMING SOON</div>
        <p className="lx-modal-sub">
          <b>{item.token_symbol ?? '–'}</b> · {item.pair ?? '–'}<br />
          Terminal Alpha is read-only research — execution is not live yet.
          Nothing to sign, nothing to click. Watch this space.
        </p>
      </div>
    </div>
  )
}

export function Skel({ n = 4 }: { n?: number }) {
  return (
    <div className="lx-skel" role="status" aria-label="loading">
      {Array.from({ length: n }, (_, i) => <i key={i} />)}
    </div>
  )
}

export function ErrBox({ msg, cooldown, onRetry }: { msg: string; cooldown: number; onRetry: () => void }) {
  return (
    <div className="lx-err">
      <span>⚠ {msg}</span>
      <button type="button" className="lx-retry" onClick={onRetry} disabled={cooldown > 0}>
        {cooldown > 0 ? `retry in ${cooldown}s` : 'retry'}
      </button>
    </div>
  )
}

export function EmptyBox({ what }: { what: string }) {
  return <div className="lx-empty">{what}</div>
}

export function StatusChips({ live, cached, stale }: { live: boolean; cached: boolean; stale: boolean }) {
  if (!live) return <span className="lx-chip dead">COMING SOON</span>
  return (
    <>
      <span className="lx-chip live"><span className="dot" />LIVE</span>
      {stale
        ? <span className="lx-chip cached"><span className="dot" />CACHED·STALE</span>
        : cached ? <span className="lx-chip cached" style={{ opacity: 0.55 }}>CACHED</span> : null}
    </>
  )
}
