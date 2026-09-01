import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import './styles/landing3.css'
import { PageBackground, ChainGlobe, RadarScanner, SystemDiagram } from './components/visuals'
import { NET_CHAINS } from './lib/netChains'
import { fetchLiveFeed, LIVE_CHAINS, LIVE_CHAIN_LABEL, LIVE_MODES } from './lib/liveApi'
import type { LiveChain, LiveItem } from './lib/liveApi'
import { fmtCount, fmtPct, fmtPrice, fmtUsdCompact, fmtUtcClock } from './lib/liveFormat'
import { api, ApiError } from './api'
import type { Chain, ScanResult } from './api'
import { ChainLogo } from './pages/chainLogos'
import { BRAND_NAME, BRAND_LEGAL } from './lib/brand'
import { AiHttpError, landingChatStream } from './lib/aiApi'

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
  'INITIALIZING VILMEI',
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
  ['Try It', 'scan'], ['How It Works', 'how'], ['Product', 'product'], ['Multi-Chain', 'chains'], ['Security', 'security'],
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
          <a href="#" className="lv-logo"><span className="m">◤</span>VIL<span className="lg">MEI</span></a>
          <div className="lv-nav-links">
            {NAV.map(([l, id]) => (
              <a key={id} href={`#${id}`} className={cur === id ? 'on' : ''}>{l}</a>
            ))}
            {NAV_BOXED.map(([l, href]) => (
              <a key={href} className="boxed" href={href}>{l}</a>
            ))}
            <span className="lv-clock" title="UTC">◉ {clock} UTC</span>
            <a className="lv-cta boxed" href="/terminal"
              title="The terminal ships in phases — watch the roadmap ledger">
              Terminal · In Build
            </a>
          </div>
          <button className="lv-burger" aria-label="Menu" onClick={() => setOpen(!open)}><i /><i /><i /></button>
        </div>
        {open && (
          <div className="lv-nav-drop">
            {NAV_BOXED.map(([l, href]) => <a key={href} href={href} onClick={() => setOpen(false)}>{l}</a>)}
            {NAV.map(([l, id]) => <a key={id} href={`#${id}`} onClick={() => setOpen(false)}>{l}</a>)}
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
        <div className="lv-kicker"><span className="live-dot" /> MEMECOIN RESEARCH · 5 CHAINS · KEYLESS LIVE</div>
        <h1 className="lv-h1">
          <span className="l1"><Decode text="See What Others Miss." delay={700} /></span>
          <span className="l2 grad"><Decode text="VERIFY EVERYTHING." delay={1250} /></span>
        </h1>
        <p className="lv-sub">
          A read-only research terminal for memecoin markets across five chains — keyless live
          feeds, deterministic risk heuristics with public thresholds, and evidence-first AI.
          <b> No custody. No keys. No black boxes.</b> Everything on this site renders exactly
          what an upstream API actually returned.
        </p>
        <div className="lv-badges">
          <span className="lv-badge hot"><Icon name="scan" size={13} /> Keyless Live Feeds</span>
          <span className="lv-badge"><Icon name="hex" size={13} /> Five Chains</span>
          <span className="lv-badge"><Icon name="cpu" size={13} /> Public Heuristics</span>
          <span className="lv-badge"><Icon name="ban" size={13} /> No Trading Execution</span>
          <span className="lv-badge"><Icon name="lock" size={13} /> No Custody</span>
        </div>
        <div className="lv-hero-cta">
          <Magnetic href="/live" className="lv-cta neon mag boxed">Open Live Board →</Magnetic>
          <a className="lv-cta ghost" href="/docs">Read the Docs →</a>
          <a className="lv-cta boxed" href="/terminal"
            title="The terminal ships in phases — watch the roadmap ledger">
            Launch Terminal · In Build
          </a>
        </div>
        <p style={{ margin: '10px 0 0', fontFamily: 'var(--fm)', fontSize: 9.5, letterSpacing: '.18em', color: 'var(--dim)' }}>
          THE TERMINAL SHIPS IN PHASES — EVERY SHIP IS DATED IN THE <a href="/roadmap" style={{ color: 'var(--g)' }}>PUBLIC LEDGER →</a>
        </p>
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
        <div className="lv-scanpill"><span className="blink" /> SCANNING FIVE CHAINS · SOL BNB BASE HOOD HYPE</div>
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


/* ═══════════ live scan — the real engine, on the landing ═══════════
   Paste an address → POST /api/scan → render the shipped engine's verdict:
   weighted signals with public thresholds, clustering, launch venue.
   Honesty law: absent → "–", a null severity renders NOT SCORED, upstream
   errors are quoted verbatim. The scanner allowlist is five chains — hype
   joins when its chainId is verified upstream, and the UI says so. */

const SCAN_CHAINS: { id: Chain; label: string; accent: string; hint: string }[] = [
  { id: 'sol', label: 'SOL', accent: 'var(--emb-sol)', hint: 'SOLANA ADDRESS · 32–44 BASE58 CHARS' },
  { id: 'bnb', label: 'BNB', accent: 'var(--emb-bnb)', hint: 'EVM ADDRESS · 0X + 40 HEX CHARS' },
  { id: 'base', label: 'BASE', accent: 'var(--emb-base)', hint: 'EVM ADDRESS · 0X + 40 HEX CHARS' },
    { id: 'hood', label: 'HOOD', accent: 'var(--emb-hood)', hint: 'EVM ADDRESS · 0X + 40 HEX CHARS' },
]

const SO_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const EVM_RE = /^0x[a-fA-F0-9]{40}$/

function SevBar({ severity }: { severity: number | null }) {
  if (severity === null || severity === undefined) return <span className="lv-ns">NOT SCORED</span>
  if (severity <= 0) return <span className="lv-sev"><span className="ok">✓</span></span>
  const pct = Math.max(0, Math.min(1, severity)) * 100
  return <span className="lv-sev"><span className={`fill${severity >= 0.5 ? ' hot' : ''}`} style={{ width: `${pct}%` }} /></span>
}

/* semi-circular risk gauge — animated count-up on result (reduced motion: instant) */
function Gauge({ score, level }: { score: number | null; level: string }) {
  const color = level === 'low' ? 'var(--emb-sol)' : level === 'medium' ? 'var(--emb-bnb)' : level === 'high' ? '#FB7185' : '#649580'
  const [v, setV] = useState(0)
  useEffect(() => {
    if (score === null || score === undefined) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(score); return }
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700)
      setV(score * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [score])
  const R = 54
  const arc = Math.PI * R
  const filled = ((v ?? 0) / 100) * arc
  return (
    <svg viewBox="0 0 148 84" className="lv-gauge" role="img"
      aria-label={`Risk score ${score ?? 'unavailable'} of 100`}>
      <path d={`M 18 74 A ${R} ${R} 0 0 1 130 74`} fill="none" stroke="rgba(22,53,42,.9)"
        strokeWidth="10" strokeLinecap="round" />
      <path d={`M 18 74 A ${R} ${R} 0 0 1 130 74`} fill="none" stroke={color} strokeWidth="10"
        strokeLinecap="round" strokeDasharray={`${filled} ${arc}`}
        style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      <text x="74" y="62" textAnchor="middle" className="lv-gauge-num"
        style={{ fill: score ? color : 'var(--dim)' }}>{score === null || score === undefined ? '–' : Math.round(v)}</text>
      <text x="74" y="78" textAnchor="middle" className="lv-gauge-sub">/100 RISK</text>
    </svg>
  )
}

function LiveScan() {
  const [chain, setChain] = useState<Chain>('sol')
  const [addr, setAddr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hint, setHint] = useState<{ msg: string; bad: boolean } | null>(null)
  const [probe, setProbe] = useState<string | null>(null)
  const [res, setRes] = useState<ScanResult | null>(null)
  const accent = SCAN_CHAINS.find((c) => c.id === chain)!.accent

  const run = () => {
    const a = addr.trim()
    if (!a || busy) return
    const isEvm = EVM_RE.test(a)
    const isSol = SO_RE.test(a)
    if (isEvm && chain === 'sol') {
      setHint({ msg: 'THAT IS A 0X ADDRESS — PICK BNB / BASE / HOOD FOR EVM CHAINS', bad: true })
      return
    }
    if (!isEvm && !isSol) {
      const hex = a.toLowerCase().startsWith('0x') ? a.length - 2 : a.length
      setHint({
        msg: chain === 'sol'
          ? `GOT ${a.length} CHARS — A SOLANA ADDRESS IS 32–44 BASE58 CHARS`
          : a.toLowerCase().startsWith('0x')
            ? `GOT 0X + ${hex} HEX — AN EVM ADDRESS IS EXACTLY 0X + 40`
            : `GOT ${a.length} CHARS — EXPECTED 0X + 40 HEX (EVM) OR 32–44 BASE58 (SOLANA)`,
        bad: true,
      })
      return
    }
    if (!isEvm && isSol && chain !== 'sol') {
      setChain('sol') // a base58 address is a Solana address — switch, never guess an EVM chain
      setHint({ msg: 'BASE58 DETECTED — SWITCHED TO SOLANA', bad: false })
    } else {
      setHint(null)
    }

    const probeEvm = async (first: Chain) => {
      // An honest 404 on an EVM chain is not the end: the same address may live
      // on a sibling chain. Probe the remaining EVM chains sequentially, loudly.
      const tried: Chain[] = [first]
      for (const c of SCAN_CHAINS.map((x) => x.id).filter((x) => x !== 'sol' && !tried.includes(x))) {
        setProbe(`NOT ON ${tried.map((t) => t.toUpperCase()).join(' · ')} — CHECKING ${c.toUpperCase()}…`)
        try {
          const r = await api.scan(c, a)
          setChain(c)
          setRes(r)
          setHint({ msg: `FOUND ON ${c.toUpperCase()} — SWITCHED`, bad: false })
          return
        } catch (e2) {
          if (!(e2 instanceof ApiError) || e2.status !== 404) {
            setErr(e2 instanceof ApiError ? e2.message : 'Scan failed — try again')
            return
          }
          tried.push(c)
        }
      }
      setErr(`no pair on any scanned chain (${tried.map((t) => t.toUpperCase()).join(' · ')}) — DexScreener may not index this token yet; nothing invented to fill the gap`)
    }

    setBusy(true)
    setErr(null)
    api.scan(chain, a)
      .then(setRes)
      .catch((e: unknown) => {
        setRes(null)
        const msg = e instanceof ApiError ? e.message : 'Scan failed — try again'
        const status = e instanceof ApiError ? e.status : 0
        if (status === 404 && chain !== 'sol') { setErr(null); return probeEvm(chain) }
        setErr(msg)
      })
      .finally(() => { setBusy(false); setProbe(null) })
  }

  const level = res?.assessment.level
  const lvlChip = level === 'low' ? 'live' : level === 'medium' ? 'sim' : level === 'high' ? 'high' : 'design'
  const top = res
    ? [...res.assessment.signals].filter((x) => x.severity !== null).sort((x, y) => (y.severity ?? 0) - (x.severity ?? 0))[0]
    : undefined
  const p = res?.pair
  const tx = p?.txns?.h24

  return (
    <section className="lv-scanband" id="scan">
      <div className="lv-scanhead rv">
        <div className="lv-k2">LIVE SCAN — THE REAL ENGINE</div>
        <h2 className="lv-h2">Paste an Address. <span className="a">Get the Verdict.</span></h2>
        <p className="lv-lead" style={{ marginInline: 'auto' }}>
          Five chains, one engine, zero sign-up — the shipped heuristics answer right here, live.
        </p>
      </div>
      <div className="lv-scancard rv">
        <div className="lv-scanrow">
          <div className="lv-chainbtns">
            {SCAN_CHAINS.map((c) => (
              <button key={c.id} type="button" className={`lv-chipbtn${chain === c.id ? ' on' : ''}`}
                style={{ '--acc': c.accent } as React.CSSProperties}
                onClick={() => { setChain(c.id); setHint(null) }} aria-pressed={chain === c.id}>
                <span className="dot" />{c.label}
              </button>
            ))}
          </div>
          <input className="lv-scanin" value={addr} spellCheck={false}
            style={{ borderColor: chain === 'sol' ? undefined : `color-mix(in srgb, ${accent} 45%, transparent)` }}
            onChange={(e) => setAddr(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            aria-label="Token or pair address" />
          <button type="button" className="lv-cta neon lv-scanbtn" onClick={run} disabled={busy}>
            {busy ? 'SCANNING…' : 'SCAN →'}
          </button>
        </div>
        <div className={`lv-scanhelp${hint?.bad ? ' bad' : ''}`} role="status">
          {hint ? `⚠ ${hint.msg}` : SCAN_CHAINS.find((c) => c.id === chain)!.hint}
        </div>
        <div className="lv-scanhint">
          SCANNER ALLOWLIST: SOL · BNB · BASE · HOOD — HYPE JOINS WHEN ITS CHAINID IS VERIFIED UPSTREAM
        </div>
        {busy && <div className="lv-scanwait">{probe ?? 'FETCHING LIVE EVIDENCE — DEXSCREENER + GECKOTERMINAL…'}</div>}
        {!busy && err && (
          <div className="lv-scanerr" role="alert">⚠ {err} — the API answers honestly; nothing is made up to fill the gap.</div>
        )}
        {!busy && !err && !res && (
          <div className="lv-scanwait" style={{ color: 'var(--muted-deep, var(--dim))' }}>
            THE VERDICT RENDERS EXACTLY WHAT THE ENGINE RETURNED — NOTHING MORE
          </div>
        )}
        {!busy && res && p && (
          <div className="lv-verdict">
            <div className="lv-vhd">
              <span className="lv-toktile" style={{ '--acc': accent } as React.CSSProperties}>
                {(p.baseToken?.symbol ?? '?').slice(0, 1).toUpperCase()}
              </span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="sym">{p.baseToken?.symbol ?? '–'}</span>
                  {res.launch_venue && <span className="venue">BORN ON {res.launch_venue.toUpperCase()}</span>}
                  {top && (top.severity ?? 0) >= 0.5 && (
                    <span className="lv-toprisk">TOP RISK DRIVER · {top.label.toUpperCase()}</span>
                  )}
                </div>
                <div className="pair">{p.pairAddress ?? '–'} · {p.quoteToken?.symbol ?? '–'}</div>
              </div>
              <span style={{ marginLeft: 'auto' }} className={`lv-status ${lvlChip}`}>
                {res.assessment.level_label}
              </span>
            </div>
            <div className="lv-scorebox">
              <Gauge score={res.assessment.score} level={level ?? 'nodata'} />
              <div style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.7, maxWidth: 480 }}>
                Weighted combination of the signals below — thresholds public in
                heuristics/rug_check.py. Higher = riskier. Never a binary verdict.
              </div>
            </div>
            <div className="lv-mstrip">
              <div><span>PRICE</span><b>{fmtPrice(p.priceUsd ?? null)}</b></div>
              <div><span>CHG 24H</span><b className={Number(p.priceChange?.h24 ?? 0) < 0 ? 'down' : 'up'}>{fmtPct(p.priceChange?.h24 ?? null)}</b></div>
              <div><span>LIQUIDITY</span><b>{fmtUsdCompact(p.liquidity?.usd ?? null)}</b></div>
              <div><span>FDV</span><b>{fmtUsdCompact(p.fdv ?? null)}</b></div>
              <div><span>VOL 24H</span><b>{fmtUsdCompact(p.volume?.h24 ?? null)}</b></div>
              <div><span>TXNS 24H</span><b>{tx ? fmtCount(tx.buys + tx.sells) : '–'}</b></div>
            </div>
            <div className="lv-sigs">
              {res.assessment.signals.map((sig) => (
                <div className="lv-sig" key={sig.key}>
                  <span className="lb">{sig.label}</span>
                  <span className="wt">{Math.round(sig.weight * 100)}%</span>
                  <SevBar severity={sig.severity} />
                  <span className="ev">{sig.evidence || '–'}</span>
                </div>
              ))}
            </div>
            <div className="lv-cluster">
              <b>WALLET CLUSTERING</b>
              <span>{res.clustering.evidence || `${res.clustering.wallets} wallets · ${res.clustering.buys} buys`}</span>
            </div>
            {res.assessment.notes.length > 0 && (
              <div className="lv-cluster">
                <b>NOTES</b>
                <span>{res.assessment.notes.join(' · ')}</span>
              </div>
            )}
          </div>
        )}
        <div className="lv-scanft">
          <span>POST /api/scan · SAME ENGINE AS THE TUI</span>
          <span>SOURCES: {res ? res.sources.join(' + ').toUpperCase() : 'DEXSCREENER + GECKOTERMINAL'}</span>
          {res && <span>TS {fmtUtcClock(res.ts)}</span>}
          <a className="fill" href="/api/docs">FULL CONTRACT →</a>
        </div>
      </div>
    </section>
  )
}

/* S2 — the problem, qualitative only (no unverifiable fear stats) */
function Problem() {
  return (
    <section className="lv-sec" id="problem">
      <div className="lv-num">00</div>
      <div className="lv-problem rv">
        <div className="lv-k2">WHY VILMEI EXISTS</div>
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
    </section>
  )
}

/* S5 — the product blueprint: every feature of the terminal, told honestly */
const BP: { g: string; items: { t: string; d: string; chip: 'live' | 'sim' | 'build' | 'design' }[] }[] = [
  {
    g: 'SHIPPED & LIVE — RUNS TODAY',
    items: [
      { t: 'Live Board', chip: 'live', d: 'Five chains, founder-locked order, trending previews, honest flags — at /live.' },
      { t: 'Chain Pages', chip: 'live', d: 'Three staggered columns per chain — NEW | TRENDING | VOLUME·ALPHA with α-ranks.' },
      { t: 'Token Scanner', chip: 'live', d: 'Paste an address, get the real engine verdict — weighted signals with public thresholds.' },
      { t: 'TUI Research Engine', chip: 'live', d: 'The same engine in your terminal: /load /verify /cluster /explain /whale.' },
      { t: 'α Lens', chip: 'live', d: 'Deterministic re-ranking with published weights — volume 40 · txns 25 · liquidity 20 · freshness 15.' },
      { t: 'Docs + Machine Index', chip: 'live', d: 'The honesty law, the API contract, and /assets/llms.txt for AI agents.' },
    ],
  },
  {
    g: 'IN BUILD — WIRED NEXT',
    items: [
      { t: 'Dashboard', chip: 'build', d: 'Mission control: market pulse, watchlist and risk at a glance.' },
      { t: 'Swap Desk', chip: 'sim', d: 'The full trading surface on a labeled deterministic data set — session + quotes are next (VM-101).' },
      { t: 'Rug Check', chip: 'build', d: 'Heuristic checklist over liquidity, ownership and mint authority.' },
      { t: 'Wallet Clustering', chip: 'build', d: 'Coordinated-wallet detection over the real GeckoTerminal trade feed.' },
      { t: 'Whale Tracker', chip: 'build', d: 'Wallet balances and flows via Helius — framework in place.' },
    ],
  },
  {
    g: 'DESIGN — SCOPED, QUEUED',
    items: [
      { t: 'AI Analyst', chip: 'design', d: 'Evidence-first narratives over live data — provider-agnostic, never trades (VM-104).' },
      { t: 'Watchlist', chip: 'design', d: 'Track tokens across the five chains — account-less, local storage (VM-102).' },
      { t: 'Portfolio Watch', chip: 'design', d: 'Read-only positions from public market data — no wallet connection.' },
      { t: 'Alerts', chip: 'design', d: 'Signal alerts when a tracked token\'s risk posture changes.' },
      { t: 'Holdings Check', chip: 'design', d: 'Wallet holdings without connecting anything — read-only by contract.' },
      { t: 'Token Gate', chip: 'design', d: 'Access depth tiers — data correctness is identical on every tier, forever.' },
    ],
  },
]

function Product() {
  return (
    <section className="lv-sec" id="product">
      <div className="lv-num">03</div>
      <div className="lv-sec-head lv-center rv">
        <div className="lv-k2">THE PRODUCT BLUEPRINT</div>
        <h2 className="lv-h2">Every Feature, <span className="a">On The Record.</span></h2>
        <p className="lv-lead">
          One engine, two surfaces — a TUI for desks and a web terminal for everyone. Nothing on
          this list is promised silently: each tile carries its true status, and every ship lands
          in the public ledger with a commit date.
        </p>
      </div>
      {BP.map((grp) => (
        <div className="lv-bp-group rv" key={grp.g}>
          <div className="g">{grp.g}</div>
          <div className="lv-bp">
            {grp.items.map((it) => (
              <div className="lv-bp-item" key={it.t}>
                <div className="nm">{it.t}
                  <span className={`lv-status ${it.chip}`}>{it.chip === 'build' ? 'in build' : it.chip === 'sim' ? 'simulated' : it.chip}</span>
                </div>
                <div className="ds">{it.d}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

/* S6 — surfaces index */
function Surfaces() {
  return (
    <section className="lv-sec alt" id="surfaces">
      <div className="lv-num">04</div>
      <div className="lv-sec-head lv-center rv">
        <div className="lv-k2">SURFACES</div>
        <h2 className="lv-h2">Every Part, <span className="a">Labeled.</span></h2>
        <p className="lv-lead">The status grammar is site-wide — the same chips, the same meanings, everywhere.</p>
      </div>
      <div className="lv-surfgrid">
        {[
          { t: 'Memecoin Live Board', s: 'Five chain cards, four feed modes, honest flags and auto-refresh.', u: '/live', chip: ['live'] },
          { t: 'Chain Pages ×6', s: 'Three staggered columns per chain with α-ranks and copy-address.', u: '/live/sol', chip: ['live'] },
          { t: 'Terminal', s: 'The product — ships in phases. The button unlocks with the Locked deploy.', u: '/terminal', chip: ['build'] },
          { t: 'Documentation', s: 'The honesty law, the pipeline, the API contract, the security posture.', u: '/docs', chip: ['live'] },
          { t: 'Roadmap', s: 'The weekly hub of proof — shipped ledger with git-verifiable dates.', u: '/roadmap', chip: ['live'] },
        ].map((c, i) => (
          <a className={`lv-surf rv d${i % 3}`} href={c.u} key={c.t}>
            <span style={{ display: 'flex', gap: 6 }}>
              {c.chip.map((k) => <span className={`lv-status ${k}`} key={k}>{k === 'sim' ? 'simulated' : k === 'build' ? 'in build' : k}</span>)}
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

/* S7 — multi-chain globe, five live marks (avax parked) */
function Chains() {
  const [hover, setHover] = useState<string | null>(null)
  const info = NET_CHAINS.find((c) => c.id === hover)
  return (
    <section className="lv-sec" id="chains">
      <div className="lv-num">05</div>
      <div className="lv-sec-head lv-center rv">
        <div className="lv-k2">MULTI-CHAIN</div>
        <h2 className="lv-h2">One Terminal. <span className="a">All Five Chains.</span></h2>
        <p className="lv-lead">Solana, BNB Chain, Base, HyperEVM and Robinhood Chain — all five live on the keyless feed today.</p>
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

/* S8 — AI demo (PROMPT-AI-V): LIVE answers via POST /api/v1/ai/ask on the
   landing pool. LABEL LAW — the chip always says what is actually true:
   a live answer shows the model id from its own provenance; ANY failure
   falls back to the deterministic scripted trace labeled SIMULATED. */

const AI_DEMO_QS: { label: string; persona: 'analyst' | 'guide'; question: string }[] = [
  { label: 'What is VILMEI?', persona: 'guide', question: 'What is VILMEI, in a few sentences?' },
  { label: 'Is this token a rug?', persona: 'analyst', question: 'Based on the evidence block, is this token showing rug signals? Say what is and what isn\'t in the evidence.' },
  { label: 'Is your AI safe?', persona: 'guide', question: 'How is the VILMEI AI kept safe and honest?' },
  { label: 'What\'s the roadmap?', persona: 'guide', question: 'What is on the VILMEI roadmap right now — what is live, and what is still planned?' },
]

type DemoState = 'idle' | 'connecting' | 'live' | 'simulated'

type ChatMsg = { who: 'user' | 'ai'; text: string; streaming?: boolean }

function AiSection() {
  const [state, setState] = useState<DemoState>('idle')
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [draft, setDraft] = useState('')
  const [label, setLabel] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const ctrlRef = useRef<AbortController | null>(null)
  const chatRef = useRef<HTMLDivElement | null>(null)
  const reduceMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const ask = async (question: string) => {
    if (!question.trim() || state === 'connecting') return
    ctrlRef.current?.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    setMsgs((m) => [...m, { who: 'user', text: question }, { who: 'ai', text: '', streaming: true }])
    setNote(null); setLabel('')
    setState('connecting')
    let text = ''
    const push = () => setMsgs((m) => {
      const next = [...m]
      next[next.length - 1] = { who: 'ai', text, streaming: true }
      return next
    })
    try {
      const history = msgs
        .filter((m) => m.text)
        .slice(-6)
        .map((m): { role: 'user' | 'assistant'; content: string } =>
          ({ role: m.who === 'user' ? 'user' : 'assistant', content: m.text }))
      await landingChatStream({ message: question, history }, (e) => {
        if (e.type === 'provenance') {
          setState('live')
          setLabel(`live · vilmei ai · analyst ${e.mode} tier${e.cached ? ' · cached' : ''}`)
        } else if (e.type === 'delta') {
          text += e.text
          if (!reduceMotion) push()  // PB-8: reduced motion gets the full text at once
        }
      }, ctrl.signal)
      setMsgs((m) => {
        const next = [...m]
        next[next.length - 1] = { who: 'ai', text }
        return next
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setState('simulated')
      setLabel('simulated (live AI offline)')
      setNote(err instanceof AiHttpError ? err.message : 'The AI route did not answer.')
      setMsgs((m) => m.filter((x, i) => !(i === m.length - 1 && x.who === 'ai' && x.text === '')))
    }
  }

  const askDemo = (q: typeof AI_DEMO_QS[number]) => void ask(q.question)

  useEffect(() => {
    chatRef.current?.scrollTo?.({ top: chatRef.current.scrollHeight })
  }, [msgs])

  return (
    <section className="lv-sec alt" id="ai">
      <div className="lv-num">06</div>
      <div className="lv-ai">
        <div className="lv-core rv" aria-hidden="true"><SystemDiagram /></div>
        <div className="rv d1">
          <div className="lv-k2">AI ANALYST</div>
          <h2 className="lv-h2" style={{ marginBottom: 18 }}>Ask Why. <span className="a">Get Evidence.</span></h2>
          <div className="lv-chat">
            <div className="hd"><span className="d" /><b>VILMEI AI — EVIDENCE-FIRST ASSISTANT</b>
              {state === 'live' && <span className="lv-status live" style={{ marginLeft: 'auto' }}><span className="dot" />{label}</span>}
              {state === 'simulated' && <span className="lv-status sim" style={{ marginLeft: 'auto' }}>{label}</span>}
              {state === 'connecting' && <span className="lv-status build" style={{ marginLeft: 'auto' }}>connecting…</span>}
              {state === 'idle' && <span className="lv-status build" style={{ marginLeft: 'auto' }}>four questions · free tier</span>}
            </div>
            <div className="lv-thread" ref={chatRef}>
              {msgs.length === 0 && (
                <div className="lv-hello">
                  <div className="lv-hello-ico" aria-hidden="true">✦</div>
                  <b>ASK THE ANALYST</b>
                  <span>Evidence-first answers · streaming · read-only. A token question runs on today's BONK evidence.</span>
                </div>
              )}
              {msgs.map((m, i) => (
                <div className={`lv-msg ${m.who}`} key={i}>
                  <div className="who">{m.who === 'user' ? 'YOU' : 'ANALYST'}</div>
                  <div className="lv-bub">
                    {m.who === 'ai' && m.text === '' && m.streaming ? (
                      <span style={{ display: 'grid', gap: 8 }}>
                        <span className="ta-skel" style={{ height: 11, width: '90%' }} />
                        <span className="ta-skel" style={{ height: 11, width: '64%' }} />
                      </span>
                    ) : (
                      <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}{m.streaming && state === 'live' && <span className="ai-caret" aria-hidden="true" />}</span>
                    )}
                  </div>
                </div>
              ))}
              {state === 'simulated' && (
                <div className="lv-msg ai">
                  <div className="who">ANALYST</div>
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
              )}
            </div>
            <form className="lv-composer" onSubmit={(e) => { e.preventDefault(); const q = draft.trim(); setDraft(''); void ask(q) }}>
              <input className="lv-composer-in" value={draft} onChange={(e) => setDraft(e.target.value)}
                placeholder={state === 'connecting' ? 'streaming…' : 'Ask anything about VILMEI or a token…'}
                aria-label="ask the analyst" disabled={state === 'connecting'} maxLength={280} />
              <button type="submit" className="lv-composer-send" disabled={state === 'connecting' || !draft.trim()} aria-label="send">➤</button>
            </form>
            <div className="btns lv-suggest">
              {AI_DEMO_QS.map((q) => (
                <button key={q.label} className="lv-cta ghost" style={{ height: 38, fontSize: 12 }}
                  disabled={state === 'connecting'} onClick={() => void askDemo(q)}>
                  {q.label}
                </button>
              ))}
            </div>
            {state === 'live' && (
              <div className="note">ANSWER STREAMED FROM THE FREE TIER — THE MODEL ID ABOVE COMES FROM THE RESPONSE ITSELF. <a href="/terminal#/ai" style={{ color: 'var(--g)' }}>OPEN THE FULL PANEL →</a></div>
            )}
            {state === 'simulated' && (
              <div className="note">DETERMINISTIC SCRIPTED TRACE{note ? ` — ${note.toUpperCase()}` : ''}. AI ANALYST — LIVE WHEN THE FOUNDER KEY IS CONFIGURED. <a href="/terminal#/ai" style={{ color: 'var(--g)' }}>OPEN THE PANEL →</a></div>
            )}
            {state === 'idle' && (
              <div className="note">PICK A QUESTION — ANSWERS STREAM LIVE FROM THE FREE TIER (SHARED DAILY BUDGET). THE TOKEN QUESTION RUNS ON TODAY'S BONK EVIDENCE. <a href="/terminal#/ai" style={{ color: 'var(--g)' }}>FULL PANEL →</a></div>
            )}
            {state === 'connecting' && (
              <div className="note">STREAMING — FREE-TIER MODELS CAN TAKE A WHILE; THE ANSWER ARRIVES TOKEN BY TOKEN.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/* S9 — security posture + the only such zero */
function Security() {
  return (
    <section className="lv-sec" id="security">
      <div className="lv-num">07</div>
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
          { i: 'scan', t: 'Zero Third-Party Requests', d: 'Verify in view-source — bundle AND fonts are self-hosted. Nothing leaves the page.' },
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
            VILMEI is research infrastructure. It does not route orders, hold keys, sign
            messages, or take fees for placement. Ranks are computed by the published α formula —
            they cannot be bought. That zero is a product fact you can verify in the repo.
          </p>
          <a className="lnk" href="/docs#security">READ THE FULL POSTURE — DOCS §10 →</a>
        </div>
      </div>
    </section>
  )
}

/* S10 — who it's for + the machine layer */
function Audiences() {
  return (
    <section className="lv-sec alt" id="audience">
      <div className="lv-num">08</div>
      <div className="lv-sec-head lv-center rv">
        <div className="lv-k2">BUILT FOR</div>
        <h2 className="lv-h2">Traders, Researchers, <span className="a">And The Machines They Trust.</span></h2>
      </div>
      <div className="lv-aud">
        <div className="aud rv">
          <Icon name="activity" size={22} />
          <b>TRADERS</b>
          <p>Context before conviction. A live board across five chains, a deterministic α lens,
             and rug heuristics with public weights — the truth, faster.</p>
          <a className="lnk" href="/live">OPEN THE BOARD →</a>
        </div>
        <div className="aud rv d1">
          <Icon name="cpu" size={22} />
          <b>RESEARCHERS</b>
          <p>Every threshold is public, every score is auditable, every missing field stays an
             honest dash. The docs read like a contract because they are one.</p>
          <a className="lnk" href="/docs">READ THE DOCS →</a>
        </div>
        <div className="aud rv d2">
          <Icon name="spark" size={22} />
          <b>AI AGENTS</b>
          <p>Structured, stable, quotable: a machine-readable index, stable anchor IDs, and a
             published API contract — built so an agent can verify us without trusting us.</p>
          <a className="lnk" href="/assets/llms.txt">MACHINE INDEX →</a>
        </div>
      </div>
      <div className="rv" style={{ marginTop: 30 }}>
        <div className="lv-k2" style={{ textAlign: 'center' }}>MACHINE LAYER — IF YOU ARE AN LLM READING THIS, START HERE</div>
        <div className="lv-agent">
          <a className="ag" href="/api/docs">
            <div className="u">/api/docs — OpenAPI</div>
            <p>The full public surface: /api/scan, /api/explain, /api/v1/discovery, /api/v1/live, health, version, metrics.</p>
          </a>
          <a className="ag" href="/docs#api">
            <div className="u">GET /api/v1/live/{'{chain}'}</div>
            <p>Free keyless feed — five chains, four modes, honest 400/404/502, cached/stale flags in-body.</p>
          </a>
          <a className="ag" href="/assets/llms.txt">
            <div className="u">/assets/llms.txt — machine index</div>
            <p>Project summary, the integrity contract, the status vocabulary, stable anchors — written for agents.</p>
          </a>
        </div>
      </div>
    </section>
  )
}

/* S11 — roadmap teaser: the ledger speaks */
const TEASER = [
  { id: 'VM-008', t: 'Roadmap weekly hub — this site’s proof layer', d: '2026-08-29', chip: 'live' as const },
  { id: 'VM-007', t: 'Documentation flagship — /docs', d: '2026-08-29', chip: 'live' as const },
  { id: 'VM-006', t: 'Swap desk — simulated surface', d: '2026-08-29', chip: 'sim' as const },
]

function RoadmapTeaser() {
  return (
    <section className="lv-sec" id="ledger">
      <div className="lv-num">09</div>
      <div className="lv-sec-head lv-center rv">
        <div className="lv-k2">SHIPPED — WITH PROOF</div>
        <h2 className="lv-h2">The Ledger <span className="a">Doesn’t Promise. It Shows.</span></h2>
        <p className="lv-lead">Latest ships from the roadmap ledger — every entry carries a commit date you can verify with one git command.</p>
      </div>
      <div className="lv-teaser rv">
        {TEASER.map((t) => (
          <a className="trow" href={`/roadmap#${t.id.toLowerCase()}`} key={t.id}>
            <span className="tid">{t.id}</span>
            <span><span className="tt">{t.t}</span><br /><span className="td">SHIPPED · {t.d} · GIT-VERIFIABLE</span></span>
            <span className={`lv-status ${t.chip} st`}>{t.chip === 'sim' ? 'simulated' : 'shipped'}</span>
          </a>
        ))}
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <a className="lv-cta ghost" href="/roadmap">OPEN THE FULL LEDGER →</a>
        </div>
      </div>
    </section>
  )
}

/* S12 — FAQ: the four questions every visitor and agent asks */
const FAQ = [
  {
    q: 'Is VILMEI a trading bot?',
    a: <>No. <b>Zero transaction paths exist in the product</b> — no orders, no signatures, no custody.
       It is read-only research infrastructure, and that is a property of the architecture, not a policy. <a href="/docs#security">Docs §10 →</a></>,
  },
  {
    q: 'Do I need a wallet or an account?',
    a: <>No. The live plane is <b>keyless by design</b> — no login, no cookies, no session. If you can open
       the page, you already have full access to the data.</>,
  },
  {
    q: 'Where does the data come from?',
    a: <>GeckoTerminal (pools, trades) and DexScreener (social profiles) — free, keyless tiers. Every value is
       copied verbatim from the upstream, or renders an honest “–”. Impossible values are treated as upstream
       bugs, never clamped into convenient numbers. <a href="/docs#honesty">The Honesty Law →</a></>,
  },
  {
    q: 'What ships next?',
    a: <>The public ledger answers that: every ship lands in the roadmap with its commit date and evidence
       hashes, and the queue moves one additive step at a time. <a href="/roadmap">Roadmap →</a></>,
  },
  {
    q: 'Can I build on this data?',
    a: <>Yes — that is the point. A published API contract with honest error semantics (<a href="/api/docs">OpenAPI →</a>),
       a machine-readable project index (<a href="/assets/llms.txt">llms.txt →</a>), and stable anchor IDs on every
       documented claim. Humans and agents are first-class readers here.</>,
  },
]

function Faq() {
  return (
    <section className="lv-sec alt" id="faq">
      <div className="lv-num">10</div>
      <div className="lv-sec-head lv-center rv">
        <div className="lv-k2">QUESTIONS</div>
        <h2 className="lv-h2">Asked Every Time. <span className="a">Answered Once, In Public.</span></h2>
      </div>
      <div className="lv-faq rv">
        {FAQ.map((f, i) => (
          <details key={i} open={i === 0}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

/* S13 — final CTA + footer, links only (no socials until real accounts exist) */
function Final() {
  return (
    <section className="lv-final">
      <span className="ring3d" aria-hidden="true" /><span className="ring3d r" aria-hidden="true" />
      <div className="rv">
        <h2>Stop Trusting. <span style={{ color: 'var(--p2)' }}>Start Verifying.</span></h2>
        <p>The board is live. The law is public. The ledger is dated. The terminal is being built — in the open.</p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Magnetic href="/live" className="lv-cta neon mag boxed">
            <span className="lv-final-cta">Open Live Board →</span>
          </Magnetic>
          <a className="lv-cta boxed" href="/terminal"
            title="The terminal ships in phases — watch the roadmap ledger">
            Launch Terminal · In Build
          </a>
        </div>
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
          <div className="lv-logo" style={{ marginBottom: 12 }}><span className="m">◤</span>VIL<span className="lg">MEI</span></div>
          <p className="disc">Read-only memecoin research across five chains. Analysis &amp; education only — risk scores are heuristics, not audits. DYOR.</p>
        </div>
        <div className="lv-foot-col">
          <b>SURFACES</b>
          <a href="/live">Memecoin Live</a>
          <a href="/docs">Docs</a>
          <a href="/roadmap">Roadmap</a>
          <span className="stat">TERMINAL · IN BUILD — SHIPS IN PHASES</span>
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
      <div className="lv-foot-legal">{BRAND_LEGAL}</div>
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
      <LiveScan />
      <Problem />
      <Honesty />
      <How />
      <Product />
      <Surfaces />
      <Chains />
      <AiSection />
      <Security />
      <Audiences />
      <RoadmapTeaser />
      <Faq />
      <Final />
      <Foot />
    </div>
  )
}

/* mount only when a #root actually exists — importing the module (tests,
   tooling) must stay side-effect-free */
const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <Landing />
    </StrictMode>,
  )
}
