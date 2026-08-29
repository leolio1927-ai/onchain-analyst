import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import './styles/landing3.css'
import { ChainGlobe, DataStream, PageBackground, RadarScanner, SystemDiagram } from './components/visuals'
import { NET_CHAINS } from './lib/netChains'
import { stream, type FeedEvent } from './lib/liveStream'
import { fetchChainTickers, type LiveRow } from './services/dexscreener'

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

/* count-up on first view */
function CountUp({ to, decimals = 0, suffix = '', prefix = '', dur = 1600 }: {
  to: number; decimals?: number; suffix?: string; prefix?: string; dur?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [v, setV] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const io = new IntersectionObserver((es) => {
      if (!es[0].isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / dur)
        const eased = 1 - Math.pow(1 - k, 3)
        setV(to * eased)
        if (k < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }, { threshold: 0.4 })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [to, dur])
  return <span ref={ref} className="odometer">{prefix}{v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>
}

/* kinetic decode — terminal scramble per character */
const GLYPHS = '!<>-_\\/[]{}=+*^?#@$%&'

function Decode({ text, delay = 0, className = '' }: { text: string; delay?: number; className?: string }) {
  const [out, setOut] = useState(text)
  useEffect(() => {
    // initial state is already `text` — reduced-motion just skips the animation
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

/* boot sequence preloader */
const BOOT = [
  'INITIALIZING INTELLIGENCE LAYER',
  'LINKING DATA PROVIDERS ······ OK',
  'CALIBRATING RISK HEURISTICS ·· OK',
  'ARMING SCANNER ARRAY ········ OK',
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
        <div className="lv-boot-logo">◤ TERMINAL ALPHA</div>
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
    key: (
      <g>
        <circle cx="8" cy="8.5" r="3.7" />
        <path d="M10.8 11.3L20 20.5M17.2 17.7l2.2-2.2M13.8 20l2-2" />
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
    x: <path d="M4.5 4.5l6.3 8.2-6.6 6.8h2.6l5.2-5.5 4 5.5h5.5l-6.7-8.8 6.2-6.2h-2.6l-4.8 5-3.6-5z" fill="currentColor" stroke="none" />,
    telegram: <path d="M21 4.5L2.8 11.4l5.6 2 2 5.9 3.2-3.7 4.6 3.4z M21 4.5L8.4 13.4" />,
    activity: <path d="M3 12h3.5l3-7.5 4.5 15 3-7.5H21" />,
  }
  return (
    <svg viewBox="0 0 24 24" style={s} className={`ic-svg ${className}`} aria-hidden="true" {...common}>
      {paths[name] ?? paths.spark}
    </svg>
  )
}

/* ═══════════ live engine consumers ═══════════ */

function Ticker() {
  const [rows, setRows] = useState<LiveRow[] | null>(null)
  useEffect(() => {
    let dead = false
    const pull = () => fetchChainTickers().then((r) => { if (!dead && r) setRows(r) })
    pull()
    const iv = setInterval(pull, 60000)
    return () => { dead = true; clearInterval(iv) }
  }, [])
  return (
    <div className="lv-chains" role="list">
      {(rows ?? []).map((r) => {
        const ct = r.chain.toLowerCase()
        const k = ct.startsWith('sol') ? 'sol' : ct.startsWith('bnb') || ct === 'bsc' ? 'bnb' : ct === 'base' ? 'base' : ct.startsWith('ava') ? 'avax' : 'hype'
        return (
          <a className="lv-chain-card" role="listitem" key={r.pair + r.chain} data-chain={k} href={r.url || '#'} target="_blank" rel="noreferrer">
            <span className="cc-chain">{r.symbol.toUpperCase()}<i style={{ fontStyle: 'normal', marginLeft: 8, fontSize: 10.5, color: 'var(--dim)', letterSpacing: 0 }}>{r.pair}</i></span>
            <span className="cc-price">${r.price >= 1 ? r.price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : r.price.toPrecision(4)}</span>
            <span className="cc-meta" style={{ display: 'flex' }}>
              <span className={r.chg >= 0 ? 'up' : 'down'}>{r.chg >= 0 ? '+' : ''}{r.chg.toFixed(1)}%</span>
              <span style={{ marginLeft: 'auto', color: 'var(--dim)' }}>VOL {r.vol >= 1e6 ? `$${(r.vol / 1e6).toFixed(1)}M` : r.vol >= 1e3 ? `$${(r.vol / 1e3).toFixed(0)}K` : '—'}</span>
            </span>
          </a>
        )
      })}
    </div>
  )
}

function LiveFeed() {
  const [rows, setRows] = useState<FeedEvent[]>([])
  useEffect(() => {
    const off = stream.subscribe((e) => {
      setRows((rs) => [e, ...rs].slice(0, 4))
    })
    return off
  }, [])
  const view = (e: FeedEvent): { tag: string; sym: string; val: string; tone: 'g' | 'y' | 'r' } => {
    switch (e.kind) {
      case 'RUG': return { tag: 'RUG', sym: `${e.sym} · ${e.chain}`, val: `RUG RISK ${e.risk}`, tone: 'r' }
      case 'SAFE': return { tag: 'SAFE', sym: `${e.sym} · ${e.chain}`, val: `RISK ${e.risk}`, tone: 'g' }
      case 'SCAN': return { tag: 'SCAN', sym: `${e.sym} · ${e.chain}`, val: `RISK ${e.risk}`, tone: e.risk >= 60 ? 'y' : 'g' }
      case 'WHALE': return { tag: 'WHALE', sym: `$${(e.usd / 1000).toFixed(1)}K accumulated`, val: e.wallet, tone: 'g' }
      case 'LOCK': return { tag: 'LOCK', sym: `LP locked · ${e.pct}%`, val: e.sym, tone: 'g' }
    }
  }
  return (
    <div className="lv-feed" aria-hidden="true">
      <div className="lv-feed-hd"><span className="blink" /> LIVE SCAN FEED <span className="lv-feed-src">DEXSCREENER + GECKOTERMINAL</span></div>
      {rows.map((e, i) => {
        const v = view(e)
        return (
          <div className={`lv-feed-row f-${v.tone}`} key={`${v.tag}-${v.sym}-${i}`} style={{ animationDelay: `${i * 0.05}s` }}>
            <span className="tag">{v.tag}</span>
            <span className="sym">{v.sym}</span>
            <span className="v">{v.val}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ═══════════ sections ═══════════ */

const NAV = [
  ['Features', 'features'], ['How It Works', 'how'], ['Multi-Chain', 'chains'],
  ['AI Analyst', 'ai'], ['Token Utility', 'token'], ['Roadmap', 'roadmap'], ['Docs', 'docs'],
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
            <a href="/live" style={{ color: 'var(--g)', textShadow: '0 0 14px rgba(0,255,163,.45)' }}>Memecoin Live</a>
            <span className="lv-clock" title="UTC">◉ {clock} UTC</span>
            <a className="lv-cta neon" href="/terminal">Launch Terminal →</a>
          </div>
          <button className="lv-burger" aria-label="Menu" onClick={() => setOpen(!open)}><i /><i /><i /></button>
        </div>
        {open && (
          <div className="lv-nav-drop">
            <a href="/live" onClick={() => setOpen(false)}>Memecoin Live</a>
            {NAV.map(([l, id]) => <a key={id} href={`#${id}`} onClick={() => setOpen(false)}>{l}</a>)}
          </div>
        )}
      </nav>
    </>
  )
}

function Hero() {
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
        <a className="lv-announce" href="#features">
          <span className="blink" /> NEW — WALLET CLUSTERING v2 IS LIVE <i>→</i>
        </a>
        <div className="lv-kicker"><span className="live-dot" /> SYSTEM ONLINE — SCANNING ACTIVE</div>
        <h1 className="lv-h1">
          <span className="l1"><Decode text="See What Others" delay={900} />&nbsp;<Decode text="Miss." delay={1250} /></span>
          <span className="l2 grad"><Decode text="Understand What Matters." delay={1500} />&nbsp;</span>
        </h1>
        <p className="lv-sub">
          Since 2024, <b>18.7 million memecoins launched — 98.6% were built to hurt you.</b> Terminal
          Alpha scans them across five chains, scores the risk with deterministic heuristics, and
          explains why with evidence-first AI. No signals. No hype. Just the truth, faster.
        </p>
        <div className="lv-badges">
          <span className="lv-badge hot"><Icon name="spark" size={13} /> AI-Powered Analysis</span>
          <span className="lv-badge"><Icon name="hex" size={13} /> Multi-Chain</span>
          <span className="lv-badge"><Icon name="shield" size={13} /> Rug Check</span>
          <span className="lv-badge"><Icon name="cluster" size={13} /> Wallet Intelligence</span>
          <span className="lv-badge"><Icon name="ban" size={13} /> No Trading Execution</span>
        </div>
        <div className="lv-hero-cta">
          <Magnetic href="/terminal" className="lv-cta neon mag">Launch Terminal →</Magnetic>
          <a className="lv-cta ghost" href="#features">Explore Features</a>
        </div>
        <LiveFeed />
      </div>
      <div className="lv-radar" aria-hidden="true">
        <div className="tilt" ref={tilt}>
          <RadarScanner />
        </div>
        <div className="lv-hud">
          <div className="cell"><b>RISK ENGINE</b><span className="v">68/100</span><small>MEDIUM RISK</small></div>
          <div className="cell"><b>CLUSTERS</b><span className="v">3</span><small>42.3% SUPPLY</small></div>
          <div className="cell"><b>WHALES 24H</b><span className="v">$318K</span><small>NET FLOW</small></div>
        </div>
        <div className="lv-scanpill"><span className="blink" /> SCANNING THE MEMECOIN UNIVERSE</div>
      </div>
    </section>
  )
}

const METRICS = [
  { to: 33.5, prefix: '$', suffix: 'B', label: 'MEMECOIN MARKET CAP · LIVE', c: 'c-green', d: 1 },
  { to: 3.8, prefix: '$', suffix: 'B', label: '24H GLOBAL VOLUME · LIVE', c: 'c-neon', d: 1 },
  { to: 18.7, suffix: 'M', label: 'LAUNCHES SINCE 2024', c: 'c-amber', d: 1 },
  { to: 98.6, suffix: '%', label: 'SHOW RUG-PULL BEHAVIOR', c: 'c-red', d: 1 },
  { to: 0.8, prefix: '', suffix: '%', label: 'GRADUATION RATE · 2026', c: 'c-amber', d: 1 },
  { to: 0, suffix: '', label: 'TRADES EXECUTED BY US', c: 'c-green', d: 0 },
]

function Metrics() {
  return (
    <section className="lv-metrics">
      <div className="lv-metrics-in">
        {METRICS.map((m) => (
          <div key={m.label}>
            <b className={m.c}>{m.to === 0 ? '0' : <CountUp to={m.to} decimals={m.d} suffix={m.suffix} prefix={m.prefix ?? ''} />}</b>
            <small>{m.label}</small>
          </div>
        ))}
      </div>
      <div className="lv-metrics-src">LIVE MARKET DATA · COINGECKO (AUG 2026) · PUMP.FUN ON-CHAIN · SOLIDUS LABS · “TRADES EXECUTED” IS A PRODUCT FACT, NOT A FORECAST</div>
    </section>
  )
}

/* the honest hook — real 2026 numbers, our reason to exist */
function RugReality() {
  return (
    <section className="lv-sec" id="reality">
      <div className="lv-num">00</div>
      <div className="lv-reality rv">
        <div className="rv-big">98.6%</div>
        <div className="rv-copy">
          <div className="lv-k2">WHY TERMINAL ALPHA EXISTS</div>
          <h2 className="lv-h2">Most memecoins are built <span className="a">to hurt you.</span></h2>
          <p>
            Of <b>18.67M tokens launched on pump.fun since January 2024</b>, <b>98.6% showed rug-pull
            or manipulative behavior</b> — and 68.7% (12.8M) stopped trading the same day they launched.
            The graduation rate recently fell to <b>0.7–0.8%</b>. Fewer than one in a hundred survives.
          </p>
          <p style={{ marginTop: 10 }}>
            You don't need more signals. You need better filters — deterministic, transparent,
            and boring about the truth.
          </p>
          <div className="rv-src">
            SOURCES: SOLIDUS LABS · PUMP.FUN ON-CHAIN (18.67M TOKENS) · CRYPTORANK · COINGECKO LIVE AUG 2026
          </div>
        </div>
      </div>
    </section>
  )
}

const TRUST = ['Multi-Chain Intelligence', 'AI Reasoning', 'Risk Detection', 'Wallet Intelligence', 'Evidence-Based Analysis']

function Trust() {
  return (
    <section className="lv-trust">
      <div className="lv-trust-in">
        {TRUST.map((t) => <span key={t}>{t}</span>)}
      </div>
    </section>
  )
}

const STAGES = [
  { n: 'STAGE 01', t: 'DATA LAYER', icon: 'hex', badge: false, desc: 'Market, trade and on-chain data aggregated into a unified intelligence layer.', chips: ['DexScreener', 'GeckoTerminal', 'Helius', 'Birdeye', 'Bitquery'] },
  { n: 'STAGE 02', t: 'ENGINE', icon: 'cpu', badge: true, desc: 'Deterministic algorithms detect suspicious patterns before AI reasoning begins.', chips: ['Rug Check', 'Wallet Clustering', 'Liquidity', 'Holders', 'Volume', 'Patterns'] },
  { n: 'STAGE 03', t: 'AI ANALYST', icon: 'spark', badge: false, desc: 'AI interprets verified evidence instead of inventing facts.', chips: ['Evidence-Based', 'Risk Explanation', 'Pattern Summary', 'Deep Analysis'] },
  { n: 'STAGE 04', t: 'TERMINAL', icon: 'grid', badge: false, desc: 'All intelligence delivered through one powerful terminal experience.', chips: ['Dashboard', 'Alerts', 'AI Chat', 'Watchlist', 'Reports'] },
]

function How() {
  return (
    <section className="lv-sec alt" id="how">
      <div className="lv-num">01</div>
      <div className="lv-sec-head lv-center rv">
        <div className="lv-k2">HOW IT WORKS</div>
        <h2 className="lv-h2">AI-Powered On-Chain <span className="a">Intelligence</span></h2>
        <p className="lv-lead">Real data. Deterministic analysis. AI reasoning.</p>
      </div>
      <div className="lv-pipe">
        {STAGES.map((s, i) => (
          <div className={`lv-stage rv d${i}`} key={s.t}>
            <DataStream className="stream" />
            <div className="n">{s.n}</div>
            <div className="lv-holo"><span className="ring" /><span className="ring r2" /><span className="core"><Icon name={s.icon} size={26} /></span></div>
            <h3>{s.t}{s.badge && <span className="lv-live-badge" aria-hidden="true" />}</h3>
            <p className="desc">{s.desc}</p>
            <div className="lv-chips">{s.chips.map((c) => <span className="lv-chip" key={c}>{c}</span>)}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Chains() {
  const [hover, setHover] = useState<string | null>(null)
  const info = NET_CHAINS.find((c) => c.id === hover)
  return (
    <section className="lv-sec" id="chains">
      <div className="lv-num">02</div>
      <div className="lv-sec-head lv-center rv">
        <div className="lv-k2">MULTI-CHAIN</div>
        <h2 className="lv-h2">One Terminal. <span className="a">All Chains.</span></h2>
        <p className="lv-lead">Scan, analyze and compare memecoins across multiple ecosystems from one unified intelligence layer.</p>
      </div>
      <div className="lv-net-wrap rv">
        <ChainGlobe hovered={hover} onHover={setHover} />
        {info && (
          <div className="lv-net-tip" style={{ borderColor: info.color + '66' }}>
            <div className="t" style={{ color: info.color }}>{info.label}</div>
            <div className="s">{info.stats}</div>
            <span className="b" style={info.live
              ? { color: '#34d399', border: '1px solid rgba(52,211,153,.4)' }
              : { color: '#8a91b4', border: '1px dashed rgba(139,145,180,.4)' }}>
              {info.live ? '● LIVE' : '◇ VERIFICATION PENDING'}
            </span>
          </div>
        )}
        <div className="lv-net-hint">HOVER A CHAIN NODE</div>
      </div>
    </section>
  )
}

const FEATS = [
  { i: 'shield', t: 'Rug Check Engine', d: 'Detect suspicious liquidity, ownership, mint authority and other risk signals.' },
  { i: 'cluster', t: 'Wallet Clustering', d: 'Detect coordinated wallets, trading patterns and hidden relationships.' },
  { i: 'spark', t: 'AI Analyst', d: 'Ask questions and receive evidence-based analysis — never invented facts.' },
  { i: 'eye', t: 'Whale Tracker', d: 'Monitor whale movements, large transactions and smart-money activity.' },
  { i: 'bell', t: 'Alerts & Watchlist', d: 'Track important tokens and receive intelligent alerts when signals change.' },
  { i: 'wallet', t: 'Portfolio Intelligence', d: 'Monitor holdings, exposure and risk insights — read-only, no custody.' },
]

function Features() {
  return (
    <section className="lv-sec alt" id="features">
      <div className="lv-num">03</div>
      <div className="lv-sec-head lv-center rv">
        <div className="lv-k2">FEATURES</div>
        <h2 className="lv-h2">Everything You Need to <span className="a">Stay Ahead</span></h2>
      </div>
      <div className="lv-feats">
        {FEATS.map((f, i) => (
          <div className={`lv-feat rv d${i % 3}`} key={f.t}>
            <div className="holo-s"><Icon name={f.i} size={24} /></div>
            <h3>{f.t}</h3>
            <p>{f.d}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

const PHIL = [
  { i: 'ban', t: 'No Trading Execution', d: 'Zero transaction paths exist in the product — by design.' },
  { i: 'key', t: 'No Custody', d: 'We never hold funds or ask for private keys. Ever.' },
  { i: 'check', t: 'Evidence-Based AI', d: 'The model cites its evidence or admits "data not available".' },
  { i: 'lock', t: 'Privacy First', d: 'Public data in, insight out. No tracking, no accounts required.' },
]

function Philosophy() {
  return (
    <section className="lv-sec" id="philosophy">
      <div className="lv-num">04</div>
      <div className="lv-sec-head lv-center rv">
        <div className="lv-k2">PRODUCT PHILOSOPHY</div>
        <h2 className="lv-h2">Built for Analysis. <span className="a">Not for Gambling.</span></h2>
        <p className="lv-lead">Terminal Alpha is an intelligence and research terminal — not a trading bot.</p>
      </div>
      <div className="lv-phil">
        {PHIL.map((p, i) => (
          <div className={`lv-pr rv d${i}`} key={p.t}>
            <div className="ico"><Icon name={p.i} size={26} /></div>
            <b>{p.t}</b>
            <span>{p.d}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function AiSection() {
  return (
    <section className="lv-sec alt" id="ai">
      <div className="lv-num">05</div>
      <div className="lv-ai">
        <div className="lv-core rv" aria-hidden="true"><SystemDiagram /></div>
        <div className="rv d1">
          <div className="lv-k2">AI ANALYST</div>
          <h2 className="lv-h2" style={{ marginBottom: 18 }}>Ask Why. <span className="a">Get Evidence.</span></h2>
          <div className="lv-chat">
            <div className="hd"><span className="d" /><b>TERMINAL ALPHA AI — MOCK CONVERSATION</b></div>
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
              <button className="lv-cta ghost" style={{ height: 38, fontSize: 12 }}>Explain Score</button>
              <button className="lv-cta ghost" style={{ height: 38, fontSize: 12 }}>Deeper Analysis</button>
            </div>
            <div className="note">// VISUAL MOCKUP — EVIDENCE-FIRST AI, NO REAL CONNECTION YET</div>
          </div>
        </div>
      </div>
    </section>
  )
}

const TIERS = [
  { i: 'scan', t: 'Free Analysis', d: 'Full data correctness, standard depth — the truth is never paywalled.' },
  { i: 'activity', t: 'Deep Analysis', d: 'Longer AI reasoning, cluster traces, whale intent — depth, not different facts.' },
  { i: 'eye', t: 'Premium Intelligence', d: 'Advanced research tooling for desks. USDC path always available.' },
]

/* soulbound key card — drag to rotate, hologram sheen */
function KeyCard() {
  const ref = useRef<HTMLDivElement>(null)
  const state = useRef({ rx: 12, ry: -14, vx: 0, vy: 0, drag: false, px: 0, py: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const loop = () => {
      const s = state.current
      if (!s.drag) {
        s.ry += (s.vy *= 0.92)
        s.rx += (s.vx *= 0.92)
        s.ry += (-14 - s.ry) * 0.015
        s.rx += (12 - s.rx) * 0.015
      }
      el.style.transform = `rotateX(${s.rx}deg) rotateY(${s.ry}deg)`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const down = (e: PointerEvent) => {
      const s = state.current
      s.drag = true; s.px = e.clientX; s.py = e.clientY
    }
    const move = (e: PointerEvent) => {
      const s = state.current
      if (!s.drag) return
      s.vy = (e.clientX - s.px) * 0.5
      s.vx = -(e.clientY - s.py) * 0.5
      s.ry += s.vy; s.rx += s.vx
      s.px = e.clientX; s.py = e.clientY
    }
    const up = () => { state.current.drag = false }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])
  return (
    <div className="lv-key rv" aria-hidden="true">
      <span className="orb" />
      <div className="key3d"><div className="card3d" ref={ref}><span className="gl"><Icon name="key" size={44} /></span><span className="tt">SOULBOUND · TIME-BOUND</span><span className="sheen" /></div></div>
      <div className="lv-key-hint">DRAG THE KEY</div>
    </div>
  )
}

function Token() {
  return (
    <section className="lv-sec" id="token">
      <div className="lv-num">06</div>
      <div className="lv-sec-head lv-center rv">
        <div className="lv-k2">TOKEN UTILITY</div>
        <h2 className="lv-h2">Access Intelligence. <span className="a">Not Speculation.</span></h2>
        <p className="lv-lead">The access layer is designed around feature depth — never trading, custody, or profit promises.</p>
      </div>
      <div className="lv-key-wrap">
        <KeyCard />
        <div className="lv-tiers rv d1">
          {TIERS.map((t) => (
            <div className="lv-tier" key={t.t}>
              <span className="ic"><Icon name={t.i} size={19} /></span>
              <div><b>{t.t}</b><span>{t.d}</span></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const ROAD = [
  { ph: 'PHASE 01', t: 'Foundation', done: true, items: ['Multi-chain scanner', 'Rug Check', 'AI Analyst', 'Terminal UI'] },
  { ph: 'PHASE 02', t: 'Intelligence', done: true, items: ['Wallet clustering', 'Whale tracking', 'Alerts', 'Grounding logs'] },
  { ph: 'PHASE 03', t: 'Advanced Intelligence', done: false, items: ['Funding-source analysis', 'Sniper detection', 'Advanced graph analysis', 'Deep research'] },
  { ph: 'PHASE 04', t: 'Scale', done: false, items: ['Production data providers', 'Expanded chain coverage', 'Advanced intelligence infrastructure'] },
]

function Roadmap() {
  return (
    <section className="lv-sec alt" id="roadmap">
      <div className="lv-num">07</div>
      <div className="lv-sec-head lv-center rv">
        <div className="lv-k2">ROADMAP</div>
        <h2 className="lv-h2">From Scanner to <span className="a">Intelligence Infrastructure</span></h2>
      </div>
      <div className="lv-road">
        {ROAD.map((r, i) => (
          <div className={`lv-phase ${r.done ? 'done' : ''} rv d${i}`} key={r.ph}>
            <span className="pt" />
            <div className="ph">{r.ph}</div>
            <b>{r.t}</b>
            <ul>{r.items.map((it) => <li className={r.done ? 'done-i' : ''} key={it}>{it}</li>)}</ul>
          </div>
        ))}
      </div>
    </section>
  )
}

/* social proof — live product stats + community */
function SocialProof() {
  const [stats, setStats] = useState({ scanned: 12847, caught: 98.2 })
  useEffect(() => {
    const off = stream.subscribe(() => setStats({ scanned: stream.stats().scanned, caught: stream.stats().caught }))
    return off
  }, [])
  return (
    <section className="lv-social">
      <div className="lv-social-in rv">
        <div className="lv-social-stats">
          <div><b className="c-neon"><CountUp to={stats.scanned} dur={1400} /></b><small>TOKENS SCANNED THIS SESSION</small></div>
          <div><b className="c-red">{stats.caught}%</b><small>FLAGGED HIGH-RISK</small></div>
          <div><b className="c-amber">5</b><small>CHAINS COVERED</small></div>
          <div><b className="c-green">24/7</b><small>SCANNER UPTIME</small></div>
        </div>
        <div className="lv-social-cta">
          <span className="lv-k2">JOIN THE DESK</span>
          <div className="lv-social-btns">
            <a className="lv-cta ghost sm" href="https://x.com/terminalalpha" target="_blank" rel="noreferrer"><Icon name="x" size={15} /> FOLLOW ON X</a>
            <a className="lv-cta ghost sm" href="https://t.me/terminalalpha" target="_blank" rel="noreferrer"><Icon name="telegram" size={15} /> TELEGRAM</a>
          </div>
        </div>
      </div>
    </section>
  )
}

function Final() {
  return (
    <section className="lv-final" id="docs">
      <span className="ring3d" aria-hidden="true" /><span className="ring3d r" aria-hidden="true" />
      <div className="rv">
        <h2>Ready to See the Alpha <span style={{ color: 'var(--p2)' }}>Others Miss?</span></h2>
        <p>Enter the next generation of AI-powered on-chain intelligence.</p>
        <Magnetic href="/terminal" className="lv-cta neon mag" >
          <span className="lv-final-cta">Launch Terminal →</span>
        </Magnetic>
        <p style={{ marginTop: 30, fontSize: 12.5, fontFamily: 'var(--fm)', color: 'var(--dim)' }}>
          DOCS · #how &nbsp;·&nbsp; API PREVIEW · #features &nbsp;·&nbsp; STATUS · <span style={{ color: 'var(--g)' }}>ALL SYSTEMS OPERATIONAL</span>
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
          <p className="disc">AI memecoin intelligence terminal. Analysis & education only — AI output is not financial advice, risk scores are heuristics not audits. DYOR.</p>
        </div>
        <div className="lv-foot-col">
          <b>PRODUCT</b>
          <a href="#features">Features</a><a href="#how">How It Works</a><a href="#chains">Multi-Chain</a><a href="/terminal">Terminal</a>
        </div>
        <div className="lv-foot-col">
          <b>INTELLIGENCE</b>
          <a href="#ai">AI Analyst</a><a href="#token">Token Utility</a><a href="#roadmap">Roadmap</a><a href="#docs">Docs</a>
        </div>
        <div className="lv-foot-col">
          <b>STATUS</b>
          <span className="ok">● All systems operational</span>
          <span className="dim">Scanner array: ACTIVE</span>
          <span className="dim">Grounding log: ENABLED</span>
        </div>
      </div>
      <div className="lv-wordmark" aria-hidden="true">TERMINAL ALPHA</div>
      <div className="lv-foot-legal">© 2026 TERMINAL ALPHA — READ-ONLY INTELLIGENCE. NO TRADING. NO CUSTODY. EVIDENCE FIRST.</div>
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
      <Metrics />
      <Trust />
      <RugReality />
      <Ticker />
      <How />
      <Chains />
      <Features />
      <Philosophy />
      <AiSection />
      <Token />
      <Roadmap />
      <SocialProof />
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
