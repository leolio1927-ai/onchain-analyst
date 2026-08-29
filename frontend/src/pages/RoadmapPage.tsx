/* ROADMAP FULL PAGE (PROMPT-R) — phase-by-phase, ULTRA PREMIUM with pure-CSS
   3D card variation (perspective tilt + depth shadow + layered translateZ).
   Source of truth: founder memory REV3.3 — SHIPPED (G/M/V/W/X with dates and
   proof), NOW (swap/docs/landing-hidup, deploy v1 ±5 Sep), NEXT (wallet+quote
   engine, watchlist, tape/ws, AI panel, BE foundations). Same live-cable
   motif as /docs; reduced-motion keeps it readable. Zero purple. */
import '../styles/pages.css'

const ACC = { shipped: 'var(--brand)', now: 'var(--amber)', next: 'var(--blue)' }

const SHIPPED: { id: string; title: string; date: string; points: string[] }[] = [
  { id: 'G', title: 'Live-feed backend', date: '2026-08-29',
    points: ['6 chains × 4 modes on keyless GeckoTerminal', '180s TTL cache + honest stale-serve', 'alpha lens — zero extra API calls'] },
  { id: 'M', title: 'Memecoin Live frontend', date: '2026-08-28/29',
    points: ['board + 3-column chain pages', 'staggered fetches, skeleton honesty', 'honest 404 / 400 / 502 handling'] },
  { id: 'V', title: 'Bordir visual system', date: '2026-08-29',
    points: ['2px accent borders + dashed hairlines', 'rest + hover glow layers', 'semantic change colors — never neutral'] },
  { id: 'W', title: 'Chain marks + token cards', date: '2026-08-29',
    points: ['6 hand-drawn SVG chain marks', 'one token = one bordered card', 'square logo tiles + dashed sekat'] },
  { id: 'X', title: 'Data credibility', date: '2026-08-29',
    points: ['junk guard — impossible values → “–”', 'per-token dedupe (most-liquid pool)', 'social chips on every chain'] },
]

const NOW: { title: string; date: string; points: string[] }[] = [
  { title: 'Swap mockup (S)', date: 'SHIPPED — INTERNAL',
    points: ['printr-model panel in the terminal sidebar', 'every number MOCK-chipped', '/swap-preview for screenshots'] },
  { title: 'Docs page (D)', date: 'SHIPPED',
    points: ['full project documentation', 'live-wire pipeline diagram'] },
  { title: 'Landing hidup (L)', date: 'IN PROGRESS',
    points: ['slim landing: hero + live + CTA', 'docs/roadmap move here — no doubles'] },
  { title: 'Deploy v1', date: '±5 SEP 2026',
    points: ['public board + docs + roadmap'] },
]

const NEXT: { title: string; points: string[] }[] = [
  { title: 'Wallet connect + quote engine', points: ['the swap mockup becomes real', 'no custody — ever'] },
  { title: 'Watchlist', points: ['track tokens across chains'] },
  { title: 'Tape / WS trades', points: ['/ws/tape wired into the board'] },
  { title: 'AI analyst panel', points: ['evidence-first narratives in-page'] },
  { title: 'BE foundations', points: ['one additive route at a time'] },
]

export function RoadmapPage() {
  document.title = 'Roadmap — Terminal Alpha'
  return (
    <div className="pg-root">
      <div className="pg-aurora" aria-hidden="true" />
      <div className="pg-wrap">
        <div style={{ display: 'flex', gap: 18, marginBottom: 30 }}>
          <a className="pg-a" href="/">← LANDING</a>
          <a className="pg-a" href="/live">MEMECOIN LIVE</a>
          <a className="pg-a" href="/docs">DOCS</a>
        </div>
        <div className="pg-kicker">TERMINAL ALPHA — ROADMAP · REV3.3</div>
        <h1 className="pg-h1">Phase by phase, <em>wire by wire.</em></h1>
        <p className="pg-lead">
          The weekly hub: every ship lands here with its proof. Shipped sprints stay
          honest with dates; NOW is what the founder is staring at; NEXT is queued
          one additive step at a time.
        </p>

        <section className="pg-section">
          <h2 className="pg-h2">SHIPPED</h2>
          <div className="rm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            {SHIPPED.map((s) => (
              <article className="rm-card" key={s.id} style={{ '--accent': ACC.shipped } as React.CSSProperties}>
                <div className="rm-layer">
                  <span className="rm-phase">SHIPPED · {s.id}</span>
                  <div className="rm-title">{s.title}</div>
                  <div className="rm-date">{s.date}</div>
                  <div className="rm-cable"><i /></div>
                  <ul className="rm-ul">{s.points.map((p) => <li key={p}>{p}</li>)}</ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="pg-section">
          <h2 className="pg-h2">NOW</h2>
          <div className="rm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            {NOW.map((n) => (
              <article className="rm-card" key={n.title} style={{ '--accent': ACC.now } as React.CSSProperties}>
                <div className="rm-layer">
                  <span className="rm-phase">NOW</span>
                  <div className="rm-title">{n.title}</div>
                  <div className="rm-date">{n.date}</div>
                  <div className="rm-cable"><i /></div>
                  <ul className="rm-ul">{n.points.map((p) => <li key={p}>{p}</li>)}</ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="pg-section">
          <h2 className="pg-h2">NEXT</h2>
          <div className="rm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {NEXT.map((n) => (
              <article className="rm-card" key={n.title} style={{ '--accent': ACC.next } as React.CSSProperties}>
                <div className="rm-layer">
                  <span className="rm-phase">NEXT</span>
                  <div className="rm-title">{n.title}</div>
                  <div className="rm-cable"><i /></div>
                  <ul className="rm-ul">{n.points.map((p) => <li key={p}>{p}</li>)}</ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        <p className="pg-note">SHIPPED = HUB NEWS MINGGUAN · TIAP SHIP DIUPDATE · READ-ONLY, NO CUSTODY, EVIDENCE FIRST</p>
      </div>
    </div>
  )
}
