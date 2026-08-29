/* DOCS FULL PAGE (PROMPT-D) — explains the whole project, static premium FE,
   zero new backend. Main feature: the live-wire SVG diagram — feature-to-
   feature cables with a moving pulse (reduced-motion = pulse off, still
   readable); not-yet branches (swap/wallet/AI) are dim dashed "soon" wires.
   Zero purple; DNA identical to /live. */
import { LIVE_CHAINS, LIVE_CHAIN_LABEL } from '../lib/liveApi'
import { ChainLogo } from './chainLogos'
import '../styles/pages.css'

/* hand-laid diagram geometry (viewBox 1080×400) */
const NODES: { x: number; y: number; w: number; t: string; s: string; c?: string }[] = [
  { x: 10, y: 50, w: 150, t: 'GECKOTERMINAL', s: 'KEYLESS · FREE TIER' },
  { x: 190, y: 50, w: 150, t: 'NORMALIZE', s: 'JUNK GUARD → “–”' },
  { x: 370, y: 50, w: 150, t: 'DEDUPE', s: 'MOST-LIQUID POOL' },
  { x: 550, y: 50, w: 150, t: 'TTL CACHE', s: '180s · STALE-SAFE' },
  { x: 730, y: 50, w: 150, t: '/API/V1/LIVE', s: 'HONEST 4XX/5XX' },
  { x: 910, y: 50, w: 160, t: 'SSR + BOARD', s: '6 CHAINS LIVE' },
  { x: 790, y: 196, w: 280, t: 'TOKEN CARDS', s: 'BORDIR · LOGOS · COPY', c: 'var(--brand-2)' },
  { x: 470, y: 196, w: 250, t: 'DS SOCIALS', s: 'X + WEBSITE · 1H CACHE · FAIL-SOFT', c: 'var(--brand-2)' },
]

const SOON: { x: number; t: string }[] = [
  { x: 250, t: 'SWAP MOCKUP' },
  { x: 500, t: 'WALLET CONNECT' },
  { x: 750, t: 'AI ANALYST' },
]

function Diagram() {
  return (
    <div className="dx-wrap">
      <svg className="dx-svg" viewBox="0 0 1080 400" role="img"
        aria-label="Terminal Alpha data pipeline: GeckoTerminal to board, with soon-branches for swap, wallet and AI">
        {NODES.map((n) => (
          <g key={n.t}>
            <rect className="dx-nbox" x={n.x} y={n.y} width={n.w} height={58} rx="10"
              stroke={n.c ?? 'var(--brand)'} />
            <text className="dx-ntext" x={n.x + n.w / 2} y={n.y + 25} textAnchor="middle">{n.t}</text>
            <text className="dx-nsub" x={n.x + n.w / 2} y={n.y + 42} textAnchor="middle">{n.s}</text>
          </g>
        ))}
        {/* main flow, left → right */}
        {[160, 340, 520, 700, 880].map((x) => (
          <path key={x} className="dx-cable" stroke="var(--brand)" d={`M${x} 79 H${x + 30}`} />
        ))}
        {/* board → token cards, DS socials → token cards */}
        <path className="dx-cable" stroke="var(--brand)" d="M990 108 V152 H930 V196" />
        <path className="dx-cable" stroke="var(--brand-2)" d="M720 225 H790" />
        {/* soon bus + drops (dim dashed, pulse off) */}
        <path className="dx-cable soon" d="M930 254 V300 H350" />
        {SOON.map((s) => (
          <g key={s.t}>
            <path className="dx-cable soon" d={`M${s.x + 100} 300 V330`} />
            <text className="dx-soonlbl" x={s.x + 100} y={322} textAnchor="middle">SOON</text>
            <rect className="dx-nbox dx-nsoon" x={s.x} y={330} width={200} height={50} rx="10"
              stroke="var(--muted-deep)" />
            <text className="dx-ntext" x={s.x + 100} y={352} textAnchor="middle" opacity=".7">{s.t}</text>
            <text className="dx-nsub" x={s.x + 100} y={368} textAnchor="middle">NOT WIRED YET</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

export function DocsPage() {
  document.title = 'Docs — Terminal Alpha'
  return (
    <div className="pg-root">
      <div className="pg-aurora" aria-hidden="true" />
      <div className="pg-wrap">
        <div style={{ display: 'flex', gap: 18, marginBottom: 30 }}>
          <a className="pg-a" href="/">← LANDING</a>
          <a className="pg-a" href="/live">MEMECOIN LIVE</a>
          <a className="pg-a" href="/terminal">TERMINAL (BETA)</a>
        </div>
        <div className="pg-kicker">TERMINAL ALPHA — DOCUMENTATION</div>
        <h1 className="pg-h1">One terminal. <em>All chains.</em> Zero lies.</h1>
        <p className="pg-lead">
          <b>Terminal Alpha</b> is a read-only memecoin research terminal built to a
          $100B-terminal standard: deterministic risk heuristics with public thresholds,
          an evidence-first AI analyst, and a live multichain board. It never asks for
          your keys and never trades. Everything on these pages renders only what an
          upstream API actually returned.
        </p>

        <section className="pg-section">
          <h2 className="pg-h2">PHILOSOPHY — THE HONESTY LAW</h2>
          <div className="pg-card">
            <ul className="pg-ul">
              <li><b>Absent stays absent.</b> A field the API did not return renders “–” — never 0, never a guess.</li>
              <li><b>Zero is a fact.</b> Zero volume or zero transactions is real and stays visible.</li>
              <li><b>A negative price drop is real.</b> Negative 24h changes are market data — rendered red, never suppressed.</li>
              <li><b>Impossible values are not facts.</b> A negative liquidity or price is an upstream data bug — normalized to “–”, never clamped, never abs().</li>
              <li><b>Mocks are labeled.</b> Anything not wired to a real upstream carries a visible MOCK chip (see the swap panel).</li>
              <li><b>Heuristics are auditable.</b> Every risk threshold lives in public code — no black boxes.</li>
            </ul>
          </div>
        </section>

        <section className="pg-section">
          <h2 className="pg-h2">MEMECOIN LIVE — HOW THE FEED WORKS</h2>
          <div className="pg-card">
            <ul className="pg-ul">
              <li><b>Keyless and free.</b> The board runs on GeckoTerminal's free tier (~10 calls/min) — no API keys anywhere.</li>
              <li><b>Honest caching.</b> Every (chain, mode) is cached for 180s (env-tunable 60–600s). A failed refresh serves the expired copy flagged <b>stale</b> — or an honest 502 when there is nothing to serve.</li>
              <li><b>One token = one card.</b> The same token in N pools collapses to its most-liquid pool — stable order, contiguous α-ranks.</li>
              <li><b>Social chips.</b> X/website links come from DexScreener (1h cache, fail-soft). If a token has no profile, the chips simply don't render.</li>
              <li><b>Alpha lens.</b> A deterministic local score (volume 40% · txns 25% · liquidity 20% · freshness 15%) re-ranks the volume feed with zero extra API calls.</li>
            </ul>
          </div>
        </section>

        <section className="pg-section">
          <h2 className="pg-h2">THE PIPELINE — LIVE WIRES</h2>
          <div className="pg-card">
            <Diagram />
            <table className="pg-tbl">
              <tbody>
                <tr><td>1 · GeckoTerminal</td><td>Keyless pools/trades API — trending, new, volume sources for six chains.</td></tr>
                <tr><td>2 · Normalize + junk guard</td><td>Verbatim field copy; impossible numerics (negative price/liquidity/…) become “–”.</td></tr>
                <tr><td>3 · Dedupe</td><td>Same token in N pools → the deepest pool survives; order stays stable.</td></tr>
                <tr><td>4 · TTL cache</td><td>180s per (chain, source) — the free tier's ~10 rpm budget stays intact.</td></tr>
                <tr><td>5 · /api/v1/live</td><td>One additive read route: honest 400/404/502, stale flags, live:false for absent networks.</td></tr>
                <tr><td>6 · SSR + board</td><td>Server-rendered skeleton, staggered client fetches, six chain cards.</td></tr>
                <tr><td>7 · Token cards</td><td>Bordered cards — logo tile, semantic change colors, copy-address, launchpad badge.</td></tr>
                <tr><td>8 · DS socials</td><td>X/website via DexScreener, 1h cache, fail-soft — absent chips render nothing.</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="pg-section">
          <h2 className="pg-h2">SIX CHAINS, FOUNDER-LOCKED ORDER</h2>
          <div className="pg-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {LIVE_CHAINS.map((c) => (
              <div className="pg-card" key={c} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px' }}>
                <ChainLogo chain={c} size={44} />
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14 }}>{LIVE_CHAIN_LABEL[c]}</div>
                  <div className="dx-nsub">{c.toUpperCase()} · LIVE</div>
                </div>
                <span className="pg-chip" style={{ marginLeft: 'auto' }}><span style={{ width: 5, height: 5, borderRadius: 999, background: 'currentColor' }} />LIVE</span>
              </div>
            ))}
          </div>
        </section>

        <section className="pg-section">
          <h2 className="pg-h2">BETA NOTAS</h2>
          <div className="pg-card">
            <ul className="pg-ul">
              <li><b>The terminal is internal beta.</b> The swap panel inside it is a labeled MOCKUP — static numbers, no wallet, no chain calls.</li>
              <li><b>Roadmap:</b> shipped sprints, current work and next moves live on the <a className="pg-a" href="/roadmap">Roadmap page →</a></li>
              <li><b>X &amp; community links</b> land with the public launch — they will be added here, never invented before that.</li>
            </ul>
            <p className="pg-note">FREE LIVE DATA VIA GECKOTERMINAL · SOCIALS VIA DEXSCREENER · READ-ONLY, NO CUSTODY</p>
          </div>
        </section>
      </div>
    </div>
  )
}
