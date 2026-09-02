import { Component, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import '../styles/app.css'
import { NAV } from './navModel'

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

function useHashRoute(): string {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#\/?/, '') || 'dashboard')
  useEffect(() => {
    const onHash = () => {
      const next = window.location.hash.replace(/^#\/?/, '') || 'dashboard'
      /* P5 micro — progressive View Transitions cross-fade between pages
         (Chrome 111+/Safari 18); unsupported browsers get the instant swap */
      const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
      if (typeof doc.startViewTransition === 'function') {
        doc.startViewTransition(() => { flushSync(() => setRoute(next)) })
      } else {
        setRoute(next)
      }
    }
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
  const [topbarNote, setTopbarNote] = useState<string | null>(null)

  useEffect(() => {
    const onNote = (e: Event) => {
      const custom = e as CustomEvent<string>
      setTopbarNote(custom.detail)
    }
    window.addEventListener('vilmei:topbar-note', onNote)
    return () => window.removeEventListener('vilmei:topbar-note', onNote)
  }, [])

  const defaultNote = route === 'settlement' ? 'READ-ONLY • SIM FEED • DEV' : 'READ-ONLY · LIVE DATA'
  const displayNote = topbarNote ?? defaultNote

  const current = pages[route] ?? pages.dashboard
  return (
    <div className="ta-shell">
      <aside className="ta-side embroidery">
        <div className="ta-side-logo">
          <span className="mark"><img src="/assets/img/vlm-logo-96.png" alt="VLM logo" className="ta-side-logo-img" /></span>
          <span className="name">VILMEI</span>
        </div>
        <nav className="ta-nav">
          {NAV.map((n) => (
            <a key={n.id} href={`#/${n.id}`} className={route === n.id ? 'on' : ''}>
              <span className="ico">{n.icon}</span>
              <span className="txt">{n.label}</span>
              {n.pill === 'NEW' && <span className="pill pill-new">NEW</span>}
              {n.pill === 'LIVE' && <span className="pill pill-live">LIVE</span>}
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
          <div className="who">VILMEI User</div>
          <div className="plan">FREE</div>
          <div className="valid">No plan required — every surface is open; no entitlement backend exists yet</div>
          <button className="btn-analyze" style={{ width: '100%', height: 38, fontSize: 12.5, opacity: 0.5, cursor: 'not-allowed' }} disabled>
            UPGRADE PLAN · SOON
          </button>
        </div>
      </aside>
      <main className="ta-main">
        {/* Search is contextual: Swap owns token selection in its hero; scanner and
            other surfaces keep their own purpose-built search controls. */}
        <header className="ta-topbar embroidery">
          <span className="ta-topbar-context mono">VILMEI TERMINAL</span>
          <span className="ta-topbar-note mono">{displayNote}</span>
        </header>
        <PageBoundary>{current}</PageBoundary>
      </main>
      <UpgradeModal open={upgrade} onClose={() => setUpgrade(false)} />
    </div>
  )
}
