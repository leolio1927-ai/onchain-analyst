import { useEffect, useMemo, useState } from 'react'
import { CHAINS, MEMEATCHI, SCANNER_ROWS, WHALES_TOP, buildClusters } from '../mock/data'
import { ClusterGraph, ScoreDial, Spark } from '../components/charts'
import { dataService } from '../services/dataService'
import { Badge, Card, EmptyState, Meter, Tabs } from '../components/ui'
import { CHAIN_LABEL } from '../api'

function fmtU(n: number): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

const chainColor = (id: string) => CHAINS.find((c) => c.id === id)?.color ?? '#8a91b4'

/* shared page header */
function Head({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div><div className="page-title">{title}</div><div className="page-sub">{sub}</div></div>
      {right}
    </div>
  )
}

/* ─────────────── TOKEN SCANNER ─────────────── */
export function ScannerPage() {
  const [q, setQ] = useState('')
  const [chain, setChain] = useState('all')
  const [risk, setRisk] = useState('all')
  const [live, setLive] = useState<any[]>(SCANNER_ROWS)
  useEffect(() => {
    let on = true
    const pull = () => dataService.getScannerRows().then((r) => { if (on) setLive(r as any[]) })
    pull()
    const t = setInterval(pull, 60_000) // provider caches 60s too
    return () => { on = false; clearInterval(t) }
  }, [])
  // null < 50 is true in JS — unscored rows must not fake a "safe" bucket
  const rows = useMemo(() => live
    .filter((r) => chain === 'all' || r.chain === chain)
    .filter((r) => risk === 'all' || (r.risk !== null && r.risk !== undefined
      && ((risk === 'safe' && r.risk < 50) || (risk === 'risky' && r.risk >= 50))))
    .filter((r) => r.symbol.toLowerCase().includes(q.toLowerCase())), [live, q, chain, risk])

  return (
    <div className="ta-page">
      <Head title="Token Scanner" sub="Live scan across 5 chains — every row carries the same deterministic risk engine." right={
        <div className="ta-searchrow">
          <div className="ta-search" style={{ height: 40 }}>
            <span style={{ color: 'var(--dim)' }}>⌕</span>
            <input placeholder="Filter symbol…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      } />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Tabs active={chain} onPick={setChain} tabs={[{ id: 'all', label: 'All chains' }, ...CHAINS.filter(c => c.live).map((c) => ({ id: c.id, label: c.label }))]} />
        <Tabs active={risk} onPick={setRisk} tabs={[{ id: 'all', label: 'All risk' }, { id: 'safe', label: '≤ 49' }, { id: 'risky', label: '≥ 50' }]} />
      </div>
      <Card>
        {rows.length === 0 ? <EmptyState title="Nothing matches those filters" hint="Loosen the chain or risk filter" /> : (
          <div className="ta-table-wrap">
            <table className="ta-table">
              <thead><tr>
                <th>Token</th><th>Chain</th><th>Pair</th><th className="r">Price</th><th className="r">24h</th>
                <th className="r">Liquidity</th><th className="r">Vol 24h</th><th>Trend</th><th className="r">Risk</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.chain+":"+r.symbol+":"+r.pair}>
                    <td><b>{r.symbol}</b></td>
                    <td><span className="ta-tip"><span className="dot-inline" style={{ background: chainColor(r.chain), width: 8, height: 8, borderRadius: 99, display: 'inline-block' }} /> {CHAIN_LABEL[r.chain as keyof typeof CHAIN_LABEL] ?? r.chain}<span className="ta-tip-pop">{CHAIN_LABEL[r.chain as keyof typeof CHAIN_LABEL] ?? r.chain}</span></span></td>
                    <td className="mono dim">{r.pair}</td>
                    <td className="r mono">{r.price < 1e-8 ? '<1e-8' : '$' + r.price.toFixed(8)}</td>
                    <td className={`r mono ${r.chg >= 0 ? 'up' : 'down'}`}>{r.chg >= 0 ? '+' : ''}{r.chg.toFixed(2)}%</td>
                    <td className="r mono">{fmtU(r.liq)}</td>
                    <td className="r mono">{fmtU(r.vol)}</td>
                    <td>{r.spark == null ? <span className="dim mono">n/a</span> : <Spark seed={r.spark} up={r.chg >= 0} />}</td>
                    <td className="r">{r.risk == null ? <span className="dim mono">n/a</span> : <span className={`ta-badge ${r.risk >= 75 ? 'b-red' : r.risk >= 50 ? 'b-amber' : 'b-green'}`}>{r.risk}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

/* ─────────────── RUG CHECK ─────────────── */
export function RugCheckPage() {
  const [addr, setAddr] = useState('')
  const [checked, setChecked] = useState(true)
  const t = MEMEATCHI
  return (
    <div className="ta-page">
      <Head title="Rug Check" sub="Deterministic checklist — same input, same verdict, forever. This is context, not an audit." />
      <div className="ta-searchrow">
        <div className="ta-search">
          <span style={{ color: 'var(--dim)' }}>⛨</span>
          <input placeholder="Paste token address…" value={addr} onChange={(e) => setAddr(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setChecked(true)} spellCheck={false} />
        </div>
        <button className="btn-analyze" onClick={() => setChecked(true)}>RUN CHECK</button>
      </div>
      {!checked ? <Card><EmptyState icon="⛨" title="No token checked yet" hint="Paste an address and hit RUN CHECK" /></Card> : (
        <div className="grid-2">
          <Card title={`RUG CHECK ANALYSIS — ${t.symbol}`}>
            <div className="rug-list">
              {t.rugCheck.items.map((it) => (
                <div className="rug-row" key={it.label}>
                  <span className="k">{it.label}</span>
                  <span className={`v ${it.ok === true ? 'ok-yes' : it.ok === false ? 'ok-no' : 'ok-warn'}`}>
                    {it.ok === true ? '✓ ' : it.ok === false ? '✗ ' : '⚠ '}{it.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="rug-score"><span className="k">RUG CHECK SCORE</span><span className="v">{t.rugCheck.score} / 100</span></div>
          </Card>
          <Card title="VERDICT" glow="#34d399">
            <div style={{ display: 'grid', placeItems: 'center', padding: '10px 0 18px' }}>
              <ScoreDial score={t.rugCheck.score} label="RUG CHECK" />
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              Heuristics v0 — weighted, auditable thresholds. A passing score is not a safety
              promise: fair-launch and airdrop patterns can mirror rug-like signals, and vice versa.
            </p>
            <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              {['Liquidity depth', 'Holder concentration', 'Trade balance'].map((k, i) => (
                <div key={k}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>
                    <span>{k}</span><span className="mono">{[92, 61, 74][i]}%</span>
                  </div>
                  <Meter value={[92, 61, 74][i]} color={['#34d399', '#fbbf24', '#22d3ee'][i]} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

/* ─────────────── WHALE TRACKER ─────────────── */
export function WhalePage() {
  const [tab, setTab] = useState('feed')
  return (
    <div className="ta-page">
      <Head title="Whale Tracker" sub="Smart-money movements read from the per-wallet trade feed. Read-only. The whale does not know you are watching." />
      <Tabs active={tab} onPick={setTab} tabs={[{ id: 'feed', label: 'Live activity' }, { id: 'top', label: 'Top wallets 24h' }]} />
      {tab === 'feed' ? (
        <Card title="WHALE ACTIVITY (24H)" right={<Badge color="green">LIVE</Badge>}>
          <div className="whale-feed">
            {SCANNER_ROWS.length > 0 && WHALES_TOP.map((w) => (
              <div className="whale-row" key={w.wallet} style={{ gridTemplateColumns: '1fr 0.6fr 0.7fr 0.6fr' }}>
                <span className="w">{w.wallet}</span>
                <span className="dim">{w.chain.toUpperCase()}</span>
                <span className={w.net >= 0 ? 'buy' : 'sell'}>{w.net >= 0 ? 'NET BUY' : 'NET SELL'}</span>
                <span className="usd">{fmtU(Math.abs(w.net))}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card title="TOP WALLETS (24H)">
          <div className="ta-table-wrap">
            <table className="ta-table">
              <thead><tr><th>Wallet</th><th>Chain</th><th className="r">Bought 24h</th><th className="r">Sold 24h</th><th className="r">Net flow</th><th className="r">Tokens held</th></tr></thead>
              <tbody>
                {WHALES_TOP.map((w) => (
                  <tr key={w.wallet}>
                    <td className="mono">{w.wallet}</td>
                    <td>{w.chain.toUpperCase()}</td>
                    <td className="r mono up">{fmtU(w.bought24h)}</td>
                    <td className="r mono down">{w.sold24h ? fmtU(w.sold24h) : '—'}</td>
                    <td className={`r mono ${w.net >= 0 ? 'up' : 'down'}`}>{fmtU(w.net)}</td>
                    <td className="r mono dim">{w.tokens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ─────────────── CLUSTER ANALYSIS ─────────────── */
export function ClusterPage() {
  const clusters = buildClusters(11)
  return (
    <div className="ta-page">
      <Head title="Cluster Analysis" sub="Burst timing + amount uniformity across per-wallet trades. Below 8 wallets we refuse to score — insufficient data is an answer." right={<Badge color="cyan">BETA</Badge>} />
      <div className="grid-23">
        <Card title={`WALLET GRAPH — ${MEMEATCHI.symbol}`}>
          <div className="clus-graph" style={{ height: 420 }}>
            <ClusterGraph clusters={clusters} />
          </div>
        </Card>
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <Card title="CLUSTERS">
            <div className="clus-legend" style={{ gridTemplateColumns: '1fr' }}>
              {MEMEATCHI.clusters.groups.map((g) => (
                <div className="row" key={g.id}>
                  <span className="dot" style={{ background: g.color, boxShadow: `0 0 8px ${g.color}` }} />
                  <span>{g.label} <span className="n">({g.wallets} wallets)</span></span>
                  <span className="pc">{g.sharePct}%</span>
                </div>
              ))}
            </div>
            <div className="clus-risk"><span className="k">CLUSTERING RISK</span><span className="v">{MEMEATCHI.clusters.risk} / 100</span></div>
          </Card>
          <Card title="HOW TO READ THIS">
            <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>
              Edges = trades within the same time-burst window. Dense same-color webs with
              similar amounts hint at coordination. Fair-launches, airdrops and KOL calls can
              mirror this exact shape — heuristics assist decisions, they never deliver verdicts.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* tiny local style helpers */
declare global { interface Window { __nothing?: never } }
export const dim = ''
