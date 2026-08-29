/* TOKEN PAGE (S2) — full-bleed, dense, shipped-product token detail + swap.
   Reference: printr token page. FE-only simulated surface: every number is
   STATIC and the page hero says so; one SIMULATED chip per panel, never per
   number. Deterministic seeded candles/trades (same input → same page). DNA:
   2px bordir, dashed hairlines, glow, mono density, zero purple.
   LAYOUT (founder-locked): main row = LEFT column stacks chart → bonding →
   trades directly (zero gaps); RIGHT column (380px) is the compact swap rail
   (sticky). No canvas — crash-proof pure CSS background. */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { LIVE_CHAINS } from '../lib/liveApi'
import type { LiveChain } from '../lib/liveApi'
import { truncAddr } from '../lib/liveFormat'
import { accentStyle } from './liveParts'
import { ChainLogo } from './chainLogos'
import '../styles/swap.css'

/* ── deterministic simulated data set ─────────────────────────── */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Bar { o: number; c: number; h: number; l: number; v: number }
const BARS: Bar[] = (() => {
  const rnd = mulberry32(4749)
  let px = 0.0031
  const out: Bar[] = []
  for (let i = 0; i < 60; i++) {
    const o = px
    const c = Math.max(px * 0.55, o + (rnd() - 0.47) * px * 0.09)
    const h = Math.max(o, c) * (1 + rnd() * 0.035)
    const l = Math.min(o, c) * (1 - rnd() * 0.035)
    out.push({ o, c, h, l, v: 200 + rnd() * 900 })
    px = c
  }
  return out
})()

const TOKEN = {
  name: 'FOMO ON SOLANA', ticker: 'FOMO', pair: 'FOMO / SOL',
  ca: 'F0Mo4vEr1111111111111111111111111111111',
  creator: 'F0M0CxA8…AAAA', created: 'AUGUST 29, 2026',
  mc: '$3.79K', ath: '$3.9K', price: 0.0031, liq: '$48.2K', vol: '$1.2M',
}

interface Trade {
  account: string; buy: boolean; value: string; amount: string
  price: number; date: string; chain: LiveChain; src: string; srcColor: string; tx: string
}
const TRADES: Trade[] = (() => {
  const rnd = mulberry32(911)
  const srcs = [['R', '#4D8DFF'], ['J', '#2DD4BF'], ['P', '#14F195'], ['B', '#F0B90B']]
  const chains: LiveChain[] = ['sol', 'bnb', 'base', 'hype', 'hood', 'avax']
  const out: Trade[] = []
  for (let i = 0; i < 12; i++) {
    const buy = rnd() > 0.45
    const [sc, cc] = srcs[i % srcs.length]
    out.push({
      account: `0x${Math.floor(rnd() * 0xfffffff).toString(16)}…${Math.floor(rnd() * 0xffff).toString(16).padStart(4, '0')}`,
      buy,
      value: `$${(rnd() * 900 + 3).toFixed(2)}`,
      amount: `${(rnd() * 600 + 12).toFixed(1)}K`,
      price: 0.000031 + rnd() * 0.0009,
      date: ['5M AGO', '12M AGO', '1H AGO', '2H AGO', '1W AGO'][i % 5],
      chain: chains[i % chains.length],
      src: sc, srcColor: cc,
      tx: `0x${Math.floor(rnd() * 0xfffffff).toString(16)}…${Math.floor(rnd() * 0xffff).toString(16).padStart(4, '0')}`,
    })
  }
  return out
})()

/* $0.0₄4994 — leading zeros rendered as a subscript count (printr notation) */
const SUBS = '₀₁₂₃₄₅₆₇₈₉'
function fmtSub(p: number): string {
  if (p >= 0.01) return `$${p.toFixed(4)}`
  const s = p.toFixed(12)
  const zeros = s.match(/^0\.(0+)/)?.[1].length ?? 0
  const digits = s.replace(/^0\.0+/, '').slice(0, 4)
  return `$0.0${SUBS[zeros] ?? zeros}${digits}`
}

const TOOLS: { id: string; svg: ReactNode; sep?: boolean }[] = [
  { id: 'zoom', svg: <><circle cx="8" cy="8" r="5" /><path d="M12 12l4 4" /></> },
  { id: 'cursor', svg: <path d="M5 3l10 6-4.5 1L8 15z" /> },
  { id: 'trend', svg: <path d="M2 14L14 2" />, sep: true },
  { id: 'channel', svg: <path d="M2 11L11 2M5 14L14 5" /> },
  { id: 'fib', svg: <path d="M2 4h12M2 8h12M2 12h12" /> },
  { id: 'measure', svg: <rect x="2" y="6" width="12" height="4" />, sep: true },
  { id: 'text', svg: <path d="M3 3h10M8 3v10" /> },
  { id: 'magnet', svg: <path d="M4 2v6a4 4 0 008 0V2M4 5h3M9 5h3" />, sep: true },
  { id: 'cross', svg: <path d="M8 2v12M2 8h12" /> },
]

function ChartSvg() {
  const W = 960, H = 400, PADR = 66, VOLH = 74, TOP = 12
  const hi = Math.max(...BARS.map((b) => b.h))
  const lo = Math.min(...BARS.map((b) => b.l))
  const vmax = Math.max(...BARS.map((b) => b.v))
  const cw = (W - PADR - 16) / BARS.length
  const y = (p: number) => TOP + ((hi - p) / (hi - lo)) * (H - VOLH - TOP - 46)
  const last = BARS[BARS.length - 1]
  const grid = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Simulated candlestick chart, static data">
      {grid.map((p, i) => (
        <g key={i}>
          <line x1={0} x2={W - PADR} y1={y(p)} y2={y(p)} stroke="var(--border-soft)"
            strokeDasharray="3 6" />
          <text x={W - PADR + 8} y={y(p) + 3} className="tk-yt">{fmtSub(p)}</text>
        </g>
      ))}
      {BARS.map((b, i) => {
        const x = 8 + i * cw + cw / 2
        const up = b.c >= b.o
        const col = up ? 'var(--brand-2)' : 'var(--rose)'
        const yTop = y(Math.max(b.o, b.c))
        const h = Math.max(1.5, Math.abs(y(b.o) - y(b.c)))
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(b.h)} y2={y(b.l)} stroke={col} strokeWidth="1" />
            <rect x={x - cw * 0.32} y={yTop} width={cw * 0.64} height={h} fill={col} rx="1" />
            <rect x={x - cw * 0.32} y={H - 18 - (b.v / vmax) * (VOLH - 26)} width={cw * 0.64}
              height={(b.v / vmax) * (VOLH - 26)} fill={col} opacity=".45" rx="1" />
          </g>
        )
      })}
      <line x1={0} x2={W - PADR} y1={y(last.c)} y2={y(last.c)} stroke="var(--brand)"
        strokeDasharray="2 4" opacity=".7" />
      <rect x={W - PADR + 4} y={y(last.c) - 9} width={58} height={18} rx="4" fill="var(--brand)" />
      <text x={W - PADR + 33} y={y(last.c) + 4} textAnchor="middle" className="tk-ychip">
        {fmtSub(last.c)}
      </text>
    </svg>
  )
}

function CopyCa({ value }: { value: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" className={ok ? 'ok' : ''} onClick={() => {
      navigator.clipboard?.writeText(value).then(() => { setOk(true); window.setTimeout(() => setOk(false), 1400) }, () => {})
    }} aria-label="copy token address">⧉</button>
  )
}

const NATIVE: Record<LiveChain, string> = {
  sol: 'SOL', bnb: 'BNB', base: 'ETH', hype: 'HYPE', hood: 'ETH', avax: 'AVAX',
}
const QUICK = [0.001, 0.01, 0.05, 0.1, 0.5]

function setAmt2(set: (v: string) => void, setP: (p: number) => void, balance: number, q: number) {
  set(String(q))
  setP(balance > 0 ? Math.round(Math.min(100, (q / balance) * 100)) : 0)
}

function SwapRail() {
  const [chain, setChain] = useState<LiveChain>('sol')
  const [dir, setDir] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [pct, setPct] = useState(0)
  const [adv, setAdv] = useState(false)
  const balance = 3.421
  const price = 0.0031
  const n = Number.parseFloat(amount)
  const payAmt = Number.isFinite(n) && n > 0 ? n : 0
  const getAmt = payAmt * price > 0 ? payAmt / price : 0
  return (
    <section className="tk-panel" data-chain={chain} style={accentStyle(chain)}>
      <div className="tk-phd">SWAP <span className="tk-mock">SIMULATED</span></div>
      <div className="tk-swap">
        <div className="sw-tabs2" role="tablist" aria-label="direction">
          <button type="button" role="tab" aria-selected={dir === 'buy'}
            className={`sw-tab2 buy${dir === 'buy' ? ' on' : ''}`} onClick={() => setDir('buy')}>BUY</button>
          <button type="button" role="tab" aria-selected={dir === 'sell'}
            className={`sw-tab2 sell${dir === 'sell' ? ' on' : ''}`} onClick={() => setDir('sell')}>SELL</button>
        </div>
        <div className="sw2-field">
          <div className="sw2-hd"><span>YOU PAY</span><span>BAL {balance.toFixed(3)}</span></div>
          <div className="sw2-row">
            <input className="sw2-input" inputMode="decimal" placeholder="0"
              value={amount} onChange={(e) => {
                setAmount(e.target.value)
                const x = Number.parseFloat(e.target.value)
                setPct(Number.isFinite(x) && balance > 0 ? Math.round(Math.min(100, (x / balance) * 100)) : 0)
              }} aria-label="amount to pay" />
            <div className="sw2-chip" onClick={(e) => e.stopPropagation()}>
              <ChainLogo chain={chain} size={20} />
              <select value={chain} onChange={(e) => { setChain(e.target.value as LiveChain); setAmount(''); setPct(0) }}
                aria-label="chain" style={{ background: 'none', border: 'none', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'pointer' }}>
                {LIVE_CHAINS.map((c) => <option key={c} value={c} style={{ background: '#071410' }}>{NATIVE[c]}</option>)}
              </select>
            </div>
          </div>
          <div className="sw2-quick">
            {QUICK.map((q) => <button type="button" key={q}
              onClick={() => setAmt2(setAmount, setPct, balance, q)}>{q}</button>)}
          </div>
          <div className="sw2-rail" role="slider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
            aria-label="percent of balance">
            <i className="fill" style={{ width: `${pct}%` }} />
            <i style={{ left: `${pct}%` }} />
          </div>
          <div className="sw2-pct"><span>{pct}%</span><span>of balance</span></div>
        </div>
        <div className="sw2-flip">
          <button type="button" aria-label="flip direction"
            onClick={() => { setDir((d) => (d === 'buy' ? 'sell' : 'buy')); setAmount(''); setPct(0) }}>⇅</button>
        </div>
        <div className="sw2-field">
          <div className="sw2-hd"><span>YOU GET</span><span>1 {NATIVE[chain]} = {fmtSub(1 / price)} {TOKEN.ticker}</span></div>
          <div className="sw2-row">
            <span className="sw2-input ro">{getAmt === 0 ? '0' : getAmt.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
            <div className="sw2-chip"><span className="tk-logo" style={{ width: 20, height: 20, borderRadius: 6, fontSize: 10 }}>{TOKEN.ticker.slice(0, 1)}</span>{TOKEN.ticker}</div>
          </div>
        </div>
        <button type="button" className="sw2-adv" aria-expanded={adv} onClick={() => setAdv((a) => !a)}>
          ADVANCED <span>{adv ? '▴' : '▾'}</span>
        </button>
        {adv && (
          <div className="sw2-adv-body">
            <label>SLIPPAGE TOLERANCE <span className="tk-mock">SIMULATED</span><input placeholder="1.0 %" readOnly tabIndex={-1} /></label>
            <label>DEADLINE <span className="tk-mock">SIMULATED</span><input placeholder="30 min" readOnly tabIndex={-1} /></label>
          </div>
        )}
        <button type="button" className="sw2-cta" onClick={() => {}}>
          {payAmt > 0 ? 'SWAP' : 'CONNECT WALLET'}
        </button>
        <p className="sw2-note">SIMULATED · PRE-RELEASE — deterministic data set, no wallet, no chain calls.</p>
      </div>
    </section>
  )
}

export function TokenPage() {
  if (typeof document !== 'undefined') document.title = 'FOMO · Swap — Terminal Alpha'
  const [tool, setTool] = useState('cross')
  const [tab, setTab] = useState('TRADES')
  const [chain] = useState<LiveChain>('sol')
  return (
    <div className="tk-root" style={accentStyle(chain)}>
      <div className="tk-aurora" aria-hidden="true" />
      <div className="tk-dots" aria-hidden="true" />
      <div className="tk-page">
        <div className="tk-wrap">
          {/* ── [B] token header ── */}
          <section className="tk-panel tk-hero" data-chain={chain}>
            <div className="tk-hero-top">
              <span className="tk-logo">{TOKEN.ticker.slice(0, 1)}</span>
              <div className="tk-id">
                <div className="tk-name">
                  {TOKEN.name}
                  <span className="tk-ticker">${TOKEN.ticker}</span>
                  <span className="tk-pair">${TOKEN.pair}</span>
                  <span className="tk-ca">CA: {truncAddr(TOKEN.ca)} <CopyCa value={TOKEN.ca} /></span>
                </div>
                <div className="tk-chips">
                  <span className="tk-chip">ATH <b>{TOKEN.ath}</b></span>
                  <span className="tk-chip pos">PRICE <b>{fmtSub(TOKEN.price)}</b></span>
                  <span className="tk-chip">LIQUIDITY <b>{TOKEN.liq}</b></span>
                  <span className="tk-chip">VOLUME <b>{TOKEN.vol}</b></span>
                  <span className="tk-chip">FEE TYPE <b>Creator</b></span>
                  <span className="tk-chip">FEE % <b>1.00%</b></span>
                </div>
              </div>
              <div className="tk-mc">
                <div className="l">Market Cap</div>
                <div className="v">{TOKEN.mc}</div>
              </div>
              <span className="tk-mock" style={{ position: 'absolute', top: 12, right: 14 }}>SIMULATED</span>
            </div>
          </section>

          {/* ── main row: LEFT column (chart → bonding → trades) + RIGHT rail ── */}
          <div className="tk-main">
            <div className="tk-col-a">
              <section className="tk-panel tk-chart" data-chain={chain}>
                <div className="tk-tools">
                  {TOOLS.map((t) => (
                    <span key={t.id} style={{ display: 'contents' }}>
                      <button type="button" title={t.id}
                        className={`tk-tool${tool === t.id ? ' on' : ''}`}
                        onClick={() => setTool(t.id)}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                          stroke="currentColor" strokeWidth="1.5">{t.svg}</svg>
                      </button>
                      {t.sep && <span className="tk-tsep" />}
                    </span>
                  ))}
                </div>
                <div className="tk-chart-main">
                  <div className="tk-cb">
                    <span className="tg">15s</span>
                    <span className="g">▮▮</span>
                    <span className="g">ƒ Indicators</span>
                    <span className="g">Marks ▾</span>
                    <span className="g">↶</span>
                    <span className="g">↷</span>
                    <span className="rgt">
                      <span className="g">◐</span><span className="g">⚙</span>
                      <span className="g">⛶</span><span className="g">📷</span>
                    </span>
                  </div>
                  <div className="tk-canvas">
                    <div className="tk-overlay">{TOKEN.name} / USD · O H L C Vol</div>
                    <ChartSvg />
                  </div>
                  <div className="tk-xaxis">
                    <span className="tg on">6m</span><span className="tg">3m</span>
                    <span className="tg">1m</span><span className="tg">5d</span><span className="tg">1d</span>
                    <span className="rgt">
                      <span>01:05:17 UTC-7</span><span className="tg">%</span>
                      <span className="tg">log</span><span className="tg on">auto</span>
                    </span>
                  </div>
                </div>
              </section>

              <section className="tk-panel tk-bond" data-chain={chain}>
                <ChainLogo chain={chain} size={26} />
                <span className="t">BONDING CURVE PROGRESS</span>
                <div className="rail"><i /></div>
                <span className="pct">0.0%</span>
                <span className="st">STATUS · ACTIVE</span>
                <span className="tk-mock">SIMULATED</span>
              </section>

              <section className="tk-panel">
                <div className="tk-tabsrow">
                  {['TRADES', 'HOLDERS (1)', 'XCHAIN', 'COMMENTS'].map((t) => (
                    <span key={t} className={tab === t ? 'on' : ''}
                      onClick={() => setTab(t)} style={{ cursor: 'pointer' }}>{t}</span>
                  ))}
                  <span className="bubble">◉ BUBBLE MAP</span>
                </div>
                <div className="tk-table-wrap">
                  <table className="tk-table">
                    <thead>
                      <tr>
                        <th>ACCOUNT</th><th>TYPE</th><th>VALUE</th><th>AMOUNT</th><th>PRICE</th>
                        <th>DATE</th><th>CHANNEL</th><th>SOURCE</th><th>TX</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TRADES.map((t, i) => (
                        <tr key={i}>
                          <td className="acc"><span className="dot" style={{ background: t.buy ? 'var(--brand-2)' : 'var(--rose)' }} />{t.account}</td>
                          <td className={t.buy ? 'buy' : 'sell'}>{t.buy ? 'BUY' : 'SELL'}</td>
                          <td>{t.value}</td>
                          <td>{t.amount}</td>
                          <td>{fmtSub(t.price)}</td>
                          <td>{t.date}</td>
                          <td><ChainLogo chain={t.chain} size={16} /></td>
                          <td><span className="tk-src" style={{ background: t.srcColor }}>{t.src}</span></td>
                          <td className="tx">{t.tx}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="tk-pagefoot">
                    <button type="button" aria-label="previous">‹</button>
                    <span>1</span>
                    <button type="button" aria-label="next">›</button>
                  </div>
                </div>
              </section>
            </div>

            {/* right rail: swap + information + movement (fixed 380px, sticky) */}
            <aside className="tk-rail-r">
              <SwapRail />
              <section className="tk-panel tk-info" data-chain={chain}>
                <div className="tk-phd">INFORMATION <span className="tk-mock">SIMULATED</span></div>
                <div className="tk-info">
                  <div className="tk-info-row">
                    <span className="tk-info-logo">{TOKEN.ticker.slice(0, 1)}</span>
                    <div className="tk-info-id">
                      <b>{TOKEN.name}</b>
                      <span>${TOKEN.ticker}</span>
                    </div>
                  </div>
                  <div className="tk-kv"><span>CREATED BY</span><b>{TOKEN.creator} <CopyCa value={TOKEN.creator} /></b></div>
                  <div className="tk-kv"><span>CREATION DATE</span><b>{TOKEN.created}</b></div>
                  <span className="tk-badge">MEMECOIN</span>
                  <p className="sw2-note">Just few hours left to bond up hold. (simulated status line)</p>
                </div>
              </section>
              <section className="tk-panel" data-chain={chain}>
                <div className="tk-phd">MOVEMENT <span className="tk-mock">SIMULATED</span></div>
                <div className="tk-grid2">
                  {[['5M', '+0.4%', 'pos'], ['1H', '+1.2%', 'pos'], ['4H', '−2.1%', 'neg'], ['24H', '+5.6%', 'pos']].map(([t, v, c]) => (
                    <div className="tk-cell" key={t}>
                      <span className="t">{t}</span>
                      <span className={`v ${c}`}>{v}</span>
                    </div>
                  ))}
                </div>
                <div className="tk-split">
                  <div className="tk-split-row"><span className="t">TXNS</span>
                    <span className="b up">BUY 1,204</span><span className="b dn">SELL 986</span></div>
                  <div className="tk-split-bar"><i className="up" style={{ width: '55%' }} /><i className="dn" style={{ width: '45%' }} /></div>
                  <div className="tk-split-row"><span className="t">VOL</span>
                    <span className="b up">BUY $482K</span><span className="b dn">SELL $301K</span></div>
                  <div className="tk-split-bar"><i className="up" style={{ width: '62%' }} /><i className="dn" style={{ width: '38%' }} /></div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}
