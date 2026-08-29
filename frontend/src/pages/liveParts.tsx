/* Shared building blocks for the Memecoin Live pages (board + chain view):
   token logo with initial-block fallback, copy-address control, and honest
   state views (skeletons / error+retry with 60s cool-down / empty). No
   fabricated numbers anywhere: absent renders as "–". */
import { useEffect, useState } from 'react'
import { truncAddr } from '../lib/liveFormat'

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
  const onCopy = () => {
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
