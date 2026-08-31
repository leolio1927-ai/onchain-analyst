/* PROMPT-V2 P3+P4 (2026-08-31): multi-chain Rug Check + Whale Tracker.
   RUG: chips AUTO·SOL·BNB·BASE·HYPE·HOOD; AUTO = local classify + /api/v1/detect
   (never a silent default); sol → RugCheck summary (server-proxied), bnb/base →
   GoPlus rows (server-proxied), hype/hood → honest "signal set limited" + live
   GT/DS stats (never a blank red error). Verdict renders through RiskDisplay
   (one severity language for every module).
   WHALE (PROMPT-V3 R2): the tape is GeckoTerminal pool trades on ALL FIVE
   chains (GET /api/v1/whale/windows + /auto). A whale = labelled heuristic
   (one trade ≥ per-chain threshold — sol $50K · bnb/base $30K · hype/hood
   native-anchored with a $30K fallback, the server ships the sentence),
   never an on-chain label. Windows 1h/6h/24h, filled net-flow sparkline,
   per-chain bars, merged tape with chain chips, REAL CSV, seeded FIELD.
   PROMPT-V4 M1 (2026-08-31): the page never stares at an empty floor —
   GT 429s aggregate into ONE dismissible banner with a retry countdown
   (never stacked yellow rows); a quiet whale window renders the muted
   all-trade histogram behind the whale line + TOP TAPE (largest trades
   UNDER the threshold, ranked by size) + a deterministic AWAITING WHALES
   seeding field; a "walked N trades · M pools" chip states the walk depth.
   RUG nitkos: the verdict label is the source name only — the number lives
   once, on the dial. */
import { useEffect, useMemo, useState } from 'react'
import { classifyQuery, fetchDetect } from '../lib/detect'
import type { DetectCandidate } from '../lib/detect'
import { fetchSwapQuote, ageOf } from '../services/dexscreener'
import type { SwapQuote } from '../services/dexscreener'
import { RiskBadge, RiskDisplay } from '../components/RiskDisplay'
import type { RiskVerdict } from '../components/RiskDisplay'
import { Skeleton } from '../components/ui'
import { accentStyle } from './liveParts'
import type { LiveChain } from '../lib/liveApi'
import { api } from '../api'
import type { WhaleAutoResult, WhaleWindowsResult } from '../api'
import { shorten } from '../lib/liveFormat'

const CHAIN_CHIPS = ['AUTO', 'SOL', 'BNB', 'BASE', 'HYPE', 'HOOD'] as const
type Chip = (typeof CHAIN_CHIPS)[number]
const CHAIN_OF: Record<string, string> = { SOL: 'sol', BNB: 'bnb', BASE: 'base', HYPE: 'hype', HOOD: 'hood' }
const LABEL_OF: Record<string, string> = { sol: 'Solana', bnb: 'BNB', base: 'Base', hype: 'HyperEVM', hood: 'Robinhood' }

/* verified live examples for the empty-state (probed 2026-08-30/31) */
const EXAMPLES = [
  { label: 'Greyson · pump (SOL)', ca: 'AfGdjAp9djSaqJxzYo3t6jy8tJA3o2aDPHoZ57Egpump', chain: 'SOL' },
  { label: 'CAKE · PancakeSwap (BNB)', ca: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', chain: 'BNB' },
  { label: 'AERO · Aerodrome (BASE)', ca: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', chain: 'BASE' },
]

function PageHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="page-head">
      <div><div className="page-title">{title}</div><div className="page-sub">{sub}</div></div>
    </div>
  )
}

function Chips({ value, onPick }: { value: Chip; onPick: (c: Chip) => void }) {
  return (
    <div className="v2-chips" role="tablist" aria-label="chain">
      {CHAIN_CHIPS.map((c) => (
        <button key={c} type="button" role="tab" aria-selected={value === c}
          className={`v2-chip mono${value === c ? ' on' : ''}`} onClick={() => onPick(c)}>{c}</button>
      ))}
    </div>
  )
}

/* rug verdict mapping — documented heuristic, never presented as an audit */
function rugVerdict(level: 'low' | 'medium' | 'high' | 'nodata', score: number | null, label: string): RiskVerdict {
  return { level, score, label }
}

/* ── R1 (PROMPT-V3): never-red 3-layer result contract ─────────────────
   Layer 1 = chain chip · Layer 2 = provider chips (OK/PARTIAL/NO COVERAGE) ·
   Layer 3 = universal market signals (ALWAYS shown). Empty ≠ red: a provider
   with no row is PARTIAL, never an error. Coverage below was verified live
   2026-08-31 (mandate-0-V3): RugCheck is sol-only; GoPlus serves bnb/base
   (live) and Robinhood chain 4663 (served, but no verified populated row yet
   → PARTIAL), while HyperEVM chain 999 → GoPlus code 2022 "not supported". */
type Cov = 'ok' | 'partial' | 'none'
interface CovRow { chain: string; label: string; rugcheck: Cov; goplus: Cov; gt: Cov }
const COVERAGE: CovRow[] = [
  { chain: 'sol',  label: 'Solana',    rugcheck: 'ok',   goplus: 'none',    gt: 'ok' },
  { chain: 'bnb',  label: 'BNB',       rugcheck: 'none', goplus: 'ok',      gt: 'ok' },
  { chain: 'base', label: 'Base',      rugcheck: 'none', goplus: 'ok',      gt: 'ok' },
  { chain: 'hype', label: 'HyperEVM',  rugcheck: 'none', goplus: 'none',    gt: 'ok' },
  { chain: 'hood', label: 'Robinhood', rugcheck: 'none', goplus: 'partial', gt: 'ok' },
]
const COV_LABEL: Record<Cov, string> = { ok: 'OK', partial: 'PARTIAL', none: 'NO COVERAGE' }
const COV_TIP: Record<Cov, string> = {
  ok: 'provider returned a populated, verbatim result for this chain',
  partial: 'provider serves this chain but returned no populated row for this token — empty is a fact, not an error',
  none: 'no free provider indexes this chain yet — the market signals below are still live',
}

function CovChip({ name, cov }: { name: string; cov: Cov }) {
  return (
    <span className={`v2-chip mono cov-${cov}`} title={`${name}: ${COV_TIP[cov]}`} data-cov={cov}>
      {name} · {COV_LABEL[cov]}
    </span>
  )
}

/* Layer 3 — universal market signals. Rendered on EVERY chain, even where the
   rug signal set is limited: the $0 market feed (same one the swap surface
   uses) always answers. FEE shows a dash because that feed does not expose the
   pool fee tier — a dash is the honest value, never a fabricated number. */
function SignalsPanel({ q }: { q: SwapQuote | null }) {
  const cells = [
    { l: 'PRICE', v: q?.priceUsd != null ? `$${q.priceUsd}` : '—' },
    { l: 'LIQUIDITY', v: q ? `$${fmtC(q.liq)}` : '—' },
    { l: 'DEX', v: q?.dexId ?? '—' },
    { l: 'VOLUME 24H', v: q?.vol24 != null ? `$${fmtC(q.vol24)}` : '—' },
    { l: 'AGE', v: q?.pairCreatedAt ? ageOf(q.pairCreatedAt) : '—' },
    { l: 'FEE', v: '—' },
  ]
  return (
    <div className="v2-grid3" data-testid="rug-signals">
      {cells.map((c) => <div key={c.l}><span className="l">{c.l}</span><b className="mono">{c.v}</b></div>)}
    </div>
  )
}

/* provider × chain matrix, rendered ON-PAGE (parity + honesty in one table) */
function MatrixTable() {
  return (
    <div style={{ overflowX: 'auto' }} data-testid="rug-matrix">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead><tr className="mono dim" style={{ textAlign: 'left' }}>
          <th style={{ padding: '4px 8px' }}>CHAIN</th>
          <th style={{ padding: '4px 8px' }}>RUGCHECK</th>
          <th style={{ padding: '4px 8px' }}>GOPLUS</th>
          <th style={{ padding: '4px 8px' }}>MARKET (GT)</th>
        </tr></thead>
        <tbody>
          {COVERAGE.map((r) => (
            <tr key={r.chain} style={{ borderTop: '1px solid var(--border-soft)' }}>
              <td style={{ padding: '5px 8px' }}><b className="mono">{r.chain.toUpperCase()}</b> <span className="dim">{r.label}</span></td>
              <td style={{ padding: '5px 8px' }}><CovChip name="RugCheck" cov={r.rugcheck} /></td>
              <td style={{ padding: '5px 8px' }}><CovChip name="GoPlus" cov={r.goplus} /></td>
              <td style={{ padding: '5px 8px' }}><CovChip name="GT" cov={r.gt} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ───────────────────────── RUG CHECK ───────────────────────── */
export function RugCheckPageMulti() {
  const [chip, setChip] = useState<Chip>('AUTO')
  const [addr, setAddr] = useState('')
  const [resolved, setResolved] = useState<{ chain: string; note: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [sol, setSol] = useState<Awaited<ReturnType<typeof solRug>> | null>(null)
  const [evm, setEvm] = useState<Awaited<ReturnType<typeof evmRug>> | null>(null)
  const [gt, setGt] = useState<SwapQuote | null>(null)
  const [cands, setCands] = useState<DetectCandidate[] | null>(null)

  async function solRug(mint: string) {
    const r = await fetch(`/api/v1/rug/sol/${encodeURIComponent(mint)}`)
    const j = await r.json()
    if (!r.ok) throw new Error(j.detail ?? `HTTP ${r.status}`)
    return j as { score: number | null; score_normalised: number | null; lp_locked_pct: number | null;
      risks: { name: string; level: string | null; score: number | null; description: string | null }[];
      provenance: { degraded: string | null; source: string } }
  }
  async function evmRug(chain: string, token: string) {
    const r = await fetch(`/api/v1/rug/evm/${chain}/${encodeURIComponent(token)}`)
    const j = await r.json()
    if (!r.ok) throw new Error(j.detail ?? `HTTP ${r.status}`)
    return j as { chain_id: number; token_symbol: string | null; rows: { field: string; value: string | number | null }[];
      provenance: { degraded: string | null; source: string } }
  }

  const run = async (chainOverride?: string) => {
    const q = addr.trim()
    setErr(null); setNotFound(false); setCands(null); setSol(null); setEvm(null); setGt(null); setResolved(null)
    if (!q) { setErr('paste a token address (CA) first'); return }
    const kind = classifyQuery(q)
    if (kind === 'invalid') { setErr('not a CA and not a $TICKER — 32-44 base58, 0x+40hex, or 1-24 chars'); return }
    setBusy(true)
    try {
      let chain = chainOverride ?? (chip === 'AUTO' ? null : CHAIN_OF[chip])
      let note: string | null = null
      if (!chain) {
        if (kind === 'base58') chain = 'sol'
        else if (kind === 'evm-ambiguous') {
          const det = await fetchDetect(q)
          const real = det.candidates
          if (real.length === 1) { chain = real[0].chain; note = `chain resolved by detect: ${real[0].chain?.toUpperCase()} (deepest pool ${shorten(real[0].pair_address ?? '')})` }
          else if (real.length > 1) { setCands(real); setBusy(false); return }
          else { setNotFound(true); setBusy(false); return }
        } else { setErr('ticker detected — use the token scanner for tickers; paste a CA here'); setBusy(false); return }
      } else if (kind === 'base58' && chain !== 'sol') {
        note = `address is solana-shaped (base58) but you picked ${LABEL_OF[chain]} — suggesting SOL; running ${LABEL_OF[chain]} anyway, provider answers honestly`
      } else if (kind === 'evm-ambiguous' && chain === 'sol') {
        note = 'address is 0x-shaped (EVM) but you picked Solana — suggesting BNB/BASE; running anyway, provider answers honestly'
      }
      setResolved({ chain, note })
      if (chain === 'sol') setSol(await solRug(q))
      else if (chain === 'bnb' || chain === 'base' || chain === 'hood') setEvm(await evmRug(chain, q))
      /* hype: no $0 rug provider indexes it (GoPlus chain 999 → code 2022) —
         never call rug/evm (a 400 would render as a red error). hood routes to
         GoPlus (chain 4663); an empty row there is PARTIAL, not an error. The
         universal signals panel below carries market stats on every chain. */
      const quote = await fetchSwapQuote(chain!, q)
      if (quote) setGt(quote)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'check failed')
    } finally { setBusy(false) }
  }

  /* verdict per provider set (documented mapping — context, not audit).
     Never null: hype has no provider, and GoPlus can return an empty row set
     for a token it serves — both render an honest nodata medallion, because a
     null verdict would hide the dial (empty ≠ hidden, empty ≠ red). */
  const verdict: RiskVerdict = useMemo(() => {
    if (sol) {
      const n = sol.score_normalised
      const level = n == null ? 'nodata' : n <= 10 ? 'low' : n <= 40 ? 'medium' : 'high'
      return rugVerdict(level, sol.score_normalised, 'RUGCHECK')
    }
    if (evm && evm.rows.length) {
      const f = Object.fromEntries(evm.rows.map((r) => [r.field, r.value]))
      const honeypot = f.is_honeypot === 1 || f.is_honeypot === '1'
      const openSrc = f.is_open_source === 1 || f.is_open_source === '1'
      const tax = Math.max(Number(f.buy_tax ?? 0) || 0, Number(f.sell_tax ?? 0) || 0)
      const level = honeypot || tax > 0.1 ? 'high' : !openSrc || (f.is_mintable === 1) || tax > 0 ? 'medium' : 'low'
      return rugVerdict(level, null, `GOPLUS ${honeypot ? '· HONEYPOT' : openSrc ? '' : '· closed-source'}${tax > 0 ? ` · tax ${Math.round(tax * 100)}%` : ''}`)
    }
    const limited = resolved?.chain === 'hype'
    return rugVerdict('nodata', null, limited
      ? 'HYPE · SIGNAL SET LIMITED'
      : 'NO SECURITY ROWS · MARKET SIGNALS ONLY')
  }, [sol, evm, resolved])

  return (
    <div className="ta-page">
      <PageHead title="Rug Check — multi-chain" sub="One check across the five live chains. Provider coverage is written per chain (matrix below) — partial coverage is stated, never hidden. Context, not an audit." />
      <Chips value={chip} onPick={(c) => { setChip(c); setErr(null) }} />
      <div className="ta-searchrow">
        <div className="ta-search" style={{ height: 40 }}>
          <span style={{ color: 'var(--dim)' }}>⛨</span>
          <input placeholder="paste token address (CA) — AUTO resolves the chain" value={addr}
            onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()}
            spellCheck={false} style={{ minWidth: 320 }} />
        </div>
        <button className="btn-analyze" disabled={busy} onClick={() => run()}>
          {busy ? 'CHECKING…' : 'RUN CHECK'}
        </button>
      </div>

      {cands && (
        <div className="v2-card">
          <b className="mono" style={{ fontSize: 11 }}>FOUND ON {cands.length} CHAINS — PICK ONE</b>
          <div className="v2-candrow">
            {cands.map((c) => (
              <button key={`${c.chain}-${c.token_address}`} type="button" className="v2-cand"
                onClick={() => { setChip((CHAIN_OF[c.chain] ?? 'AUTO') as Chip); run(c.chain) }}>
                <b>{c.symbol}</b><span className="mono">{(c.chain ?? '').toUpperCase()}</span>
                <span className="mono dim">{c.dex_id}</span>
                <span className="mono">{c.liquidity_usd != null ? `$${fmtC(c.liquidity_usd)}` : '—'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {resolved?.note && <div className="v2-note" role="status">{resolved.note}</div>}
      {err && <div className="v2-note err" role="alert">{err}</div>}
      {notFound && (
        <div className="v2-note" role="status" data-testid="rug-notfound">
          No pool found for this address on any of the five live feeds — there is nothing to check and nothing was invented.{' '}
          Try the <a href="#/scanner" className="mono">token scanner</a> for a ticker search, or double-check the address.
        </div>
      )}

      {/* R3 PB-4 — skeleton shimmer per block while the provider fetch runs
         (resolved lands synchronously for direct chains, so the shimmer keys
         on the payload; hype has no provider call and is excluded) */}
      {busy && !sol && !evm && resolved?.chain !== 'hype' && (
        <div className="v2-card" data-testid="rug-loading" style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <Skeleton h={26} w={140} /><Skeleton h={26} w={120} /><Skeleton h={26} w={120} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={54} />)}
          </div>
          <Skeleton h={180} />
        </div>
      )}

      {/* R1 three-layer result — NEVER red. Layer 1 chain · Layer 2 provider
          chips (OK/PARTIAL/NO COVERAGE) · Layer 3 universal market signals
          (always shown). Empty ≠ red: a provider with no row is PARTIAL. */}
      {resolved && (
        <div className="v2-card pb-acc" data-testid="rug-result" style={accentStyle(resolved.chain as LiveChain)}>
          <div className="v2-cardhead">
            <b>CHAIN · {LABEL_OF[resolved.chain].toUpperCase()}</b>
            <span className="v2-candrow" data-testid="rug-provider-chips">
              <CovChip name="RugCheck" cov={resolved.chain === 'sol' ? (sol ? 'ok' : 'partial') : 'none'} />
              <CovChip name="GoPlus" cov={
                resolved.chain === 'hype' || resolved.chain === 'sol' ? 'none'
                  : evm ? (evm.rows.length ? 'ok' : 'partial') : 'partial'} />
              <CovChip name="GT" cov="ok" />
            </span>
          </div>
          <SignalsPanel q={gt} />
          <div className="v2-cardhead" style={{ marginTop: 12 }}>
            <b>VERDICT — {evm?.token_symbol ?? (resolved.chain === 'sol' ? 'SOL' : resolved.chain.toUpperCase())}</b>
            {resolved.chain === 'hype' && <RiskBadge level="nodata" label="SIGNAL SET LIMITED" />}
            <span className="mono dim">context not audit</span>
          </div>
          <RiskDisplay verdict={{ ...verdict, rows: sol?.risks ?? evm?.rows.map((r) => ({
            name: r.field, level: null, score: r.value, description: null })) ?? [] }}
            seed={`rug:${resolved.chain}:${addr.trim()}`} />
          {sol && (
            <p className="dim" style={{ fontSize: 10.5 }}>
              LP locked {sol.lp_locked_pct != null ? `${Number(sol.lp_locked_pct).toFixed(1)}%` : '—'} · provider: RugCheck.xyz (server-proxied)
            </p>
          )}
          {evm && evm.rows.length > 0 && (
            <p className="dim" style={{ fontSize: 10.5 }}>
              provider: GoPlus chain_id {evm.chain_id} — every row is the verbatim provider value (0/1 or string)
            </p>
          )}
          {evm && evm.rows.length === 0 && (
            <p className="dim" style={{ fontSize: 10.5 }}>
              GoPlus serves this chain but returned no security row for this token — empty is a fact, not an error. Market signals above are live.
            </p>
          )}
        </div>
      )}

      {/* provider × chain coverage matrix — always rendered ON-PAGE (parity +
          honesty in one table, probed 2026-08-31) */}
      <div className="v2-card">
        <div className="v2-cardhead"><b>PROVIDER × CHAIN COVERAGE</b><span className="mono dim">probed 2026-08-31</span></div>
        <MatrixTable />
      </div>

      {!resolved && !err && !notFound && !busy && !cands && (
        <div className="v2-card">
          <div className="v2-empty">
            <MiniShield />
            <div>
              <b className="mono" style={{ fontSize: 11, letterSpacing: '.1em' }}>ONE CHECK ACROSS FIVE CHAINS</b>
              <p className="dim" style={{ fontSize: 12 }}>
                Paste a token address — AUTO resolves the chain. The coverage matrix above shows exactly which provider answers where; partial coverage is stated, never hidden, and market signals load on every chain. Context, not an audit.
              </p>
              <b className="mono" style={{ fontSize: 10, letterSpacing: '.1em' }}>TRY A REAL ONE</b>
              <div className="v2-candrow">
                {EXAMPLES.map((ex) => (
                  <button key={ex.ca} type="button" className="v2-cand"
                    onClick={() => { setAddr(ex.ca); setChip(ex.chain as Chip); run(CHAIN_OF[ex.chain]) }}>
                    <b>{ex.label}</b><span className="mono dim">{shorten(ex.ca)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────── WHALE TRACKER (PROMPT-V3 R2) ───────────────────────── */
const WINDOWS = ['1h', '6h', '24h'] as const
type Win = (typeof WINDOWS)[number]
const WIN_MS: Record<Win, number> = { '1h': 3.6e6, '6h': 2.16e7, '24h': 8.64e7 }
const SPARK_BUCKETS = 24

interface MergedRow { chain: string; wallet: string; kind: string; ts: string | null; usd: number; tx: string | null }

/* filled net-flow sparkline — buckets are computed from the SAME whale tape
   shown in the table; positive area above the zero line, negative below.
   M1: `hist` (server volume_hist.buckets, hourly all-trade volume over 24h)
   renders as muted bars BEHIND the whale line — a quiet whale window still
   shows the living tape; bars scale to their own max, capped under the line. */
function NetSpark({ buckets, hist }: { buckets: number[]; hist?: number[] | null }) {
  const width = 600
  const height = 96
  const max = Math.max(...buckets.map((b) => Math.abs(b)), 1)
  const mid = height / 2
  const step = width / Math.max(buckets.length - 1, 1)
  const y = (v: number) => mid - (v / max) * (mid - 6)
  const pts = buckets.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`)
  const line = `M${pts.join(' L')}`
  const area = `${line} L${width},${mid} L0,${mid} Z`
  const net = buckets.reduce((a, b) => a + b, 0)
  const color = net >= 0 ? 'var(--sev-low)' : 'var(--sev-high)'
  const hmax = hist && hist.length ? Math.max(...hist, 1) : 1
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="v2-spark" role="img"
      aria-label="net whale flow sparkline" preserveAspectRatio="none" data-testid="whale-spark">
      {hist && hist.length > 0 && (
        <g data-testid="whale-spark-hist">
          {hist.map((v, i) => {
            const bw = width / hist.length
            const bh = (v / hmax) * (height - 18)
            return <rect key={i} x={(i * bw + 1).toFixed(1)} y={(height - bh).toFixed(1)}
              width={Math.max(bw - 2, 1).toFixed(1)} height={bh.toFixed(1)} className="whale-hist" />
          })}
        </g>
      )}
      <line x1="0" y1={mid} x2={width} y2={mid} stroke="var(--border-soft)" strokeWidth="1" />
      <path d={area} fill={color} opacity="0.28" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  )
}

/* M1: deterministic seeding field — bars are seeded from the CA (never
   Math.random, never fake trades), so the same CA renders the same field. */
function seedRng(key: string): () => number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) }
  return () => {
    h = Math.imul(h ^ (h >>> 15), h | 1)
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61)
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296
  }
}

export function WhalePageMulti() {
  const [chip, setChip] = useState<Chip>('AUTO')
  const [token, setToken] = useState('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263')
  const [tf, setTf] = useState<Win>('24h')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [per, setPer] = useState<{ chain: string; res: WhaleWindowsResult }[]>([])
  const [auto, setAuto] = useState<WhaleAutoResult | null>(null)
  const [scanTs, setScanTs] = useState(0)
  /* M1: ONE aggregate 429 banner — dismissed/collapsed state + countdown */
  const [rlDismissed, setRlDismissed] = useState(false)
  const [rlOpen, setRlOpen] = useState(false)
  const [rlLeft, setRlLeft] = useState(0)

  /* AUTO = server resolves the CA across networks (deepest pool per chain) +
     trending top-N; a chip narrows to one chain. Every miss is a sentence. */
  const run = async () => {
    const tok = token.trim()
    if (!tok) { setErr('paste a token address (CA) first'); return }
    setBusy(true); setErr(null); setPer([]); setAuto(null); setScanTs(Date.now())
    setRlDismissed(false); setRlOpen(false)
    try {
      if (chip === 'AUTO') {
        const a = await api.whaleAuto(tok)
        setAuto(a)
        setPer(a.results.map((r) => ({ chain: r.chain, res: r })))
        if ((a.rate_limited ?? []).length) setRlLeft(a.retry_after_s ?? 60)
      } else {
        const r = await api.whaleWindows(CHAIN_OF[chip], tok)
        setPer([{ chain: r.chain, res: r }])
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'whale scan failed')
    } finally { setBusy(false) }
  }

  const livePer = per.filter((p) => p.res.data_mode === 'live')

  /* M1: the genuine-429 aggregate — one banner, one countdown, dismissible.
     rate_limited entries are chain keys or "search" (the AUTO pool search
     itself); the related data_sources sentences live inside the collapse. */
  const rl = auto?.rate_limited ?? []
  const isRlNote = (s: string) => s.includes('rate_limited') || s.includes('rate-limited')
  const otherNotes = (auto?.data_sources ?? []).filter((s) => !isRlNote(s))
  const rlNotes = (auto?.data_sources ?? []).filter(isRlNote)
  const rlActive = rl.length > 0 && rlLeft > 0
  useEffect(() => {
    if (!rlActive) return
    const id = window.setInterval(() => setRlLeft((s) => Math.max(0, s - 1)), 1000)
    return () => window.clearInterval(id)
  }, [rlActive])

  /* the merged whale tape — verbatim rows from every live chain, ts desc */
  const merged: MergedRow[] = useMemo(() => per.filter((p) => p.res.data_mode === 'live')
    .flatMap((p) => (p.res.tape ?? []).map((t) => ({
      chain: p.chain, wallet: t.wallet ?? '?', kind: t.kind ?? '?',
      ts: t.ts, usd: t.usd ?? 0, tx: t.tx,
    }))).sort((a, b) => Date.parse(b.ts ?? '') - Date.parse(a.ts ?? '')), [per])

  /* sparkline buckets: the window split into SPARK_BUCKETS equal slices, net
     per slice — same tape as the table, never a second source */
  const sparkBuckets = useMemo(() => {
    const out = new Array<number>(SPARK_BUCKETS).fill(0)
    const span = WIN_MS[tf]
    const cutoff = scanTs - span          // scanTs=0 pre-scan → tape empty anyway
    for (const r of merged) {
      const t = Date.parse(r.ts ?? '')
      if (!Number.isFinite(t) || t < cutoff) continue
      const i = Math.min(SPARK_BUCKETS - 1, Math.floor(((t - cutoff) / span) * SPARK_BUCKETS))
      out[i] += r.kind === 'buy' ? r.usd : -r.usd
    }
    return out
  }, [merged, tf, scanTs])

  /* M1: muted histogram behind the whale line — the SERVER's hourly all-trade
     buckets summed across live chains. Only the 24h window is bucket-aligned
     (24 hourly buckets ↔ 24 spark slices); shorter windows skip it honestly. */
  const hist24 = useMemo(() => {
    if (tf !== '24h') return null
    const out = new Array<number>(SPARK_BUCKETS).fill(0)
    let any = false
    for (const p of per) {
      if (p.res.data_mode !== 'live') continue
      const b = p.res.volume_hist?.buckets
      if (!b || b.length !== SPARK_BUCKETS) continue
      any = true
      for (let i = 0; i < SPARK_BUCKETS; i++) out[i] += b[i] ?? 0
    }
    return any ? out : null
  }, [per, tf])

  /* M1: "walked N trades · M pools" — the tape-walk depth, verbatim counters */
  const tradesSeen = livePer.reduce((a, p) => a + (p.res.tape_trades_seen ?? 0), 0)
  const poolsWalked = chip === 'AUTO'
    ? (auto?.pools_walked ?? livePer.length)
    : livePer.reduce((a, p) => a + (p.res.pools_walked ?? 0), 0)

  /* M1: TOP TAPE — largest trades UNDER the whale line, ranked by size.
     Verbatim server rows (top_below_threshold), merged across live chains. */
  const belowRows: MergedRow[] = useMemo(() => per.filter((p) => p.res.data_mode === 'live')
    .flatMap((p) => (p.res.top_below_threshold ?? []).map((t) => ({
      chain: p.chain, wallet: t.wallet ?? '?', kind: t.kind ?? '?',
      ts: t.ts, usd: t.usd ?? 0, tx: t.tx,
    }))).sort((a, b) => b.usd - a.usd), [per])

  /* M1: AWAITING WHALES seeding field — deterministic bars from the CA */
  const fieldBars = useMemo(() => {
    const rng = seedRng(`await:${token.trim()}`)
    return Array.from({ length: SPARK_BUCKETS }, () => 12 + Math.round(rng() * 58))
  }, [token])

  const totalNet = livePer.reduce((a, p) => a + (p.res.windows?.[tf]?.net_usd ?? 0), 0)

  /* per-chain bars from the SERVER's window math (parity: the bar shows what
     the payload says, nothing re-derived client-side) */
  const chainBars = per.map((p) => {
    const live = p.res.data_mode === 'live'
    const net = live ? (p.res.windows?.[tf]?.net_usd ?? 0) : 0
    return { chain: p.chain, live, net, reason: live ? null : (p.res.data_sources[0] ?? 'declared null') }
  })
  const maxAbs = Math.max(...chainBars.map((b) => Math.abs(b.net)), 1)

  /* window aggregate (1h/6h/24h) across live chains */
  const winAgg = WINDOWS.map((w) => {
    let trades = 0; let whales = 0; let buy = 0; let sell = 0
    for (const p of livePer) {
      const s = p.res.windows?.[w]
      if (!s) continue
      trades += s.trades; whales += s.whale_trades; buy += s.buy_usd; sell += s.sell_usd
    }
    return { w, trades, whales, buy, sell, net: buy - sell }
  })

  const csv = () => {
    const poolOf: Record<string, string> = Object.fromEntries(livePer.map((p) => [p.chain, p.res.pool ?? '']))
    const head = 'chain,pool,wallet,kind,usd,ts,tx'
    const lines = merged.map((r) =>
      [r.chain, poolOf[r.chain] ?? '', r.wallet, r.kind, r.usd, r.ts ?? '', r.tx ?? ''].join(','))
    const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `vilmei-whale-tape-${tf}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const verdict: RiskVerdict = {
    level: 'nodata',
    score: null,
    label: `NET ${totalNet >= 0 ? '+' : '−'}$${fmtC(Math.abs(totalNet))} ${tf.toUpperCase()} (HEURISTIC TAPE)`,
    rows: merged.slice(0, 12).map((r) => ({
      name: `${shorten(r.wallet)} · ${r.chain.toUpperCase()}`,
      level: r.kind === 'buy' ? 'buy' : 'sell',
      score: r.usd, description: null,
    })),
    provenance: per.length ? { chains: per.map((p) => p.chain), data_mode: per.map((p) => p.res.data_mode) } : undefined,
  }

  /* seeding = live chain(s) but zero whale rows in the walked tape — data,
     not absence; a chip says so instead of fake zeros */
  const quietChains = livePer.filter((p) => !(p.res.tape ?? []).length)

  return (
    <div className="ta-page">
      <PageHead title="Whale Tracker — multi-chain" sub="One CA across the five chains on the keyless GeckoTerminal trade tape. AUTO resolves the deepest pool per network and adds trending candidates. A quiet tape is data, never an error." />
      <div className="ta-searchrow">
        <Chips value={chip} onPick={(c) => { setChip(c); setPer([]); setAuto(null); setErr(null) }} />
      </div>
      <div className="ta-searchrow">
        <div className="ta-search" style={{ height: 40 }}>
          <span style={{ color: 'var(--dim)' }}>◍</span>
          <input value={token} onChange={(e) => setToken(e.target.value)} spellCheck={false}
            placeholder="token address (CA)" style={{ minWidth: 320 }}
            onKeyDown={(e) => e.key === 'Enter' && run()} />
        </div>
        <button className="btn-analyze" disabled={busy} onClick={run}>{busy ? 'SCANNING…' : 'SCAN WHALES'}</button>
      </div>
      {/* mandatory honesty copy — the label is a heuristic, never an on-chain fact */}
      <p className="dim" style={{ fontSize: 11, margin: '4px 0 0' }} data-testid="whale-mandate">
        whale = heuristic on trade tape (≥$50K/$30K), not an on-chain label
      </p>

      {err && <div className="v2-note err" role="alert">{err}</div>}
      {/* M1: genuine GT 429s aggregate into ONE banner — count, countdown,
          which-chains collapse, dismiss; never stacked yellow rows */}
      {rl.length > 0 && !rlDismissed && (
        <div className="v2-note rl" role="status" data-testid="whale-rl-banner">
          <span>
            ⏳ {rl.length === 1 ? '1 chain' : `${rl.length} chains`} skipped (rate-limited by GeckoTerminal) ·{' '}
            <b className="mono">{rlLeft > 0 ? `retry in ${rlLeft}s` : 'ready to retry'}</b>
          </span>
          <span className="rl-btns">
            <button type="button" className="v2-chip mono" onClick={() => setRlOpen((o) => !o)}
              aria-expanded={rlOpen} data-testid="whale-rl-which">{rlOpen ? 'HIDE' : 'WHICH?'}</button>
            <button type="button" className="v2-chip mono" onClick={() => setRlDismissed(true)}
              aria-label="dismiss rate-limit banner" data-testid="whale-rl-dismiss">✕</button>
          </span>
          {rlOpen && (
            <div className="rl-detail mono" data-testid="whale-rl-detail">
              <span className="v2-candrow">
                {rl.map((c) => (
                  <span key={c} className="v2-chip mono cov-partial" style={{ cursor: 'default' }}>
                    {c === 'search' ? 'AUTO SEARCH' : c.toUpperCase()}
                  </span>
                ))}
              </span>
              {rlNotes.map((s) => <div key={s} className="dim">{s}</div>)}
            </div>
          )}
        </div>
      )}
      {otherNotes.map((s) => <div key={s} className="v2-note" role="status">{s}</div>)}

      {/* R3 PB-4 — skeleton shimmer while the tape walk is in flight */}
      {busy && per.length === 0 && (
        <div className="v2-card" data-testid="whale-loading" style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <Skeleton h={26} w={160} /><Skeleton h={26} w={64} /><Skeleton h={26} w={64} /><Skeleton h={26} w={64} />
          </div>
          <Skeleton h={96} />
          <Skeleton h={74} />
          <Skeleton h={140} />
        </div>
      )}

      {per.length > 0 && (
        <>
          {/* threshold provenance — the server's sentence per chain */}
          <div className="v2-candrow" data-testid="whale-thresholds">
            {livePer.map((p) => (
              <span key={p.chain} className="v2-chip mono" title={p.res.threshold_note ?? ''} style={{ cursor: 'default' }}>
                {p.chain.toUpperCase()} ≥ {p.res.threshold_usd != null ? `$${fmtC(p.res.threshold_usd)}` : '—'} · heuristic
              </span>
            ))}
            {quietChains.map((p) => (
              <span key={`${p.chain}-seed`} className="v2-chip mono cov-partial" title={p.res.data_sources.join(' · ')} style={{ cursor: 'default' }}>
                {p.chain.toUpperCase()} · SEEDING — quiet tape, no whale trades in the walked window
              </span>
            ))}
          </div>

          {/* per-chain misses stay visible even when other chains have a live
              tape — every miss is a sentence, never hidden behind the bars */}
          {livePer.length > 0 && per.filter((p) => p.res.data_mode !== 'live').map((p) => (
            <div key={p.chain} className="v2-note" role="status">
              <span className="ta-chain-tag">{p.chain.toUpperCase()}</span> {p.res.data_sources[0] ?? 'declared null'}
            </div>
          ))}

          <div className="v2-card pb-acc" style={per[0] ? accentStyle(per[0].chain as LiveChain) : undefined}>
            <div className="v2-cardhead">
              <b>NET-WHALE-FLOW — {chip === 'AUTO' ? 'ALL CHAINS' : chip} · {tf}</b>
              <span className="v2-chip mono dim" style={{ cursor: 'default' }} data-testid="whale-walked"
                title="depth of the GeckoTerminal tape walk (server counters, verbatim)">
                walked {tradesSeen} trades · {poolsWalked} pool{poolsWalked === 1 ? '' : 's'}
              </span>
              <div className="v2-tfs" role="tablist" aria-label="window">
                {WINDOWS.map((w) => (
                  <button key={w} type="button" role="tab" aria-selected={tf === w}
                    className={`v2-chip mono${tf === w ? ' on' : ''}`} onClick={() => setTf(w)}>{w}</button>
                ))}
              </div>
              <button type="button" className="v2-csv mono" onClick={csv} data-testid="whale-csv">CSV ⭳</button>
            </div>
            <NetSpark buckets={sparkBuckets} hist={hist24} />
            {/* per-chain bars — payload window math, verbatim */}
            <div className="v2-flowbar" role="img" aria-label={`net whale flow per chain ${tf}`}>
              {chainBars.map((b) => (
                <i key={b.chain} title={`${b.chain.toUpperCase()}: ${b.live ? `net ${b.net >= 0 ? '+' : '-'}$${fmtC(Math.abs(b.net))}` : b.reason}`}
                  style={{
                    height: `${b.live ? Math.min(100, Math.max(4, (Math.abs(b.net) / maxAbs) * 100)) : 4}%`,
                    background: !b.live ? 'var(--sev-nodata)' : b.net >= 0 ? 'var(--sev-low)' : 'var(--sev-high)',
                    opacity: b.live ? 1 : 0.35,
                  }} />
              ))}
            </div>
            <div className="v2-candrow">
              {chainBars.map((b) => (
                <span key={b.chain} className="v2-chip mono" style={{ cursor: 'default' }}>
                  {b.chain.toUpperCase()} {b.live ? `${b.net >= 0 ? '+' : '−'}$${fmtC(Math.abs(b.net))}` : '· no pool / no tape (declared)'}
                </span>
              ))}
            </div>
            {/* windows aggregate across live chains */}
            <div style={{ overflowX: 'auto', marginTop: 8 }} data-testid="whale-windows">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr className="mono dim" style={{ textAlign: 'left' }}>
                  <th style={{ padding: '4px 8px' }}>WINDOW</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>TRADES</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>WHALES</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>BUYS</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>SELLS</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>NET</th></tr></thead>
                <tbody>
                  {winAgg.map((r) => (
                    <tr key={r.w} style={{ borderTop: '1px solid var(--border-soft)' }}>
                      <td style={{ padding: '5px 8px' }} className="mono">{r.w}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }} className="mono">{r.trades}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }} className="mono">{r.whales}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }} className="mono">${fmtC(r.buy)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }} className="mono">${fmtC(r.sell)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }} className="mono">
                        {r.net >= 0 ? '+' : '−'}${fmtC(Math.abs(r.net))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <RiskDisplay verdict={verdict} seed={`whale2:${per.map((p) => p.chain).join('+')}:${token.trim()}`} />
          </div>

          {/* AUTO extras: where the CA was found + trending top-N candidates */}
          {auto && (auto.candidates.length > 0 || auto.trending.length > 0) && (
            <div className="v2-card" data-testid="whale-auto-cards">
              {auto.candidates.length > 0 && (
                <>
                  <div className="v2-cardhead"><b>FOUND ON — DEEPEST POOL PER CHAIN</b><span className="mono dim">GT pool search</span></div>
                  <div className="v2-candrow">
                    {auto.candidates.map((c) => (
                      <span key={`${c.chain}-${c.pool}`} className="v2-chip mono" style={{ cursor: 'default' }}
                        title={`${c.network} pool ${c.pool}${c.volume_24h != null ? ` · vol24 $${fmtC(c.volume_24h)}` : ''}`}>
                        {c.chain.toUpperCase()} · {c.name ?? shorten(c.pool)} {c.liquidity_usd != null ? `· liq $${fmtC(c.liquidity_usd)}` : ''}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {auto.trending.length > 0 && (
                <>
                  <div className="v2-cardhead" style={{ marginTop: 10 }}><b>TRENDING CANDIDATES — TOP-N</b><span className="mono dim">one per chain, cached</span></div>
                  <div className="v2-candrow">
                    {auto.trending.map((t) => (
                      <span key={`${t.chain}-${t.pool}`} className="v2-chip mono" style={{ cursor: 'default' }}
                        title={`${t.network} pool ${t.pool}`}>
                        <span className="ta-chain-tag">{t.chain.toUpperCase()}</span> {t.name ?? shorten(t.pool)}
                        {t.liquidity_usd != null ? ` · $${fmtC(t.liquidity_usd)}` : ''}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* merged whale tape — chain chip per row */}
          {merged.length > 0 && (
            <div className="v2-card">
              <div className="v2-cardhead"><b>MERGED TAPE — {merged.length} WHALE TRADES ≥ THRESHOLD (24H WALK)</b></div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead><tr className="mono dim" style={{ textAlign: 'left' }}>
                    <th style={{ padding: '4px 8px' }}>CHAIN</th><th style={{ padding: '4px 8px' }}>WALLET</th>
                    <th style={{ padding: '4px 8px' }}>SIDE</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>USD</th>
                    <th style={{ padding: '4px 8px' }}>AGE</th><th style={{ padding: '4px 8px' }}>TX</th></tr></thead>
                  <tbody>
                    {merged.slice(0, 30).map((r, i) => (
                      <tr key={`${r.chain}-${r.tx ?? i}`} style={{ borderTop: '1px solid var(--border-soft)' }}>
                        <td style={{ padding: '5px 8px' }}><span className="ta-chain-tag">{r.chain.toUpperCase()}</span></td>
                        <td style={{ padding: '5px 8px' }} className="mono">{shorten(r.wallet)}</td>
                        <td style={{ padding: '5px 8px' }} className="mono">{r.kind.toUpperCase()}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }} className="mono">${fmtC(r.usd)}</td>
                        <td style={{ padding: '5px 8px' }} className="mono dim">{r.ts ? ageOf(Date.parse(r.ts)) : '—'}</td>
                        <td style={{ padding: '5px 8px' }} className="mono dim">{r.tx ? shorten(r.tx) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* honest misses — no pool / no tape, reasons verbatim, never red */}
          {livePer.length === 0 && (
            <div className="v2-card">
              <div className="v2-cardhead"><b>NO LIVE WHALE TAPE FOR THIS CA</b><RiskBadge level="nodata" label="DECLARED NULL" /></div>
              {per.map((p) => (
                <p key={p.chain} className="dim" style={{ fontSize: 11.5 }}>
                  <span className="ta-chain-tag">{p.chain.toUpperCase()}</span> <b className="mono">{LABEL_OF[p.chain] ?? p.chain}</b> — {p.res.data_sources[0] ?? 'declared null'}
                </p>
              ))}
            </div>
          )}
          {livePer.length > 0 && merged.length === 0 && (
            <>
              {/* M1 seeding state — silence is a state, not a void. The bars are
                  seeded from the CA (deterministic, never random-null, never
                  fake trades); the watermark says what the tape says. */}
              <div className="v2-card whale-field pb-acc" data-testid="whale-awaiting"
                style={accentStyle(per[0].chain as LiveChain)}>
                <div className="whale-field-stage">
                  <div className="whale-field-bars" aria-hidden="true">
                    {fieldBars.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}
                  </div>
                  <div className="whale-field-mark mono" data-testid="whale-awaiting-mark">AWAITING WHALES</div>
                </div>
                <p className="dim" style={{ fontSize: 11, margin: 0 }} data-testid="whale-quiet">
                  Live tape, zero trades ≥ threshold in the walked window — a quiet tape is data,
                  not absence. The field above is seeded from this CA (deterministic, not noise);
                  windows fill as trades cross the line. Nothing is backfilled.
                </p>
              </div>

              {/* M1 TOP TAPE — the page never stares at an empty floor: the
                  largest trades UNDER the whale line, ranked by size */}
              {belowRows.length > 0 && (
                <div className="v2-card" data-testid="whale-top-tape">
                  <div className="v2-cardhead">
                    <b>TOP TAPE — UNDER THRESHOLD</b>
                    <span className="v2-chip mono cov-partial" style={{ cursor: 'default' }}>
                      below whale threshold — ranked by size
                    </span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead><tr className="mono dim" style={{ textAlign: 'left' }}>
                        <th style={{ padding: '4px 8px' }}>CHAIN</th><th style={{ padding: '4px 8px' }}>WALLET</th>
                        <th style={{ padding: '4px 8px' }}>SIDE</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>USD</th>
                        <th style={{ padding: '4px 8px' }}>AGE</th><th style={{ padding: '4px 8px' }}>TX</th></tr></thead>
                      <tbody>
                        {belowRows.map((r, i) => (
                          <tr key={`${r.chain}-${r.tx ?? i}`} style={{ borderTop: '1px solid var(--border-soft)' }}>
                            <td style={{ padding: '5px 8px' }}><span className="ta-chain-tag">{r.chain.toUpperCase()}</span></td>
                            <td style={{ padding: '5px 8px' }} className="mono">{shorten(r.wallet)}</td>
                            <td style={{ padding: '5px 8px' }} className="mono">{r.kind.toUpperCase()}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right' }} className="mono">${fmtC(r.usd)}</td>
                            <td style={{ padding: '5px 8px' }} className="mono dim">{r.ts ? ageOf(Date.parse(r.ts)) : '—'}</td>
                            <td style={{ padding: '5px 8px' }} className="mono dim">{r.tx ? shorten(r.tx) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {per.length === 0 && !err && !busy && (
        <div className="v2-card">
          <p className="dim" style={{ fontSize: 12 }}>
            AUTO resolves one CA across all five chains via GT pool search (deepest pool per
            chain) and adds trending top-N candidates; a chip narrows to one chain. Windows are
            1h/6h/24h over the walked tape; net = Σ whale buys − Σ whale sells. Thresholds are
            labelled heuristics — the chip tooltip carries the server's derivation sentence.
          </p>
        </div>
      )}
    </div>
  )
}

function MiniShield() {
  return (
    <svg width="84" height="96" viewBox="0 0 84 96" aria-hidden="true" className="v2-shield">
      <defs>
        <linearGradient id="vshield" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(72% 0.14 155)" />
          <stop offset="1" stopColor="oklch(40% 0.09 165)" />
        </linearGradient>
      </defs>
      <path d="M42 4 L78 16 V48 C78 70 62 86 42 92 C22 86 6 70 6 48 V16 Z"
        fill="url(#vshield)" stroke="oklch(85% 0.1 160 / .8)" strokeWidth="1.5" />
      <path d="M42 14 L68 23 V48 C68 64 57 76 42 82 Z" fill="oklch(20% 0.03 160 / .85)" />
      <text x="42" y="54" textAnchor="middle" fontFamily="monospace" fontSize="11"
        fill="oklch(90% 0.06 160)">VLM</text>
    </svg>
  )
}

function fmtC(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}
