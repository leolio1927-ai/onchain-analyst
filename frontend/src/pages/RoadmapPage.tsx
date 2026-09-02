/* ROADMAP FLAGSHIP (PROMPT-R2) — the weekly hub of proof: a governance
   document on a 3D stage. Every claim is greppable, every date comes from
   git history (verified 2026-08-29 — never invented), every entry carries a
   stable anchor ID (#ta-xxx) quotable by humans and AI agents and mirrored
   in /assets/llms.txt. Honesty corrections vs the previous page: the swap
   desk and the docs flagship have SHIPPED, so they live in the §1 ledger —
   §2 only holds what is genuinely in progress. The banned register
   (mockup/mock/demo/dummy/fake/placeholder/coming soon/TODO/WIP) appears
   nowhere in copy, chips or comments. Visual: landing-grade fixed background
   (canvas + aurora), perspective rail with a travelling cable, cards that
   lift toward the viewer on hover; reduced motion flattens the stage. */
import { PageBackground } from '../components/visuals'
import '../styles/roadmap.css'

type ChipKind = 'shipped' | 'progress' | 'sim' | 'build' | 'design' | 'locked'

function Chip({ kind, children }: { kind: ChipKind; children: React.ReactNode }) {
  return <span className={`rr-chip ${kind}`}>{(kind === 'shipped' || kind === 'progress') && <span className="dot" />}{children}</span>
}

const SHIPPED: { id: string; tag: string; letter: string; title: string; date: string; points: string[]; evi: string; sim?: boolean }[] = [
  {
    id: 'ta-009', tag: 'VM-009', letter: 'L', title: 'Landing flagship — the honest showpiece', date: '2026-08-29',
    points: [
      '3D hero + real REST tape band — top trending per chain, staggered 60s sweep, honest flags',
      'Product blueprint: every terminal feature on the record with its true status chip',
      'Machine layer for AI agents, ledger teaser, FAQ — six-chain boxed nav DNA site-wide',
    ],
    evi: 'EVIDENCE · 5f4cd95 · fddb122 · 7783d0a · 63d97e2 · d7dcd9e · 0f35759 · 43c91ab · 8a24ae4 · 3c0e26f · 2370887 · f91407f · 7070825 · src/landing.tsx',
  },
  {
    id: 'ta-008', tag: 'VM-008', letter: 'R', title: 'Roadmap weekly hub — this page', date: '2026-08-29',
    points: [
      'Governance upgrade: stable IDs, anchor permalinks, git-dated ledger',
      'Status grammar unified with Documentation §13',
      'NON-GOALS published — the no’s are on the record',
    ],
    evi: 'EVIDENCE · this commit · src/pages/RoadmapPage.tsx',
  },
  {
    id: 'ta-007', tag: 'VM-007', letter: 'D', title: 'Documentation flagship — /docs', date: '2026-08-29',
    points: [
      'Editorial docs: honesty law, pipeline SVG, API contract with a captured live response',
      'Deterministic α worked example, surfaces index, security posture',
      'Machine-readable /assets/llms.txt for AI agents',
    ],
    evi: 'EVIDENCE · 565b82c · df9f095 · f498360 · 6b10e60 · 7cdb28d · 7e342b0 · fb25973 · src/pages/DocsPage.tsx · public/assets/llms.txt',
  },
  {
    id: 'ta-006', tag: 'VM-006', letter: 'S', title: 'Swap desk — SIMULATED surface', date: '2026-08-29', sim: true,
    points: [
      'Full token detail page: chart column + bonding + trade table',
      'Compact swap rail (PAY / GET / ADVANCED) on a deterministic data set, labeled SIMULATED',
      'No session, no wallet, no chain calls',
    ],
    evi: 'EVIDENCE · 345590f · 5fbed95 · 6943d7d · src/pages/TokenPage.tsx',
  },
  {
    id: 'ta-005', tag: 'VM-005', letter: 'X', title: 'Data integrity', date: '2026-08-29',
    points: [
      'Junk guard — impossible upstream values render “–”; zeros and negative changes stay',
      'Per-token dedupe — the most liquid pool survives, order stays stable',
      'X/website social chips on all served chains + the EVM case-insensitive fix',
    ],
    evi: 'EVIDENCE · f44b162 · 3ffff05 · b094da2 · 319e36c · d2a3ec7 · providers/live.py',
  },
  {
    id: 'ta-004', tag: 'VM-004', letter: 'W', title: 'Chain marks + token cards', date: '2026-08-29',
    points: [
      'Six hand-crafted SVG marks — sol bars, bnb diamonds, base notch, hype ring, hood feather, avax split (avax mark parked 2026-08-30)',
      'One token = one bordered card; square logo tiles with initial fallback',
    ],
    evi: 'EVIDENCE · 86be5e4 · 6b21fac · 7a56b68 · src/pages/chainLogos.tsx',
  },
  {
    id: 'ta-003', tag: 'VM-003', letter: 'V', title: 'Bordir visual system', date: '2026-08-28',
    points: [
      '2px accent borders + dashed inset hairlines',
      'Rest + hover glow layers; semantic pos/neg colors — never neutral',
    ],
    evi: 'EVIDENCE · f007ae1 · c47e10b · src/styles/live.css',
  },
  {
    id: 'ta-002', tag: 'VM-002', letter: 'M', title: 'Memecoin Live frontend', date: '2026-08-28',
    points: [
      'Board: six chain cards in founder-locked order, staggered trending previews (avax parked 2026-08-30)',
      'Chain pages: three staggered columns NEW | TRENDING | VOLUME·ALPHA with α-ranks',
      'Honest 404/400/502 rendering; per-card failure with a 60s retry cool-down',
    ],
    evi: 'EVIDENCE · 55898f4 · a53eea1 · src/pages/LiveBoard.tsx · src/pages/ChainLive.tsx',
  },
  {
    id: 'ta-001', tag: 'VM-001', letter: 'G', title: 'Live-feed backend', date: '2026-08-28',
    points: [
      'Six chains × four modes on keyless GeckoTerminal — live:false stays honest for absent networks',
      '180s TTL cache + honest stale-serve; env FEED_CACHE_TTL_S clamped 60–600',
      'α lens — deterministic re-ranking, zero extra upstream calls',
    ],
    evi: 'EVIDENCE · 642296d · 95d7ade · f53bac4 · providers/live.py · webapp/server.py',
  },
]

const NOW: { title: string; chips: ChipKind[]; band?: string; points: string[] }[] = [
  {
    title: 'Deploy v1', chips: ['progress', 'locked'], band: 'CONFIDENCE · LOCKED — TARGET ±5 SEPTEMBER 2026',
    points: [
      'Public board + docs + roadmap + tagged release behind a reverse proxy with TLS',
      'The only dated item on this page — locked because the deploy work itself is in progress',
    ],
  },
  {
    title: 'Terminal branding parity', chips: ['progress'],
    points: [
      'The six-chain boxed nav DNA now runs on landing, /live, /docs and /roadmap topnavs',
      'The terminal sidebar joins the same DNA with the product PR — one brand thread everywhere',
    ],
  },
  {
    title: 'Terminal Beta internal surfaces', chips: ['progress'],
    points: [
      'The shell sidebar carries honest DESIGN markers on panels that have not shipped (scanner, whale, cluster, AI…)',
      'Each panel queues one additive step at a time — see §3',
    ],
  },
  {
    title: 'Weekly proof cadence', chips: ['progress'],
    points: [
      'Every ship lands in the §1 ledger with commit evidence',
      'A weekly note rides along with the hub — no silent drift between ships',
    ],
  },
]

const QUEUE: { id: string; tag: string; title: string; kind: ChipKind; why: string; proof: string }[] = [
  {
    id: 'ta-101', tag: 'VM-101', title: 'Wallet session + quote engine', kind: 'build',
    why: 'The swap desk’s SIMULATED surface goes live: read-only session first, then quotes — never custody.',
    proof: 'PROOF · real quote from an onchain router · the SIMULATED chip is replaced by a LIVE chip · Documentation §5 updated',
  },
  {
    id: 'ta-102', tag: 'VM-102', title: 'Watchlist', kind: 'build',
    why: 'Track tokens across the five chains; account-less first (local storage) — no accounts until there is a reason for keys.',
    proof: 'PROOF · PARTIAL — M4 ships the account-less watchlist (vilmei.watchlist, cap 15) + /api/v1/portfolio/snapshot market facts; the page is LIVE in the nav · survives reload with zero server session · cross-device sync and alerts remain design',
  },
  {
    id: 'ta-103', tag: 'VM-103', title: 'Trade tape on the board', kind: 'build',
    why: 'The /ws/tape route already ships additive trade deltas over real GeckoTerminal trades — the board should read them without refresh.',
    proof: 'PROOF · board ticker consumes /ws/tape · back-pressure policy documented · snap schema untouched (3741173, 5428dfd)',
  },
  {
    id: 'ta-104', tag: 'VM-104', title: 'VILMEI AI panel', kind: 'shipped',
    why: 'Evidence-first narratives over live data — the VILMEI AI went live in the AI-V phase: streaming SSE proxy /api/v1/ai/ask (founder-configured upstream, server-side key) + MCP ai_ask tool #7.',
    proof: 'PROOF · /api/v1/ai/ask SSE (provenance → deltas → usage → [DONE]) · ANALYST evidence-first + GUIDE grounded in AI-BRIEF.md · per-IP/daily budgets, cache, honest 429/502/503/504 · never trades',
  },
  {
    id: 'ta-105', tag: 'VM-105', title: 'Backend foundations — one additive route at a time', kind: 'build',
    why: 'Taxonomy, rate budget and integrity tests keep growing with every route; no route ships without its contract.',
    proof: 'PROOF · every route arrives with its test suite (120 passing today) · ruff 0 · oxlint 0',
  },
  {
    id: 'ta-fee-01', tag: 'VM-fee-01', title: 'Buyback engine — the 0.10% fee slice', kind: 'design',
    why: 'The planned fee (0.50% = ops 0.30 + buyback 0.10 + rewards 0.10, docs/FEE-MODELS-2026.md) is published as data, but its buyback slice is BLOCKED: VILMEI ships no execution surface and no custody, so nothing here could ever buy back anything until a founder decision changes that.',
    proof: 'PROOF · a founder decision unblocks VM-fee-01 · the slice flips from declared-but-unwired to a dated design in §1 · estimator + swap-rail strip updated in the same commit',
  },
  {
    id: 'ta-fee-02', tag: 'VM-fee-02', title: 'Vault claim gate — 15 public addresses', kind: 'design',
    why: 'The vault map (GET /api/v1/fees/destinations, docs/FEE-VAULTS.md) ships claim-based: 5 chains × 3 slices render awaiting-founder until the founder sets VAULT_{CHAIN}_{SLICE}_ADDRESS in .env. PUBLIC addresses only — a key never enters this repo, and nothing is charged.',
    proof: 'PROOF · the founder sets addresses in .env · claimed/total on /api/v1/fees/destinations moves off 0/15 · the swap-rail vault chips flip to shortened claimed addresses',
  },
  {
    id: 'ta-fee-03', tag: 'VM-fee-03', title: 'Settlement ledger — off-chain accounting', kind: 'design',
    why: 'If a fee path ever goes live (sol Jupiter platformFeeBps is the only $0 keyless one today), what was collected and how it splits across the three vaults stays an off-chain, claim-reconciled ledger — VILMEI custodies nothing.',
    proof: 'PROOF · a fee path flips to wired in docs/FEE-MODELS-2026.md first · the ledger surface ships with its reconciliation sentences in the same commit',
  },
]

const NON_GOALS = [
  'Never custody keys or seeds.',
  'Never execute trades from this terminal.',
  'Never paid rankings or buyable α positions.',
  'Never hide data — zeros and “–” are facts and stay on screen.',
  'No ads, no trackers, no third-party scripts in the research surface.',
  'No promises on dates beyond the §2 Locked band.',
]

const BANDS: { chip: ChipKind; name: string; text: string }[] = [
  { chip: 'locked', name: 'LOCKED', text: 'Deploy-class work already in progress — the only band allowed a date.' },
  { chip: 'build', name: 'IN BUILD', text: 'Spec frozen, wiring in progress. No dates by policy.' },
  { chip: 'design', name: 'DESIGN', text: 'Scoped, not started. No dates by policy.' },
  { chip: 'sim', name: 'SIMULATED', text: 'Labeled pre-release UI rendering deterministic data sets.' },
]

export function RoadmapPage() {
  document.title = 'Roadmap — VILMEI'
  return (
    <div className="rr-root">
      <PageBackground />
      <div className="rr-aurora" aria-hidden="true" />
      <div className="rr-shell">
        <div className="rr-topnav embroidery">
          <a className="rr-a" href="/">← LANDING</a>
          <a className="rr-a boxed" href="/live">MEMECOIN LIVE</a>
          <a className="rr-a boxed" href="/docs">DOCS</a>
          <span className="rr-a boxed locked">TERMINAL · LOCKED</span>
        </div>

        {/* ── HERO ─────────────────────────────────────────── */}
        <header className="rr-hero">
          <div className="rr-kicker">THE WEEKLY HUB OF PROOF</div>
          <h1 className="rr-h1">VILMEI — ROADMAP · <em>REV3.3</em></h1>
          <p className="rr-deck">
            <b>Phase by phase, wire by wire.</b> The weekly hub: every ship lands here with its
            proof. Shipped items carry commit dates you can verify; IN PROGRESS is what we stare
            at today; next moves queue one additive step at a time.
          </p>
          <span className="rr-honest"><span className="dot" />DATES ON THIS PAGE COME FROM COMMIT HISTORY — VERIFY US</span>
          <div className="rr-legend">
            <Chip kind="shipped">shipped</Chip>
            <Chip kind="progress">in progress</Chip>
            <Chip kind="sim">simulated</Chip>
            <Chip kind="build">in build</Chip>
            <Chip kind="design">design</Chip>
            <span>Status vocabulary is defined in <a className="rr-a" href="/docs#status">Documentation §13</a> — the same grammar is used across this site by design.</span>
          </div>
        </header>

        {/* ── §1 SHIPPED — THE LEDGER ──────────────────────── */}
        <section className="rr-sec" id="shipped">
          <h2 className="rr-h2"><span className="n">§1</span>SHIPPED — THE LEDGER</h2>
          <p className="rr-sub">Newest first. IDs are stable anchors — link straight to #ta-xxx (or the VM-xxx alias); dates and hashes are real git history. Display reads VM- since the VILMEI rename (2026-08-30).</p>
          <div className="rr-stage">
            <div className="rr-rail">
              {SHIPPED.map((s) => (
                <div className="rr-row" key={s.id}>
                  <span className="rr-node" aria-hidden="true" />
                  <article className="rr-card" id={s.id}>
                    {/* P7 alias: the VM- rename keeps #ta-xxx resolvable forever */}
                    <span className="rr-alias" id={'vm-' + s.id.slice(3)} aria-hidden="true" />
                    <span className="topline" aria-hidden="true" />
                    <span className="rr-chiprow">
                      <Chip kind="shipped">shipped</Chip>
                      {s.sim && <Chip kind="sim">simulated</Chip>}
                    </span>
                    <div className="rr-id">{s.tag} · {s.letter}</div>
                    <div className="rr-cardtitle">{s.title}</div>
                    <div className="rr-date">{s.date}</div>
                    <ul className="rr-ul">{s.points.map((p) => <li key={p}>{p}</li>)}</ul>
                    <span className="rr-evi">{s.evi}</span>
                  </article>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── §2 IN PROGRESS — THIS WEEK ───────────────────── */}
        <section className="rr-sec" id="now">
          <h2 className="rr-h2"><span className="n">§2</span>IN PROGRESS — THIS WEEK</h2>
          <p className="rr-sub">What we stare at today. The Deploy band is the only item allowed a date — because its work is already running.</p>
          <div className="rr-now">
            {NOW.map((n) => (
              <article className="rr-nowcard" key={n.title}>
                <div className="rr-cardtitle">{n.title}</div>
                <div className="rr-chiprow" style={{ position: 'static', marginTop: 8, marginBottom: 4 }}>
                  {n.chips.map((c) => <Chip key={c} kind={c}>{c === 'progress' ? 'in progress' : c === 'locked' ? 'locked' : c}</Chip>)}
                </div>
                {n.band && <div className="rr-date" style={{ marginBottom: 6 }}>{n.band}</div>}
                <ul className="rr-ul">{n.points.map((p) => <li key={p}>{p}</li>)}</ul>
              </article>
            ))}
          </div>
        </section>

        {/* ── §3 NEXT — THE QUEUE ──────────────────────────── */}
        <section className="rr-sec" id="next">
          <h2 className="rr-h2"><span className="n">§3</span>NEXT — THE QUEUE</h2>
          <p className="rr-sub">Ordered, one additive step at a time. Every item carries a stable ID, a WHY, and the proof that will mark it shipped — no dates unless Locked.</p>
          <div className="rr-queue">
            {QUEUE.map((q) => (
              <div className="rr-q" id={q.id} key={q.id}>
                <span className="rr-alias" id={'vm-' + q.id.slice(3)} aria-hidden="true" />
                <span className="tid">{q.tag}</span>
                <div>
                  <div className="t">{q.title} <Chip kind={q.kind}>{q.kind === 'build' ? 'in build' : q.kind === 'shipped' ? 'shipped' : q.kind}</Chip></div>
                  <p><b>WHY:</b> {q.why}</p>
                  <span className="proof">{q.proof}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── §4 NON-GOALS ─────────────────────────────────── */}
        <section className="rr-sec" id="non-goals">
          <h2 className="rr-h2"><span className="n">§4</span>NON-GOALS</h2>
          <p className="rr-sub">The credibility anchor — what this project will not do, on the record.</p>
          <div className="rr-ngo">
            <ul>
              {NON_GOALS.map((g) => <li key={g}><b>NEVER</b><span>{g}</span></li>)}
            </ul>
            <p className="why">A roadmap that says only yes is a wishlist; the no’s are what make the yes’s real.</p>
          </div>
        </section>

        {/* ── §5 CONFIDENCE & CADENCE ──────────────────────── */}
        <section className="rr-sec" id="cadence">
          <h2 className="rr-h2"><span className="n">§5</span>CONFIDENCE &amp; CADENCE</h2>
          <p className="rr-sub">The methodology — how to read every band on this page without trusting us an inch.</p>
          <div className="rr-bands">
            {BANDS.map((b) => (
              <div className="rr-band" key={b.name}>
                <Chip kind={b.chip}>{b.name.toLowerCase()}</Chip>
                <p>{b.text}</p>
              </div>
            ))}
          </div>
          <ul className="rr-rules">
            <li><b>Shipped = dated evidence.</b> Every §1 entry carries commit hashes — run <code>git log --oneline</code> and check us.</li>
            <li><b>Not shipped = no invented precision.</b> Undated items carry no target “estimates”.</li>
            <li><b>Stable IDs forever.</b> Every entry anchors at #ta-xxx (VM-xxx aliases resolve too) and is mirrored in <a className="rr-a" href="/assets/llms.txt">/assets/llms.txt</a> — quotable by humans and AI agents alike.</li>
            <li><b>Cadence.</b> This page updates with every ship; the weekly note rides along with it.</li>
          </ul>
        </section>

        <footer className="rr-foot">
          VILMEI · ROADMAP REV3.3 · READ-ONLY — NO CUSTODY — EVIDENCE FIRST
          <br />MACHINE INDEX · <a className="rr-a" href="/assets/llms.txt">/assets/llms.txt</a> · DOCS · <a className="rr-a" href="/docs">/docs</a> · LIVE BOARD · <a className="rr-a" href="/live">/live</a>
        </footer>
      </div>
    </div>
  )
}
