import { useEffect, useMemo, useState } from 'react'
import { CHAINS, MEMEATCHI, buildClusters } from '../mock/data'
import { ClusterGraph } from '../components/charts'
import { RugCheckPageMulti, WhalePageMulti } from './RugWhaleMulti'
import { dataService } from '../services/dataService'
import { Badge, Card, EmptyState, Skeleton, Tabs } from '../components/ui'
import { MiniBadge, SevSpark } from '../components/RiskDisplay'
import { ApiError, api, CHAINS as API_CHAINS, CHAIN_LABEL } from '../api'
import { ScanVerdict } from '../components/ScanVerdict'
import '../styles/landing3.css'
import type { Chain, ScanResult } from '../api'


function fmtU(n: number): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

/* one scanned row = real engine verdict from POST /api/scan (B2). R3: the
   row also carries the engine's signal severities — the 8-bin sev sparkline
   renders THIS profile, never a synthesized one. */
function scannedRow(res: ScanResult, chain: string): any {
  const p = res.pair
  const short = (a: string | null) => (a && a.length > 12 ? a.slice(0, 5) + '…' + a.slice(-4) : a) || '?'
  return {
    id: `scan:${chain}:${p.pairAddress ?? p.baseToken?.address ?? res.ts}`,
    symbol: p.baseToken?.symbol ?? 'UNKNOWN',
    chain, pair: `${short(p.pairAddress)} / ${p.quoteToken?.symbol ?? '?'}`,
    price: Number(p.priceUsd ?? 0), chg: p.priceChange?.h24 ?? 0,
    liq: p.liquidity?.usd ?? 0, vol: p.volume?.h24 ?? 0,
    risk: res.assessment.score, spark: null, scanned: true,
    sevs: (res.assessment.signals ?? [])
      .map((s) => s.severity).filter((s): s is number => s != null),
  }
}
/* R3 (PB-2): the scanner's empty state is styled content — three REAL
   contracts (probed live 2026-08-31) a founder can click to load the input */
const SC_EXAMPLES = [
  { label: 'Greyson · pump (SOL)', ca: 'AfGdjAp9djSaqJxzYo3t6jy8tJA3o2aDPHoZ57Egpump', chain: 'sol' },
  { label: 'CAKE · PancakeSwap (BNB)', ca: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', chain: 'bnb' },
  { label: 'AERO · Aerodrome (BASE)', ca: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', chain: 'base' },
]

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
  const [live, setLive] = useState<any[]>([])
  const [liveState, setLiveState] = useState<'loading' | 'live' | 'empty'>('loading')
  const [scanned, setScanned] = useState<any[]>([])
  const [scanChain, setScanChain] = useState<Chain>('sol')
  const [scanAddr, setScanAddr] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanErr, setScanErr] = useState<string | null>(null)
  const [lastRes, setLastRes] = useState<ScanResult | null>(null)
  async function runScan() {
    const address = scanAddr.trim()
    if (!address) { setScanErr('Paste a token address first.'); return }
    setScanning(true); setScanErr(null)
    try {
      const res = await api.scan(scanChain, address)
      const row = scannedRow(res, scanChain)
      setScanned((prev) => [row, ...prev.filter((r) => r.id !== row.id)])
      setLastRes(res)
      setScanAddr(''); setQ('')
    } catch (e) {
      setScanErr(e instanceof ApiError ? e.message : 'Scan failed — try again.')
    } finally { setScanning(false) }
  }
  useEffect(() => {
    let on = true
    const pull = () => dataService.getScannerRows().then((r) => {
      if (!on) return
      setLive(r as any[])
      setLiveState(r.length ? 'live' : 'empty')
    })
    pull()
    const t = setInterval(pull, 60_000) // provider caches 60s too
    return () => { on = false; clearInterval(t) }
  }, [])
  // null < 50 is true in JS — unscored rows must not fake a "safe" bucket
  const rows = useMemo(() => [...scanned, ...live]
    .filter((r) => chain === 'all' || r.chain === chain)
    .filter((r) => risk === 'all' || (r.risk !== null && r.risk !== undefined
      && ((risk === 'safe' && r.risk < 50) || (risk === 'risky' && r.risk >= 50))))
    .filter((r) => r.symbol.toLowerCase().includes(q.toLowerCase())), [live, scanned, q, chain, risk])

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
      <div className="ta-searchrow">
        <select value={scanChain} onChange={(e) => setScanChain(e.target.value as Chain)} className="mono"
          style={{ height: 40, background: '#0d1322', color: 'var(--ink, #e7ecf5)', border: '1px dashed #233047', borderRadius: 8, padding: '0 10px' }}>
          {API_CHAINS.map((c) => <option key={c} value={c}>{CHAIN_LABEL[c]}</option>)}
        </select>
        <div className="ta-search" style={{ height: 40 }}>
          <span style={{ color: 'var(--dim)' }}>⛨</span>
          <input placeholder="Paste token address — POST /api/scan" value={scanAddr}
            onChange={(e) => setScanAddr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runScan()} spellCheck={false} style={{ minWidth: 280 }} />
        </div>
        <button className="btn-analyze" disabled={scanning} onClick={runScan}>{scanning ? 'SCANNING…' : 'SCAN TOKEN'}</button>
      </div>
      {scanErr && <Card><span className="mono" style={{ color: '#fb7185' }}>✗ {scanErr}</span></Card>}
      {lastRes && (
        <Card className="pb-acc" title="SCAN EVIDENCE — direct from /api/scan">
          <ScanVerdict res={lastRes} chain={scanChain} />
        </Card>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Tabs active={chain} onPick={setChain} tabs={[{ id: 'all', label: 'All chains' }, ...CHAINS.filter(c => c.live).map((c) => ({ id: c.id, label: c.label }))]} />
        <span className="chain-chip soon">HYPE (SOON)</span>
        <Tabs active={risk} onPick={setRisk} tabs={[{ id: 'all', label: 'All risk' }, { id: 'safe', label: '≤ 49' }, { id: 'risky', label: '≥ 50' }]} />
      </div>
      <Card className="pb-acc">
        {rows.length === 0 && liveState === 'loading' ? (
          /* PB-4 — table-shaped skeleton shimmer while the feed is in flight */
          <div data-testid="sc-loading" style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <Skeleton h={30} w={110} /><Skeleton h={30} w={80} /><Skeleton h={30} w={80} />
            </div>
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={40} />)}
          </div>
        ) : rows.length === 0 ? (
          /* PB-2 — empty state = styled content, never a gaping blank */
          <div data-testid="sc-empty" style={{ display: 'grid', gap: 10 }}>
            <EmptyState
              title={liveState === 'empty' ? 'The live trending feed has no rows right now' : 'Nothing matches those filters'}
              hint={liveState === 'empty' ? 'Scan any contract directly — the engine runs for real' : 'Loosen the chain or risk filter'} />
            <b className="mono" style={{ fontSize: 10, letterSpacing: '.1em' }}>TRY A REAL ONE</b>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
              {SC_EXAMPLES.map((ex) => (
                <button key={ex.ca} type="button" className="v2-cand"
                  onClick={() => { setScanAddr(ex.ca); setScanChain(ex.chain as Chain) }}>
                  <b>{ex.label}</b>
                  <span className="mono dim">{ex.ca.slice(0, 6)}…{ex.ca.slice(-4)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="ta-table-wrap">
            <table className="ta-table">
              <thead><tr>
                <th>Token</th><th>Chain</th><th>Pair</th><th className="r">Price</th><th className="r">24h</th>
                <th className="r">Liquidity</th><th className="r">Vol 24h</th><th title="8-bin severity profile from the engine's signals (RiskDisplay ramp)">SEV</th><th className="r">Risk</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id ?? r.chain+":"+r.symbol+":"+r.pair}>
                    <td><b>{r.symbol}</b>{r.scanned ? <span title="verified by /api/scan engine" style={{ color: '#34d399', marginLeft: 6, fontSize: 10 }}>⛨</span> : null}{r.mock ? <span title="placeholder data — not a live scan" style={{ color: '#fbbf24', marginLeft: 6, fontSize: 10, border: '1px dashed #fbbf24', borderRadius: 4, padding: '0 4px' }}>MOCK</span> : null}</td>
                    <td><span className="sc-chain" data-chain={r.chain}
                      title={CHAIN_LABEL[r.chain as keyof typeof CHAIN_LABEL] ?? r.chain}>
                      {(CHAIN_LABEL[r.chain as keyof typeof CHAIN_LABEL] ?? r.chain).toUpperCase()}</span></td>
                    <td className="mono dim">{r.pair}</td>
                    <td className="r mono">{r.price < 1e-8 ? '<1e-8' : '$' + r.price.toFixed(8)}</td>
                    <td className={`r mono ${r.chg >= 0 ? 'up' : 'down'}`}>{r.chg >= 0 ? '+' : ''}{r.chg.toFixed(2)}%</td>
                    <td className="r mono">{fmtU(r.liq)}</td>
                    <td className="r mono">{fmtU(r.vol)}</td>
                    <td><SevSpark sevs={r.sevs ?? null} /></td>
                    <td className="r">{r.risk == null ? <span className="dim mono">n/a</span> : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <MiniBadge level={r.risk >= 75 ? 'high' : r.risk >= 50 ? 'medium' : 'low'} />
                        <span className={`ta-badge ${r.risk >= 75 ? 'b-red' : r.risk >= 50 ? 'b-amber' : 'b-green'}`}>{r.risk}</span>
                      </span>
                    )}</td>
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

/* PROMPT-V2 P3+P4: the multi-chain implementations live in RugWhaleMulti.tsx
   (rug: RugCheck on sol + GoPlus on bnb/base + honest limited panel on
   hype/hood; whale: labeled heuristics + tape windows + CSV). The page ids
   and nav stay stable. */
export function RugCheckPage() {
  return <RugCheckPageMulti />
}

export function WhalePage() {
  return <WhalePageMulti />
}


/* ─────────────── CLUSTER ANALYSIS ─────────────── */
export function ClusterPage() {
  const clusters = buildClusters(11)
  return (
    <div className="ta-page">
      <Head title="Cluster Analysis" sub="SIMULATED — deterministic fixture (mock/data.ts), NOT connected to the backend; no cluster endpoint exists. Real per-scan wallet clustering already ships inside /api/scan → clustering. Below 8 wallets we refuse to score — insufficient data is an answer." right={<Badge color="amber">SIMULATED</Badge>} />
      <div className="grid-23">
        <Card title={`WALLET GRAPH — ${MEMEATCHI.symbol} · SIMULATED FIXTURE`}>
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
