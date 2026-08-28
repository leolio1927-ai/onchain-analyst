import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

/* Small premium UI kit used across every page. */

export function Card({ title, right, children, className = '', glow }: {
  title?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
  glow?: string
}) {
  return (
    <section className={`ta-card ${className}`} style={glow ? { boxShadow: `0 0 0 1px ${glow}33, 0 0 34px ${glow}14` } : undefined}>
      {(title || right) && (
        <header className="ta-card-head">
          <h3 className="ta-card-title">{title}</h3>
          {right}
        </header>
      )}
      {children}
    </section>
  )
}

export function Badge({ color = 'cyan', children }: { color?: 'cyan' | 'purple' | 'green' | 'amber' | 'red' | 'muted'; children: ReactNode }) {
  return <span className={`ta-badge b-${color}`}>{children}</span>
}

export function Tabs({ tabs, active, onPick }: {
  tabs: { id: string; label: ReactNode }[]
  active: string
  onPick: (id: string) => void
}) {
  return (
    <div className="ta-tabs">
      {tabs.map((t) => (
        <button key={t.id} className={t.id === active ? 'on' : ''} onClick={() => onPick(t.id)}>{t.label}</button>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, title, children, width = 560 }: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  width?: number
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="ta-modal-veil" onClick={onClose}>
      <div className="ta-modal" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <header className="ta-modal-head">
          <h3>{title}</h3>
          <button className="ta-x" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="ta-modal-body">{children}</div>
      </div>
    </div>
  )
}

export function Tooltip({ tip, children }: { tip: string; children: ReactNode }) {
  return (
    <span className="ta-tip" tabIndex={0}>
      {children}
      <span className="ta-tip-pop">{tip}</span>
    </span>
  )
}

export function Skeleton({ h = 16, w = '100%' }: { h?: number; w?: number | string }) {
  return <span className="ta-skel" style={{ height: h, width: w }} />
}

export function EmptyState({ icon = '◇', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="ta-empty">
      <div className="ta-empty-ico">{icon}</div>
      <div className="ta-empty-t">{title}</div>
      {hint && <div className="ta-empty-h">{hint}</div>}
    </div>
  )
}

export function Meter({ value, max = 100, color = '#00ffa3' }: { value: number; max?: number; color?: string }) {
  return (
    <div className="ta-meter">
      <span style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color, boxShadow: `0 0 12px ${color}66` }} />
    </div>
  )
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button className={`ta-toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span className="knob" />
      {label && <span className="lbl">{label}</span>}
    </button>
  )
}

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
