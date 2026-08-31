/* PROMPT-V2 P3+P4 (2026-08-31): multi-chain Rug Check + Whale Tracker.
   RUG: chips AUTO·SOL·BNB·BASE·HYPE·HOOD; AUTO = local classify + /api/v1/detect
   (never a silent default); sol → RugCheck summary (server-proxied), bnb/base →
   GoPlus rows (server-proxied), hype/hood → honest "signal set limited" + live
   GT/DS stats (never a blank red error). Verdict renders through RiskDisplay
   (one severity language for every module).
   WHALE: per-chain thresholds are a LABELED heuristic (SOL 50K / EVM 30K,
   formula in tooltip), tape-window aggregation with timeframe chips, CSV
   export, seeding banner when windows are shorter than 24h. */
import { useMemo, useState } from 'react'
import { classifyQuery, fetchDetect } from '../lib/detect'
import type { DetectCandidate } from '../lib/detect'
import { fetchSwapQuote } from '../services/dexscreener'
import type { SwapQuote } from '../services/dexscreener'
import { RiskBadge, RiskDisplay } from '../components/RiskDisplay'
import type { RiskVerdict } from '../components/RiskDisplay'
import { api } from '../api'
import type { WhalesResult } from '../api'
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

/* ───────────────────────── RUG CHECK ───────────────────────── */
export function RugCheckPageMulti() {
  const [chip, setChip] = useState<Chip>('AUTO')
  const [addr, setAddr] = useState('')
  const [resolved, setResolved] = useState<{ chain: string; note: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
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
    setErr(null); setCands(null); setSol(null); setEvm(null); setGt(null); setResolved(null)
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
          else { setErr('Not found on the five live feeds — nothing to check, nothing invented.'); setBusy(false); return }
        } else { setErr('ticker detected — use the token scanner for tickers; paste a CA here'); setBusy(false); return }
      } else if (kind === 'base58' && chain !== 'sol') {
        note = `address is solana-shaped (base58) but you picked ${LABEL_OF[chain]} — suggesting SOL; running ${LABEL_OF[chain]} anyway, provider answers honestly`
      } else if (kind === 'evm-ambiguous' && chain === 'sol') {
        note = 'address is 0x-shaped (EVM) but you picked Solana — suggesting BNB/BASE; running anyway, provider answers honestly'
      }
      setResolved({ chain, note })
      if (chain === 'sol') setSol(await solRug(q))
      else if (chain === 'bnb' || chain === 'base') setEvm(await evmRug(chain, q))
      /* hype/hood: no $0 rug provider indexes them — never call rug/evm (a
         400 would render as a red error); the honest limited panel below
         carries the GT/DS market stats instead. */
      const quote = await fetchSwapQuote(chain!, q)
      if (quote) setGt(quote)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'check failed')
    } finally { setBusy(false) }
  }

  /* verdict per provider set (documented mapping — context, not audit) */
  const verdict: RiskVerdict | null = useMemo(() => {
    if (sol) {
      const n = sol.score_normalised
      const level = n == null ? 'nodata' : n <= 10 ? 'low' : n <= 40 ? 'medium' : 'high'
      return rugVerdict(level, sol.score_normalised, `RUGCHECK ${sol.score_normalised != null ? `· risk ${sol.score_normalised}/100` : ''}`)
    }
    if (evm) {
      const f = Object.fromEntries(evm.rows.map((r) => [r.field, r.value]))
      const honeypot = f.is_honeypot === 1 || f.is_honeypot === '1'
      const openSrc = f.is_open_source === 1 || f.is_open_source === '1'
      const tax = Math.max(Number(f.buy_tax ?? 0) || 0, Number(f.sell_tax ?? 0) || 0)
      const level = honeypot || tax > 0.1 ? 'high' : !openSrc || (f.is_mintable === 1) || tax > 0 ? 'medium' : 'low'
      return rugVerdict(level, null, `GOPLUS ${honeypot ? '· HONEYPOT' : openSrc ? '' : '· closed-source'}${tax > 0 ? ` · tax ${Math.round(tax * 100)}%` : ''}`)
    }
    return null
  }, [sol, evm])

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

      {/* honest limited panel — hype/hood: no $0 rug provider; GT/DS stats stay */}
      {resolved && (resolved.chain === 'hype' || resolved.chain === 'hood') && (
        <div className="v2-card">
          <div className="v2-cardhead">
            <b>RUG FLAGS — {LABEL_OF[resolved.chain].toUpperCase()}</b>
            <RiskBadge level="nodata" label="SIGNAL SET LIMITED" />
          </div>
          <p className="dim" style={{ fontSize: 11.5 }}>
            signal set limited: free coverage does not index this chain yet — indexed source on roadmap.
          </p>
          <div className="v2-grid3">
            <div><span className="l">PRICE</span><b className="mono">{gt?.priceUsd != null ? `$${gt.priceUsd}` : '—'}</b></div>
            <div><span className="l">LIQUIDITY</span><b className="mono">{gt ? `$${fmtC(gt.liq)}` : '—'}</b></div>
            <div><span className="l">DEX</span><b className="mono">{gt?.dexId ?? '—'}</b></div>
          </div>
          <p className="dim" style={{ fontSize: 10.5 }}>liquidity/volume/age come from the same $0 feed as the swap surface — the rug signal set is the honest empty part.</p>
        </div>
      )}

      {verdict && (
        <div className="v2-card">
          <div className="v2-cardhead">
            <b>VERDICT — {evm?.token_symbol ?? 'SOL'} · {(resolved?.chain ?? '').toUpperCase()}</b>
            <span className="mono dim">context not audit</span>
          </div>
          <RiskDisplay verdict={{ ...verdict, rows: sol?.risks ?? evm?.rows.map((r) => ({
            name: r.field, level: null, score: r.value, description: null })) ?? [] }} />
          {sol && (
            <p className="dim" style={{ fontSize: 10.5 }}>
              LP locked {sol.lp_locked_pct != null ? `${Number(sol.lp_locked_pct).toFixed(1)}%` : '—'} · provider: RugCheck.xyz (server-proxied)
            </p>
          )}
          {evm && (
            <p className="dim" style={{ fontSize: 10.5 }}>
              provider: GoPlus chain_id {evm.chain_id} — every row is the verbatim provider value (0/1 or string)
            </p>
          )}
        </div>
      )}

      {!resolved && !err && !busy && !cands && (
        <div className="v2-card">
          <div className="v2-empty">
            <MiniShield />
            <div>
              <b className="mono" style={{ fontSize: 11, letterSpacing: '.1em' }}>WHAT WE CHECK PER CHAIN</b>
              <ul className="v2-matrix">
                <li><b>SOL</b> — RugCheck.xyz summary: score, normalised risk, LP lock %, named risks <span className="mono dim">[LIVE]</span></li>
                <li><b>BNB · BASE</b> — GoPlus token_security: honeypot, open-source, buy/sell tax, mintable, freezable, holders, creator <span className="mono dim">[LIVE]</span></li>
                <li><b>HYPE · HOOD</b> — no free provider indexes them yet: honest limited panel + live GT/DS market stats <span className="mono dim">[LIMITED]</span></li>
              </ul>
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

/* ───────────────────────── WHALE TRACKER ───────────────────────── */
const THRESHOLD: Record<string, number> = { sol: 50_000, bnb: 30_000, base: 30_000, hype: 30_000, hood: 30_000 }
const TIMEFRAMES = ['1h', '6h', '24h', '7d'] as const
type Timeframe = (typeof TIMEFRAMES)[number]
const TF_MS: Record<Timeframe, number> = { '1h': 3.6e6, '6h': 2.16e7, '24h': 8.64e7, '7d': 6.048e8 }

interface WhaleRow { wallet: string; usd: number; direction: string; ts: string | number | null; tx: string | null; chain: string }

export function WhalePageMulti() {
  const [chip, setChip] = useState<Chip>('AUTO')
  const [token, setToken] = useState('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263')
  const [tf, setTf] = useState<Timeframe>('24h')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [per, setPer] = useState<{ chain: string; res: WhalesResult }[]>([])

  /* AUTO = fan out to all five chains in parallel; a chip narrows to one.
     Every chain keeps its own USD threshold (labeled heuristic) and answers
     honestly — live transfers or the probe reason verbatim. */
  const run = async () => {
    const tok = token.trim()
    if (!tok) { setErr('paste a token address (CA) first'); return }
    const chains = chip === 'AUTO' ? ['sol', 'bnb', 'base', 'hype', 'hood'] : [CHAIN_OF[chip]]
    setBusy(true); setErr(null); setPer([])
    try {
      const settled = await Promise.allSettled(
        chains.map((c) => api.whales(c, tok, THRESHOLD[c], 40)))
      const out: { chain: string; res: WhalesResult }[] = []
      settled.forEach((s, i) => { if (s.status === 'fulfilled') out.push({ chain: chains[i], res: s.value }) })
      if (!out.length) setErr('whale scan failed on every chain — is the API server running?')
      setPer(out)
    } catch { setErr('whale scan failed') } finally { setBusy(false) }
  }

  const rows: WhaleRow[] = useMemo(() => per.flatMap((p) =>
    (p.res.data_mode === 'live' ? p.res.transfers : []).map((t) => ({
      wallet: t.wallet, usd: t.usd ?? 0, direction: t.direction, ts: t.ts, tx: t.tx, chain: p.chain,
    }))), [per])

  const tsOf = (r: WhaleRow): number => {
    const t = typeof r.ts === 'number' ? r.ts : Date.parse(String(r.ts ?? ''))
    return Number.isFinite(t) ? t : NaN
  }
  const cutoff = Date.now() - TF_MS[tf]
  const filtered = rows.filter((r) => { const t = tsOf(r); return Number.isNaN(t) || t >= cutoff })
  const netflow = filtered.reduce((a, r) => a + (r.direction === 'buy' ? r.usd : -r.usd), 0)

  /* seeding = the tape is younger than the selected window — say so, never
     backfill fake history */
  const oldest = filtered.map(tsOf).filter((t) => Number.isFinite(t))
  const seeding = oldest.length > 0 && (Date.now() - Math.min(...oldest)) < TF_MS[tf]

  /* per-chain breakdown bars from the same tape */
  const chainBars = useMemo(() => per.map((p) => {
    const live = p.res.data_mode === 'live'
    const net = filtered.filter((r) => r.chain === p.chain)
      .reduce((a, r) => a + (r.direction === 'buy' ? r.usd : -r.usd), 0)
    return { chain: p.chain, net, live, reason: live ? null : (p.res.data_sources[0] ?? 'declared null') }
  }), [per, filtered])
  const maxAbs = Math.max(...chainBars.map((b) => Math.abs(b.net)), 1)

  const csv = () => {
    const head = 'chain,wallet,direction,usd,ts,tx'
    const lines = filtered.map((r) => [r.chain, r.wallet, r.direction, r.usd, r.ts ?? '', r.tx ?? ''].join(','))
    const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `vilmei-whales-${tf}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const verdict: RiskVerdict = {
    level: 'nodata',
    score: null,
    label: `NET ${netflow >= 0 ? '+' : '−'}$${fmtC(Math.abs(netflow))} ${tf.toUpperCase()} (HEURISTIC TAPE)`,
    rows: filtered.slice(0, 12).map((r) => ({
      name: `${shorten(r.wallet)} · ${r.chain.toUpperCase()}`,
      level: r.direction === 'buy' ? 'buy' : 'sell',
      score: r.usd, description: null,
    })),
    provenance: per[0] ? { chains: per.map((p) => p.chain), data_mode: per.map((p) => p.res.data_mode) } : undefined,
  }

  return (
    <div className="ta-page">
      <PageHead title="Whale Tracker — multi-chain" sub="AUTO scans all five chains at once; each chain carries its own labeled USD threshold. Live transfers merge into one list with a chain chip per row; chains without a $0 feed answer the probe reason verbatim." />
      <div className="ta-searchrow">
        <Chips value={chip} onPick={(c) => { setChip(c); setPer([]); setErr(null) }} />
      </div>
      <div className="ta-searchrow">
        <div className="ta-search" style={{ height: 40 }}>
          <span style={{ color: 'var(--dim)' }}>◍</span>
          <input value={token} onChange={(e) => setToken(e.target.value)} spellCheck={false}
            placeholder="token address (CA)" style={{ minWidth: 320 }}
            onKeyDown={(e) => e.key === 'Enter' && run()} />
        </div>
        <span className="mono dim v2-threshold" title="HEURISTIC — formula: usd = transfer amount × live token price (dexscreener) at scan time; a whale is ONE transfer ≥ per-chain threshold (SOL $50K / EVM $30K). Thresholds are labeled heuristics, not provider constants.">
          threshold ≥ $50K (SOL) / $30K (EVM) · heuristic
        </span>
        <button className="btn-analyze" disabled={busy} onClick={run}>{busy ? 'SCANNING…' : 'SCAN WHALES'}</button>
      </div>

      {err && <div className="v2-note err" role="alert">{err}</div>}

      {per.length > 0 && (
        <>
          <div className="v2-card">
            <div className="v2-cardhead">
              <b>NET WHALE FLOW — {chip === 'AUTO' ? 'ALL CHAINS' : chip} · {tf}</b>
              <div className="v2-tfs" role="tablist" aria-label="timeframe">
                {TIMEFRAMES.map((t) => (
                  <button key={t} type="button" role="tab" aria-selected={tf === t}
                    className={`v2-chip mono${tf === t ? ' on' : ''}`} onClick={() => setTf(t)}>{t}</button>
                ))}
              </div>
              <button type="button" className="v2-csv mono" onClick={csv}>CSV ⭳</button>
            </div>
            {seeding && (
              <div className="v2-note" role="status">seeding — the tape is younger than the selected window; windows shorten as data accumulates (no fake history is backfilled)</div>
            )}
            {/* per-chain breakdown bars */}
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
                  {b.chain.toUpperCase()} {b.live ? `${b.net >= 0 ? '+' : '−'}$${fmtC(Math.abs(b.net))}` : '· no $0 feed (declared)'}
                </span>
              ))}
            </div>
            <RiskDisplay verdict={verdict} seed={`whale:${per.map((p) => p.chain).join('+')}:${token}`} />
          </div>

          {/* merged list — chain chip column */}
          {filtered.length > 0 && (
            <div className="v2-card">
              <div className="v2-cardhead"><b>MERGED TAPE — {filtered.length} TRANSFERS ≥ THRESHOLD</b></div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead><tr className="mono dim" style={{ textAlign: 'left' }}>
                    <th style={{ padding: '4px 8px' }}>CHAIN</th><th style={{ padding: '4px 8px' }}>WALLET</th>
                    <th style={{ padding: '4px 8px' }}>DIR</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>USD</th>
                    <th style={{ padding: '4px 8px' }}>TX</th></tr></thead>
                  <tbody>
                    {filtered.slice(0, 30).map((r, i) => (
                      <tr key={`${r.chain}-${r.tx ?? i}`} style={{ borderTop: '1px solid var(--border-soft)' }}>
                        <td style={{ padding: '5px 8px' }}><span className="ta-chain-tag">{r.chain === 'sol' ? 'SOL' : 'EVM'}</span> <span className="mono dim">{r.chain.toUpperCase()}</span></td>
                        <td style={{ padding: '5px 8px' }} className="mono">{shorten(r.wallet)}</td>
                        <td style={{ padding: '5px 8px' }} className="mono">{r.direction.toUpperCase()}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }} className="mono">${fmtC(r.usd)}</td>
                        <td style={{ padding: '5px 8px' }} className="mono dim">{r.tx ? shorten(r.tx) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {filtered.length === 0 && rows.length === 0 && per.every((p) => p.res.data_mode !== 'live') && (
            <div className="v2-card">
              <div className="v2-cardhead"><b>NO $0 TRADE FEED ON THE SCANNED CHAINS</b><RiskBadge level="nodata" label="DECLARED NULL" /></div>
              {per.map((p) => (
                <p key={p.chain} className="dim" style={{ fontSize: 11.5 }}>
                  <span className="ta-chain-tag">{p.chain === 'sol' ? 'SOL' : 'EVM'}</span> <b className="mono">{p.chain.toUpperCase()}</b> — {p.res.data_sources[0] ?? 'declared null'}
                </p>
              ))}
            </div>
          )}
        </>
      )}

      {per.length === 0 && !err && !busy && (
        <div className="v2-card">
          <p className="dim" style={{ fontSize: 12 }}>
            AUTO scans the five chains in parallel for one CA. Sol returns Helius enhanced
            transfers + netflow; EVM chains without a $0 feed carry the honest probe reason.
            Thresholds, flow bars and the tape are labeled heuristics — the tooltip carries
            the formula.
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
