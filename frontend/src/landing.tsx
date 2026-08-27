import { useEffect } from 'react'
import './styles/base.css'
import './styles/landing.css'

const MOCK_LINES = [
  { p: '$', cls: 'cmd', text: '/load sol DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
  { p: '>', cls: 'ok', text: 'BONK loaded · risk LOW 34/100' },
  { p: '■', cls: 'sig', text: 'Liquidity — $150,940 — adequate (weight 30%)' },
  { p: '■', cls: 'sig', text: 'Wallet coordination — 77 wallets · 60s burst max 17 (8.0x avg)' },
  { p: '$', cls: 'cmd', text: '/explain claude' },
  { p: 'AI', cls: 'ai', text: 'Liquidity is adequate, but FDV/liquidity at 1,850x means exit…' },
]

function TerminalMock() {
  return (
    <div className="mock" aria-hidden="true">
      <div className="mock-bar">
        <span className="dot r" /><span className="dot y" /><span className="dot g" />
        <span className="mock-title">terminal-alpha — read-only</span>
      </div>
      <div className="mock-body">
        {MOCK_LINES.map((l, i) => (
          <div className={`mock-line ${l.cls}`} style={{ animationDelay: `${0.35 + i * 0.45}s` }} key={i}>
            <span className="p">{l.p}</span> {l.text}
          </div>
        ))}
        <div className="mock-line cursor-line">
          <span className="p">$</span> <span className="cursor" />
        </div>
      </div>
    </div>
  )
}

function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('visible')),
      { threshold: 0.12 },
    )
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
}

const PRINCIPLES = [
  { k: '01', t: 'Read-only by design', d: 'No swaps, no wallet connections, no keys. The terminal analyzes — execution stays on your platform of choice.' },
  { k: '02', t: 'Evidence-first AI', d: 'The model only sees a whitelisted evidence block. What isn’t in the data doesn’t exist: “data not available” is a valid answer.' },
  { k: '03', t: 'Deterministic heuristics', d: 'Five weighted signals you can audit threshold by threshold. Same input, same verdict — every single time.' },
  { k: '04', t: 'Wallet coordination', d: 'Per-wallet trade feed feeds burst-timing and amount-uniformity detection. Below 8 wallets we refuse to score.' },
  { k: '05', t: 'Grounding log', d: 'Every AI answer is logged next to the exact evidence it saw — replayable, comparable across models, regression-testable.' },
  { k: '06', t: 'Insufficient data is an answer', d: 'Missing signals never get guessed. The verdict says INSUFFICIENT DATA and moves on. Honesty over false confidence.' },
]

const FLOW = [
  { t: 'Providers', d: 'DexScreener aggregates + GeckoTerminal per-wallet trades' },
  { t: 'Heuristics', d: 'Deterministic weighted scoring — no AI involved yet' },
  { t: 'AI analyst', d: 'Reasons only over the evidence block it was handed' },
  { t: 'Your screen', d: 'TUI or web terminal — same engine, same verdicts' },
]

export default function Landing() {
  useReveal()
  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <a href="/" className="logo"><span className="mark">◤</span> TERMINAL<span className="tld">ALPHA</span></a>
          <div className="nav-links">
            <a href="#principles">Principles</a>
            <a href="#architecture">Architecture</a>
            <a href="#disclaimer">Disclaimer</a>
            <a href="/terminal" className="btn btn-primary btn-sm">Open Terminal</a>
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-bg" aria-hidden="true" />
        <div className="container hero-inner">
          <div className="hero-copy">
            <p className="overline">AI memecoin scanner terminal</p>
            <h1>Cut the noise.<br /><span className="grad">Know the why.</span></h1>
            <p className="sub">
              Terminal Alpha turns raw on-chain data into <em>explained</em> risk.
              Deterministic heuristics, evidence-first AI, zero custody —
              no buy/sell signals, just context you can verify.
            </p>
            <div className="hero-cta">
              <a href="/terminal" className="btn btn-primary">Open Terminal →</a>
              <a href="#architecture" className="btn btn-ghost">How it works</a>
            </div>
            <div className="hero-stats">
              <div><b>6</b><span>risk signals</span></div>
              <div><b>4</b><span>chains live</span></div>
              <div><b>3</b><span>AI providers</span></div>
              <div><b>0</b><span>transactions executed</span></div>
            </div>
          </div>
          <TerminalMock />
        </div>
      </header>

      <section className="chains reveal">
        <div className="container chains-inner">
          <span className="chains-label">live on</span>
          {['Solana', 'BNB Chain', 'Base', 'Avalanche'].map((c) => (
            <span className="chain" key={c}>{c}</span>
          ))}
          <span className="chain soon">Hyperliquid · soon</span>
        </div>
      </section>

      <section id="principles" className="section">
        <div className="container">
          <p className="overline reveal">Non-negotiables</p>
          <h2 className="reveal">Principles that don't bend.</h2>
          <div className="cards">
            {PRINCIPLES.map((p) => (
              <article className="card reveal" key={p.k}>
                <span className="card-num">{p.k}</span>
                <h3>{p.t}</h3>
                <p>{p.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="architecture" className="section alt">
        <div className="container">
          <p className="overline reveal">Pipeline</p>
          <h2 className="reveal">Every answer traces back to data.</h2>
          <p className="lead reveal">
            The AI never talks to raw APIs. It reasons strictly over the heuristic output it was
            handed — so any conclusion can be audited down to the exact numbers behind it.
          </p>
          <div className="flow">
            {FLOW.map((f, i) => (
              <div className="flow-step reveal" key={f.t} style={{ transitionDelay: `${i * 0.1}s` }}>
                <span className="flow-n">{i + 1}</span>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="disclaimer" className="section">
        <div className="container">
          <div className="disclaimer reveal">
            <h2>Read this before you trade.</h2>
            <p>
              Terminal Alpha is a research and education tool. AI output is <b>not financial
              advice</b>. Every risk score is an automated heuristic, not an audit. Memecoin
              trading is extremely high risk — never risk funds you cannot afford to lose. Always
              do your own research.
            </p>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container footer-inner">
          <span className="logo"><span className="mark">◤</span> TERMINAL<span className="tld">ALPHA</span></span>
          <span className="foot-note">© 2026 — research & education tool. Not financial advice. DYOR.</span>
          <a href="/terminal" className="foot-link">Open Terminal →</a>
        </div>
      </footer>
    </>
  )
}
