import { Component, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import '../styles/app.css'

/* crash guard: a broken page must NEVER white-screen the terminal — the
   actual error is surfaced honestly so it can be screenshotted and fixed */
class PageBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 40, fontFamily: 'var(--f-mono, monospace)', color: 'var(--muted, #9cc3b2)' }}>
          <b style={{ color: 'var(--red, #fb7185)' }}>⚠ page error — </b>
          <span>{String(this.state.err.message)}</span>
        </div>
      )
    }
    return this.props.children
  }
}

const NAV: { id: string; icon: string; label: string; pill?: 'NEW' | number; soon?: boolean }[] = [
  { id: 'dashboard', icon: '▦', label: 'Dashboard' },
  { id: 'swap', icon: '⇅', label: 'Swap', pill: 'NEW' },
  { id: 'scanner', icon: '⌕', label: 'Token Scanner' },
  { id: 'rugcheck', icon: '⛨', label: 'Rug Check', soon: true },
  { id: 'whale', icon: '◍', label: 'Whale Tracker', soon: true },
  { id: 'cluster', icon: '❋', label: 'Cluster Analysis', soon: true },
  { id: 'ai', icon: '✦', label: 'AI Analyst', soon: true },
  { id: 'portfolio', icon: '▤', label: 'Portfolio Watch', soon: true },
  { id: 'alerts', icon: '◆', label: 'Alerts', soon: true },
  { id: 'holdings', icon: '▣', label: 'Holdings Check', soon: true },
  { id: 'gate', icon: '⚿', label: 'Token Gate', soon: true },
  { id: 'settings', icon: '⚙', label: 'Settings', soon: true },
  { id: 'docs', icon: '❐', label: 'Documentation', soon: true },
  { id: 'feedback', icon: '✎', label: 'Feedback', soon: true },
]

function useHashRoute(): string {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#\/?/, '') || 'dashboard')
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.replace(/^#\/?/, '') || 'dashboard')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return route
}

export function UpgradeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="ta-modal-veil" onClick={onClose}>
      <div className="ta-modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <header className="ta-modal-head">
          <h3>⚡ Upgrade your plan</h3>
          <button className="ta-x" onClick={onClose}>×</button>
        </header>
        <div className="ta-modal-body">
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 18 }}>
            Deeper analysis only — data correctness is identical on every tier. Choose how deep
            the AI digs. Pay with USDC or the access token (soulbound, time-bound). No custody, ever.
          </p>
          <div className="grid-3">
            {[
              { n: 'FREE', p: '$0', d: '5 AI runs/hour · standard depth · all heuristics', hot: false },
              { n: 'DEEP', p: '$19/mo', d: 'Unlimited deep runs · priority AI · full cluster graph export', hot: true },
              { n: 'DESK', p: '$99/mo', d: 'Multi-seat · alert webhooks · raw evidence export API', hot: false },
            ].map((t) => (
              <div key={t.n} className="ta-card" style={t.hot ? { borderColor: 'rgba(0,255,163,0.55)', boxShadow: 'var(--glow-brand)' } : undefined}>
                <div className="ta-card-head"><h3 className="ta-card-title">{t.n}</h3>{t.hot && <span className="ta-badge b-purple">POPULAR</span>}</div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 26, fontWeight: 700, marginBottom: 8 }}>{t.p}</div>
                <p style={{ color: 'var(--muted)', fontSize: 12, minHeight: 54 }}>{t.d}</p>
                <button className={`btn-analyze ${t.hot ? '' : 'as-ghost'}`} style={{ width: '100%', height: 40, fontSize: 12.5, marginTop: 10 }}>
                  {t.hot ? 'Upgrade to Deep' : 'Switch'}
                </button>
              </div>
            ))}
          </div>
          <p style={{ color: 'var(--dim)', fontSize: 11, marginTop: 16, textAlign: 'center' }}>
            Analysis-only product — a plan never changes what the data says, only how far the AI digs into it.
          </p>
        </div>
      </div>
    </div>
  )
}

export function Shell({ pages }: { pages: Record<string, ReactNode> }) {
  const route = useHashRoute()
  const [upgrade, setUpgrade] = useState(false)
  const current = pages[route] ?? pages.dashboard
  return (
    <div className="ta-shell">
      <aside className="ta-side">
        <div className="ta-side-logo">
          <span className="mark">◤</span>
          <span className="name">TERMINAL<span>ALPHA</span></span>
        </div>
        <nav className="ta-nav">
          {NAV.map((n) => (
            <a key={n.id} href={`#/${n.id}`} className={route === n.id ? 'on' : ''}>
              <span className="ico">{n.icon}</span>
              <span className="txt">{n.label}</span>
              {n.pill === 'NEW' && <span className="pill pill-new">NEW</span>}
              {typeof n.pill === 'number' && <span className="pill pill-n">{n.pill}</span>}
              {n.soon && (
                <span className="pill" style={{ opacity: 0.55, border: '1px solid var(--border)' }}>
                  SOON
                </span>
              )}
            </a>
          ))}
        </nav>
        <div className="ta-user">
          <div className="who">Alpha User</div>
          <div className="plan">Premium Deep</div>
          <div className="valid">Valid until 2026-12-31</div>
          <div className="ta-meter"><span style={{ width: '89%' }} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', margin: '5px 0 12px', fontSize: 10.5, color: 'var(--dim)' }}>
            <span>Cycle usage</span><span>89%</span>
          </div>
          <button className="btn-analyze" style={{ width: '100%', height: 38, fontSize: 12.5, opacity: 0.5, cursor: 'not-allowed' }} disabled>
            UPGRADE PLAN · SOON
          </button>
        </div>
      </aside>
      <main className="ta-main">
        <PageBoundary>{current}</PageBoundary>
      </main>
      <UpgradeModal open={upgrade} onClose={() => setUpgrade(false)} />
    </div>
  )
}
