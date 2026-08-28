import { useEffect, useState } from 'react'
import { dataService } from '../services/dataService'
import { CHAINS, SYSTEM_STATUS, buildClusters } from '../mock/data'
import type { TokenData } from '../mock/data'
import { CandleChart, ClusterGraph, RadarChart, ScoreDial } from '../components/charts'
import { Badge, Card, EmptyState, Skeleton } from '../components/ui'
import { AiPanel } from '../components/AiPanel'

const HERO_STATS = [
  { ico: '⬡', v: '5', l: 'Blockchains', c: 'c-cyan' },
  { ico: '❋', v: '50K+', l: 'Tokens scanned', c: 'c-amber' },
  { ico: '▲', v: '1.2M+', l: 'Analyses performed', c: 'c-purple' },
  { ico: '◔', v: '99.7%', l: 'Uptime', c: 'c-green' },
  { ico: '👤', v: '250K+', l: 'Users (target)', c: 'c-pink' },
  { ico: '∞', v: '', l: 'Possibilities', c: 'c-cyan' },
]

const PREMIUM = [
  { ico: '⬡', t: 'Multi-chain scanning', d: 'Scan across 5 major blockchains' },
  { ico: '✦', t: 'AI-powered analysis', d: 'Advanced AI reasoning with evidence-based insights' },
  { ico: '❋', t: 'Wallet clustering', d: 'Detect coordinated groups and wash trading' },
  { ico: '⛨', t: 'Rug pull detection', d: 'Advanced heuristics to identify rug patterns' },
  { ico: '◍', t: 'Whale tracking', d: 'Follow whale movements and smart money' },
  { ico: '▤', t: 'Portfolio watch', d: 'Track your watchlist and get smart alerts' },
  { ico: '✧', t: 'Deep research', d: 'In-depth analysis with premium data and patterns' },
]

const PRINCIPLES = [
  { ico: '⊘', t: 'NO TRADING', d: 'Pure analysis only' },
  { ico: '⚿', t: 'NO CUSTODY', d: 'Your keys, your crypto' },
  { ico: '✦', t: 'EVIDENCE-BASED', d: 'Data → heuristics → AI' },
  { ico: '◈', t: 'TRANSPARENT', d: 'Explainable AI reasoning' },
  { ico: '◉', t: 'PRIVACY FIRST', d: 'Your data stays private' },
  { ico: '⛨', t: 'SECURITY FOCUSED', d: 'Built for safety' },
]

function Metric({ k, v, d, up, tip }: { k: string; v: string; d?: string; up?: boolean; tip?: string }) {
  return (
    <div className="metric">
      <span className="k">{tip ? <span className="ta-tip">{k}<span className="ta-tip-pop">{tip}</span></span> : k}</span>
      <div className="v">{v}</div>
      {d && <div className={`d ${up ? 'up' : 'down'}`}>{d}</div>}
    </div>
  )
}

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

export default function Dashboard() {
  const [token, setToken] = useState<TokenData | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [chainSel, setChainSel] = useState('ALL CHAINS')
  const [analyzing, setAnalyzing] = useState(false)

  const load = (address: string) => {
    setLoading(true)
    dataService.getToken(address).then((t) => { setToken(t); setLoading(false) })
  }
  useEffect(() => { load('') }, [])

  const analyze = () => {
    if (!query.trim()) return
    setAnalyzing(true)
    setTimeout(() => { load(query.trim()); setQuery(''); setAnalyzing(false) }, 700)
  }

  return (
    <div className="ta-page" style={{ padding: 0, gap: 0 }}>
      {/* ── hero ── */}
      <div className="ta-hero">
        <div className="hero-badge">BUILT FOR TRADERS.<br /><small>NOT FOR GAMBLERS.</small></div>
        <div className="hero-title">
          <h1>TERMINAL <span className="p">ALPHA</span></h1>
          <div className="sub">AI MEMECOIN SCANNER TERMINAL — SEE WHAT OTHERS MISS. UNDERSTAND WHAT MATTERS.</div>
        </div>
        <div className="hero-gold">
          <div>
            <div className="v">$100B</div>
            <div className="d">POTENTIAL VALUE<br />AI + DATA + INTELLIGENCE<br />= THE FUTURE OF CRYPTO RESEARCH</div>
          </div>
          <span style={{ fontSize: 26 }}>🚀</span>
        </div>
      </div>

      {/* ── stat strip ── */}
      <div className="ta-stats">
        {HERO_STATS.map((s) => (
          <div key={s.l}><span className={`ico ${s.c}`}>{s.ico}</span><div><b className={s.c}>{s.v}</b><small>{s.l}</small></div></div>
        ))}
      </div>

      <div className="ta-page">
        {/* ── search ── */}
        <div className="ta-searchrow reveal">
          <div className="ta-search">
            <span style={{ color: 'var(--dim)' }}>⌕</span>
            <input
              placeholder="PASTE TOKEN ADDRESS OR SEARCH TOKEN / PAIR / CA"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && analyze()}
              spellCheck={false}
            />
          </div>
          <select className="ta-select" value={chainSel} onChange={(e) => setChainSel(e.target.value)}>
            <option>ALL CHAINS</option>
            {CHAINS.map((c) => <option key={c.id}>{c.label.toUpperCase()}{c.live ? '' : ' (SOON)'}</option>)}
          </select>
          <button className="btn-analyze" onClick={analyze} disabled={analyzing}>
            {analyzing ? 'ANALYZING…' : 'ANALYZE'} {!analyzing && <span>→</span>}
          </button>
        </div>

        <div className="chain-chips reveal">
          <span className="lbl">Supported chains:</span>
          {CHAINS.map((c, i) => (
            <button
              key={c.id}
              className={`chain-chip ${i === 0 && c.live ? 'on' : ''} ${c.live ? '' : 'soon'}`}
              onClick={c.live ? () => setChainSel(c.label.toUpperCase()) : undefined}
            >
              <span className="dot" style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }} />
              {c.label.toUpperCase()}
            </button>
          ))}
        </div>

        {/* ── main grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
            {/* row 1: token / chart / risk */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.7fr 1.3fr', gap: 16 }}>
              <Card>
                {loading ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <Skeleton h={46} w={46} /><Skeleton h={22} /><Skeleton h={18} w="70%" /><Skeleton h={72} />
                  </div>
                ) : token && (
                  <>
                    <div className="tok">
                      <span className="avatar">😼</span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="sym">{token.symbol}</span>
                          <span className="ta-badge b-muted">/ {token.chain.toUpperCase()}</span>
                          <Badge color="purple">{token.tag}</Badge>
                        </div>
                        <div className="pair">{token.address} · {token.dex}</div>
                      </div>
                      <button className="star" title="Pin to portfolio">★</button>
                    </div>
                    <div className="price-line">
                      <span className="big">${token.price.toFixed(7)}</span>
                      <span className={`chg ${token.change24h >= 0 ? 'up' : 'down'}`}>
                        {token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}% (24H)
                      </span>
                    </div>
                    <div className="mini-metrics">
                      <div><div className="k">Liquidity</div><div className="v">{fmtUsd(token.liquidity)}</div></div>
                      <div><div className="k">FDV</div><div className="v">{fmtUsd(token.fdv)}</div></div>
                      <div><div className="k">Market cap</div><div className="v">{fmtUsd(token.marketCap)}</div></div>
                    </div>
                  </>
                )}
              </Card>

              <Card title="PRICE CHART (24H)">
                <div className="chart-box">
                  {loading
                    ? <Skeleton h={190} />
                    : token && <CandleChart candles={token.candles} />}
                </div>
              </Card>

              <Card title="TERMINAL ALPHA RISK SCORE" glow="#fbbf24">
                {loading ? <Skeleton h={190} /> : token && (
                  <div className="risk-wrap">
                    <div className="num">
                      <ScoreDial score={token.risk.score} label="/100" />
                      <div className="lvl">{token.risk.level}</div>
                      <div className="lvl-note">This token shows mixed signals.<br />Monitor closely.</div>
                    </div>
                    <div className="radar">
                      <RadarChart
                        values={token.risk.radar}
                        labels={['Liquidity', 'Holders', 'Distribution', 'Security', 'Momentum']}
                      />
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* row 2: metrics */}
            {!loading && token && (
              <div className="metrics-row">
                <Metric k="Volume 24h" v={fmtUsd(token.volume24h)} d={`+${token.volumeChange}%`} up />
                <Metric k="Txns 24h" v={token.txns24h.toLocaleString('en-US')} d={`+${token.txnsChange}%`} up />
                <Metric k="Buy / Sell" v={`${token.buySell[0]}% / ${token.buySell[1]}%`} tip="24h trade balance" />
                <Metric k="Holders" v={token.holders.toLocaleString('en-US')} d={`+${token.holdersChange}%`} up />
                <Metric k="Top 10 holders" v={`${token.top10Pct}%`} tip="Concentration of supply — audit lesson: context, not verdict" />
                <Metric k="Age" v={token.age} />
                <Metric k="Liquidity lock" v={token.liquidityLock} d="🔒 locked" up />
              </div>
            )}

            {/* row 3: rug / cluster / whale */}
            <div className="grid-3">
              <Card title="RUG CHECK ANALYSIS" right={<Badge color={token && token.rugCheck.score >= 70 ? 'green' : 'amber'}>HEURISTIC v0</Badge>}>
                {loading || !token ? <Skeleton h={200} /> : (
                  <>
                    <div className="rug-list">
                      {token.rugCheck.items.map((it) => (
                        <div className="rug-row" key={it.label}>
                          <span className="k">{it.label}</span>
                          <span className={`v ${it.ok === true ? 'ok-yes' : it.ok === false ? 'ok-no' : 'ok-warn'}`}>
                            {it.ok === true ? '✓ ' : it.ok === false ? '✗ ' : '⚠ '}{it.value}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="rug-score">
                      <span className="k">RUG CHECK SCORE</span>
                      <span className="v">{token.rugCheck.score} / 100</span>
                    </div>
                  </>
                )}
              </Card>

              <Card title="WALLET CLUSTERING ANALYSIS" right={<Badge color="cyan">BETA</Badge>}>
                {loading || !token ? <Skeleton h={220} /> : (
                  <>
                    <div className="clus-wrap">
                      <div className="clus-graph">
                        <ClusterGraph clusters={buildClusters(7)} />
                      </div>
                      <div className="clus-legend">
                        {token.clusters.groups.map((g) => (
                          <div className="row" key={g.id}>
                            <span className="dot" style={{ background: g.color, boxShadow: `0 0 8px ${g.color}` }} />
                            <span>{g.label} <span className="n">({g.wallets} wallets)</span></span>
                            <span className="pc">{g.sharePct}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="clus-risk">
                      <span className="k">CLUSTERING RISK</span>
                      <span className="v">{token.clusters.risk} / 100</span>
                    </div>
                  </>
                )}
              </Card>

              <Card title="WHALE ACTIVITY (24H)" right={<Badge color="green">LIVE</Badge>}>
                {loading || !token ? <Skeleton h={220} /> : (
                  <>
                    <div className="whale-feed">
                      {token.whales.map((w) => (
                        <div className="whale-row" key={w.wallet}>
                          <span className="w">{w.wallet}</span>
                          <span className={w.action === 'Buy' ? 'buy' : 'sell'}>{w.action}</span>
                          <span className="usd">{fmtUsd(w.usd)}</span>
                        </div>
                      ))}
                    </div>
                    <button className="btn-ghost">VIEW ALL WHALES →</button>
                  </>
                )}
              </Card>
            </div>
          </div>

          {/* right rail */}
          <div style={{ display: 'grid', gap: 16, position: 'sticky', top: 16 }}>
            <Card title="TERMINAL ALPHA AI ANALYST" right={<Badge color="green">DEEP ANALYSIS</Badge>} glow="#00ffa3">
              {loading || !token
                ? <div style={{ display: 'grid', gap: 10 }}><Skeleton h={18} /><Skeleton h={14} w="80%" /><Skeleton h={14} w="90%" /><Skeleton h={14} w="60%" /></div>
                : <AiPanel token={token} />}
            </Card>

            <Card title={<span>TERMINAL STATUS <span style={{ color: 'var(--green)', fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>● All Systems Operational</span></span>}>
              {SYSTEM_STATUS.map((s) => (
                <div className="sys-row" key={s.name}>
                  <span className="n"><i />{s.name}</span>
                  <span className="s">{s.state}</span>
                </div>
              ))}
              <div className="sys-foot">
                <span>LAST UPDATE: {new Date().toISOString().slice(11, 19)} UTC</span>
                <span style={{ cursor: 'pointer' }}>⟳</span>
              </div>
            </Card>
          </div>
        </div>

        {/* ── premium strip ── */}
        <div className="prem-strip reveal">
          <div className="t">— ALL PREMIUM FEATURES INCLUDED —</div>
          <div className="prem-items">
            {PREMIUM.map((p) => (
              <div className="prem-item" key={p.t}>
                <span className="ico">{p.ico}</span>
                <div><div className="tt">{p.t}</div><div className="dd">{p.d}</div></div>
              </div>
            ))}
          </div>
        </div>

        {/* ── principles + future ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'center' }}>
          <div className="principles">
            {PRINCIPLES.map((p) => (
              <div className="principle" key={p.t}>
                <span className="ico">{p.ico}</span>
                <div><div className="tt">{p.t}</div><div className="dd">{p.d}</div></div>
              </div>
            ))}
          </div>
          <div className="future">THE FUTURE IS HERE.<br />ARE YOU READY?</div>
        </div>

        {!token && !loading && <EmptyState title="No token loaded" hint="Paste an address above and hit ANALYZE" />}
      </div>
    </div>
  )
}
