import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { dataService } from '../services/dataService'
import type { LiveToken } from '../services/dataService'
import { api, ApiError } from '../api'
import type { ChainsCatalog, WhalesResult } from '../api'
import { ScoreDial } from '../components/charts'
import { Badge, Card, EmptyState, Skeleton } from '../components/ui'
import { AiHttpError, analystName, answerKey, askAiOnce, cachedAnswer, rememberAnswer } from '../lib/aiApi'
import { useActivePair } from '../lib/tokenStore'
import { shorten } from '../lib/liveFormat'
import { useSpringNumber } from '../lib/spring'

/* BE-ALL-LIVE F5: this dashboard eats the real modules — /api/scan verdicts,
   the whale tracker, live scanner rows. Mock-only surfaces (candles, cluster
   graph, alerts) render as declared-SOON empty states; the AI narrative went
   live via /api/v1/ai/ask (PROMPT-AI-V) and is never pretended either way. */

const HERO_STATS = [
  { ico: '⬡', v: '5', l: 'Blockchains', c: 'c-cyan' },
  { ico: '❋', v: 'LIVE', l: 'Feed + scan', c: 'c-amber' },
  { ico: '▲', v: '6', l: 'Risk signals', c: 'c-cyan' },
  { ico: '◔', v: '$0', l: 'Provider tier', c: 'c-green' },
]


const PRINCIPLES = [
  { ico: '⊘', t: 'NO TRADING', d: 'Pure analysis only' },
  { ico: '⚿', t: 'NO CUSTODY', d: 'Your keys, your crypto' },
  { ico: '✦', t: 'EVIDENCE-BASED', d: 'Data → heuristics → AI' },
  { ico: '◈', t: 'TRANSPARENT', d: 'Explainable AI reasoning' },
  { ico: '◉', t: 'PRIVACY FIRST', d: 'Your data stays private' },
  { ico: '⛨', t: 'SECURITY FOCUSED', d: 'Built for safety' },
]

const SCAN_CHAINS: { id: string; label: string }[] = [
  { id: 'sol', label: 'SOL' }, { id: 'bnb', label: 'BNB' },
  { id: 'base', label: 'BASE' }, { id: 'hood', label: 'HOOD' },
]

const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'   // live whale demo seed

function Metric({ k, v, d, up, tip }: { k: string; v: ReactNode; d?: string; up?: boolean; tip?: string }) {
  return (
    <div className="metric">
      <span className="k">{tip ? <span className="ta-tip">{k}<span className="ta-tip-pop">{tip}</span></span> : k}</span>
      <div className="v">{v}</div>
      {d && <div className={`d ${up ? 'up' : 'down'}`}>{d}</div>}
    </div>
  )
}

/* P5 micro — spring counter: headline integers ease in with spring physics
   (dep-free rAF integrator; reduced-motion jumps straight to the value). */
function SpringInt({ value }: { value: number }) {
  const n = useSpringNumber(value)
  return <>{Math.round(n).toLocaleString('en-US')}</>
}

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

const short = shorten

/* PROMPT-AI-V: dashboard AI micro-feed — one lazy, cached /ai/v1/ask free
   answer for the active token. Zero requests until the user hits ASK WHY (or
   the AI page already answered this token this session); the server-side
   cache absorbs repeats. Label law: LIVE shows the model from the REAL
   provenance — never a hardcoded name. */
const WHY_Q = 'In two or three sentences, what does the evidence say about this token right now?'

type FeedFlow = { key: string; phase: 'asking' | 'busy' | 'offline'; note: string | null }

function AiMicroFeed() {
  const pair = useActivePair()
  const [flow, setFlow] = useState<FeedFlow | null>(null)
  const [, rerender] = useState(0)

  const pairKey = pair ? answerKey(pair.chain, pair.tokenAddress, WHY_Q) : null
  /* the answer is DERIVED from the session cache at render time — asking
     remembers into it and bumps a counter; no effect, no stale state. A
     flow from a different token is ignored, so switching tokens resets
     the panel naturally. */
  const cached = pairKey ? cachedAnswer(pairKey) : null
  const activeFlow = flow && pairKey && flow.key === pairKey ? flow : null

  const askWhy = async () => {
    if (!pair || !pairKey || activeFlow?.phase === 'asking') return
    setFlow({ key: pairKey, phase: 'asking', note: null })
    try {
      const a = await askAiOnce({ question: WHY_Q, mode: 'free', surface: 'terminal', persona: 'analyst', chain: pair.chain, token: pair.tokenAddress })
      rememberAnswer(pairKey, a)
      setFlow(null)
      rerender((n) => n + 1)
    } catch (e) {
      if (e instanceof AiHttpError && e.status === 503) {
        setFlow({ key: pairKey, phase: 'offline', note: e.message })
      } else if (e instanceof AiHttpError) {
        setFlow({ key: pairKey, phase: 'busy', note: e.message })
      } else {
        setFlow({ key: pairKey, phase: 'busy', note: 'The AI route did not answer — the rest of the dashboard stays live.' })
      }
    }
  }

  return (
    <Card title="AI ANALYST" right={<Badge color="green">LIVE</Badge>} glow="#00ffa3" className="pb-acc">
      {!pair ? (
        <EmptyState title="No token in context" hint="scan a token or pick one in the terminal — the AI answers about the token you are looking at" />
      ) : cached ? (
        <a href="#/ai" style={{ textDecoration: 'none', color: 'inherit', display: 'grid', gap: 8 }}>
          <p style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.6 }}>{cached.text || '—'}</p>
          <div className="ai-prov" style={{ marginTop: 2 }}>
            <span className="prov-chip live">● LIVE{cached.provenance ? ` · ${analystName(cached.provenance.mode)}` : ''}</span>
            {cached.provenance?.cached && <span className="prov-chip">CACHED</span>}
          </div>
          <div style={{ color: 'var(--dim)', fontSize: 10.5, fontFamily: 'var(--f-mono, monospace)' }}>OPEN AI PAGE →</div>
        </a>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>
            One free-tier question about <b style={{ color: 'var(--text)' }}>{pair.symbol}</b> —
            answered from the same evidence block the scanner uses.
          </p>
          {activeFlow?.phase === 'asking' ? (
            <div style={{ display: 'grid', gap: 8 }} aria-label="asking">
              <span className="ta-skel" style={{ height: 11, width: '94%' }} />
              <span className="ta-skel" style={{ height: 11, width: '70%' }} />
            </div>
          ) : (
            <button className="btn-analyze" style={{ height: 38, fontSize: 12.5 }} onClick={() => void askWhy()}>ASK WHY</button>
          )}
          {activeFlow?.note && (
            <div className="ai-note">{activeFlow.note}{activeFlow.phase === 'offline' ? ' — the dashboard data stays live without it.' : ''}</div>
          )}
        </div>
      )}
    </Card>
  )
}

async function scanAnyChain(address: string,
                            chainSel: string): Promise<{ token: LiveToken; chain: string }> {
  type ScanChain = 'sol' | 'bnb' | 'base' | 'hood'
  const candidates: ScanChain[] = chainSel !== 'ALL CHAINS' && SCAN_CHAINS.some((c) => c.id === chainSel)
    ? [chainSel as ScanChain]
    : address.startsWith('0x') ? ['base', 'bnb', 'hood'] : ['sol']
  let last: unknown = null
  for (const chain of candidates) {
    try {
      return { token: await dataService.getScan(chain, address), chain }
    } catch (e) {
      last = e
      if (e instanceof ApiError && e.status === 400) throw e   // bad shape: not a chain issue
    }
  }
  throw last instanceof Error ? last : new Error('scan failed')
}

export default function Dashboard() {
  const [token, setToken] = useState<LiveToken | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [chainSel, setChainSel] = useState('ALL CHAINS')
  const [analyzing, setAnalyzing] = useState(false)
  const [whales, setWhales] = useState<WhalesResult | null>(null)
  const [whalesErr, setWhalesErr] = useState<string | null>(null)
  const [health, setHealth] = useState<{ status: string; chains: string[] } | null>(null)
  const [catalog, setCatalog] = useState<ChainsCatalog | null>(null)

  useEffect(() => {
    let on = true
    api.health().then((h) => { if (on) setHealth(h) }).catch(() => { if (on) setHealth(null) })
    api.chains().then((c) => { if (on) setCatalog(c) }).catch(() => {})
    return () => { on = false }
  }, [])

  // chain-aware whale read: follows the scanned token, defaults to sol/BONK
  useEffect(() => {
    const chain = token?.chain || 'sol'
    const addr = token?.address || BONK
    let on = true
    setWhales(null); setWhalesErr(null)
    api.whales(chain, addr, 10_000)
      .then((w) => { if (on) setWhales(w) })
      .catch((e) => { if (on) setWhalesErr(e instanceof ApiError ? e.message : 'whale route did not answer') })
    return () => { on = false }
  }, [token?.chain, token?.address])

  const analyze = () => {
    const address = query.trim()
    if (!address) return
    setAnalyzing(true); setErr(null); setLoading(true)
    scanAnyChain(address, chainSel)
      .then(({ token: t }) => { setToken(t); setErr(null) })
      .catch((e) => {
        setToken(null)
        setErr(e instanceof ApiError ? e.message : 'Scan failed — try again')
      })
      .finally(() => { setAnalyzing(false); setLoading(false); setQuery('') })
  }

  return (
    <div className="ta-page" style={{ padding: 0, gap: 0 }}>
      {/* ── hero ── */}
      <div className="ta-hero">
        <div className="hero-badge">BUILT FOR TRADERS.<br /><small>NOT FOR GAMBLERS.</small></div>
        <div className="hero-title">
          <h1>VIL<span className="p">MEI</span></h1>
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

      {/* ── stat strip (measured, not invented) ── */}
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
              placeholder="PASTE TOKEN ADDRESS (SOL / 0X) — REAL SCAN, NO SIMULATION"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && analyze()}
              spellCheck={false}
            />
          </div>
          <select className="ta-select" value={chainSel} onChange={(e) => setChainSel(e.target.value)}>
            <option>ALL CHAINS</option>
            {SCAN_CHAINS.map((c) => <option key={c.id}>{c.label}</option>)}
          </select>
          <button className="btn-analyze" onClick={analyze} disabled={analyzing}>
            {analyzing ? 'ANALYZING…' : 'ANALYZE'} {!analyzing && <span>→</span>}
          </button>
        </div>

        {err && (
          <div className="reveal" role="alert" style={{
            border: '2px solid var(--red)', padding: '10px 14px', fontSize: 13,
            color: 'var(--text)', background: 'rgba(255,80,80,.06)',
          }}>⚠ {err}</div>
        )}

        <div className="chain-chips reveal">
          <span className="lbl">Scannable chains:</span>
          {SCAN_CHAINS.map((c) => (
            <span key={c.id} className="chain-chip on" style={{ cursor: 'default' }}>
              <span className="dot" style={{ background: 'var(--green)' }} />
              {c.label}
            </span>
          ))}
          <span className="chain-chip soon">HYPE (SOON)</span>
        </div>

        {/* ── main grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
            {/* row 1: token / verdict */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 16 }}>
              <Card>
                {loading ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <Skeleton h={46} w={46} /><Skeleton h={22} /><Skeleton h={18} w="70%" /><Skeleton h={72} />
                  </div>
                ) : token ? (
                  <>
                    <div className="tok">
                      <span className="avatar">⬡</span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="sym">{token.symbol ?? '—'}</span>
                          <span className="ta-badge b-muted">/ {token.chain.toUpperCase()}</span>
                          {token.launchVenue && <Badge color="cyan">{token.launchVenue}</Badge>}
                        </div>
                        <div className="pair">{token.address} · {token.dex ?? '—'}</div>
                      </div>
                    </div>
                    <div className="price-line">
                      <span className="big">{token.price != null ? `$${token.price.toPrecision(4)}` : '–'}</span>
                      {token.change24h != null && (
                        <span className={`chg ${token.change24h >= 0 ? 'up' : 'down'}`}>
                          {token.change24h >= 0 ? '+' : ''}{token.change24h.toFixed(2)}% (24H)
                        </span>
                      )}
                    </div>
                    <div className="mini-metrics">
                      <div><div className="k">Liquidity</div><div className="v">{token.liquidity != null ? fmtUsd(token.liquidity) : '–'}</div></div>
                      <div><div className="k">FDV</div><div className="v">{token.fdv != null ? fmtUsd(token.fdv) : '–'}</div></div>
                      <div><div className="k">Market cap</div><div className="v">{token.marketCap != null ? fmtUsd(token.marketCap) : '–'}</div></div>
                    </div>
                  </>
                ) : (
                  <EmptyState title="No token loaded" hint="Paste an address and hit ANALYZE — the engine runs for real" />
                )}
              </Card>

              <Card title="VILMEI RISK VERDICT" glow="#fbbf24">
                {loading ? <Skeleton h={190} /> : token ? (
                  <div className="risk-wrap">
                    <div className="num">
                      <ScoreDial score={token.score ?? 0} label={token.score != null ? '/100' : 'NODATA'} />
                      <div className="lvl">{token.levelLabel ?? 'INSUFFICIENT DATA'}</div>
                      <div className="lvl-note">Weighted heuristics, public thresholds.<br />Context block renders beside it.</div>
                    </div>
                    <div className="rug-list">
                      {token.signals.map((s) => (
                        <div className="rug-row" key={s.label}>
                          <span className="k">{s.label} <small style={{ color: 'var(--dim)' }}>w{s.weight}</small></span>
                          <span className={`v ${s.severity == null ? 'ok-warn' : s.severity >= 0.5 ? 'ok-no' : s.severity > 0 ? 'ok-warn' : 'ok-yes'}`}>
                            {s.severity == null ? '⚠ not scored' : s.severity >= 0.5 ? '✗ high' : s.severity > 0 ? '⚠ elevated' : '✓ ok'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : <EmptyState title="—" hint="" />}
              </Card>
            </div>

            {/* row 2: real metrics (nulls stay "–") */}
            {!loading && token && (
              <div className="metrics-row">
                <Metric k="Volume 24h" v={token.volume24h != null ? fmtUsd(token.volume24h) : '–'} />
                <Metric k="Txns 24h" v={token.txns24h != null ? <SpringInt value={token.txns24h} /> : '–'} />
                <Metric k="Buy / Sell" v={token.buySell ? `${token.buySell[0]}% / ${token.buySell[1]}%` : '–'} tip="24h trade balance" />
                <Metric k="Age" v={token.age ?? '–'} />
                <Metric k="Launch venue" v={token.launchVenue ?? '–'} tip="Earliest pair on this chain (DexScreener)" />
                <Metric k="Signal denominator" v={`${token.signals.filter((s) => s.computed).length}/${token.signals.length}`} tip="Computed signals of all weighted signals — auditable" />
              </div>
            )}

            {/* row 3: evidence / whales */}
            <div className="grid-3">
              <Card title="EVIDENCE (VERBATIM)" right={<Badge color="cyan">PUBLIC WEIGHTS</Badge>}>
                {loading || !token ? <Skeleton h={200} /> : (
                  <div className="rug-list">
                    {token.signals.map((s) => (
                      <div className="rug-row" key={s.evidence}>
                        <span className="k">{s.label}</span>
                        <span className="v">{s.evidence || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card
                title={`WHALE ACTIVITY — ${(token?.symbol ?? 'BONK')} · ${(token?.chain ?? 'sol').toUpperCase()}`}
                right={whalesErr ? <Badge color="red">ERR</Badge>
                  : whales?.data_mode === 'live' ? <Badge color="green">LIVE</Badge>
                  : whales?.data_mode === 'partial' ? <Badge color="amber">PARTIAL</Badge>
                  : whales?.data_mode === 'unwired' ? <Badge color="muted">DECLARED NULL</Badge>
                  : <Badge color="muted">…</Badge>}>
                {whalesErr ? (
                  <EmptyState title="Whale route did not answer" hint={whalesErr} />
                ) : whales == null ? (
                  <Skeleton h={160} />
                ) : whales.data_mode === 'partial' ? (
                  <EmptyState title="Whale feed upstream failed" hint={whales.data_sources.join(' · ') || 'keyed provider error — the feed exists, the fetch did not'} />
                ) : whales.data_mode === 'unwired' ? (
                  <EmptyState title="No $0 whale feed on this chain" hint={whales.data_sources.join(' · ') || 'declared null in the capability catalog'} />
                ) : whales.transfers.length === 0 ? (
                  <EmptyState title={`0 transfers ≥ $${whales.threshold_usd} in last ${whales.window_txs} txs window`} hint={whales.data_sources.join(' · ')} />
                ) : (
                  <div className="whale-feed">
                    {whales.transfers.slice(0, 7).map((t, i) => (
                      <div className="whale-row" key={`${t.tx}-${i}`}>
                        <span className="w">{short(t.wallet)}</span>
                        <span className={t.direction === 'in' ? 'buy' : 'sell'}>
                          {t.direction === 'in' ? 'IN' : 'OUT'}
                        </span>
                        <span className="usd">{t.usd != null ? fmtUsd(t.usd) : `${Math.abs(t.amount).toLocaleString('en-US')} tok`}</span>
                      </div>
                    ))}
                    <div className="sys-foot">
                      <span>{whales.data_sources.join(' · ')}</span>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* right rail */}
          <div style={{ display: 'grid', gap: 16, position: 'sticky', top: 16 }}>
            <AiMicroFeed />

            <Card title={<span>TERMINAL STATUS <span style={{ color: 'var(--green)', fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>
              ● {health ? health.status.toUpperCase() : '—'}</span></span>}>
              <div className="sys-row"><span className="n"><i />Chains served</span>
                <span className="s">{catalog ? `${catalog.chains.length} (${catalog.chains.map((c) => c.chain).join(', ')})` : '—'}</span></div>
              <div className="sys-row"><span className="n"><i />Whale feed</span><span className="s">sol live · others declared null</span></div>
              <div className="sys-row"><span className="n"><i />Deployer (EVM)</span><span className="s">blockscout/goplus, on-chain gated</span></div>
              <div className="sys-foot">
                <span>LAST UPDATE: {new Date().toISOString().slice(11, 19)} UTC</span>
                <span>⟳</span>
              </div>
            </Card>
          </div>
        </div>

        {/* ── principles ── */}
        <div className="principles">
          {PRINCIPLES.map((p) => (
            <div className="principle" key={p.t}>
              <span className="ico">{p.ico}</span>
              <div><div className="tt">{p.t}</div><div className="dd">{p.d}</div></div>
            </div>
          ))}
        </div>

        {/* R3 PB-2: empty state = styled content — real CAs a founder can click */}
        {!token && !loading && !err && (
          <div className="ta-card" data-testid="dash-empty" style={{ display: 'grid', gap: 10 }}>
            <EmptyState title="No token loaded" hint="Paste an address above and hit ANALYZE — or start from a real one" />
            <b className="mono" style={{ fontSize: 10, letterSpacing: '.1em' }}>TRY A REAL ONE</b>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
              {[
                { label: 'Greyson · pump (SOL)', ca: 'AfGdjAp9djSaqJxzYo3t6jy8tJA3o2aDPHoZ57Egpump', chainSel: 'ALL CHAINS' },
                { label: 'CAKE · PancakeSwap (BNB)', ca: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', chainSel: 'BNB' },
                { label: 'AERO · Aerodrome (BASE)', ca: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', chainSel: 'BASE' },
              ].map((ex) => (
                <button key={ex.ca} type="button" className="v2-cand"
                  onClick={() => { setQuery(ex.ca); setChainSel(ex.chainSel) }}>
                  <b>{ex.label}</b>
                  <span className="mono dim">{ex.ca.slice(0, 6)}…{ex.ca.slice(-4)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
