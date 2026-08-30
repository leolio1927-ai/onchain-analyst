import { useEffect, useMemo, useState } from 'react'
import { CHAINS, MEMEATCHI, buildClusters } from '../mock/data'
import { ClusterGraph, Spark } from '../components/charts'
import { dataService } from '../services/dataService'
import { Badge, Card, EmptyState, Tabs } from '../components/ui'
import { ApiError, api, CHAINS as API_CHAINS, CHAIN_LABEL } from '../api'
import type { Chain, ChainsCatalog, ScanResult, WhalesResult } from '../api'


function fmtU(n: number): string {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

/* one scanned row = real engine verdict from POST /api/scan (B2) */
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
  }
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
  const [live, setLive] = useState<any[]>([])
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
    const pull = () => dataService.getScannerRows().then((r) => { if (on) setLive(r as any[]) })
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
        <Card title="SCAN EVIDENCE — direct from /api/scan">
          <div className="rug-list">
            <div className="rug-row"><span className="k">Verdict</span><span className="v">{lastRes.assessment.level_label} · {lastRes.assessment.score ?? 'n/a'}/100</span></div>
            <div className="rug-row"><span className="k">Sources</span><span className="v mono">{lastRes.sources.join(' + ')}</span></div>
            {lastRes.launch_venue && (
              <div className="rug-row"><span className="k">Launch venue</span><span className="v">{lastRes.launch_venue}</span></div>
            )}
            <div className="rug-row"><span className="k">Clustering</span><span className="v">{lastRes.clustering.wallets} wallets · {lastRes.clustering.buys} buys · sev {lastRes.clustering.severity ?? 'n/a'}</span></div>
            <div className="rug-row"><span className="k">Cluster evidence</span><span className="v">{lastRes.clustering.evidence}</span></div>
            <div className="rug-row"><span className="k">Scanned at</span><span className="v mono">{lastRes.ts}</span></div>
          </div>
          {lastRes.assessment.signals.length > 0 && (
            <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
              {lastRes.assessment.signals.map((g) => (
                <div key={g.key} className="mono-line" style={{ fontSize: 12 }}>
                  <b>[{g.severity == null ? 'n/a' : `sev ${g.severity}`}] {g.label}</b> · w{g.weight} — {g.evidence}
                </div>
              ))}
            </div>
          )}
          {lastRes.assessment.notes.length > 0 && (
            <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 10 }}>{lastRes.assessment.notes.join(' · ')}</p>
          )}
        </Card>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Tabs active={chain} onPick={setChain} tabs={[{ id: 'all', label: 'All chains' }, ...CHAINS.filter(c => c.live).map((c) => ({ id: c.id, label: c.label }))]} />
        <span className="chain-chip soon">HYPE (SOON)</span>
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
                  <tr key={r.id ?? r.chain+":"+r.symbol+":"+r.pair}>
                    <td><b>{r.symbol}</b>{r.scanned ? <span title="verified by /api/scan engine" style={{ color: '#34d399', marginLeft: 6, fontSize: 10 }}>⛨</span> : null}{r.mock ? <span title="placeholder data — not a live scan" style={{ color: '#fbbf24', marginLeft: 6, fontSize: 10, border: '1px dashed #fbbf24', borderRadius: 4, padding: '0 4px' }}>MOCK</span> : null}</td>
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

/* ─────────────── RUG CHECK (LIVE) ───────────────
   Chain-aware surface over the scan context block (BE-F5a-R): sol renders
   helius DAS authorities + mutable, bnb/base render GoPlus security flags —
   all values verbatim. Chains whose rug_flags capability is declared null
   (hood/hype) render the catalog reason verbatim instead of a fake result. */
function flagHint(v: string | number | null): { text: string; cls: string } {
  if (v === null || v === undefined || v === '') return { text: '—', cls: 'ok-warn' }
  const s = String(v)
  if (s === '0') return { text: '0 (no)', cls: 'ok-yes' }
  if (s === '1') return { text: '1 (YES)', cls: 'ok-no' }
  return { text: s, cls: 'ok-warn' }
}

export function RugCheckPage() {
  const [catalog, setCatalog] = useState<ChainsCatalog | null>(null)
  const [catalogErr, setCatalogErr] = useState<string | null>(null)
  const [chain, setChain] = useState('sol')
  const [addr, setAddr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [res, setRes] = useState<ScanResult | null>(null)

  useEffect(() => {
    let on = true
    api.chains()
      .then((c) => { if (on) setCatalog(c) })
      .catch(() => { if (on) setCatalogErr('chain catalog unavailable — /api/v1/chains did not answer') })
    return () => { on = false }
  }, [])

  const cap = catalog?.capabilities?.[chain]?.rug_flags
  const declaredNull = cap != null && cap.source == null

  async function run() {
    const address = addr.trim()
    if (!address) { setErr('Paste a token address first.'); return }
    setBusy(true); setErr(null)
    try {
      setRes(await api.scan(chain as Chain, address))
    } catch (e) {
      setRes(null)
      setErr(e instanceof ApiError ? e.message : 'Scan failed — try again.')
    } finally { setBusy(false) }
  }

  const flags = res?.context?.rug_flags ?? null
  const flagNote = res?.context?.notes?.find((n) => n.includes('rug_flags')) ?? null

  return (
    <div className="ta-page">
      <Head title="Rug Check" sub="Token authority + contract flags straight from the wired providers — verbatim values, provenance attached. Context, not an audit." />
      <div className="ta-searchrow">
        <select value={chain} onChange={(e) => { setChain(e.target.value); setRes(null); setErr(null) }} className="mono"
          style={{ height: 40, background: '#0d1322', color: 'var(--ink, #e7ecf5)', border: '1px dashed #233047', borderRadius: 8, padding: '0 10px' }}>
          {(catalog?.chains ?? []).map((c) => <option key={c.chain} value={c.chain}>{c.name}</option>)}
          {!catalog && <option value="sol">Solana</option>}
        </select>
        <div className="ta-search" style={{ height: 40 }}>
          <span style={{ color: 'var(--dim)' }}>⛨</span>
          <input placeholder="Paste token address — POST /api/scan" value={addr}
            onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !declaredNull && run()}
            spellCheck={false} style={{ minWidth: 280 }} />
        </div>
        <button className="btn-analyze" disabled={busy || declaredNull} onClick={run}
          title={declaredNull ? 'Rug flags are declared null on this chain — reason below' : undefined}>
          {busy ? 'CHECKING…' : 'RUN CHECK'}
        </button>
      </div>
      {catalogErr && <Card><span className="mono" style={{ color: '#fb7185' }}>✗ {catalogErr}</span></Card>}
      {err && <Card><span className="mono" style={{ color: '#fb7185' }}>✗ {err}</span></Card>}

      {declaredNull && (
        <Card title={`RUG FLAGS — ${chain.toUpperCase()}`} right={<Badge color="muted">DECLARED NULL</Badge>}>
          <EmptyState icon="⛨" title="No rug-flag source on this chain" hint={cap?.reason ?? 'declared null in the capability catalog'} />
          <p className="mono" style={{ color: 'var(--dim)', fontSize: 11.5, marginTop: 10 }}>
            source: none — reason served verbatim by /api/v1/chains (capability catalog)
          </p>
        </Card>
      )}

      {!declaredNull && !res && !err && !busy && (
        <Card><EmptyState icon="⛨" title="No token checked yet" hint={`Rug flags on ${chain} are served live by ${cap?.source ?? 'the wired provider'} — paste an address and hit RUN CHECK`} /></Card>
      )}

      {res && (
        <>
          <Card title={`RUG FLAGS — ${res.pair.baseToken?.symbol ?? '?'} · ${chain.toUpperCase()}`}
            right={<Badge color={flags ? 'green' : 'amber'}>{flags ? `LIVE · ${res.context.sources.join(' + ') || 'provider'}` : 'PROVIDER NULL'}</Badge>}>
            {flags ? (
              <div className="rug-list">
                {chain === 'sol' ? (
                  <>
                    <div className="rug-row">
                      <span className="k">Update authorities</span>
                      <span className={`v ${flags.update_authorities.length ? 'ok-no' : 'ok-yes'}`}>
                        {flags.update_authorities.length
                          ? `⚠ ${flags.update_authorities.length} set — mint/metadata revocable`
                          : '✓ none — revoked'}
                      </span>
                    </div>
                    {flags.update_authorities.map((a) => (
                      <div className="rug-row" key={a}><span className="k dim">authority</span><span className="v mono">{a}</span></div>
                    ))}
                    <div className="rug-row">
                      <span className="k">Mutable</span>
                      <span className={`v ${flags.mutable ? 'ok-no' : flags.mutable === false ? 'ok-yes' : 'ok-warn'}`}>
                        {flags.mutable == null ? '—' : flags.mutable ? `⚠ true — metadata can change` : '✓ false — immutable'}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    {(['is_honeypot', 'buy_tax', 'sell_tax', 'mintable', 'freezable', 'holder_count'] as const).map((k) => {
                      const raw = flags[k]
                      const h = flagHint(raw)
                      const label = k.replace(/_/g, ' ')
                      const text = (k === 'buy_tax' || k === 'sell_tax') && raw != null && raw !== '' ? `${raw}%` : h.text
                      return <div className="rug-row" key={k}><span className="k">{label}</span><span className={`v ${h.cls}`}>{text}</span></div>
                    })}
                  </>
                )}
              </div>
            ) : (
              <EmptyState icon="⚠" title="Provider answered null"
                hint={flagNote ?? `the wired provider returned no flags for this token — see context notes`} />
            )}
            <p className="mono" style={{ color: 'var(--dim)', fontSize: 11.5, marginTop: 10 }}>
              data_mode {res.context.data_mode} · scanned {res.ts}
            </p>
          </Card>

          {res.context.notes.length > 0 && (
            <Card title="CONTEXT NOTES (VERBATIM)">
              <div style={{ display: 'grid', gap: 6 }}>
                {res.context.notes.map((n) => (
                  <div key={n} className="mono-line" style={{ fontSize: 12, color: 'var(--muted)' }}>{n}</div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

/* ─────────────── WHALE TRACKER (LIVE) ───────────────
   GET /api/v1/whales/{chain}/{token}: sol = helius enhanced txs + per-wallet
   netflow over the shown window; other chains carry the probe reason.
   Two distinct honest states: a LIVE quiet window (0 transfers ≥ threshold
   in the last N txs) vs a DECLARED NULL chain (reason verbatim). */
export function WhalePage() {
  const [catalog, setCatalog] = useState<ChainsCatalog | null>(null)
  const [chain, setChain] = useState('sol')
  const [addr, setAddr] = useState('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263')
  const [threshold, setThreshold] = useState(1000)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [res, setRes] = useState<WhalesResult | null>(null)

  useEffect(() => {
    let on = true
    api.chains().then((c) => { if (on) setCatalog(c) }).catch(() => {})
    return () => { on = false }
  }, [])

  async function run() {
    const token = addr.trim()
    if (!token) { setErr('Paste a token address first.'); return }
    setBusy(true); setErr(null)
    try {
      setRes(await api.whales(chain, token, threshold))
    } catch (e) {
      setRes(null)
      setErr(e instanceof ApiError ? e.message : 'Whale route did not answer.')
    } finally { setBusy(false) }
  }

  const short = (w: string | null) => (w ? `${w.slice(0, 4)}…${w.slice(-4)}` : '—')
  const unwired = res?.data_mode === 'unwired'
  const liveEmpty = res?.data_mode === 'live' && res.transfers.length === 0

  return (
    <div className="ta-page">
      <Head title="Whale Tracker" sub="Large recent transfers + per-wallet netflow, read from the provider window. Read-only — the whale does not know you are watching." />
      <div className="ta-searchrow">
        <select value={chain} onChange={(e) => { setChain(e.target.value); setRes(null); setErr(null) }} className="mono"
          style={{ height: 40, background: '#0d1322', color: 'var(--ink, #e7ecf5)', border: '1px dashed #233047', borderRadius: 8, padding: '0 10px' }}>
          {(catalog?.chains ?? []).map((c) => <option key={c.chain} value={c.chain}>{c.name}</option>)}
          {!catalog && <option value="sol">Solana</option>}
        </select>
        <div className="ta-search" style={{ height: 40 }}>
          <span style={{ color: 'var(--dim)' }}>◍</span>
          <input placeholder="Token address — GET /api/v1/whales" value={addr}
            onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()}
            spellCheck={false} style={{ minWidth: 260 }} />
        </div>
        <input className="mono" type="number" min={1} value={threshold}
          onChange={(e) => setThreshold(Math.max(1, Number(e.target.value) || 1))}
          aria-label="threshold in USD"
          style={{ height: 40, width: 90, background: '#0d1322', color: 'var(--ink, #e7ecf5)', border: '1px dashed #233047', borderRadius: 8, padding: '0 8px' }} />
        <button className="btn-analyze" disabled={busy} onClick={run}>{busy ? 'READING…' : 'READ WINDOW'}</button>
      </div>
      {err && <Card><span className="mono" style={{ color: '#fb7185' }}>✗ {err}</span></Card>}

      {!res && !err && !busy && (
        <Card><EmptyState icon="◍" title="No window read yet" hint="Paste a token address, set the USD threshold, hit READ WINDOW — sol is served by helius, other chains answer with their reason" /></Card>
      )}

      {res && unwired && (
        <Card title={`WHALE TRANSFERS — ${chain.toUpperCase()}`} right={<Badge color="muted">DECLARED NULL</Badge>}>
          <EmptyState icon="◍" title="No $0 whale feed on this chain" hint={res.data_sources.join(' · ') || 'declared null in the capability catalog'} />
          <p className="mono" style={{ color: 'var(--dim)', fontSize: 11.5, marginTop: 10 }}>
            data_mode {res.data_mode} · reason served verbatim by /api/v1/whales
          </p>
        </Card>
      )}

      {res && liveEmpty && (
        <Card title={`WHALE TRANSFERS — ${chain.toUpperCase()}`} right={<Badge color="green">LIVE</Badge>}>
          <EmptyState icon="◍" title={`0 transfers ≥ $${res.threshold_usd} in last ${res.window_txs} txs window`}
            hint={res.data_sources.join(' · ')} />
        </Card>
      )}

      {res && res.data_mode === 'live' && res.transfers.length > 0 && (
        <>
          <Card title={`WHALE TRANSFERS — ${chain.toUpperCase()} · ≥ $${res.threshold_usd}`} right={<Badge color="green">LIVE</Badge>}>
            <div className="whale-feed">
              {res.transfers.map((t, i) => (
                <div className="whale-row" key={`${t.tx}-${i}`} style={{ gridTemplateColumns: '1fr 0.5fr 1fr 0.8fr' }}>
                  <span className="w">{short(t.wallet)}</span>
                  <span className={t.direction === 'in' ? 'buy' : 'sell'}>{t.direction === 'in' ? 'IN' : 'OUT'}</span>
                  <span className="dim mono">{Math.abs(t.amount).toLocaleString('en-US')} tok</span>
                  <span className="usd">{t.usd != null ? fmtU(t.usd) : '—'}</span>
                </div>
              ))}
            </div>
            <div className="sys-foot">
              <span>{res.data_sources.join(' · ')}</span>
            </div>
          </Card>
          <Card title="NETFLOW (SAME WINDOW)">
            <div className="ta-table-wrap">
              <table className="ta-table">
                <thead><tr><th>Wallet</th><th>Direction</th><th className="r">Net amount</th><th className="r">Net USD</th></tr></thead>
                <tbody>
                  {res.netflow.slice(0, 10).map((n) => (
                    <tr key={n.wallet}>
                      <td className="mono">{short(n.wallet)}</td>
                      <td className={n.direction === 'in' ? 'up' : 'down'}>{n.direction === 'in' ? 'NET IN' : 'NET OUT'}</td>
                      <td className="r mono">{n.net_amount.toLocaleString('en-US')}</td>
                      <td className="r mono">{n.net_usd != null ? fmtU(Math.abs(n.net_usd)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {res && (
        <p className="mono" style={{ color: 'var(--dim)', fontSize: 11.5 }}>
          threshold ${res.threshold_usd} · window {res.window_txs} txs · price {res.price_usd != null ? `$${res.price_usd}` : 'absent — usd null'} · data_mode {res.data_mode} · {res.ts}
        </p>
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
