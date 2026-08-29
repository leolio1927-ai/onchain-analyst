import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import './styles/landing3.css'
import { PageBackground, ChainGlobe, RadarScanner, SystemDiagram } from './components/visuals'
import { NET_CHAINS } from './lib/netChains'
import { fetchLiveFeed, LIVE_CHAINS, LIVE_CHAIN_LABEL, LIVE_MODES } from './lib/liveApi'
import type { LiveChain, LiveItem } from './lib/liveApi'
import { fmtPct, fmtPrice, fmtUtcClock } from './lib/liveFormat'
import { ChainLogo } from './pages/chainLogos'
import { BRAND_NAME, BRAND_LEGAL, BRAND_DATA, BRAND_POSTURE } from './lib/brand'

/* ═══════════ helpers ═══════════ */

function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('vis')),
      { threshold: 0.12 },
    )
    document.querySelectorAll('.rv').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
}

function useScrollNav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return scrolled
}

function useUtcClock() {
  const [s, setS] = useState('')
  useEffect(() => {
    const tick = () => setS(new Date().toISOString().slice(11, 19))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return s
}

function useScrollspy(ids: string[]) {
  const [cur, setCur] = useState('')
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setCur(e.target.id)),
      { rootMargin: '-42% 0px -52% 0px' },
    )
    ids.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el) })
    return () => io.disconnect()
  }, [ids])
  return cur
}

function useScrollProgress() {
  const [p, setP] = useState(0)
  useEffect(() => {
    const on = () => {
      const max = document.documentElement.scrollHeight - innerHeight
      setP(max > 0 ? window.scrollY / max : 0)
    }
    on()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on) }
  }, [])
  return p
}

/* magnetic button — pulls toward the cursor */
function Magnetic({ children, className = '', href }: { children: React.ReactNode; className?: string; href: string }) {
  const ref = useRef<HTMLAnchorElement>(null)
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    el.style.transform = `translate(${dx * 0.12}px, ${dy * 0.22}px)`
  }
  const reset = () => { if (ref.current) ref.current.style.transform = '' }
  return (
    <a ref={ref} href={href} className={className} onMouseMove={onMove} onMouseLeave={reset}>
      {children}
    </a>
  )
}

/* kinetic decode — terminal scramble per character */
const GLYPHS = '!<>-_\\/[]{}=+*^?#@$%&'

function Decode({ text, delay = 0, className = '' }: { text: string; delay?: number; className?: string }) {
  const [out, setOut] = useState(text)
  useEffect(() => {
    // initial state is already `text` — reduced motion just skips the animation
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const start = performance.now() + delay
    const per = 30
    const step = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - start) / (text.length * per)))
      const settled = Math.floor(k * text.length)
      let s = text.slice(0, settled)
      for (let i = settled; i < text.length; i++) {
        s += text[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0]
      }
      setOut(s)
      if (k < 1) raf = requestAnimationFrame(step)
      else setOut(text)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [text, delay])
  return <span className={className}>{out}</span>
}

/* spotlight follows the cursor (desktop) */
function Spotlight() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return
    let raf = 0
    const on = (e: MouseEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        ref.current?.style.setProperty('background',
          `radial-gradient(560px 560px at ${e.clientX}px ${e.clientY}px, rgba(0,255,163,0.05), transparent 70%)`)
      })
    }
    window.addEventListener('mousemove', on)
    return () => { window.removeEventListener('mousemove', on); cancelAnimationFrame(raf) }
  }, [])
  return <div className="lv-spotlight" ref={ref} aria-hidden="true" />
}

/* boot sequence preloader — engineering truth only */
const BOOT = [
  'INITIALIZING TERMINAL ALPHA',
  'DATA · GECKOTERMINAL + DEXSCREENER · KEYLESS',
  'HEURISTICS · PUBLIC AND AUDITABLE',
  'POSTURE · READ-ONLY · NO CUSTODY',
]

function Preloader({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(0)
  const [pct, setPct] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onDone(); return }
    const li = setInterval(() => setN((x) => Math.min(BOOT.length, x + 1)), 260)
    const pi = setInterval(() => setPct((x) => Math.min(100, x + Math.ceil(Math.random() * 14))), 60)
    const done = setTimeout(onDone, 1500)
    return () => { clearInterval(li); clearInterval(pi); clearTimeout(done) }
  }, [onDone])
  return (
    <div className="lv-boot" aria-hidden="true">
      <div className="lv-boot-in">
        <div className="lv-boot-logo">◤ {BRAND_NAME}</div>
        {BOOT.slice(0, n).map((b) => <div className="lv-boot-line" key={b}>{b}</div>)}
        <div className="lv-boot-bar"><span style={{ width: `${pct}%` }} /></div>
        <div className="lv-boot-pct">{pct}%</div>
      </div>
    </div>
  )
}

/* ═══════════ SVG icon set (no tofu glyphs) ═══════════ */

export function Icon({ name, size = 22, className = '' }: { name: string; size?: number; className?: string }) {
  const s = { width: size, height: size }
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const paths: Record<string, React.ReactNode> = {
    shield: <path d="M12 3l7 3v5c0 4.6-3 7.7-7 9-4-1.3-7-4.4-7-9V6z" />,
    cluster: (
      <g>
        <circle cx="12" cy="12" r="2.6" />
        <circle cx="5" cy="5.5" r="1.9" /><circle cx="19" cy="5.5" r="1.9" />
        <circle cx="5" cy="18.5" r="1.9" /><circle cx="19" cy="18.5" r="1.9" />
        <path d="M6.6 6.8l3.4 3.4M17.4 6.8L14 10.2M6.6 17.2l3.4-3.4M17.4 17.2L14 13.8" />
      </g>
    ),
    spark: <path d="M12 2.5l2 6.4 6.5 2.1-6.5 2.1-2 6.4-2-6.4L3.5 11 10 8.9z" />,
    eye: (
      <g>
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
        <circle cx="12" cy="12" r="2.6" />
      </g>
    ),
    bell: (
      <g>
        <path d="M6.3 9.5a5.7 5.7 0 0 1 11.4 0c0 4.6 1.8 5.8 1.8 5.8H4.5s1.8-1.2 1.8-5.8" />
        <path d="M10 19.5a2.2 2.2 0 0 0 4 0" />
      </g>
    ),
    wallet: (
      <g>
        <rect x="3" y="6" width="18" height="13" rx="2.2" />
        <path d="M3 10h18M16.5 14.8h2" />
      </g>
    ),
    hex: <path d="M12 2.8l7.6 4.4v9.6L12 21.2l-7.6-4.4V7.2z" />,
    cpu: (
      <g>
        <rect x="7" y="7" width="10" height="10" rx="1.6" />
        <rect x="10.2" y="10.2" width="3.6" height="3.6" />
        <path d="M9.5 4.5V7M14.5 4.5V7M9.5 17v2.5M14.5 17v2.5M4.5 9.5H7M4.5 14.5H7M17 9.5h2.5M17 14.5h2.5" />
      </g>
    ),
    grid: (
      <g>
        <rect x="3.5" y="4" width="17" height="16" rx="2" />
        <path d="M3.5 9h17M3.5 14h17M9.5 4v16M15 4v16" />
      </g>
    ),
    ban: (
      <g>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M6 6l12 12" />
      </g>
    ),
    check: (
      <g>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M8.3 12.4l2.5 2.6 4.9-5.6" />
      </g>
    ),
    lock: (
      <g>
        <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      </g>
    ),
    scan: (
      <g>
        <path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5" />
        <path d="M7 12h10" />
      </g>
    ),
    activity: <path d="M3 12h3.5l3-7.5 4.5 15 3-7.5H21" />,
  }
  return (
    <svg viewBox="0 0 24 24" style={s} className={`ic-svg ${className}`} aria-hidden="true" {...common}>
      {paths[name] ?? paths.spark}
    </svg>
  )
}

/* ═══════════ the real tape — REST /api/v1/live, staggered ═══════════
   Decision (documented in the task report): /ws/snap's tick list mirrors the
   /api/scan cache — empty on a fresh server, so a landing tape fed by it
   would be an empty tape. The honest live wire for visitors is the shipped
   keyless REST feed: top trending pool per chain, refreshed every 60s in a
   stagger, server-cached 180s. The chip says exactly that — no "realtime"
   theater. */

interface TapeRow { chain: LiveChain; item: LiveItem | null }

function Tape() {
  const [rows, setRows] = useState<TapeRow[]>([])
  const [down, setDown] = useState(false)
  const [sync, setSync] = useState('·····')
  useEffect(() => {
    let alive = true
    const timers: number[] = []
    const pull = () => {
      LIVE_CHAINS.forEach((c, i) => {
        timers.push(window.setTimeout(() => {
          fetchLiveFeed(c, 'trending', 1)
            .then((f) => {
              if (!alive) return
              setRows((rs) => {
                const next = rs.filter((r) => r.chain !== c)
                next.push({ chain: c, item: f.items[0] ?? null })
                return LIVE_CHAINS
                  .map((ch) => next.find((r) => r.chain === ch))
                  .filter((r): r is TapeRow => Boolean(r))
              })
              setDown(false)
              setSync(fmtUtcClock(f.generated_at))
            })
            .catch(() => { if (alive) setDown(true) })
        }, i * 350))
      })
    }
    pull()
    const iv = window.setInterval(pull, 60000)
    return () => { alive = false; timers.forEach(clearTimeout); clearInterval(iv) }
  }, [])
  return (
    <div className="lv-tapewrap" aria-label="Live trending pools, one per chain">
      <div className="lv-tapehd">
        <span className="live-dot" /> LIVE FEED · TOP TRENDING PER CHAIN
        <span className={`st${down ? ' down' : ''}`}>
          <span className="dot" />{down ? 'RECONNECTING' : `SYNCED ${sync}`}
        </span>
      </div>
      {rows.length === 0
        ? <div className="lv-taperow"><span className="sym">connecting to the keyless feed…</span></div>
        : rows.map((r) => (
          <a className="lv-taperow" key={r.chain} href={`/live/${r.chain}`}>
            <ChainLogo chain={r.chain} size={26} />
            <span className="sym">{r.item?.token_symbol ?? '–'}<small>{LIVE_CHAIN_LABEL[r.chain]} · {r.item?.pair ?? '–'}</small></span>
            <span className="px">{fmtPrice(r.item?.price_usd ?? null)}</span>
            <span className={`chg ${Number(r.item?.change_24h) < 0 ? 'down' : 'up'}`}>{fmtPct(r.item?.change_24h ?? null)}</span>
          </a>
        ))}
      <div className="lv-tapeft">
        <span>GECKOTERMINAL KEYLESS FREE TIER</span>
        <span>SERVER CACHE 180s</span>
        <a className="fill" href="/live">OPEN THE FULL BOARD →</a>
      </div>
    </div>
  )
}

/* live-verified stats — counted from the shipped client constants + product facts */
function StatRow() {
  const stats: { v: string; l: string; zero?: boolean }[] = [
    { v: String(LIVE_CHAINS.length), l: 'chains live' },
    { v: String(LIVE_MODES.length), l: 'feed modes' },
    { v: '180s', l: 'server cache' },
    { v: '0', l: 'api keys required', zero: true },
    { v: '0', l: 'trades executed by us', zero: true },
  ]
  return (
    <div className="lv-statrow" aria-label="Live-verified product stats">
      {stats.map((s) => (
        <span className={`lv-stat${s.zero ? ' zero' : ''}`} key={s.l}><b>{s.v}</b>{s.l}</span>
      ))}
    </div>
  )
}

/* ═══════════ sections ═══════════ */

const NAV = [
  ['How It Works', 'how'], ['Multi-Chain', 'chains'], ['Security', 'security'],
]
const NAV_BOXED = [
  ['Memecoin Live', '/live'], ['Docs', '/docs'], ['Roadmap', '/roadmap'],
]

function Nav() {
  const scrolled = useScrollNav()
  const clock = useUtcClock()
  const cur = useScrollspy(NAV.map(([, id]) => id))
  const progress = useScrollProgress()
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="lv-progress"><span style={{ width: `${progress * 100}%` }} /></div>
      <nav className={`lv-nav bordir ${scrolled ? 'scrolled' : ''}`}>
        <div className="lv-nav-in">
          <a href="#" className="lv-logo"><span className="m">◤</span>TERMINAL&nbsp;<span className="lg">ALPHA</span></a>
          <div className="lv-nav-links">
            {NAV.map(([l, id]) => (
              <a key={id} href={`#${id}`} className={cur === id ? 'on' : ''}>{l}</a>
            ))}
            {NAV_BOXED.map(([l, href]) => (
              <a key={href} className="boxed" href={href}>{l}</a>
            ))}
            <span className="lv-clock" title="UTC">◉ {clock} UTC</span>
            <a className="lv-cta neon boxed" href="/terminal">Launch Terminal →</a>
          </div>
          <button className="lv-burger" aria-label="Menu" onClick={() => setOpen(!open)}><i /><i /><i /></button>
        </div>
        {open && (
          <div className="lv-nav-drop">
            {NAV_BOXED.map(([l, href]) => <a key={href} href={href} onClick={() => setOpen(false)}>{l}</a>)}
            {NAV.map(([l, id]) => <a key={id} href={`#${id}`} onClick={() => setOpen(false)}>{l}</a>)}
            <a href="/terminal" onClick={() => setOpen(false)}>Launch Terminal →</a>
          </div>
        )}
      </nav>
    </>
  )
}

function Hero() {
  /* 3D tilt on the radar stage — pointer-fine devices only */
  const tilt = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = tilt.current
    if (!el || window.matchMedia('(pointer: coarse)').matches) return
    const parent = el.parentElement
    const onMove = (e: MouseEvent) => {
      const r = parent!.getBoundingClientRect()
      const dx = (e.clientX - r.left) / r.width - 0.5
      const dy = (e.clientY - r.top) / r.height - 0.5
      el.style.transform = `perspective(1100px) rotateY(${dx * 6}deg) rotateX(${-dy * 4}deg)`
    }
    const reset = () => { el.style.transform = 'perspective(1100px)' }
    parent?.addEventListener('mousemove', onMove)
    parent?.addEventListener('mouseleave', reset)
    return () => {
      parent?.removeEventListener('mousemove', onMove)
      parent?.removeEventListener('mouseleave', reset)
    }
  }, [])
  return (
    <section className="lv-hero" id="top">
      <div className="lv-hero-bg" />
      <div className="rv vis">
        <a className="lv-announce" href="/docs#honesty">
          <span className="blink" /> THE HONESTY LAW — SIX CLAUSES, ENFORCED IN CODE <i>→</i>
        </a>
        <div className="lv-kicker"><span className="live-dot" /> MEMECOIN RESEARCH · 6 CHAINS · KEYLESS LIVE</div>
        <h1 className="lv-h1">
          <span className="l1"><Decode text="See What Others Miss." delay={700} /></span>
          <span className="l2 grad"><Decode text="VERIFY EVERYTHING." delay={1250} /></span>
        </h1>
        <p className="lv-sub">
          A read-only research terminal for memecoin markets across six chains — keyless live
          feeds, deterministic risk heuristics with public thresholds, and evidence-first AI.
          <b> No custody. No keys. No black boxes.</b> Everything on this site renders exactly
          what an upstream API actually returned.
        </p>
        <div className="lv-badges">
          <span className="lv-badge hot"><Icon name="scan" size={13} /> Keyless Live Feeds</span>
          <span className="lv-badge"><Icon name="hex" size={13} /> Six Chains</span>
          <span className="lv-badge"><Icon name="cpu" size={13} /> Public Heuristics</span>
          <span className="lv-badge"><Icon name="ban" size={13} /> No Trading Execution</span>
          <span className="lv-badge"><Icon name="lock" size={13} /> No Custody</span>
        </div>
        <div className="lv-hero-cta">
          <Magnetic href="/terminal" className="lv-cta neon mag boxed">Launch Terminal →</Magnetic>
          <a className="lv-cta ghost" href="/docs">Read the Docs →</a>
        </div>
        <StatRow />
      </div>
      <div className="lv-radar" aria-hidden="true">
        <div className="tilt" ref={tilt}>
          <RadarScanner />
        </div>
        {/* honest readout — real product facts, no invented panel numbers */}
        <div className="lv-hud">
          <div className="cell"><b>FEED</b><span className="v">LIVE · KEYLESS</span><small>GECKOTERMINAL</small></div>
          <div className="cell"><b>CACHE</b><span className="v">180s</span><small>STALE-SAFE</small></div>
          <div className="cell"><b>MODES</b><span className="v">4</span><small>α LENS INCLUDED</small></div>
        </div>
        <div className="lv-scanpill"><span className="blink" /> SCANNING SIX CHAINS · SOL BNB BASE HYPE HOOD AVAX</div>
      </div>
    </section>
  )
}

/* the real tape — full-width band directly under the hero */
function TapeBand() {
  return (
    <section className="lv-tapeband">
      <Tape />
    </section>
  )
}

/* S2 — the problem, qualitative only (no unverifiable fear stats) */
function Problem() {
  return (
    <section className="lv-sec" id="problem">
      <div className="lv-num">00</div>
      <div className="lv-problem rv">
        <div className="lv-k2">WHY TERMINAL ALPHA EXISTS</div>
        <h2 className="lv-h2">Most memecoins are built <span className="a">to hurt you.</span></h2>
        <p>
          Discovery is fragmented across chain ecosystems, volume displays lie, ratings are
          opaque, and trading interfaces quietly hold your custody risk. We built the filter
          we wished existed — <b>deterministic, transparent, and boring about the truth.</b> The
          numbers you will see here are the numbers the chain returned — or an honest dash.
        </p>
      </div>
    </section>
  )
}

/* S3 — the honesty law teaser → docs */
const LAWS = [
  { no: '2.1', t: 'Absent stays absent.', d: 'A field the upstream did not return renders “–” — never imputed, never zero-filled.', ref: 'in code: providers/live.py · _normalize()' },
  { no: '2.2', t: 'Zero is a fact.', d: '$0 liquidity and 0 trades are real market states and stay visible.', ref: 'in code: providers/live.py · _no_neg() keeps zeros' },
  { no: '2.3', t: 'A negative drop is data.', d: 'Minus 24h changes render in red. Never suppressed.', ref: 'in code: lib/liveFormat.ts · fmtPct()' },
  { no: '2.4', t: 'Impossible values are bugs.', d: 'A negative price or liquidity normalizes to “–” — never clamped, never absolute-valued.', ref: 'in code: providers/live.py · _no_neg()' },
  { no: '2.5', t: 'Pre-release is declared.', d: 'Any surface not wired to execution renders a labeled deterministic data set.', ref: 'in code: src/pages/TokenPage.tsx · SIMULATED chips' },
  { no: '2.6', t: 'Heuristics are auditable.', d: 'Every threshold and weight is public code — a score you cannot audit, you must not follow.', ref: 'in code: providers/live.py · ALPHA_WEIGHTS' },
]

function Honesty() {
  return (
    <section className="lv-sec alt" id="honesty">
      <div className="lv-num">01</div>
      <div className="lv-sec-head lv-center rv">
        <div className="lv-k2">THE HONESTY LAW</div>
        <h2 className="lv-h2">Zero Lies, <span className="a">As Code.</span></h2>
        <p className="lv-lead">Six clauses govern every surface of this product. Each one is a function you can read — not a value we promise.</p>
      </div>
      <div className="lv-lawgrid">
        {LAWS.map((l) => (
          <a className="lv-law rv" key={l.no} href="/docs#honesty">
            <span className="no">CLAUSE {l.no}</span>
            <b>{l.t}</b>
            <span>{l.d}</span>
            <span className="ref">{l.ref}</span>
          </a>
        ))}
      </div>
    </section>
  )
}

/* S4 — how it works, purified to the docs truth */
const STAGES = [
  {
    n: 'STAGE 01', t: 'DATA LAYER', icon: 'hex', live: true,
    desc: 'Keyless ingestion → normalize + integrity guard → per-token dedupe → TTL cache. One pipeline through, every stage documented.',
    chips: ['GeckoTerminal · keyless', 'DexScreener · socials', 'Helius · in build', '180s cache', 'junk guard → “–”'],
  },
  {
    n: 'STAGE 02', t: 'ENGINE', icon: 'cpu', live: true,
    desc: 'Public heuristics: the deterministic α lens and weighted risk checks. Every threshold and weight lives in public code.',
    chips: ['α lens · published weights', 'rug check', 'wallet clustering', 'no hidden models'],
  },
  {
    n: 'STAGE 03', t: 'AI ANALYST', icon: 'spark', live: false,
    desc: 'Evidence-first narratives: the model cites its evidence or says “data not available”. Provider-agnostic, never trades.',
    chips: ['deterministic local tier', 'cites evidence', 'rate-limited', 'no fabrication'],
  },
  {
    n: 'STAGE 04', t: 'TERMINAL', icon: 'grid', live: true,
    desc: 'One read-only surface: the live board, chain pages, the terminal shell, and the docs you are reading.',
    chips: ['read-only', 'no custody', 'no accounts', 'no third-party scripts'],
  },
]

function How() {
  return (
    <section className="lv-sec" id="how">
      <div className="lv-num">02</div>
      <div className="lv-sec-head lv-center rv">
        <div className="lv-k2">HOW IT WORKS</div>
        <h2 className="lv-h2">One Pipeline. <span className="a">Zero Magic.</span></h2>
        <p className="lv-lead">Keyless data, public heuristics, evidence-first analysis — the whole system fits one mental model, by design.</p>
      </div>
      <div className="lv-pipe">
        {STAGES.map((s, i) => (
          <div className={`lv-stage rv d${i}`} key={s.t}>
            <div className="n">{s.n}</div>
            <div style={{ position: 'absolute', top: 26, right: 22 }}>
              <span className={`lv-status ${s.live ? 'live' : 'design'}`}>{s.live ? 'live' : 'design'}</span>
            </div>
            <div className="lv-holo"><span className="ring" /><span className="ring r2" /><span className="core"><Icon name={s.icon} size={26} /></span></div>
            <h3>{s.t}</h3>
            <p className="desc">{s.desc}</p>
            <div className="lv-chips">{s.chips.map((c) => <span className="lv-chip" key={c}>{c}</span>)}</div>
          </div>
        ))}
      </div>
      {/* engine surface — every tile carries its true status */}
      <div className="lv-feats" style={{ marginTop: 26 }}>
        {[
          { i: 'shield', t: 'Rug Check Engine', chip: 'live', d: 'Weighted liquidity, volume and age signals with public thresholds — shipped in the scan pipeline.' },
          { i: 'grid', t: 'Multi-Chain Board', chip: 'live', d: 'Six chains, four feed modes, honest flags — the /live board and chain pages.' },
          { i: 'cluster', t: 'Wallet Clustering', chip: 'build', d: 'Coordination heuristic over the GeckoTerminal trade feed — engine shipped, web surface queued.' },
          { i: 'eye', t: 'Whale Tracker', chip: 'build', d: 'Wallet balances via Helius — framework in place, wiring next.' },
          { i: 'spark', t: 'AI Analyst', chip: 'design', d: 'Evidence-first narratives over live data — the /api/explain contract already ships the deterministic tier.' },
          { i: 'bell', t: 'Alerts & Watchlist', chip: 'design', d: 'Track tokens across the six chains — account-less first, local storage.' },
        ].map((f, i) => (
          <div className={`lv-feat rv d${i % 3}`} key={f.t}>
            <span style={{ position: 'absolute', top: 18, right: 18 }}>
              <span className={`lv-status ${f.chip}`}>{f.chip === 'build' ? 'in build' : f.chip}</span>
            </span>
            <div className="holo-s"><Icon name={f.i} size={24} /></div>
            <h3>{f.t}</h3>
            <p>{f.d}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* S5 — surfaces index */
function Surfaces() {
  return (
    <section className="lv-sec alt" id="surfaces">
      <div className="lv-num">03</div>
      <div className="lv-sec-head lv-center rv">
        <div className="lv-k2">SURFACES</div>
        <h2 className="lv-h2">Every Part, <span className="a">Labeled.</span></h2>
        <p className="lv-lead">The status grammar is site-wide — the same chips, the same meanings, everywhere.</p>
      </div>
      <div className="lv-surfgrid">
        {[
          { t: 'Memecoin Live Board', s: 'Six chain cards, four feed modes, honest flags and retry cool-downs.', u: '/live', chip: ['live'] },
          { t: 'Chain Pages ×6', s: 'Three staggered columns per chain with α-ranks and copy-address.', u: '/live/sol', chip: ['live'] },
          { t: 'Terminal + Swap Desk', s: 'The beta shell with a swap desk on a deterministic data set — no session, no wallet, no chain calls.', u: '/terminal', chip: ['live', 'sim'] },
          { t: 'Documentation', s: 'The honesty law, the pipeline, the API contract, the security posture.', u: '/docs', chip: ['live'] },
          { t: 'Roadmap', s: 'The weekly hub of proof — shipped ledger with git-verifiable dates.', u: '/roadmap', chip: ['live'] },
        ].map((c, i) => (
          <a className={`lv-surf rv d${i % 3}`} href={c.u} key={c.t}>
            <span style={{ display: 'flex', gap: 6 }}>
              {c.chip.map((k) => <span className={`lv-status ${k}`} key={k}>{k === 'sim' ? 'simulated' : k}</span>)}
            </span>
            <span className="t">{c.t}</span>
            <span className="s">{c.s}</span>
            <span className="u">{c.u} →</span>
          </a>
        ))}
      </div>
    </section>
  )
}

/* S6 — multi-chain globe, six marks */
function Chains() {
  const [hover, setHover] = useState<string | null>(null)
  const info = NET_CHAINS.find((c) => c.id === hover)
  return (
    <section className="lv-sec" id="chains">
      <div className="lv-num">04</div>
      <div className="lv-sec-head lv-center rv">
        <div className="lv-k2">MULTI-CHAIN</div>
        <h2 className="lv-h2">One Terminal. <span className="a">All Six Chains.</span></h2>
        <p className="lv-lead">Solana, BNB Chain, Base, HyperEVM, Robinhood Chain, Avalanche — every one live on the keyless feed today.</p>
      </div>
      <div className="lv-net-wrap rv">
        <ChainGlobe hovered={hover} onHover={setHover} />
        {info && (
          <div className="lv-net-tip" style={{ borderColor: info.color + '66' }}>
            <div className="t" style={{ color: info.color }}>{info.label}</div>
            <div className="s">{info.stats}</div>
            <span className="b" style={{ color: '#34d399', border: '1px solid rgba(52,211,153,.4)' }}>● LIVE</span>
          </div>
        )}
        <div className="lv-net-hint">HOVER A CHAIN NODE</div>
      </div>
    </section>
  )
}

/* S7 — security posture + the only such zero */
function Security() {
  return (
    <section className="lv-sec alt" id="security">
      <div className="lv-num">05</div>
      <div className="lv-sec-head lv-center rv">
        <div className="lv-k2">SECURITY POSTURE</div>
        <h2 className="lv-h2">Built for Analysis. <span className="a">Not for Gambling.</span></h2>
        <p className="lv-lead">A terminal that cannot reach your funds cannot betray them.</p>
      </div>
      <div className="lv-phil">
        {[
          { i: 'ban', t: 'No Trading Execution', d: 'Zero transaction paths exist in the product — by design.' },
          { i: 'lock', t: 'No Custody', d: 'We never hold funds or ask for private keys. Ever.' },
          { i: 'check', t: 'No Accounts', d: 'No login, no cookie, no session. Public data in, insight out.' },
          { i: 'scan', t: 'No Third-Party Scripts', d: 'Verify in view-source — the bundle is self-hosted, fonts aside.' },
        ].map((p, i) => (
          <div className={`lv-pr rv d${i}`} key={p.t}>
            <div className="ico"><Icon name={p.i} size={26} /></div>
            <b>{p.t}</b>
            <span>{p.d}</span>
          </div>
        ))}
      </div>
      <div className="lv-zerobox rv">
        <div className="big">0</div>
        <div>
          <div className="tt">TRADES EXECUTED BY US — EVER.</div>
          <p>
            Terminal Alpha is research infrastructure. It does not route orders, hold keys, sign
            messages, or take fees for placement. Ranks are computed by the published α formula —
            they cannot be bought. That zero is a product fact you can verify in the repo.
          </p>
          <a className="lnk" href="/docs#security">READ THE FULL POSTURE — DOCS §10 →</a>
        </div>
      </div>
    </section>
  )
}

/* S8 — AI teaser: deterministic illustrative trace, labeled SIMULATED */
function AiSection() {
  return (
    <section className="lv-sec" id="ai">
      <div className="lv-num">06</div>
      <div className="lv-ai">
        <div className="lv-core rv" aria-hidden="true"><SystemDiagram /></div>
        <div className="rv d1">
          <div className="lv-k2">AI ANALYST</div>
          <h2 className="lv-h2" style={{ marginBottom: 18 }}>Ask Why. <span className="a">Get Evidence.</span></h2>
          <div className="lv-chat">
            <div className="hd"><span className="d" /><b>TERMINAL ALPHA AI — ILLUSTRATIVE TRACE</b>
              <span className="lv-status sim" style={{ marginLeft: 'auto' }}>simulated</span>
            </div>
            <div className="lv-msg user">
              <div className="who">YOU</div>
              <div className="lv-bub">“Why is this token considered medium risk?”</div>
            </div>
            <div className="lv-msg ai">
              <div className="who">AI ANALYST</div>
              <div className="lv-bub">
                <span className="lv-verdict">◈ MEDIUM RISK · 68/100</span>
                <div className="sect">KEY SIGNALS</div>
                <ul>
                  <li>Early wallet clustering detected</li>
                  <li>Liquidity appears healthy</li>
                  <li>Holder concentration requires monitoring</li>
                  <li>Coordinated activity detected</li>
                </ul>
              </div>
            </div>
            <div className="btns">
              <button className="lv-cta ghost off" style={{ height: 38, fontSize: 12 }} aria-disabled="true" tabIndex={-1}>Explain Score</button>
              <button className="lv-cta ghost off" style={{ height: 38, fontSize: 12 }} aria-disabled="true" tabIndex={-1}>Deeper Analysis</button>
            </div>
            <div className="note">DETERMINISTIC ILLUSTRATIVE TRACE — THE PANEL ABOVE IS NOT WIRED YET. AI ANALYST — <a href="/roadmap#ta-104" style={{ color: 'var(--g)' }}>IN BUILD · ROADMAP TA-104 →</a></div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* S9 — final CTA + footer, links only (no socials until real accounts exist) */
function Final() {
  return (
    <section className="lv-final">
      <span className="ring3d" aria-hidden="true" /><span className="ring3d r" aria-hidden="true" />
      <div className="rv">
        <h2>Stop Trusting. <span style={{ color: 'var(--p2)' }}>Start Verifying.</span></h2>
        <p>The board is live. The law is public. The ledger is dated.</p>
        <Magnetic href="/terminal" className="lv-cta neon mag boxed">
          <span className="lv-final-cta">Launch Terminal →</span>
        </Magnetic>
        <p style={{ marginTop: 30, fontSize: 12.5, fontFamily: 'var(--fm)', color: 'var(--dim)' }}>
          LIVE BOARD · <a href="/live" style={{ color: 'var(--g)' }}>/live</a> &nbsp;·&nbsp; DOCS · <a href="/docs" style={{ color: 'var(--g)' }}>/docs</a> &nbsp;·&nbsp; ROADMAP · <a href="/roadmap" style={{ color: 'var(--g)' }}>/roadmap</a>
        </p>
      </div>
    </section>
  )
}

function Foot() {
  return (
    <footer className="lv-foot">
      <div className="lv-foot-grid">
        <div>
          <div className="lv-logo" style={{ marginBottom: 12 }}><span className="m">◤</span>TERMINAL&nbsp;<span className="lg">ALPHA</span></div>
          <p className="disc">Read-only memecoin research across six chains. Analysis &amp; education only — risk scores are heuristics, not audits. DYOR.</p>
        </div>
        <div className="lv-foot-col">
          <b>SURFACES</b>
          <a href="/live">Memecoin Live</a><a href="/terminal">Terminal</a><a href="/docs">Docs</a><a href="/roadmap">Roadmap</a>
        </div>
        <div className="lv-foot-col">
          <b>REGISTER</b>
          <a href="/docs#honesty">The Honesty Law</a><a href="/docs#status">Status Legend</a><a href="/roadmap#non-goals">Non-Goals</a><a href="/assets/llms.txt">Machine Index</a>
        </div>
        <div className="lv-foot-col">
          <b>PRODUCT FACTS</b>
          <span className="ok">● 0 TRADES EXECUTED BY US</span>
          <span className="stat">KEYLESS FEED — GT + DEXSCREENER</span>
          <span className="stat">READ-ONLY — NO CUSTODY</span>
        </div>
      </div>
      <div className="lv-wordmark" aria-hidden="true">{BRAND_NAME}</div>
      <div className="lv-foot-legal">{BRAND_LEGAL} · {BRAND_DATA} · {BRAND_POSTURE}</div>
    </footer>
  )
}

/* ═══════════ page ═══════════ */

export default function Landing() {
  const [booted, setBooted] = useState(false)
  useReveal()
  return (
    <div className="lv">
      {!booted && <Preloader onDone={() => setBooted(true)} />}
      <div className="lv-aurora" aria-hidden="true" />
      <PageBackground />
      <Spotlight />
      <Nav />
      <Hero />
      <TapeBand />
      <Problem />
      <Honesty />
      <How />
      <Surfaces />
      <Chains />
      <Security />
      <AiSection />
      <Final />
      <Foot />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Landing />
  </StrictMode>,
)
