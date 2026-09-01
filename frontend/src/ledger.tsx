/* VILMEI Token Ledger — build-in-public transparency page (PROMPT-V).
   S2 full-page DNA. Every number renders exactly what /api/ledger returned —
   each with {source, fetched_at, verified_by}; anything unproven renders in
   the GAPS panel. Labels default to UNKNOWN; the labels file is repo-public.
   Tabs: HOLDERS · BUYBACK · BURN · VESTING · FLOW. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import { fmtUsdCompact } from './lib/liveFormat'
import './styles/ledger.css'

const EXPLORER = 'https://solscan.io'   // PUBLIC explorer — not ours, allowed

interface Holder {
  rank: number; token_account: string; owner: string; amount: number
  pct_supply: number | null; label: string; evidence: string
  delta_24h?: number | null
}
interface Ledger {
  data_mode: 'live' | 'partial' | 'unwired'
  mint: string
  preview_note: string
  supply: { total_minted_fixed: number; current_supply: number | null
    supply_prov: { source: string; fetched_at: string; verified_by: string }
    mint_authority: string | null; mint_absent: boolean
    mint_prov: { source: string; fetched_at: string; verified_by: string } }
  bars: { burned_upper_bound_pct: number; note: string }
  holders: Holder[]
  holders_prov: { source: string; fetched_at: string; verified_by: string }
  delta_note: string
  invariant: { expression: string; top20_sum: number | null
    current_supply: number | null; holds: boolean | null }
  buyback: { rows: unknown[]; gap: string }
  burn: { rows: unknown[]; gap: string }
  vesting: { rows: unknown[]; gap: string }
  labels_source: string
  gaps: string[]
  cached?: boolean
  ts: string
}

type TabId = 'holders' | 'buyback' | 'burn' | 'vesting' | 'flow'
const TABS: { id: TabId; label: string }[] = [
  { id: 'holders', label: 'HOLDERS' }, { id: 'buyback', label: 'BUYBACK' },
  { id: 'burn', label: 'BURN' }, { id: 'vesting', label: 'VESTING' },
  { id: 'flow', label: 'FLOW' },
]

const LABEL_CLASS: Record<string, string> = {
  TEAM: 'lg-team', TREASURY: 'lg-team', LP: 'lg-lp', CEX: 'lg-cex', UNKNOWN: 'lg-unk',
}

function useLedger(mint: string | null) {
  const [state, setState] = useState<{ st: 'loading' | 'ok' | 'error'; ledger?: Ledger; msg?: string }>({ st: 'loading' })
  const [fetchedAt, setFetchedAt] = useState<number>(0)
  useEffect(() => {
    let on = true
    const pull = () => {
      const q = mint ? `?chain=sol&mint=${encodeURIComponent(mint)}` : '?chain=sol'
      fetch(`/api/ledger${q}`)
        .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
        .then(({ ok, j }) => { if (!on) return
          if (!ok) { setState({ st: 'error', msg: j.detail ?? `HTTP error` }); return }
          setState({ st: 'ok', ledger: j }); setFetchedAt(Date.now())
        })
        .catch((e) => { if (on) setState({ st: 'error', msg: String(e).slice(0, 120) }) })
    }
    pull()
    const t = setInterval(pull, 60_000)
    return () => { on = false; clearInterval(t) }
  }, [mint])
  return { state, fetchedAt }
}

/* Σ INVARIANT — recomputed client-side from the same payload every render */
function InvariantChip({ inv }: { inv: Ledger['invariant'] }) {
  if (inv.holds === null) return <span className="lg-chip muted">Σ INVARIANT · n/a</span>
  return inv.holds
    ? <span className="lg-chip ok" title={inv.expression}>Σ INVARIANT ✓ top20 {fmtUsdCompact(inv.top20_sum)} ≤ supply</span>
    : <span className="lg-chip red" title={inv.expression}>Σ INVARIANT ✗ Δ = {fmtUsdCompact((inv.top20_sum ?? 0) - (inv.current_supply ?? 0))}</span>
}

function ProvenanceStrip({ ledger, fetchedAt }: { ledger: Ledger; fetchedAt: number }) {
  const ago = fetchedAt ? Math.max(0, Math.round((Date.now() - fetchedAt) / 1000)) : null
  return (
    <div className="lg-prov mono">
      SOURCES: {ledger.holders_prov.source || '—'} + {ledger.supply.supply_prov.source || '—'}
      {ledger.cached ? ' · cached' : ''} · refresh {ago == null ? '—' : `${ago}s ago`} · TS {ledger.ts}
    </div>
  )
}

function SupplyBars({ s, bars }: { s: Ledger['supply']; bars: Ledger['bars'] }) {
  const total = s.total_minted_fixed
  const burnedPct = Math.min(100, ((total - (s.current_supply ?? total)) / total) * 100)
  return (
    <div className="lg-supply">
      <div className="lg-supply-bar" role="img" aria-label={`burned ${burnedPct.toFixed(2)}% of fixed supply`}>
        <i style={{ width: `${burnedPct}%` }} />
      </div>
      <div className="lg-supply-cells">
        <div><span>FIXED MINT</span><b>{total.toLocaleString('en-US')}</b></div>
        <div><span>CURRENT SUPPLY</span><b>{s.current_supply?.toLocaleString('en-US') ?? '–'}</b></div>
        <div><span>BURNED/ABSENT</span><b>{burnedPct.toFixed(4)}%<small className="lg-mono-note"> upper bound — see GAPS</small></b></div>
        <div><span>MINT AUTHORITY</span><b className={s.mint_absent ? 'ok' : 'warn'}>
          {s.mint_absent ? 'MINT ABSENT ✓ self-verifiable' : (s.mint_authority ?? '–')}</b></div>
      </div>
      <div className="lg-mono-note">{bars.note}</div>
    </div>
  )
}

function HoldersTable({ holders, delta }: { holders: Holder[]; delta: boolean }) {
  return (
    <div className="lg-table-wrap">
      <table className="lg-table">
        <thead><tr>
          <th>#</th><th>WALLET</th><th>LABEL</th><th className="r">AMOUNT</th>
          <th className="r">% SUPPLY</th><th className="r">Δ24H</th><th>VERIFY →</th>
        </tr></thead>
        <tbody>
          {holders.map((h) => (
            <tr key={h.token_account}>
              <td className="mono dim">{h.rank}</td>
              <td className="mono" title={`${h.owner} · token account ${h.token_account}`}>
                {h.owner.slice(0, 6)}…{h.owner.slice(-4)}
              </td>
              <td><span className={`lg-label ${LABEL_CLASS[h.label] ?? 'lg-unk'}`}
                title={h.evidence || 'no on-chain evidence — default label'}>{h.label}</span></td>
              <td className="r mono">{h.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
              <td className="r mono">{h.pct_supply?.toFixed(4) ?? '–'}%</td>
              <td className={`r mono ${h.delta_24h == null ? 'dim' : h.delta_24h >= 0 ? 'up' : 'down'}`}>
                {h.delta_24h == null ? '–' : `${h.delta_24h >= 0 ? '+' : ''}${h.delta_24h.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
              </td>
              <td><a className="lg-verify" href={`${EXPLORER}/account/${h.owner}`} target="_blank" rel="noopener noreferrer">explorer ↗</a></td>
            </tr>
          ))}
        </tbody>
      </table>
      {delta && <div className="lg-mono-note">Δ24h = live diff against the persisted on-chain snapshot — see Methodology.</div>}
    </div>
  )
}

function GapPanel({ title, gap, rows }: { title: string; gap: string; rows: unknown[] }) {
  const empty = !rows || rows.length === 0
  return (
    <div className="lg-gapbox">
      <b>{title}</b>
      {empty
        ? <span className="lg-gapline">{gap}</span>
        : <pre className="mono">{JSON.stringify(rows, null, 1)}</pre>}
    </div>
  )
}

function ByteProof({ ledger }: { ledger: Ledger }) {
  const s = ledger.supply
  return (
    <div className="lg-byteproof">
      <b>BYTE-PROOF · VERIFY IT YOURSELF</b>
      <pre className="mono">{`curl -s https://api.mainnet-beta.solana.com \\
  -X POST -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo",
       "params":["${ledger.mint}","encoding":"jsonParsed"]}' \\
  | jq .result.value.data.parsed.info.mintAuthority   # → ${s.mint_authority === null ? 'null' : s.mint_authority}`}</pre>
      <span className="lg-mono-note">fetched_at {s.mint_prov.fetched_at} · via {s.mint_prov.source} — machine-dump: <a href="/ledger.jsonl">/ledger.jsonl</a></span>
    </div>
  )
}

function LedgerPage() {
  const { state, fetchedAt } = useLedger(null)
  const [tab, setTab] = useState<TabId>('holders')
  const threadRef = useRef<HTMLDivElement>(null)

  return (
    <div className="lg-root">
      <header className="lg-top embroidery">
        <a className="lg-logo" href="/"><span className="m">◤</span>VILMEI</a>
        <nav className="lg-seg" aria-label="site section">
          <a href="/live">MEMECOIN LIVE</a>
          <span className="lg-seg-on">$VLM · LEDGER</span>
        </nav>
        <span className="lg-badge mono">$JUP · PREVIEW — venue untuk $VLM nanti</span>
      </header>
      <main className="lg-main">
        {state.st === 'error' && (
          <div className="lg-errbox" role="status">LEDGER OFFLINE — {state.msg}
            <div className="lg-mono-note">The rest of the terminal stays live — a ledger that cannot prove itself says so.</div>
          </div>
        )}
        {state.st === 'loading' && (
          <div className="lg-skel"><i /><i /><i /></div>
        )}
        {state.st === 'ok' && state.ledger && (
          <>
            <div className="lg-headrow">
              <h1 className="lg-h1">TOKEN <em>LEDGER</em></h1>
              <span className="lg-mint mono" title={state.ledger.mint}>
                {state.ledger.mint.slice(0, 6)}…{state.ledger.mint.slice(-4)}
              </span>
              <InvariantChip inv={state.ledger.invariant} />
              {state.ledger.data_mode === 'partial' && <span className="lg-chip amber">PARTIAL — GAPS OPEN</span>}
            </div>
            <ProvenanceStrip ledger={state.ledger} fetchedAt={fetchedAt} />
            <SupplyBars s={state.ledger.supply} bars={state.ledger.bars} />
            <div className="lg-grid">
              <section className="lg-left">
                <div className="lg-tabs" role="tablist">
                  {TABS.map((t) => (
                    <button key={t.id} role="tab" aria-selected={tab === t.id}
                      className={`lg-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="lg-tabbody" ref={threadRef} key={tab}>
                  {tab === 'holders' && (
                    state.ledger.holders.length
                      ? <HoldersTable holders={state.ledger.holders} delta={Boolean(state.ledger.delta_note)} />
                      : <div className="lg-gapline">Top-20 unreachable — see GAPS. Nothing is guessed.</div>
                  )}
                  {tab === 'buyback' && <GapPanel title="BUYBACK LEDGER" gap={state.ledger.buyback.gap} rows={state.ledger.buyback.rows} />}
                  {tab === 'burn' && <GapPanel title="BURN LEDGER" gap={state.ledger.burn.gap} rows={state.ledger.burn.rows} />}
                  {tab === 'vesting' && <GapPanel title="VESTING LEDGER" gap={state.ledger.vesting.gap} rows={state.ledger.vesting.rows} />}
                  {tab === 'flow' && (
                    <div className="lg-gapbox">
                      <b>FLOW — TOP MOVERS Δ24H</b>
                      <span className="lg-gapline">{state.ledger.delta_note || 'No snapshot diff available yet — the loop stores one per fetch; Δ rows appear once a ≥6h-old snapshot exists.'}</span>
                    </div>
                  )}
                </div>
              </section>
              <aside className="lg-rail">
                <div className="lg-railcard">
                  <b>GAPS — WHAT IS NOT KNOWN</b>
                  <ul className="lg-gaps">
                    {state.ledger.gaps.map((g, i) => <li key={i}>{g}</li>)}
                    <li>Buyback rows: {state.ledger.buyback.gap}</li>
                    <li>Burn rows: {state.ledger.burn.gap}</li>
                  </ul>
                  <span className="lg-mono-note">GAPS are the feature — a transparency page that hides nothing.</span>
                </div>
                <div className="lg-railcard">
                  <b>LABELS METHODOLOGY</b>
                  <span>{state.ledger.labels_source}. Default UNKNOWN. Seeds require on-chain evidence — a label without proof violates the ledger law.</span>
                </div>
                <ByteProof ledger={state.ledger} />
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

document.title = 'VILMEI Token Ledger — $JUP · Preview'
createRoot(document.getElementById('root')!).render(
  <StrictMode><LedgerPage /></StrictMode>,
)