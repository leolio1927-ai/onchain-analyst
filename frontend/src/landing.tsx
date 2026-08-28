import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import './styles/landing3.css'
import { ChainNetwork, DataStream, NET_CHAINS, NeuralCore, PageBackground, RadarScanner } from './components/visuals'

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

/* scrollspy: which section id is current */
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

/* scroll progress 0..1 */
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
  return <span ref={ref}>{prefix}{v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>
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

/* live ticker tape (mock) */
const TAPE = [
  ['$MEMEATCHI', 'SOL', '+24.6%', 'RISK 68', true],
  ['PEPEKING', 'BNB', '+41.2%', 'RISK 57', true],
  ['BASEDGOD', 'BASE', '+8.9%', 'RISK 34', true],
  ['WOJAK2.0', 'SOL', '-12.4%', 'RISK 81', false],
  ['SNOWBALL', 'AVAX', '-3.1%', 'RISK 72', false],
  ['MOONBOI', 'SOL', '+5.2%', 'RISK 49', true],
  ['HYPERCAT', 'HYPE', '+63.7%', 'RISK 88', false],
] as const

function Ticker() {
  const row = [...TAPE, ...TAPE]
  return (
    <div className="lv-tape" aria-hidden="true">
      <div className="lv-tape-track">
        {row.map(([sym, ch, chg, risk, up], i) => (
          <span className="lv-tape-item" key={i}>
            <b>{sym}</b><span className="dim">{ch}</span>
            <span className={up ? 'up' : 'down'}>{chg}</span>
            <span className={parseInt(risk.replace(/\D/g, '')) >= 60 ? 'down' : 'up'}>{risk}</span>
            <i>◈</i>
          </span>
        ))}
      </div>
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
  return (
    <>
      <div className="lv-progress"><span style={{ width: `${progress * 100}%` }} /></div>
      <nav className={`lv-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="lv-nav-in">
          <a href="#" className="lv-logo"><span className="m">◤</span>TERMINAL&nbsp;<span style={{ color: 'var(--p2)' }}>ALPHA</span></a>
          <div className="lv-nav-links">
            {NAV.map(([l, id]) => (
              <a key={id} href={`#${id}`} className={cur === id ? 'on' : ''}>{l}</a>
            ))}
            <span className="lv-clock" title="UTC">◉ {clock} UTC</span>
            <a className="lv-cta" href="/terminal">Launch Terminal →</a>
          </div>
        </div>
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
      el.style.transform = `perspective(1100px) rotateY(${dx * 7}deg) rotateX(${-dy * 5}deg)`
    }
    const reset = () => { el.style.transform = 'perspective(1100px)' }
    parent?.addEventListener('mousemove', onMove)
    parent?.addEventListener('mouseleave', reset)
    return () => {
      parent?.removeEventListener('mousemove', onMove)
      parent?.removeEventListener('mouseleave', reset)
    }
  }, [])
  const words = ['See', 'What', 'Others', 'Miss.']
  const words2 = ['Understand', 'What', 'Matters.']
  return (
    <section className="lv-hero" id="top">
      <div className="lv-hero-bg" />
      <div className="rv vis">
        <div className="lv-kicker"><span className="live-dot" /> SYSTEM ONLINE — SCANNING ACTIVE</div>
        <h1 className="lv-h1">
          <span className="l1">{words.map((w, i) => <span key={i} style={{ animationDelay: `${0.9 + i * 0.09}s` }}>{w}&nbsp;</span>)}</span>
          <span className="l2 a shimmer">{words2.map((w, i) => <span key={i} style={{ animationDelay: `${1.15 + i * 0.09}s` }}>{w}&nbsp;</span>)}</span>
        </h1>
        <p className="lv-sub">
          Terminal Alpha is an AI-powered memecoin intelligence terminal that helps traders
          analyze risk, detect hidden patterns, and understand smarter on-chain behavior
          across multiple blockchains.
        </p>
        <div className="lv-badges">
          <span className="lv-badge hot">✦ AI-Powered Analysis</span>
          <span className="lv-badge">⬡ Multi-Chain</span>
          <span className="lv-badge">⛨ Rug Check</span>
          <span className="lv-badge">❋ Wallet Intelligence</span>
          <span className="lv-badge">⊘ No Trading Execution</span>
        </div>
        <div className="lv-hero-cta">
          <Magnetic href="/terminal" className="lv-cta mag">Launch Terminal →</Magnetic>
          <a className="lv-cta ghost" href="#features">Explore Features</a>
        </div>
      </div>
      <div className="lv-radar" aria-hidden="true">
        <div className="tilt" ref={tilt}>
          <RadarScanner />
          <div className="lv-rpanel p1"><b>RISK ENGINE</b><span className="v">68/100</span> MEDIUM RISK</div>
          <div className="lv-rpanel p2"><b>CLUSTERS</b><span className="v">3 detected</span> 42.3% supply</div>
          <div className="lv-rpanel p3"><b>WHALES</b><span className="v">$318K</span> net flow 24h</div>
        </div>
        <div className="lv-scanpill"><span className="blink" /> SCANNING THE MEMECOIN UNIVERSE</div>
      </div>
    </section>
  )
}

const METRICS = [
  { to: 5, suffix: '', label: 'BLOCKCHAINS', c: 'c-cyan', d: 0 },
  { to: 50, suffix: 'K+', label: 'TOKENS SCANNED', c: 'c-green', d: 0 },
  { to: 1.2, suffix: 'M+', label: 'ANALYSES RUN', c: 'c-purple', d: 1 },
  { to: 99.7, suffix: '%', label: 'UPTIME', c: 'c-amber', d: 1 },
  { to: 6, suffix: '', label: 'RISK SIGNALS', c: 'c-cyan', d: 0 },
  { to: 0, suffix: '', label: 'TRADES EXECUTED', c: 'c-green', d: 0 },
]

function Metrics() {
  return (
    <section className="lv-metrics">
      <div className="lv-metrics-in">
        {METRICS.map((m) => (
          <div key={m.label}>
            <b className={m.c}>{m.to === 0 ? '0' : <CountUp to={m.to} decimals={m.d} suffix={m.suffix} />}</b>
            <small>{m.label}</small>
          </div>
        ))}
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
  { n: 'STAGE 01', t: 'DATA LAYER', icon: '⬡', desc: 'Market, trade and on-chain data aggregated into a unified intelligence layer.', chips: ['DexScreener', 'GeckoTerminal', 'Helius', 'Birdeye', 'Bitquery'] },
  { n: 'STAGE 02', t: 'HEURISTIC ENGINE', icon: '⛭', desc: 'Deterministic algorithms detect suspicious patterns before AI reasoning begins.', chips: ['Rug Check', 'Wallet Clustering', 'Liquidity', 'Holders', 'Volume', 'Patterns'] },
  { n: 'STAGE 03', t: 'AI ANALYST', icon: '✦', desc: 'AI interprets verified evidence instead of inventing facts.', chips: ['Evidence-Based', 'Risk Explanation', 'Pattern Summary', 'Deep Analysis'] },
  { n: 'STAGE 04', t: 'TERMINAL', icon: '▤', desc: 'All intelligence delivered through one powerful terminal experience.', chips: ['Dashboard', 'Alerts', 'AI Chat', 'Watchlist', 'Reports'] },
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
            <div className="lv-holo"><span className="ring" /><span className="ring r2" /><span className="core">{s.icon}</span></div>
            <h3>{s.t}</h3>
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
        <ChainNetwork hovered={hover} onHover={setHover} />
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
  { i: '⛨', t: 'Rug Check Engine', d: 'Detect suspicious liquidity, ownership, mint authority and other risk signals.' },
  { i: '❋', t: 'Wallet Clustering', d: 'Detect coordinated wallets, trading patterns and hidden relationships.' },
  { i: '✦', t: 'AI Analyst', d: 'Ask questions and receive evidence-based analysis — never invented facts.' },
  { i: '◍', t: 'Whale Tracker', d: 'Monitor whale movements, large transactions and smart-money activity.' },
  { i: '◆', t: 'Alerts & Watchlist', d: 'Track important tokens and receive intelligent alerts when signals change.' },
  { i: '▤', t: 'Portfolio Intelligence', d: 'Monitor holdings, exposure and risk insights — read-only, no custody.' },
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
            <div className="holo-s">{f.i}</div>
            <h3>{f.t}</h3>
            <p>{f.d}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

const PHIL = [
  { i: '⊘', t: 'No Trading Execution', d: 'Zero transaction paths exist in the product — by design.' },
  { i: '⚿', t: 'No Custody', d: 'We never hold funds or ask for private keys. Ever.' },
  { i: '✦', t: 'Evidence-Based AI', d: 'The model cites its evidence or admits “data not available”.' },
  { i: '◈', t: 'Privacy First', d: 'Public data in, insight out. No tracking, no accounts required.' },
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
            <div className="ico">{p.i}</div>
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
        <div className="lv-core rv" aria-hidden="true"><NeuralCore /></div>
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
  { i: '◇', t: 'Free Analysis', d: 'Full data correctness, standard depth — the truth is never paywalled.' },
  { i: '◆', t: 'Deep Analysis', d: 'Longer AI reasoning, cluster traces, whale intent — depth, not different facts.' },
  { i: '✧', t: 'Premium Intelligence', d: 'Advanced research tooling for desks. USDC path always available.' },
]

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
        <div className="lv-key rv" aria-hidden="true">
          <span className="orb" />
          <div className="card3d"><span className="gl">⚿</span><span className="tt">SOULBOUND · TIME-BOUND</span></div>
        </div>
        <div className="lv-tiers rv d1">
          {TIERS.map((t) => (
            <div className="lv-tier" key={t.t}>
              <span className="ic">{t.i}</span>
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

function Final() {
  return (
    <section className="lv-final" id="docs">
      <span className="ring3d" aria-hidden="true" /><span className="ring3d r" aria-hidden="true" />
      <div className="rv">
        <h2>Ready to See the Alpha <span style={{ color: 'var(--p2)' }}>Others Miss?</span></h2>
        <p>Enter the next generation of AI-powered on-chain intelligence.</p>
        <Magnetic href="/terminal" className="lv-cta mag" >
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
          <div className="lv-logo" style={{ marginBottom: 12 }}><span className="m">◤</span>TERMINAL&nbsp;<span style={{ color: 'var(--p2)' }}>ALPHA</span></div>
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
      <PageBackground />
      <Spotlight />
      <Nav />
      <Hero />
      <Metrics />
      <Trust />
      <Ticker />
      <How />
      <Chains />
      <Features />
      <Philosophy />
      <AiSection />
      <Token />
      <Roadmap />
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
