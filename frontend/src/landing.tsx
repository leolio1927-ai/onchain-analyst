import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import './styles/landing2.css'
import { ChainNetwork, DataStream, NET_CHAINS, NeuralCore, RadarScanner } from './components/visuals'

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

/* hero radar reacts subtly to the mouse */
function useTilt() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      const dx = (e.clientX - r.left) / r.width - 0.5
      const dy = (e.clientY - r.top) / r.height - 0.5
      el.style.transform = `perspective(1100px) rotateY(${dx * 7}deg) rotateX(${-dy * 5}deg)`
    }
    const reset = () => { el.style.transform = 'perspective(1100px)' }
    const parent = el.parentElement
    parent?.addEventListener('mousemove', onMove)
    parent?.addEventListener('mouseleave', reset)
    return () => {
      parent?.removeEventListener('mousemove', onMove)
      parent?.removeEventListener('mouseleave', reset)
    }
  }, [])
  return ref
}

/* ═══════════ sections ═══════════ */

const NAV = [
  ['Features', '#features'], ['How It Works', '#how'], ['Multi-Chain', '#chains'],
  ['AI Analyst', '#ai'], ['Token Utility', '#token'], ['Roadmap', '#roadmap'], ['Docs', '#docs'],
]

function Nav() {
  const scrolled = useScrollNav()
  return (
    <nav className={`lv-nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="lv-nav-in">
        <a href="#" className="lv-logo"><span className="m">◤</span>TERMINAL&nbsp;<span style={{ color: 'var(--p2)' }}>ALPHA</span></a>
        <div className="lv-nav-links">
          {NAV.map(([l, h]) => <a key={h} href={h}>{l}</a>)}
          <a className="lv-cta" href="/terminal">Launch Terminal →</a>
        </div>
      </div>
    </nav>
  )
}

function Hero() {
  const tilt = useTilt()
  return (
    <section className="lv-hero" id="top">
      <div className="lv-hero-bg" />
      <div className="rv vis">
        <div className="lv-kicker">AI MEMECOIN INTELLIGENCE TERMINAL</div>
        <h1 className="lv-h1">See What Others Miss.<br /><span className="a">Understand What Matters.</span></h1>
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
          <a className="lv-cta" href="/terminal">Launch Terminal →</a>
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
  {
    n: 'STAGE 01', t: 'DATA LAYER', icon: '⬡', desc: 'Market, trade and on-chain data aggregated into a unified intelligence layer.',
    chips: ['DexScreener', 'GeckoTerminal', 'Helius', 'Birdeye', 'Bitquery'],
  },
  {
    n: 'STAGE 02', t: 'HEURISTIC ENGINE', icon: '⛭', desc: 'Deterministic algorithms detect suspicious patterns before AI reasoning begins.',
    chips: ['Rug Check', 'Wallet Clustering', 'Liquidity', 'Holders', 'Volume', 'Patterns'],
  },
  {
    n: 'STAGE 03', t: 'AI ANALYST', icon: '✦', desc: 'AI interprets verified evidence instead of inventing facts.',
    chips: ['Evidence-Based', 'Risk Explanation', 'Pattern Summary', 'Deep Analysis'],
  },
  {
    n: 'STAGE 04', t: 'TERMINAL', icon: '▤', desc: 'All intelligence delivered through one powerful terminal experience.',
    chips: ['Dashboard', 'Alerts', 'AI Chat', 'Watchlist', 'Reports'],
  },
]

function How() {
  return (
    <section className="lv-sec alt" id="how">
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
        <a className="lv-cta" href="/terminal" style={{ height: 54, padding: '0 38px', fontSize: 15.5 }}>Launch Terminal →</a>
        <p style={{ marginTop: 28, fontSize: 12.5, fontFamily: 'var(--fm)', color: 'var(--dim)' }}>
          DOCS · #how &nbsp;·&nbsp; API PREVIEW · #features &nbsp;·&nbsp; STATUS · ALL SYSTEMS OPERATIONAL
        </p>
      </div>
    </section>
  )
}

function Foot() {
  return (
    <footer className="lv-foot">
      <div className="lv-foot-in">
        <a href="#" className="lv-logo"><span className="m">◤</span>TERMINAL&nbsp;<span style={{ color: 'var(--p2)' }}>ALPHA</span></a>
        <p className="disc">
          Research & education tool. AI output is not financial advice. Risk scores are automated
          heuristics, not audits. Memecoin trading is extremely high risk — DYOR, never risk funds
          you cannot afford to lose.
        </p>
        <div className="nav2"><a href="#top">Back to top ↑</a><a href="/terminal">Open Terminal</a></div>
      </div>
    </footer>
  )
}

/* ═══════════ page ═══════════ */

export default function Landing() {
  useReveal()
  return (
    <div className="lv">
      <Nav />
      <Hero />
      <Trust />
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
