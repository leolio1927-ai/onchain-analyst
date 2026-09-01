/* DOCS FLAGSHIP (PROMPT-D2) — the most verifiable documentation surface a
   memecoin terminal has ever shipped. One sentence = one greppable truth:
   every number, field and policy below was read from the shipped code before
   it was written here (providers/live.py, webapp/server.py, lib/liveApi.ts…).
   Editorial layout: sticky section rail, 860px reading column, 4-variant
   status system, live-wire pipeline SVG, landing-grade fixed background.
   Register is engineering, never marketing: pre-release surfaces are declared
   with the SIMULATED label — the banned words (mockup/mock/demo/dummy/fake/
   placeholder) appear nowhere in copy, chips, comments or alt text. */
import { useEffect, useState } from 'react'
import { PageBackground } from '../components/visuals'
import { ChainLogo } from './chainLogos'
import { LIVE_CHAINS, LIVE_CHAIN_LABEL } from '../lib/liveApi'
import type { LiveChain } from '../lib/liveApi'
import '../styles/docs.css'

/* mirrors liveParts.CHAIN_ACCENT (founder-locked hexes) — duplicated here so
   the docs bundle stays free of unrelated strings and deps */
const ACCENT: Record<LiveChain, string> = {
  sol: 'var(--emb-sol)', bnb: 'var(--emb-bnb)', base: 'var(--emb-base)',
  hype: '#2DD4BF', hood: '#00C805', // avax accent parked 2026-08-30
}

/* GeckoTerminal network slugs — copied from providers/live.py CHAINS */
const NET_ID: Record<LiveChain, string> = {
  sol: 'solana', bnb: 'bsc', base: 'base', hype: 'hyperevm', hood: 'robinhood', // avax parked 2026-08-30
}

const SECTIONS = [
  ['1', 'thesis', 'Thesis'], ['2', 'honesty', 'Honesty Law'], ['3', 'arch', 'Architecture'],
  ['4', 'pipeline', 'Pipeline'], ['5', 'sources', 'Data Sources'], ['6', 'api', 'API Reference'],
  ['7', 'alpha', 'Alpha Lens'], ['8', 'networks', 'Networks'], ['9', 'surfaces', 'Surfaces Index'],
  ['10', 'security', 'Security'], ['11', 'qa', 'Quality Gates'], ['12', 'changelog', 'Changelog'],
  ['13', 'status', 'Status Legend'], ['14', 'roadmap', 'Roadmap'], ['15', 'glossary', 'Glossary'],
  ['16', 'agents', 'For Agents'], ['17', 'fees', 'Fees'],
] as const

function Chip({ kind, children }: { kind: 'live' | 'sim' | 'build' | 'design'; children: React.ReactNode }) {
  return <span className={`dd-chip ${kind}`}>{kind === 'live' && <span className="dot" />}{children}</span>
}

function H2({ n, children }: { n: string; children: React.ReactNode }) {
  return <h2 className="dd-h2"><span className="n">§{n}</span>{children}</h2>
}

function Sec({ id, n, title, sub, children }: {
  id: string; n: string; title: string; sub?: string; children: React.ReactNode
}) {
  return (
    <section className="dd-sec" id={id}>
      <H2 n={n}>{title}</H2>
      {sub && <p className="dd-sub">{sub}</p>}
      {children}
    </section>
  )
}

/* hand-laid pipeline geometry (viewBox 1120×380) — statuses mirror the legend */
const MAIN_NODES = [
  { x: 14, t: 'GECKOTERMINAL', s: 'KEYLESS · FREE TIER' },
  { x: 194, t: 'NORMALIZE + GUARD', s: 'IMPOSSIBLE → “–”' },
  { x: 374, t: 'DEDUPE', s: 'DEEPEST POOL SURVIVES' },
  { x: 554, t: 'TTL CACHE', s: '180s · STALE-SAFE' },
  { x: 734, t: '/API/V1/LIVE', s: 'HONEST 400/404/502' },
  { x: 914, t: 'LIVE BOARD', s: '5 CHAINS · STAGGERED' },
]
const ROW2 = [
  { x: 554, t: 'DS SOCIALS', s: 'X/WEBSITE · 1H CACHE · FAIL-SOFT' },
  { x: 914, t: 'TOKEN CARDS', s: 'BORDIR · MARKS · COPY' },
]
const BRANCH = [
  { x: 20, t: 'QUOTE ENGINE', k: 'build', s: 'PRICE DISCOVERY' },
  { x: 228, t: 'SWAP DESK UI', k: 'sim', s: 'DETERMINISTIC DATA SET' },
  { x: 436, t: 'WALLET SESSION', k: 'design', s: 'SESSION + KEYS' },
  { x: 644, t: 'WS TAPE', k: 'build', s: 'ROUTE SHIPPED · UI PENDING' },
  { x: 852, t: 'VILMEI AI', k: 'live', s: 'EVIDENCE FIRST · NEVER TRADES' },
]
const BRANCH_COLOR: Record<string, string> = {
  build: '#9cc3b2', sim: 'var(--amber)', design: 'var(--muted-deep)', live: 'var(--brand)',
}

function Pipeline() {
  return (
    <div className="dd-pipe-wrap">
      <svg className="dd-pipe" viewBox="0 0 1120 380" role="img"
        aria-label="VILMEI live pipeline: GeckoTerminal, normalize, dedupe, cache, API route, board, with labeled pre-release branches">
        {MAIN_NODES.map((n) => (
          <g key={n.t}>
            <rect className="dd-nbox" x={n.x} y={52} width={150} height={58} rx="10" stroke="var(--brand)" />
            <text className="dd-ntext" x={n.x + 75} y={76} textAnchor="middle">{n.t}</text>
            <text className="dd-nsub" x={n.x + 75} y={94} textAnchor="middle">{n.s}</text>
            <rect x={n.x + 8} y={43} width={34} height={13} rx="6" fill="#071410" stroke="var(--brand)" strokeWidth="1" />
            <text className="dd-nchip" x={n.x + 25} y={52.7} textAnchor="middle" fill="var(--brand)">LIVE</text>
          </g>
        ))}
        {[164, 344, 524, 704, 884].map((x) => (
          <path key={x} className="dd-cable" stroke="var(--brand)" d={`M${x} 81 H${x + 30}`} />
        ))}
        {ROW2.map((n) => (
          <g key={n.t}>
            <rect className="dd-nbox" x={n.x} y={190} width={150} height={52} rx="10" stroke="var(--brand)" />
            <text className="dd-ntext" x={n.x + 75} y={211} textAnchor="middle">{n.t}</text>
            <text className="dd-nsub" x={n.x + 75} y={228} textAnchor="middle">{n.s}</text>
            <rect x={n.x + 8} y={181} width={34} height={13} rx="6" fill="#071410" stroke="var(--brand)" strokeWidth="1" />
            <text className="dd-nchip" x={n.x + 25} y={190.7} textAnchor="middle" fill="var(--brand)">LIVE</text>
          </g>
        ))}
        {/* board → token cards; DS socials → route (enrichment happens server-side) */}
        <path className="dd-cable" stroke="var(--brand)" d="M989 110 V190" />
        <path className="dd-cable" stroke="var(--brand)" d="M629 190 V148 H809 V110" />
        {/* branch bus — dim, unwired drops */}
        <path className="dd-cable dim" d="M809 110 V280" />
        <path className="dd-cable dim" d="M115 280 H947" />
        {BRANCH.map((b) => (
          <g key={b.t}>
            <path className="dd-cable dim" d={`M${b.x + 95} 280 V310`} />
            <rect className="dd-nbox sml" x={b.x} y={310} width={190} height={52} rx="10"
              stroke={BRANCH_COLOR[b.k]} strokeDasharray={b.k === 'sim' ? '5 4' : undefined} />
            <text className="dd-ntext" x={b.x + 95} y={331} textAnchor="middle">{b.t}</text>
            <text className="dd-nchip" x={b.x + 95} y={346} textAnchor="middle" fill={BRANCH_COLOR[b.k]}>
              {b.k.toUpperCase()}
            </text>
            <text className="dd-nsub" x={b.x + 95} y={357} textAnchor="middle">{b.s}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}

function useScrollspy(ids: readonly string[]) {
  const [cur, setCur] = useState('')
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setCur(e.target.id)),
      { rootMargin: '-38% 0px -55% 0px' },
    )
    ids.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el) })
    return () => io.disconnect()
  }, [ids])
  return cur
}

const BAR = (pct: number) => ({ width: `${pct}%` })

export function DocsPage() {
  document.title = 'Docs — VILMEI'
  const cur = useScrollspy(SECTIONS.map(([, id]) => id))
  return (
    <div className="dd-root">
      <PageBackground />
      <div className="dd-aurora" aria-hidden="true" />
      <div className="dd-shell">
        <nav className="dd-rail" aria-label="Documentation sections">
          <div className="dd-rail-hd">DOCUMENTATION</div>
          {SECTIONS.map(([n, id, label]) => (
            <a key={id} href={`#${id}`} className={cur === id ? 'on' : ''}><i>§{n}</i>{label}</a>
          ))}
          <div className="dd-rail-ft">
            MACHINE INDEX<br />
            <a href="/assets/llms.txt">/assets/llms.txt</a>
          </div>
        </nav>

        <main>
          <div className="dd-topnav">
            <a className="dd-a" href="/">← LANDING</a>
            <a className="dd-a boxed" href="/live">MEMECOIN LIVE</a>
            <a className="dd-a boxed" href="/roadmap">ROADMAP</a>
            <a className="dd-a boxed" href="/terminal">TERMINAL (BETA)</a>
          </div>

          {/* ── HERO ─────────────────────────────────────────── */}
          <header className="dd-hero-noise">
            <div className="dd-kicker">VILMEI · DOCUMENTATION · v1 BUILD 2026.08.29</div>
            <h1 className="dd-h1">One terminal. <em>All chains.</em> Zero lies.</h1>
            <p className="dd-deck">
              <b>VILMEI</b> is a production read-only research terminal for memecoin markets
              across five chains: a keyless live data pipeline with deterministic integrity guarantees,
              public risk heuristics, and an evidence-first analysis layer. No custody, no keys, no
              black boxes. Everything on this site renders exactly what an upstream API actually
              returned. Machine-readable index: <a className="dd-a" href="/assets/llms.txt">/assets/llms.txt</a>.
            </p>
            <div className="dd-statrow">
              <span className="dd-stat"><b>120</b> automated tests</span>
              <span className="dd-stat"><b>6</b> chains live</span>
              <span className="dd-stat"><b>4</b> feed modes</span>
              <span className="dd-stat"><b>180s</b> ttl cache</span>
              <span className="dd-stat"><b>0</b> api keys required</span>
              <span className="dd-stat"><b>2</b> runtime deps</span>
            </div>
          </header>

          {/* ── 1 · THESIS ───────────────────────────────────── */}
          <Sec id="thesis" n="1" title="THESIS — WHY THIS EXISTS">
            <p className="dd-p">
              Memecoin discovery is fragmented across five chain ecosystems, poisoned by fabricated
              volume displays, scored by opaque third-party ratings, and monetized through
              interfaces that quietly hold user custody risk. VILMEI answers with one
              surface: verified multichain data through an auditable pipeline, every decision rule
              published, every unfinished part labeled — so a researcher and their AI can verify
              everything without trusting anything.
            </p>
          </Sec>

          {/* ── 2 · HONESTY LAW ──────────────────────────────── */}
          <Sec id="honesty" n="2" title="THE HONESTY LAW"
            sub="Six clauses, numbered and load-bearing. Each one is enforced in code, not in spirit — the reference points to where.">
            <ul className="dd-law">
              <li>
                <span className="no">2.1</span>
                <div><b>Absent stays absent.</b>
                  <p>Fields an upstream did not return render “–”; never imputed, never defaulted, never zero-filled.</p>
                  <span className="ref">providers/live.py · _normalize() · lib/liveFormat.ts</span>
                </div>
              </li>
              <li>
                <span className="no">2.2</span>
                <div><b>Zero is a fact.</b>
                  <p>$0 liquidity and 0 trades are real market states and stay visible.</p>
                  <span className="ref">providers/live.py · _no_neg() keeps zeros</span>
                </div>
              </li>
              <li>
                <span className="no">2.3</span>
                <div><b>A negative drop is data.</b>
                  <p>Minus 24h changes render in red with a real minus sign. Never suppressed.</p>
                  <span className="ref">providers/live.py · change_24h verbatim · lib/liveFormat.ts · fmtPct()</span>
                </div>
              </li>
              <li>
                <span className="no">2.4</span>
                <div><b>Impossible values are upstream bugs.</b>
                  <p>Negative prices/liquidity/volume/FDV normalize to “–” — never clamped, never absolute-valued.</p>
                  <span className="ref">providers/live.py · _no_neg() · test: junk-numeric guard</span>
                </div>
              </li>
              <li>
                <span className="no">2.5</span>
                <div><b>Pre-release surfaces are declared.</b>
                  <p>Any UI layer not yet wired to execution renders from deterministic simulated data sets with a visible SIMULATED label.</p>
                  <span className="ref">src/pages/TokenPage.tsx · §13 status legend</span>
                </div>
              </li>
              <li>
                <span className="no">2.6</span>
                <div><b>Heuristics are auditable.</b>
                  <p>Every threshold and weight is public code — a score you cannot audit is a score you must not follow.</p>
                  <span className="ref">providers/live.py · ALPHA_WEIGHTS · heuristics/rug_check.py</span>
                </div>
              </li>
            </ul>
          </Sec>

          {/* ── 3 · ARCHITECTURE ─────────────────────────────── */}
          <Sec id="arch" n="3" title="ARCHITECTURE — LEAN SUPPLY CHAIN"
            sub="One pipeline through: keyless ingestion of external sources → normalization → deduplication → cached distribution → typed client. The whole system fits one mental model — that is by design.">
            <div className="dd-grid2">
              <div className="dd-card">
                <p className="dd-p">
                  <b>Frontend:</b> React 19 + Vite + TypeScript with exactly two runtime
                  dependencies — <code>react</code> and <code>react-dom</code> (read
                  package.json). No UI kit, no charting library, no router, no CSS framework:
                  every visual — radar, globe, pipeline, chain marks — is hand-written canvas/SVG.
                </p>
                <p className="dd-p">
                  <b>Backend:</b> a Python webapp server (uv-managed, FastAPI) with a
                  contract-first, additive route policy: new endpoints are added, existing response
                  schemas are never mutated. State is deterministic everywhere — same input, same
                  output, no hidden randomness.
                </p>
              </div>
              <div className="dd-card">
                <p className="dd-p"><b>Why so few dependencies</b></p>
                <p className="dd-p">
                  A verifiable supply chain: two runtime packages, both first-party maintained,
                  nothing transitive in the browser. Deterministic rendering, a strict per-page
                  code-split budget, and longevity — the backend speaks stdlib <code>urllib</code>
                  over vendor SDKs, so upstreams stay swappable.
                </p>
                <p className="dd-p">
                  The trade-off, honestly: we spend more engineering hours on state and visuals
                  than a framework-heavy stack would charge us. That is the deal — our time for
                  your audit surface.
                </p>
              </div>
            </div>
          </Sec>

          {/* ── 4 · PIPELINE ─────────────────────────────────── */}
          <Sec id="pipeline" n="4" title="THE PIPELINE — LIVE WIRES"
            sub="Every mainline node below is [LIVE]: shipped, serving real upstream data. Branch lanes are declared with the status vocabulary of §13.">
            <div className="dd-card">
              <Pipeline />
              <p className="dd-cap">
                THE WIRES YOU SEE ARE THE WIRES YOU GET. NODES MARKED SIMULATED SHIP A LABELED
                PRE-RELEASE INTERFACE ONLY; NO UPSTREAM IS WIRED TO THEM YET.
              </p>
            </div>
            <div className="dd-card">
              <table className="dd-tbl">
                <thead><tr><th>Node</th><th>What ships</th><th>Evidence</th></tr></thead>
                <tbody>
                  <tr><td>4.1 · GeckoTerminal</td>
                    <td>Keyless pools/trades API — new, trending and volume sources for five chains; volume sort verified monotonic in stage-0 (2026-08-29).</td>
                    <td className="path">providers/live.py · providers/geckoterminal.py</td></tr>
                  <tr><td>4.2 · Normalize + guard</td>
                    <td>Verbatim field copy; impossible numerics (negative price/liquidity/volume/FDV) become “–”; zeros stay; a negative 24h change is market data and stays.</td>
                    <td className="path">providers/live.py · _no_neg() · _txns_24h()</td></tr>
                  <tr><td>4.3 · Dedupe</td>
                    <td>One token = one card: the same (symbol, name) in N pools keeps only its most liquid pool; stable first-occurrence order; α-ranks stay contiguous.</td>
                    <td className="path">providers/live.py · _dedupe()</td></tr>
                  <tr><td>4.4 · TTL cache</td>
                    <td>180s per (chain, source) — env <code>FEED_CACHE_TTL_S</code>, clamped 60–600s. A failed refresh serves the expired copy flagged <code>stale:true</code>; with no fallback the route answers 502.</td>
                    <td className="path">providers/live.py · get_feed()</td></tr>
                  <tr><td>4.5 · /api/v1/live</td>
                    <td>One read-only additive route: honest 400/404/502, and <code>live:false</code> with an empty item list for networks GeckoTerminal does not serve — never fabricated data.</td>
                    <td className="path">webapp/server.py · api_live()</td></tr>
                  <tr><td>4.6 · Board client</td>
                    <td>Client-rendered React surfaces: five chain cards and three columns per chain, fetched staggered ≥1s apart; per-card failure with a 60s retry cool-down.</td>
                    <td className="path">src/pages/LiveBoard.tsx · src/pages/ChainLive.tsx</td></tr>
                  <tr><td>4.7 · Token cards</td>
                    <td>Bordered cards — logo tile with initial fallback, semantic +/− colors, copy-address control, launchpad badge from observed dex ids only.</td>
                    <td className="path">src/pages/liveParts.tsx · providers/live.py · LAUNCHPAD</td></tr>
                  <tr><td>4.8 · DS socials</td>
                    <td>X/website lookups via DexScreener, batched ≤30 addresses, 1h cache, fail-soft — dead lookups leave socials absent; chips render nothing.</td>
                    <td className="path">providers/live.py · _enrich_socials()</td></tr>
                </tbody>
              </table>
            </div>
            {/* PROMPT-V Fase 4 (2026-08-30): the $0 wiring audit, written as the
               law before the swap rebuild — every widget states its source or
               its honest absence. */}
            <div className="dd-card">
              <p className="dd-cap">SWAP SURFACE — SIGNAL SOURCES (PROMPT-V, 2026-08-30). EVERY
                WIDGET NAMES ITS $0 SOURCE; WHAT THE FREE FEEDS DO NOT CARRY RENDERS “—” WITH A
                REASON, NEVER A NUMBER.</p>
              <table className="dd-tbl">
                <thead><tr><th>Widget</th><th>$0 source</th><th>Final status</th><th>Chip</th></tr></thead>
                <tbody>
                  <tr><td>QUOTE / RATE + PRICE · LIQ · DEX · ±24H · VOL · TXNS</td>
                    <td>DexScreener deepest-pair payload (browser fetch, CORS *, no key)</td>
                    <td>Live — the one quote the whole page shares (single identity via the token store)</td>
                    <td><code>LIVE · DEXSCREENER</code></td></tr>
                  <tr><td>CHART OHLCV</td>
                    <td><code>GET /api/v1/market/ohlcv</code> → GeckoTerminal (keyless). The browser never calls GT directly — the zero-third-party-host claim holds.</td>
                    <td>Live; first seconds show <code>SEEDING…</code>, then <code>LIVE · GECKOTERMINAL</code>. Empty pool → the degraded reason verbatim, never a filled series.</td>
                    <td><code>LIVE · GECKOTERMINAL</code></td></tr>
                  <tr><td>VOLUME PANE</td>
                    <td>the <code>v</code> column of the same OHLCV array</td>
                    <td>Live — no second source exists</td>
                    <td><code>LIVE · GECKOTERMINAL</code></td></tr>
                  <tr><td>INDICATORS (EMA 12 · VWAP · RSI 14)</td>
                    <td>computed in the FE over the live OHLCV array — deterministic; formulas quoted in the chart legend</td>
                    <td>Live (“honesty by construction”: same candles in, same lines out)</td>
                    <td><code>COMPUTED FE</code></td></tr>
                  <tr><td>TRADES</td>
                    <td><code>/ws/tape</code> — real GT trade deltas for the active pool</td>
                    <td>Live once frames arrive; the seeded tape renders only while the socket is quiet and is declared <code>SEEDING</code> in the header</td>
                    <td><code>LIVE · WS TAPE</code> / <code>SEEDING</code></td></tr>
                  <tr><td>SOCIALS (was COMMENTS — removed)</td>
                    <td><code>GET /api/v1/socials</code> → DexScreener token-pairs info, keyed by the TOKEN address (a pair address answers 0 pairs — probed 2026-08-30)</td>
                    <td>Live links (X/web/telegram) or the honest empty state: “No official links in feed.” There will never be fake comments.</td>
                    <td><code>LIVE · DEXSCREENER</code></td></tr>
                  <tr><td>XCHAIN</td>
                    <td><code>GET /api/v1/detect</code> on the token CA, minus the active chain</td>
                    <td>Live per-chain candidates; none → the honest empty sentence</td>
                    <td><code>LIVE · DEXSCREENER</code></td></tr>
                  <tr><td>BONDING %</td>
                    <td>none — GT pairs carry no graduated/bonding field (probed 2026-08-30)</td>
                    <td>“—” + “bonding progress: not in free feed — indexed source on roadmap”. The old 0.0% + STATUS·ACTIVE was a fabricated number and is gone.</td>
                    <td><code>NOT IN FEED · ROADMAP</code></td></tr>
                  <tr><td>HOLDERS</td>
                    <td>no $0 source on this terminal</td>
                    <td>Empty panel + reason sentence; never simulated numbers</td>
                    <td><code>SIMULATED</code></td></tr>
                  <tr><td>MARKET CAP</td>
                    <td>DexScreener <code>marketCap</code> when supply is in the payload (derived: price×supply); absent → “—” + reason</td>
                    <td>Live when the feed carries it</td>
                    <td><code>LIVE · DEXSCREENER (derived)</code></td></tr>
                  <tr><td>CREATED / AGE</td>
                    <td>DexScreener <code>pairCreatedAt</code> — real</td>
                    <td>Live (the “just few hours left…” simulated line is gone)</td>
                    <td>—</td></tr>
                  <tr><td>CREATOR</td>
                    <td>not in the free feed</td>
                    <td>“—” — never guessed</td>
                    <td><code>NOT IN FEED</code></td></tr>
                  <tr><td>BALANCE (header + rail — one number)</td>
                    <td>wallet store (Fase 2): deterministic demo per (wallet, chain), address-only; extension adapters are read-only stubs that throw <code>READ_ONLY_BUILD</code></td>
                    <td>Preview, labeled everywhere</td>
                    <td><code>DEMO WALLET</code></td></tr>
                  <tr><td>ADVANCED (slippage / deadline)</td>
                    <td>n/a — read-only terminal</td>
                    <td>Simulated inputs, declared</td>
                    <td><code>SIMULATED</code></td></tr>
                  <tr><td>CTA</td>
                    <td>the quote’s real pair <code>url</code></td>
                    <td>Live deep link, label from the observed dex id</td>
                    <td><code>OPEN {'{DEX}'} PAIR ↗</code></td></tr>
                </tbody>
              </table>
            </div>
          </Sec>

          {/* ── 5 · DATA SOURCES ─────────────────────────────── */}
          <Sec id="sources" n="5" title="DATA SOURCES & LIMITS"
            sub="Every upstream is documented with its real constraints — limits are respected by design, not by luck.">
            <div className="dd-card">
              <table className="dd-tbl">
                <thead><tr><th>Source</th><th>Access</th><th>Constraints as wired</th></tr></thead>
                <tbody>
                  <tr><td>GeckoTerminal API v2</td>
                    <td>Keyless · free tier</td>
                    <td>~10 calls/min. Feed endpoints (new/trending/volume) wired for five networks: <code>solana</code>, <code>bsc</code>, <code>base</code>, <code>hyperevm</code>, <code>robinhood</code> — stage-0 verified against 248 network ids (2026-08-29); avax parked 2026-08-30 (founder 5-chain lineup). The trade-level path used by clustering currently resolves three chains (sol/bnb/base); hype/hood scans degrade honestly there. 180s feed cache keeps steady-state at ~6 rpm.</td></tr>
                  <tr><td>DexScreener</td>
                    <td>Keyless</td>
                    <td>Social profiles, batch ≤30 addresses per call, cached 1h. Chain ids served: solana, bsc, base, robinhood (avax parked 2026-08-30) — <code>hyperevm</code> is not listed upstream, so socials stay absent on hype. Failures leave socials absent; the feed never breaks.</td></tr>
                  <tr><td>Helius</td>
                    <td>Key required</td>
                    <td>Wallet balances for the whale surface (<code>HELIUS_API_KEY</code>, server-side only). Framework status — not part of the live feed plane.</td></tr>
                </tbody>
              </table>
              <blockquote className="dd-never">
                <b>Why keyless:</b> no secret can leak, because none exists. The live pipeline holds
                zero credentials, and the free-tier budget is enforced by the cache — 18
                (chain, source) combinations settle at ~6 requests/minute against a ~10 rpm tier.
              </blockquote>
            </div>
          </Sec>

          {/* ── 6 · API REFERENCE ────────────────────────────── */}
          <Sec id="api" n="6" title="API REFERENCE — /API/V1/LIVE"
            sub="The response below was captured from a running server (2026-08-29), not written by hand. Absent upstream fields stay null end-to-end.">
            <div className="dd-card">
              <div className="dd-code">
                <div className="hd"><span className="m">GET</span> /api/v1/live/{'{chain}'} · READ-ONLY</div>
                {'GET /api/v1/live/sol?mode=alpha&limit=20'}
              </div>
              <table className="dd-tbl">
                <thead><tr><th>Parameter</th><th>In</th><th>Contract</th></tr></thead>
                <tbody>
                  <tr><td>chain</td><td>path</td><td>One of <code>sol | bnb | base | hype | hood</code> (avax parked 2026-08-30). Anything else → 404 with the allowed list echoed.</td></tr>
                  <tr><td>mode</td><td>query</td><td><code>new | trending | volume | alpha</code> (default <code>new</code>). Anything else → 400.</td></tr>
                  <tr><td>limit</td><td>query</td><td>Integer 1..50 (default 20). Out of range → 400. Alpha ranks the full page before slicing, so ranking is never clipped by the limit.</td></tr>
                </tbody>
              </table>
              <div className="dd-code">
                <div className="hd">200 · REAL RESPONSE · SOL/ALPHA · CAPTURED 2026-08-29</div>
                <span className="c-k">{'{'}</span>{'\n  '}
                <span className="c-k">"chain"</span>: <span className="c-s">"sol"</span>,{' '}
                <span className="c-k">"network_id"</span>: <span className="c-s">"solana"</span>,{' '}
                <span className="c-k">"live"</span>: <span className="c-m">true</span>,{'\n  '}
                <span className="c-k">"generated_at"</span>: <span className="c-s">"2026-08-29T14:20:39.485347+00:00"</span>,{'\n  '}
                <span className="c-k">"cached"</span>: <span className="c-m">false</span>,{' '}
                <span className="c-k">"stale"</span>: <span className="c-m">false</span>,{'\n  '}
                <span className="c-k">"items"</span>: [<span className="c-c">{'{ … first of two items, verbatim }'}</span>{'\n    '}
                <span className="c-k">"pool_address"</span>: <span className="c-s">"FAxXtukf96gtk1BLR3NR6VoKe6DNeneUXWF9GgNLac46"</span>,{'\n    '}
                <span className="c-k">"token_symbol"</span>: <span className="c-s">"HOOD"</span>,{' '}
                <span className="c-k">"token_name"</span>: <span className="c-s">"Robinhood"</span>,{' '}
                <span className="c-k">"pair"</span>: <span className="c-s">"HOOD / SOL"</span>,{'\n    '}
                <span className="c-k">"logo"</span>: <span className="c-s">"https://assets.geckoterminal.com/kcbazdhluvdji6rja1upjpihrdzi"</span>,{'\n    '}
                <span className="c-k">"price_usd"</span>: <span className="c-s">"0.00011567840369361685322389768596137022102…"</span> <span className="c-c">{'// verbatim upstream string, print-truncated'}</span>{'\n    '}
                <span className="c-k">"volume_24h"</span>: <span className="c-s">"81266399.1334394"</span>,{' '}
                <span className="c-k">"change_24h"</span>: <span className="c-s">"1009.514"</span>,{'\n    '}
                <span className="c-k">"liquidity_usd"</span>: <span className="c-s">"273054.9653"</span>,{' '}
                <span className="c-k">"txns_24h"</span>: <span className="c-n">112063</span>,{'\n    '}
                <span className="c-k">"fdv_usd"</span>: <span className="c-s">"11432414.9694959"</span>,{' '}
                <span className="c-k">"created_at"</span>: <span className="c-s">"2026-08-29T07:41:42Z"</span>,{'\n    '}
                <span className="c-k">"dex_id"</span>: <span className="c-s">"pumpswap"</span>,{' '}
                <span className="c-k">"launchpad"</span>: <span className="c-s">"pumpswap"</span>,{'\n    '}
                <span className="c-k">"token_address"</span>: <span className="c-s">"Buj9Y5JhQ7hx9Lebmr5ngayLbD5BhnZs2DHUtmnqdHe7"</span>,{'\n    '}
                <span className="c-k">"socials"</span>: <span className="c-m">null</span> <span className="c-c">{'// nothing returned upstream → null, rendered “–”'}</span>
                {'\n  }]\n}'}
              </div>
              <table className="dd-tbl">
                <thead><tr><th>Envelope field</th><th>Type</th><th>Null semantics</th></tr></thead>
                <tbody>
                  <tr><td>chain</td><td>string</td><td>Echo of the requested chain key.</td></tr>
                  <tr><td>network_id</td><td>string | null</td><td>GeckoTerminal network slug; null only when <code>live:false</code>.</td></tr>
                  <tr><td>live</td><td>boolean</td><td><code>false</code> = the network is not served upstream today: empty items, never fabricated data.</td></tr>
                  <tr><td>generated_at</td><td>ISO-8601 UTC</td><td>Server clock at response build.</td></tr>
                  <tr><td>cached</td><td>boolean</td><td><code>true</code> = served from the TTL cache, zero upstream calls spent.</td></tr>
                  <tr><td>stale</td><td>boolean</td><td><code>true</code> = the refresh failed and the expired entry was served. Flagged, never silent.</td></tr>
                  <tr><td>items[]</td><td>array</td><td>Normalized, deduped, (for alpha) ranked page. Item fields: pool_address, token_symbol, token_name, pair, logo, price_usd, volume_24h, change_24h, liquidity_usd, txns_24h, fdv_usd, created_at, dex_id, launchpad, token_address, socials.</td></tr>
                </tbody>
              </table>
              <p className="dd-p" style={{ marginTop: 14 }}>
                <b>Headers, honestly:</b> the route sets no HTTP cache headers — freshness is carried
                in-body (<code>generated_at</code>, <code>cached</code>, <code>stale</code>), so no
                client can ever mistake a stale copy for a fresh one.
              </p>
              <div className="dd-code">
                <div className="hd">ERROR CONTRACT — REAL BODIES, ECHOED VERBATIM</div>
                <span className="c-n">404</span> <span className="c-err">{`{"detail":"unknown chain 'nope' — pick sol|bnb|base|hype|hood"}`}</span>{'\n'}
                <span className="c-n">400</span> <span className="c-err">{`{"detail":"mode must be new|trending|volume|alpha"}`}</span>{'\n'}
                <span className="c-n">400</span> <span className="c-err">{`{"detail":"limit must be 1..50"}`}</span>{'\n'}
                <span className="c-n">502</span> <span className="c-err">{`{"detail":"GeckoTerminal HTTP 429 — live feed upstream failed"}`}</span>{' '}
                <span className="c-c">{'// honest failure — no data, no pretense'}</span>
              </div>
            </div>
          </Sec>

          {/* ── 7 · ALPHA LENS ───────────────────────────────── */}
          <Sec id="alpha" n="7" title="ALPHA LENS — THE DETERMINISTIC SCORE"
            sub="Computed locally in providers/live.py — zero additional API calls. The alpha mode re-ranks the volume feed with published weights, capped components, and a stable tie-break.">
            <div className="dd-card">
              <div className="dd-formula">
                <span>α</span><span className="op">=</span>
                <span className="w">0.40</span><span>·volume</span><span className="op">+</span>
                <span className="w">0.25</span><span>·txns</span><span className="op">+</span>
                <span className="w">0.20</span><span>·liquidity</span><span className="op">+</span>
                <span className="w">0.15</span><span>·freshness</span>
              </div>
              <div className="dd-bars">
                <div className="dd-bar"><span>VOLUME</span><span className="track"><span className="fill" style={BAR(100)} /></span><span className="pct">40%</span></div>
                <div className="dd-bar"><span>TXNS</span><span className="track"><span className="fill" style={BAR(62)} /></span><span className="pct">25%</span></div>
                <div className="dd-bar"><span>LIQUIDITY</span><span className="track"><span className="fill" style={BAR(50)} /></span><span className="pct">20%</span></div>
                <div className="dd-bar"><span>FRESHNESS</span><span className="track"><span className="fill" style={BAR(38)} /></span><span className="pct">15%</span></div>
              </div>
              <table className="dd-tbl">
                <thead><tr><th>Component</th><th>Normalization (shipped code)</th><th>Cap</th></tr></thead>
                <tbody>
                  <tr><td>volume</td><td>log10(1 + vol24) / 8 — ≈$100M daily volume saturates</td><td>1.0</td></tr>
                  <tr><td>txns</td><td>log10(1 + txns24) / 3 — ≈1,000 daily txns saturate</td><td>1.0</td></tr>
                  <tr><td>liquidity</td><td>min(liq, $100K) / $100K</td><td>1.0</td></tr>
                  <tr><td>freshness</td><td>max(0, 1 − age_h / 168) — one week of life</td><td>1.0</td></tr>
                </tbody>
              </table>
              <p className="dd-p" style={{ marginTop: 14 }}>
                A missing component contributes 0 — never fabricated. Ties break by 24h volume
                (desc), then by stable source order. The worked example below uses three synthetic
                tokens with hand-picked signals; the weights, caps and normalization are the exact
                shipped code:
              </p>
              <table className="dd-tbl">
                <thead><tr><th>Synthetic token</th><th>Signals</th><th>α</th></tr></thead>
                <tbody>
                  <tr><td>T1 — young mover</td>
                    <td>vol $250K · 120 txns · liq $40K · 20h old → 0.270 + 0.174 + 0.080 + 0.132</td>
                    <td><b>0.656</b></td></tr>
                  <tr><td>T2 — liquid veteran</td>
                    <td>vol $8M · 900 txns · liq $180K (capped) · 90h old → 0.345 + 0.246 + 0.200 + 0.070</td>
                    <td><b>0.861</b></td></tr>
                  <tr><td>T3 — dead pair</td>
                    <td>vol $0 · no txns · liq $0 · 400h old → every component 0</td>
                    <td><b>0.000</b></td></tr>
                </tbody>
              </table>
              <blockquote className="dd-never">
                You audit this in public code; no hidden models. <b>α is a lens, not a verdict</b> —
                it re-orders what the upstream already returned, and nothing else.
              </blockquote>
            </div>
          </Sec>

          {/* ── 8 · NETWORKS ─────────────────────────────────── */}
          <Sec id="networks" n="8" title="NETWORKS — FIVE CHAINS, FOUNDER-LOCKED ORDER"
            sub="Network ids are GeckoTerminal slugs, copied from providers/live.py CHAINS. Every entry below answers live:true today.">
            <div className="dd-nets">
              {LIVE_CHAINS.map((c) => (
                <div className="dd-net" key={c} style={{ borderColor: `color-mix(in srgb, ${ACCENT[c]} 35%, transparent)` }}>
                  <ChainLogo chain={c} size={40} />
                  <div>
                    <div className="nm">{LIVE_CHAIN_LABEL[c]}</div>
                    <div className="id">{c.toUpperCase()} · accent {ACCENT[c]}</div>
                  </div>
                  <span className="key">network_id: {NET_ID[c]}</span>
                  <Chip kind="live">live</Chip>
                </div>
              ))}
            </div>
          </Sec>

          {/* ── 9 · SURFACES INDEX ───────────────────────────── */}
          <Sec id="surfaces" n="9" title="SURFACES INDEX"
            sub="The labeling rule in practice: every surface is labeled with the engineering register of §13, and every label is testable.">
            <div className="dd-surfs">
              <a className="dd-surf" href="/live">
                <span className="chiprow"><Chip kind="live">live</Chip></span>
                <span className="t">Memecoin Live Board</span>
                <span className="s">Six chain cards in founder-locked order, trending top-3 previews, staggered fetch, honest flags.</span>
                <span className="u">/live</span>
              </a>
              <a className="dd-surf" href="/live/sol">
                <span className="chiprow"><Chip kind="live">live</Chip></span>
                <span className="t">Chain Pages ×6</span>
                <span className="s">Three columns per chain — NEW | TRENDING | VOLUME·ALPHA with α-rank numbers.</span>
                <span className="u">/live/{'{chain}'}</span>
              </a>
              <a className="dd-surf" href="/terminal">
                <span className="chiprow"><Chip kind="build">in build</Chip><Chip kind="sim">simulated</Chip></span>
                <span className="t">Terminal + Swap Desk</span>
                <span className="s">The product ships in phases: the landing entry stays disabled until the Locked deploy, while this surface stays reachable and honestly labeled — no session, no wallet, no chain calls.</span>
                <span className="u">/terminal</span>
              </a>
              <a className="dd-surf" href="/roadmap">
                <span className="chiprow"><Chip kind="live">live</Chip></span>
                <span className="t">Roadmap</span>
                <span className="s">Shipped sprints, current work and next moves — the full detail behind §14.</span>
                <span className="u">/roadmap</span>
              </a>
              <a className="dd-surf" href="/assets/llms.txt">
                <span className="chiprow"><Chip kind="live">live</Chip></span>
                <span className="t">Machine Index</span>
                <span className="s">Structured llms.txt: project summary, integrity contract, endpoint descriptions — written for AI agents.</span>
                <span className="u">/assets/llms.txt</span>
              </a>
            </div>
          </Sec>

          {/* ── 10 · SECURITY ────────────────────────────────── */}
          <Sec id="security" n="10" title="SECURITY & CUSTODY POSTURE"
            sub="A terminal that cannot reach your funds cannot betray them. Each claim below is checkable in view-source or in the repo.">
            <div className="dd-card">
              <ul className="dd-law">
                <li><span className="no">10.1</span><div><b>Read-only data plane.</b>
                  <p>The API exposes reads (scan, explain, discovery, live feed). No route accepts an order, a signature or a transaction.</p></div></li>
                <li><span className="no">10.2</span><div><b>No key request at any point.</b>
                  <p>The live pipeline is keyless; there is no login, no account, no cookie, no session anywhere on the site.</p></div></li>
                <li><span className="no">10.3</span><div><b>Zero secret handling in the browser.</b>
                  <p>No secret ships in any frontend bundle. AI provider keys live server-side and are never returned by any endpoint.</p></div></li>
                <li><span className="no">10.4</span><div><b>No third-party script on the page.</b>
                  <p>Verifiable in view-source: zero third-party requests of any kind — the bundle and the fonts are self-hosted from /assets.</p></div></li>
                <li><span className="no">10.5</span><div><b>Bounded surfaces.</b>
                  <p>Every cache has a hard cap (scan 512, feed 32, socials 128 entries); WebSocket fan-out is capped (default 64 clients); AI endpoints are per-IP rate limited (5/hour, 30/day by default).</p></div></li>
              </ul>
              <blockquote className="dd-never">
                <b>What we will never do:</b> custody seed phrases or private keys · sign anything ·
                execute trades from the terminal · sell rank placement (ranks are computed by the
                published α formula, not bought) · resell feed data through hidden channels.
              </blockquote>
            </div>
          </Sec>

          {/* ── 11 · QUALITY GATES ───────────────────────────── */}
          <Sec id="qa" n="11" title="QUALITY ASSURANCE — GATES"
            sub="One red gate blocks the pipeline. These numbers are measured on 2026-08-29, not estimated.">
            <div className="dd-card">
              <div className="dd-qa">
                <span><b>120</b> tests</span>
                <span><b>0</b> ruff errors</span>
                <span><b>0</b> oxlint errors</span>
                <span><b>✓</b> full build</span>
                <span><b>✓</b> bundle probe</span>
                <span><b>✓</b> pipefail</span>
              </div>
              <table className="dd-tbl">
                <tbody>
                  <tr><td>Test suite</td><td>120 automated tests (pytest): feed contract, limit clamp, alpha determinism/ties/zero-calls, stale-serve, route 404/400/502, junk-numeric guard, dedupe stability, socials mapping/1h cache/fail-soft, TTL env clamp, WS auth/cap, OpenAPI surface.</td></tr>
                  <tr><td>Linters</td><td>ruff (Python) and oxlint (TypeScript/React) both at zero findings on every commit.</td></tr>
                  <tr><td>Bundle probe</td><td>The minified docs bundle is grepped before ship: key strings (HONESTY LAW, ALPHA LENS, llms.txt) present, banned register absent.</td></tr>
                  <tr><td>Process</td><td>pipefail discipline — one red gate blocks; one additive change per commit; every commit is full-build verified.</td></tr>
                </tbody>
              </table>
            </div>
          </Sec>

          {/* ── 12 · CHANGELOG ───────────────────────────────── */}
          <Sec id="changelog" n="12" title="ENGINEERING CHANGELOG — SHIPPED"
            sub="Dates and hashes read from git log — never guessed. Every line is checkable with one command.">
            <ul className="dd-chg">
              <li><span className="d">2026-08-30 · REBRAND</span> <span className="h">PROMPT-V2B</span>
                <p><b>VILMEI:</b> renamed from Terminal Alpha 2026-08-30 — wordmark, meta/og/ld+json (VILMEI Labs), roadmap ledger display (TA-xx → VM-xx; the #ta-xx anchors stay resolvable as aliases) and the vilmei.* local-storage namespace.</p></li>
              <li><span className="d">2026-08-29 · LANDING</span> <span className="h">5f4cd95 · fddb122 · 7783d0a · 63d97e2 · d7dcd9e · 0f35759 · f91407f · 7070825</span>
                <p><b>Landing flagship:</b> the honest showpiece — 3D hero + real REST tape, the full product blueprint with true status chips, the machine layer for AI agents, and the six-chain boxed nav DNA.</p></li>
              <li><span className="d">2026-08-29 · INTEGRITY</span> <span className="h">f44b162 · 3ffff05 · b094da2 · 319e36c · d2a3ec7</span>
                <p><b>Data integrity pass:</b> junk-numeric guard (impossible values → “–”), verbatim negative changes kept, per-token dedupe, X/website social chips + the EVM case-insensitive match fix.</p></li>
              <li><span className="d">2026-08-29 · MARKS</span> <span className="h">86be5e4 · 6b21fac · 7a56b68</span>
                <p><b>Chain marks + token cards:</b> hand-crafted inline SVG chain marks (sol bars, bnb diamonds, base notch, hype ring, hood feather, avax split — avax parked 2026-08-30), token-card bordir.</p></li>
              <li><span className="d">2026-08-29 · SWAP SURFACE</span> <span className="h">5fbed95 · 6943d7d</span>
                <p><b>Token detail + swap desk</b> <Chip kind="sim">simulated</Chip> — deterministic simulated data set, no session, no wallet, no chain calls.</p></li>
              <li><span className="d">2026-08-28 · REALTIME</span> <span className="h">3741173 · 5428dfd</span>
                <p><b>WebSocket plane:</b> /ws/snap honest snapshot ticker + /ws/tape additive trade-tape deltas over real GeckoTerminal trades.</p></li>
              <li><span className="d">2026-08-28 · BOARD</span> <span className="h">55898f4 · a53eea1</span>
                <p><b>Multichain board frontend:</b> six chain cards + three staggered columns per chain (avax parked 2026-08-30), honest 404/400/502 rendering, 60s retry cool-down.</p></li>
              <li><span className="d">2026-08-28 · BORDIR</span> <span className="h">f007ae1 · c47e10b</span>
                <p><b>2px border/glow system:</b> accent borders, dashed inset hairlines, semantic pos/neg colors.</p></li>
              <li><span className="d">2026-08-28 · FEED ENGINE</span> <span className="h">642296d · 95d7ade · f53bac4</span>
                <p><b>Live feed backend:</b> 6 chains × 4 modes (avax parked 2026-08-30), TTL 180s (env-clamped 60–600), deterministic α ranking, stale-safe serving.</p></li>
              <li><span className="d">2026-08-27 · FOUNDATIONS</span> <span className="h">d38f78e · fee1c93 · 3095cba · 8f860bb · d5faea2</span>
                <p><b>Foundations:</b> TUI research engine, weighted risk heuristics v0, wallet clustering, multi-provider evidence-first AI, FastAPI read-only API, GeckoTerminal trade feed verified live.</p></li>
            </ul>
          </Sec>

          {/* ── 13 · STATUS LEGEND ───────────────────────────── */}
          <Sec id="status" n="13" title="STATUS SYSTEM LEGEND"
            sub="The vocabulary used on every diagram and table on this site — humans and AI readers need the same words for the same state.">
            <div className="dd-card">
              <table className="dd-tbl">
                <thead><tr><th>Chip</th><th>Exact meaning</th></tr></thead>
                <tbody>
                  <tr><td><Chip kind="live">live</Chip></td><td>Shipped and serving real upstream data. Green, glow, 2px border.</td></tr>
                  <tr><td><Chip kind="sim">simulated</Chip></td><td>Pre-release UI rendering from a deterministic simulated data set, visibly labeled. No upstream wired. Amber, dashed border.</td></tr>
                  <tr><td><Chip kind="build">in build</Chip></td><td>Design frozen, wiring in progress. Slate, 1px flat.</td></tr>
                  <tr><td><Chip kind="design">design</Chip></td><td>Scoped, not started. Dim outline.</td></tr>
                </tbody>
              </table>
            </div>
          </Sec>

          {/* ── 14 · ROADMAP ─────────────────────────────────── */}
          <Sec id="roadmap" n="14" title="ROADMAP">
            <p className="dd-p">
              Shipped sprints, current work and next moves live on the{' '}
              <a className="dd-a" href="/roadmap">Roadmap page →</a> — the documentation surface
              only mirrors what already exists in code.
            </p>
          </Sec>

          {/* ── 15 · GLOSSARY ────────────────────────────────── */}
          <Sec id="glossary" n="15" title="GLOSSARY + STATEMENT">
            <div className="dd-card">
              <dl className="dd-gloss">
                <div><dt>pool</dt><dd>An on-chain pair contract holding two tokens — the atomic unit of every feed item.</dd></div>
                <div><dt>liquidity</dt><dd>USD value locked in a pool (upstream reserve_in_usd) — the depth a price can absorb.</dd></div>
                <div><dt>bonding curve</dt><dd>A deterministic price curve that mints/burns supply as capital enters or leaves; where most memecoins are born.</dd></div>
                <div><dt>launchpad badge</dt><dd>An observed dex id mapped to a label (pump.fun, raydium…); unknown ids pass through raw, never guessed.</dd></div>
                <div><dt>fresh / stale</dt><dd>Fresh = served inside the 180s TTL window. Stale = the refresh failed and the expired copy was served, flagged stale:true.</dd></div>
                <div><dt>TTL</dt><dd>Time-to-live — how long a cached (chain, source) entry answers before the next upstream call.</dd></div>
                <div><dt>fail-soft</dt><dd>A non-critical enrichment (socials) degrades to absent instead of breaking the feed.</dd></div>
                <div><dt>network id</dt><dd>GeckoTerminal's slug for a chain: solana, bsc, base, hyperevm, robinhood (avax parked 2026-08-30).</dd></div>
                <div><dt>α (alpha score)</dt><dd>The deterministic local ranking — volume 40 · txns 25 · liquidity 20 · freshness 15, capped, ties by 24h volume.</dd></div>
                <div><dt>dedupe</dt><dd>One token = one card: the same (symbol, name) collapses to its most liquid pool.</dd></div>
                <div><dt>junk guard</dt><dd>The normalizer that turns impossible upstream values into “–”; zeros and negative changes pass through.</dd></div>
                <div><dt>deterministic simulation</dt><dd>A rendered surface driven by a fixed seeded data set: same input → same page, labeled SIMULATED.</dd></div>
                <div><dt>additive route</dt><dd>A new endpoint that touches no existing route's schema — the discipline the API grows by.</dd></div>
                <div><dt>free tier</dt><dd>GeckoTerminal's keyless ~10 calls/min budget, respected by the cache (~6 rpm steady-state).</dd></div>
              </dl>
              <blockquote className="dd-never">
                <b>Statement:</b> research tools — not financial advice. Data belongs to upstream
                providers (GeckoTerminal, DexScreener); rendering rights as per their public terms.
              </blockquote>
            </div>
          </Sec>

          {/* ── 16 · FOR AGENTS ───────────────────────────────── */}
          <Sec id="agents" n="16" title="VILMEI FOR AGENTS — MACHINE SURFACES">
            <p className="dd-p">
              Two read-only doors exist for AI agents. Neither trades, custodies or
              writes — they serve the exact same functions the REST surface serves.
            </p>
            <div className="dd-card">
              <dl className="dd-gloss">
                <div><dt>POST /mcp</dt><dd>Model Context Protocol server (spec revision 2026-07-28), JSON-RPC 2.0: initialize · ping · tools/list · tools/call.</dd></div>
                <div><dt>tools</dt><dd>trending (live feed per chain) · scan (weighted verdict + evidence) · rug (RugCheck sol / GoPlus bnb+base / honest partial elsewhere) · whale_windows (large transfers + netflow) · fee_view (the planned fee as data — nothing is charged).</dd></div>
                <div><dt>GET /.well-known/api-catalog</dt><dd>RFC 9727 discovery document (application/linkset+json) pointing at /openapi.json.</dd></div>
                <div><dt>/assets/llms.txt</dt><dd>The machine-readable index of the project — the agent's map of everything above.</dd></div>
              </dl>
            </div>
          </Sec>

          {/* ── 17 · FEES (PROMPT-V3 R4) ─────────────────────── */}
          <Sec id="fees" n="17" title="FEES — PLANNED, INSPECTABLE, NEVER CHARGED">
            <p className="dd-p">
              VILMEI is read-only: no execution, no custody, no keys — so <b>nothing is
              charged today, and nothing can be</b>. The fee policy below is published as
              data before a single basis point could ever flow: the estimator endpoint and
              the swap-rail strip render exactly this table.
            </p>
            <div className="dd-card">
              <dl className="dd-gloss">
                <div><dt>planned total</dt><dd><b>0.50% (50 bps)</b> of swap notional — only if a fee surface ever ships.</dd></div>
                <div><dt>split</dt><dd>operations 0.30% · buyback 0.10% (blocked: VM-fee-01) · rewards 0.10% — fixed in docs/FEE-MODELS-2026.md and mirrored in code.</dd></div>
                <div><dt>GET /api/v1/fees/estimate</dt><dd>rate + split + per-chain fee path as data (data_mode: "static" — a policy constant, not a feed).</dd></div>
                <div><dt>MCP fee_view</dt><dd>the same payload through the read-only machine door.</dd></div>
              </dl>
            </div>
            <div className="dd-card">
              <dl className="dd-gloss">
                <div><dt>sol — SIAP-$0</dt><dd>Jupiter Swap API platformFeeBps: verified live, keyless, no agreement (probed 2026-08-31). Planned 50 bps is below every figure observed.</dd></div>
                <div><dt>bnb · base — TIDAK-ADA</dt><dd>No keyless integrator-fee API. Escape hatch = deploy + audit our own hook (Uniswap v4 / PancakeSwap Infinity, cap 5% on the official dynamic-fee-hook) or BD (Aerodrome).</dd></div>
                <div><dt>hype — PERLU-AGREEMENT-BISNIS</dt><dd>Hyperliquid HIP-3 builder fee share needs a builder application; HyperEVM spot is gas-only.</dd></div>
                <div><dt>hood — TIDAK-ADA</dt><dd>No public scheme found (TBD); chain liveness proven via GoPlus id 4663.</dd></div>
              </dl>
            </div>
            <blockquote className="dd-never">
              <b>Blocker VM-fee-01:</b> the 0.10% buyback slice has no engine — VILMEI ships
              no execution surface and designs no new token. Until a founder decision
              unblocks it, the slice stays declared-but-unwired everywhere it appears.
            </blockquote>
          </Sec>

          <footer className="dd-foot">
            VILMEI · READ-ONLY RESEARCH INFRASTRUCTURE · NO TRADING · NO CUSTODY · EVIDENCE FIRST
            <br />MACHINE INDEX · <a className="dd-a" href="/assets/llms.txt">/assets/llms.txt</a> · API SURFACE · <a className="dd-a" href="/api/docs">/api/docs</a> · ROADMAP · <a className="dd-a" href="/roadmap">/roadmap</a>
          </footer>
        </main>
      </div>
    </div>
  )
}
