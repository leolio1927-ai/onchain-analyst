import { useEffect, useMemo, useRef, useState } from 'react'
import { ALERTS, SYSTEM_STATUS } from '../mock/data'
import { AiHttpError, analystName, answerKey, askAiStream, rememberAnswer } from '../lib/aiApi'
import type { AiAskRequest, AiMode, AiProvenance, AiUsage } from '../lib/aiApi'
import { getGeneration, useActivePair } from '../lib/tokenStore'
import type { LiveChain } from '../lib/liveApi'
import { LIVE_CHAINS, LIVE_CHAIN_LABEL } from '../lib/liveApi'
import { fmtPct, fmtPrice, fmtUsdCompact, fmtUtcClock, shorten } from '../lib/liveFormat'
import { getHoldingsChain, setHoldingsChain } from '../lib/prefs'
import { WATCH_CAP, addWatchItem, removeWatchItem, setWatchAmount, useWatchlist } from '../lib/watchlist'
import { WALLET_LABEL } from '../wallet/registry'
import { useWallet } from '../wallet/WalletContext'
import { Badge, Card, EmptyState, Meter, Skeleton, Tabs, Toggle } from '../components/ui'
import { ChainLogo } from './chainLogos'

function Head({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div className="page-head embroidery">
      <div><div className="page-title">{title}</div><div className="page-sub">{sub}</div></div>
      {right}
    </div>
  )
}

/* ─────────────── AI ANALYST (PROMPT-AI-V — LIVE) ───────────────
   The model only ever sees a server-assembled evidence block; this page
   never composes a prompt. P1 law: the active-pair identity is captured
   atomically per ask — if the token changes mid-answer, the stale stream
   is aborted instead of rendering one token's words under another. */

const AI_PRESETS: { label: string; mode: 'free' | 'deep'; question: string }[] = [
  { label: 'Explain Score', mode: 'free', question: 'Explain this token\'s current risk score: which evidence signals drive it, and what would move it up or down?' },
  { label: 'Deeper Analysis', mode: 'deep', question: 'Give the full structured assessment: what the evidence supports, the gaps in it, and what to watch next.' },
  { label: 'Rug Picture', mode: 'free', question: 'What rug signals does the evidence show for this token — and what evidence is missing?' },
]

interface GroundingRow {
  id: number
  model: string
  mode: string
  persona: string
  tokens: number | null
  cached: boolean
  ms: number
  ts: string
}

type AiPageStatus =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'streaming' }
  | { kind: 'done' }
  | { kind: 'http-error'; status: number; message: string }
  | { kind: 'stream-error'; message: string }
  | { kind: 'network-error'; message: string }

function AiStatusPanel({ status }: { status: AiPageStatus }) {
  if (status.kind === 'http-error') {
    const busy = status.status === 429
    const offline = status.status === 503
    return (
      <div className="ai-status-panel" style={{ borderColor: busy || offline ? 'var(--line2)' : 'rgba(251,191,36,.4)' }}>
        <div className="t" style={{ color: busy || offline ? 'var(--muted)' : '#fbbf24' }}>
          {busy ? 'BUDGET' : offline ? 'OFFLINE' : 'UPSTREAM'}
        </div>
        <div className="m">{status.message}</div>
        {offline && (
          <div className="s">The rest of the terminal stays live — scans, rug check, whale feed and prices do not need the AI key.</div>
        )}
      </div>
    )
  }
  if (status.kind === 'stream-error') {
    return (
      <div className="ai-status-panel" style={{ borderColor: 'rgba(251,191,36,.4)' }}>
        <div className="t" style={{ color: '#fbbf24' }}>UPSTREAM</div>
        <div className="m">{status.message}</div>
        <div className="s">The first byte arrived instantly — the free tier itself stalled. Nothing is loading silently; the rest of the terminal stays live.</div>
      </div>
    )
  }
  if (status.kind === 'network-error') {
    return (
      <div className="ai-status-panel" style={{ borderColor: 'rgba(251,191,36,.4)' }}>
        <div className="t" style={{ color: '#fbbf24' }}>CONNECTION</div>
        <div className="m">{status.message}</div>
      </div>
    )
  }
  return null
}

export function AiPage() {
  const pair = useActivePair()
  const [mode, setMode] = useState<AiMode>('free')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [status, setStatus] = useState<AiPageStatus>({ kind: 'idle' })
  const [provenance, setProvenance] = useState<AiProvenance | null>(null)
  const [log, setLog] = useState<GroundingRow[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [ttfbMs, setTtfbMs] = useState<number | null>(null)
  const ctrlRef = useRef<AbortController | null>(null)
  const startRef = useRef(0)
  const idRef = useRef(0)

  /* V5-G2: leaving the page kills the stream — no orphan reader keeps
     burning a server slot after the surface is gone. */
  useEffect(() => () => ctrlRef.current?.abort(), [])

  const ask = async (raw: string, askMode: AiMode) => {
    const q = raw.trim()
    if (!q) return
    ctrlRef.current?.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    setAnswer(''); setProvenance(null); setNote(null); setElapsedMs(null); setTtfbMs(null)
    setStatus({ kind: 'connecting' })
    /* P1: identity captured ATOMICALLY at ask-time — a newer applySwapToken
       bumps the generation and every later event for this run is dropped. */
    const gen = getGeneration()
    const p = pair
    const req: AiAskRequest = {
      question: q, mode: askMode, surface: 'terminal',
      persona: p ? 'analyst' : 'guide',
      ...(p ? { chain: p.chain, token: p.tokenAddress } : {}),
    }
    startRef.current = performance.now()
    const got: { prov: AiProvenance | null; usg: AiUsage | null } = { prov: null, usg: null }
    let text = ''
    let dropped = false
    let interrupted = false
    try {
      let firstByte = true
      await askAiStream(req, (e) => {
        if (getGeneration() !== gen) {
          dropped = true
          ctrl.abort()
          return
        }
        if (firstByte) { firstByte = false; setTtfbMs(Math.round(performance.now() - startRef.current)) }
        if (e.type === 'provenance') { got.prov = e; setProvenance(e) }
        else if (e.type === 'delta') {
          text += e.text
          setAnswer(text)
          setStatus({ kind: 'streaming' })
        } else if (e.type === 'usage') { got.usg = e }
        else if (e.type === 'error') { interrupted = true; setNote(e.detail); setStatus({ kind: 'stream-error', message: e.detail }) }
      }, ctrl.signal)
      if (dropped) {
        setStatus({ kind: 'idle' })
        setNote('Token changed mid-answer — the stale answer was dropped. Ask again.')
        return
      }
      const ms = Math.round(performance.now() - startRef.current)
      setElapsedMs(ms)
      const provDone = got.prov
      const usgDone = got.usg
      if (provDone) {
        idRef.current += 1
        setLog((rows) => [{
          id: idRef.current, model: analystName(askMode), mode: askMode,
          persona: provDone.persona, tokens: usgDone?.total_tokens ?? null,
          cached: provDone.cached, ms, ts: new Date().toISOString().slice(11, 19),
        }, ...rows].slice(0, 8))
        if (p) rememberAnswer(answerKey(p.chain, p.tokenAddress, q),
          { text, provenance: provDone, usage: usgDone, interrupted })
      }
      /* an interrupted answer keeps its honest error panel — 'done' would
         paint a happy end over a stream that actually died (V5-G2). */
      if (!interrupted) setStatus({ kind: 'done' })
    } catch (err) {
      if (dropped) {
        setStatus({ kind: 'idle' })
        setNote('Token changed mid-answer — the stale answer was dropped. Ask again.')
        return
      }
      if (err instanceof AiHttpError) setStatus({ kind: 'http-error', status: err.status, message: err.message })
      else if (err instanceof DOMException && err.name === 'AbortError') { /* superseded by a newer ask — silent */ }
      else setStatus({ kind: 'network-error', message: 'The stream could not be opened — the terminal or its backend is unreachable.' })
    }
  }

  const busy = status.kind === 'connecting' || status.kind === 'streaming'

  return (
    <div className="ta-page">
      <Head title="AI Analyst" sub="Evidence-first: the model only sees the heuristic evidence block the server assembles. Free and Deep differ in depth — never in data correctness." right={<Badge color="green">LIVE · FREE TIER</Badge>} />
      <div className="grid-23">
        <Card className="pb-acc">
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="ai-mode" role="group" aria-label="AI mode">
              <button className={mode === 'free' ? 'on' : ''} onClick={() => setMode('free')}>FREE · FAST TIER</button>
              <button className={mode === 'deep' ? 'on' : ''} onClick={() => setMode('deep')}>DEEP · REASONING TIER</button>
            </div>
            <textarea
              className="ai-ask-input"
              rows={2}
              value={question}
              placeholder={pair ? `Ask about ${pair.symbol} — the evidence block rides along` : 'No token selected — the guide answers VILMEI questions'}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(question, mode) } }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn-analyze" style={{ height: 38, fontSize: 12.5 }} disabled={busy || !question.trim()} onClick={() => void ask(question, mode)}>
                {busy ? 'STREAMING…' : 'ASK'}
              </button>
              {AI_PRESETS.map((p) => (
                <button key={p.label} className="btn-analyze as-ghost" style={{ height: 38, fontSize: 12 }} disabled={busy} onClick={() => { setQuestion(p.question); void ask(p.question, p.mode) }}>
                  {p.label}{p.mode === 'deep' ? ' · DEEP' : ''}
                </button>
              ))}
            </div>
            {status.kind === 'connecting' && (
              <div style={{ display: 'grid', gap: 8, padding: '4px 0' }} aria-label="connecting">
                <span className="ta-skel" style={{ height: 12, width: '92%' }} />
                <span className="ta-skel" style={{ height: 12, width: '76%' }} />
                <span className="ta-skel" style={{ height: 12, width: '84%' }} />
              </div>
            )}
            {(answer || status.kind === 'streaming' || status.kind === 'done') && (
              <div className="ai-answer mono">
                {answer}
                {status.kind === 'streaming' && <span className="ai-caret" aria-hidden="true" />}
              </div>
            )}
            {note && <div className="ai-note">{note}</div>}
            {provenance && (
              <div className="ai-prov">
                <span className="prov-chip live">● LIVE · {analystName(provenance.mode)}</span>
                <span className="prov-chip">{provenance.mode.toUpperCase()}</span>
                <span className="prov-chip">{provenance.persona.toUpperCase()}</span>
                {provenance.cached && <span className="prov-chip">CACHED</span>}
                {ttfbMs != null && (
                  <span className="prov-chip" style={{ fontVariantNumeric: 'tabular-nums' }} title="time to the first real byte of this answer">
                    · first byte {ttfbMs}ms
                  </span>
                )}
                {elapsedMs != null && (
                  <span className="prov-chip" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {(elapsedMs / 1000).toFixed(1)}s{provenance.mode === 'deep' ? ' · deep' : ''}
                  </span>
                )}
                <span className="prov-chip dim">{provenance.prompt_version}</span>
                {provenance.evidence_sources.length > 0 && (
                  <span className="prov-chip dim">EVIDENCE: {provenance.evidence_sources.join(' · ')}</span>
                )}
              </div>
            )}
            <AiStatusPanel status={status} />
          </div>
        </Card>
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <Card title="ACTIVE CONTEXT" className="pb-acc">
            {pair ? (
              <div className="rug-list">
                <div className="rug-row"><span className="k">Token</span><span className="v">{pair.symbol} · <span className="dim">{shorten(pair.tokenAddress)}</span></span></div>
                <div className="rug-row"><span className="k">Chain</span><span className="v">{LIVE_CHAIN_LABEL[pair.chain]}</span></div>
                <div className="rug-row"><span className="k">Persona</span><span className="v ok-yes">ANALYST</span></div>
                <div className="rug-row"><span className="k">Evidence</span><span className="v">{provenance ? provenance.evidence_sources.join(' · ') : 'assembled server-side on ask'}</span></div>
              </div>
            ) : (
              <div className="rug-list">
                <div className="rug-row"><span className="k">Token</span><span className="v dim">none selected</span></div>
                <div className="rug-row"><span className="k">Persona</span><span className="v ok-yes">GUIDE</span></div>
                <div className="rug-row"><span className="k">Grounding</span><span className="v">docs/AI-BRIEF.md — facts only, LIVE/PLANNED labels</span></div>
              </div>
            )}
            <p style={{ color: 'var(--dim)', fontSize: 11, marginTop: 10 }}>
              Context follows the token store — switch tokens and the next ask carries the new identity. Stale mid-stream answers are dropped, never blended.
            </p>
          </Card>
          <Card title="GROUNDING LOG" className="pb-acc">
            <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>
              Every answer logs the exact model, mode and tokens from its own provenance —
              nothing is written here before a real response exists.
            </p>
            <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
              {log.length === 0 && <div className="mono-line dim">no answers yet this session — the log fills as you ask</div>}
              {log.map((r) => (
                <div key={r.id} className="mono-line">
                  {r.model} · {r.mode} · {r.persona} · <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.tokens ?? '—'} tok</span>{r.cached ? ' · cached' : ''} · <span style={{ fontVariantNumeric: 'tabular-nums' }}>{(r.ms / 1000).toFixed(1)}s</span> · {r.ts}Z
                </div>
              ))}
            </div>
          </Card>
          <Card title="EVIDENCE LAW">
            <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>
              The analyst may only cite numbers, prices, levels or dates that exist in the
              evidence block. Ask for a support level it can't ground and it refuses instead
              of inventing. Not financial advice — a read-only terminal never tells you to buy.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ─────────────── PORTFOLIO WATCH (PROMPT-V4 M4 — live, $0) ───────────────
   Account-less by architecture: the watchlist (≤15 tokens) persists in this
   browser under vilmei.watchlist; the server answers only market facts from
   the deepest GeckoTerminal pool, verbatim. Positions (amounts) are typed by
   the user and never leave the machine — value = amount × price is computed
   HERE, client-side. No account, no keys, no custody. */

interface SnapshotRow {
  chain: string
  token: string
  status: 'ok' | 'no_pool' | 'rate_limited' | 'upstream_error'
  pool?: string | null
  pool_name?: string | null
  price_usd?: number | null
  liquidity_usd?: number | null
  volume_24h?: number | null
  change_24h?: number | null
  note?: string | null
}

interface Snapshot {
  data_mode: string
  sources: string[]
  rows: SnapshotRow[]
  rate_limited: string[]
  pools_walked: number
  data_sources: string[]
  ts?: string | null
}

const ADD_FAIL: Record<'invalid-chain' | 'empty-token' | 'duplicate' | 'cap', string> = {
  'invalid-chain': 'Pick one of the five live chains first.',
  'empty-token': 'Paste a contract address — an empty entry is not a token.',
  'duplicate': 'Already watching this exact contract on this chain.',
  'cap': `Watchlist cap is ${WATCH_CAP} items — remove one to add another.`,
}

function useSnapshot(itemsKey: string): { snap: Snapshot | null; loading: boolean; err: string | null; refresh: () => void } {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [doneKey, setDoneKey] = useState<string | null>(null)
  /* loading is DERIVED (requested vs resolved key) — no synchronous setState
     inside the effect; doneKey is written only from the fetch callbacks. */
  const reqKey = `${itemsKey}#${tick}`
  useEffect(() => {
    if (!itemsKey) return
    const ctrl = new AbortController()
    let stale = false
    fetch(`/api/v1/portfolio/snapshot?items=${encodeURIComponent(itemsKey)}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          let detail = `HTTP ${res.status}`
          try {
            const j = (await res.json()) as { detail?: unknown }
            if (typeof j.detail === 'string') detail = j.detail
          } catch { /* non-JSON error body — keep the HTTP code line */ }
          throw new Error(detail)
        }
        return (await res.json()) as Snapshot
      })
      .then((data) => { if (!stale) { setSnap(data); setErr(null); setDoneKey(reqKey) } })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (!stale) { setErr(e instanceof Error ? e.message : String(e)); setDoneKey(reqKey) }
      })
    return () => { stale = true; ctrl.abort() }
  }, [itemsKey, tick, reqKey])
  return {
    snap: itemsKey ? snap : null,
    err: itemsKey ? err : null,
    loading: itemsKey !== '' && doneKey !== reqKey,
    refresh: () => setTick((t) => t + 1),
  }
}

function AmountInput({ chain, token, amount }: { chain: LiveChain; token: string; amount?: number }) {
  const [text, setText] = useState(amount === undefined ? '' : String(amount))
  return (
    <input
      className="mono"
      data-testid={`pf-amount-${chain}-${token}`}
      value={text}
      placeholder="amount"
      inputMode="decimal"
      spellCheck={false}
      style={{ width: 96, textAlign: 'right', background: 'rgba(5,6,15,0.5)', border: '1px solid var(--line-soft, var(--line))', borderRadius: 7, padding: '5px 8px', color: 'var(--text)', fontSize: 12, outline: 'none' }}
      onChange={(e) => {
        const raw = e.target.value.trim()
        setText(raw)
        if (raw === '') return setWatchAmount(chain, token, undefined)
        const n = Number(raw)
        if (Number.isFinite(n) && n > 0) setWatchAmount(chain, token, n)
      }}
    />
  )
}

export function PortfolioPage() {
  const items = useWatchlist()
  const itemsKey = useMemo(() => items.map((w) => `${w.chain}:${w.token}`).join(','), [items])
  const { snap, loading, err, refresh } = useSnapshot(itemsKey)
  const [chain, setChain] = useState<LiveChain>('sol')
  const [ca, setCa] = useState('')
  const [addMsg, setAddMsg] = useState<string | null>(null)

  const rowFor = (c: string, t: string) => snap?.rows.find((r) => r.chain === c && r.token === t)
  const valued = items.map((w) => {
    const r = rowFor(w.chain, w.token)
    const price = r?.status === 'ok' && r.price_usd !== null && r.price_usd !== undefined ? r.price_usd : null
    return { w, r, value: w.amount !== undefined && price !== null ? w.amount * price : null }
  })
  const total = valued.reduce((s, v) => s + (v.value ?? 0), 0)
  const valuedCount = valued.filter((v) => v.value !== null).length
  let topMover: { sym: string; chg: number } | null = null
  for (const { w, r } of valued) {
    if (r?.status === 'ok' && r.change_24h !== null && r.change_24h !== undefined) {
      if (!topMover || r.change_24h > topMover.chg) topMover = { sym: w.symbol ?? shorten(w.token), chg: r.change_24h }
    }
  }

  const onAdd = () => {
    const res = addWatchItem(chain, ca)
    if (res.ok) { setCa(''); setAddMsg(null) } else { setAddMsg(ADD_FAIL[res.reason]) }
  }

  return (
    <div className="ta-page">
      <Head
        title="Portfolio Watch"
        sub="Account-less watchlist — tokens persist in this browser only; market facts come verbatim from the deepest GeckoTerminal pool. No account, no custody."
        right={<Badge color="green">LIVE · $0</Badge>}
      />
      <div className="grid-3">
        <Card title="TOTAL VALUE">
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 30, fontWeight: 700 }}>{valuedCount ? fmtUsdCompact(total) : '–'}</div>
          <div className="mono" style={{ fontSize: 12, marginTop: 4, color: 'var(--muted)' }}>
            {items.length === 0 ? 'add a token to begin'
              : valuedCount ? `${valuedCount} of ${items.length} positions valued`
              : 'set amounts — a value needs both an amount and a live price'}
          </div>
        </Card>
        <Card title="POSITIONS">
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 30, fontWeight: 700 }}>{items.length}<span style={{ fontSize: 16, color: 'var(--muted)' }}> / {WATCH_CAP}</span></div>
          <div className="mono" style={{ fontSize: 12, marginTop: 4, color: 'var(--muted)' }}>stored in vilmei.watchlist · reload-safe</div>
        </Card>
        <Card title="TOP MOVER · 24H">
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 30, fontWeight: 700 }}>{topMover ? topMover.sym : '–'}</div>
          <div className={`mono ${topMover && topMover.chg >= 0 ? 'up' : 'down'}`} style={{ fontSize: 13, marginTop: 4 }}>
            {topMover ? fmtPct(topMover.chg) : 'no 24h change data yet'}
          </div>
        </Card>
      </div>

      <Card title="ADD TO WATCHLIST">
        <div className="ai-mode" style={{ marginBottom: 10 }}>
          {LIVE_CHAINS.map((c) => (
            <button key={c} className={chain === c ? 'on' : ''} data-testid={`pf-chain-${c}`} onClick={() => setChain(c)}>
              {LIVE_CHAIN_LABEL[c].toUpperCase()}
            </button>
          ))}
        </div>
        <div className="ta-searchrow">
          <div className="ta-search">
            <span style={{ color: 'var(--dim)' }}>⌕</span>
            <input
              data-testid="pf-ca"
              placeholder={`Contract address on ${LIVE_CHAIN_LABEL[chain]}…`}
              value={ca}
              onChange={(e) => setCa(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onAdd()}
              spellCheck={false}
            />
          </div>
          <button className="btn-analyze" data-testid="pf-add" onClick={onAdd}>WATCH</button>
          <button className="btn-analyze as-ghost" data-testid="pf-refresh" onClick={refresh} disabled={items.length === 0 || loading}>
            {loading ? '…' : 'REFRESH'}
          </button>
        </div>
        <div className="mono" style={{ fontSize: 11.5, marginTop: 8, color: addMsg ? 'var(--amber, #fbbf24)' : 'var(--dim)' }} data-testid="pf-add-note">
          {addMsg ?? `${items.length}/${WATCH_CAP} used · account-less — no login, no keys, nothing leaves this browser`}
        </div>
      </Card>

      {items.length === 0 ? (
        <Card>
          <EmptyState icon="▤" title="No tokens watched yet"
            hint="Paste a contract address above — the list lives only in this browser (vilmei.watchlist). Prices, liquidity and 24h facts arrive live from GeckoTerminal." />
        </Card>
      ) : err ? (
        <Card>
          <EmptyState icon="⚠" title="Snapshot unreachable" hint={`${err} — the watchlist itself is safe in this browser; REFRESH when the API is back.`} />
        </Card>
      ) : (
        <>
          {snap && snap.rate_limited.length > 0 && (
            <Card className="reveal" glow="#fbbf24">
              <div className="mono" style={{ fontSize: 12, color: 'var(--amber, #fbbf24)' }}>
                RATE LIMITED · {snap.rate_limited.length} of {items.length} tokens — GeckoTerminal free tier
                (retry in ~60s or hit REFRESH). Their rows show no facts until then; nothing is guessed.
              </div>
            </Card>
          )}
          <Card title="WATCHED TOKENS">
            <div className="ta-table-wrap">
              <table className="ta-table">
                <thead>
                  <tr><th>Token</th><th>Chain</th><th className="r">Price</th><th className="r">24h</th><th className="r">Liquidity</th><th className="r">Vol 24h</th><th className="r">Amount</th><th className="r">Value</th><th /></tr>
                </thead>
                <tbody>
                  {valued.map(({ w, r, value }) => {
                    const ok = r?.status === 'ok'
                    return (
                      <tr key={`${w.chain}:${w.token}`}>
                        <td>
                          <b>{w.symbol ?? shorten(w.token)}</b>
                          {ok && r?.pool_name && <div className="mono dim" style={{ fontSize: 10.5 }}>{r.pool_name}</div>}
                          {r && r.status !== 'ok' && r.note && (
                            <div className="mono dim" style={{ fontSize: 10.5, maxWidth: 340 }} data-testid={`pf-note-${w.chain}`}>{r.note}</div>
                          )}
                        </td>
                        <td className="mono dim">{w.chain.toUpperCase()}</td>
                        {r === undefined ? (
                          <td colSpan={6}><Skeleton h={12} w={180} /></td>
                        ) : r.status === 'rate_limited' ? (
                          <td colSpan={6} className="mono dim">awaiting the free-tier window — no facts invented</td>
                        ) : !ok ? (
                          <td colSpan={6} className="mono dim">–</td>
                        ) : (
                          <>
                            <td className="r mono">{fmtPrice(r.price_usd === undefined ? null : String(r.price_usd))}</td>
                            <td className={`r mono ${r.change_24h == null ? 'dim' : r.change_24h >= 0 ? 'up' : 'down'}`}>{fmtPct(r.change_24h ?? null)}</td>
                            <td className="r mono">{fmtUsdCompact(r.liquidity_usd ?? null)}</td>
                            <td className="r mono">{fmtUsdCompact(r.volume_24h ?? null)}</td>
                          </>
                        )}
                        <td className="r"><AmountInput chain={w.chain} token={w.token} amount={w.amount} /></td>
                        <td className="r mono" data-testid={`pf-value-${w.chain}`}>{value === null ? '–' : fmtUsdCompact(value)}</td>
                        <td className="r">
                          <button
                            data-testid={`pf-remove-${w.chain}`}
                            onClick={() => removeWatchItem(w.chain, w.token)}
                            style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 14, padding: '2px 6px' }}
                            title="Remove from watchlist"
                          >×</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--dim)', marginTop: 10 }}>
              {snap
                ? `walked ${snap.pools_walked} pool(s) · sources: ${snap.sources.join(', ')} · ${fmtUtcClock(snap.ts ?? null)} · amounts never leave this browser`
                : loading ? 'fetching market facts…' : 'no snapshot yet'}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

/* ─────────────── ALERTS ─────────────── */
export function AlertsPage() {
  const [tab, setTab] = useState('all')
  const rows = ALERTS.filter((a) => tab === 'all' || (tab === 'unread' && a.unread) || (tab === 'high' && a.sev === 'HIGH'))
  return (
    <div className="ta-page">
      <Head title="Alerts" sub="Heuristic triggers on your watchlist — signals, not instructions." right={<Badge color="red">3 UNREAD</Badge>} />
      <Tabs active={tab} onPick={setTab} tabs={[{ id: 'all', label: 'All' }, { id: 'unread', label: 'Unread' }, { id: 'high', label: 'High severity' }]} />
      {rows.length === 0 ? <Card><EmptyState icon="◆" title="No alerts in this filter" /></Card> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((a) => (
            <Card key={a.title} className="reveal" glow={a.sev === 'HIGH' ? '#fb7185' : undefined}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span className={`ta-badge ${a.sev === 'HIGH' ? 'b-red' : a.sev === 'MED' ? 'b-amber' : 'b-green'}`}>{a.sev}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {a.unread && <span style={{ color: 'var(--cyan)' }}>● </span>}{a.title}
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 2 }}>{a.body}</div>
                </div>
                <span className="mono dim" style={{ fontSize: 11.5 }}>{a.time} ago</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─────────────── HOLDINGS CHECK (PROMPT-V4 M5 — live, read-only) ───────────────
   Paste a PUBLIC wallet address; the server reads balances from free-tier
   sources (sol Helius · bnb Alchemy · base Alchemy-or-keyless-Blockscout ·
   hype/hood honest PARTIAL). Coverage states are chips, never red-solo:
   a missing key or missing coverage is a sentence, not an error. */

interface HoldingsResult {
  chain: string
  address: string
  coverage: 'ok' | 'no_key' | 'partial' | 'upstream_error'
  native_symbol: string | null
  native_amount: number | null
  native_price_usd: number | null
  native_change_24h: number | null
  tokens: { token: string | null; symbol: string | null; amount: number | null; price_usd: number | null; change_24h: number | null; price_note: string | null }[]
  pricing_note: string | null
  sources: string[]
  reasons: string[]
  data_mode: string
}

const COVERAGE_LABEL: Record<HoldingsResult['coverage'], string> = {
  ok: 'LIVE', no_key: 'NO KEY', partial: 'PARTIAL', upstream_error: 'UPSTREAM',
}
const COVERAGE_COLOR: Record<HoldingsResult['coverage'], 'green' | 'amber' | 'cyan' | 'muted'> = {
  ok: 'green', no_key: 'amber', partial: 'muted', upstream_error: 'amber',
}

/* the one privacy sentence, verbatim everywhere it appears */
const PRIVACY_LINE = 'address stays in this browser; proxy fetches public balances; never logs addresses'

/* a price miss is data, shown per-row in dim — mapped to human words */
const PRICE_NOTE_LABEL: Record<string, string> = {
  no_pool: 'no pool price', rate_limited: 'price rate-limited',
  capped: 'beyond price cap', upstream_error: 'price unavailable',
}

const BAR_COLORS = ['#00ffa3', '#a78bfa', '#fbbf24', '#38bdf8', '#f472b6', '#94a3b8']

function fmtAmt(n: number | null): string {
  if (n === null) return '–'
  const a = Math.abs(n)
  if (a >= 1e9) return `${(n / 1e9).toPrecision(4)}B`
  if (a >= 1e6) return `${(n / 1e6).toPrecision(4)}M`
  if (a >= 1e3) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (n === 0) return '0'
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return '–'
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  if (n >= 1) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `$${n.toPrecision(4)}`
}

/* client-side only: USD value = amount × server price (M4 portfolio pattern —
   the server ships facts, the multiplication never leaves the browser) */
function valueOf(amount: number | null | undefined, price: number | null | undefined): number | null {
  if (amount === null || amount === undefined || price === null || price === undefined) return null
  return amount * price
}

function Delta({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined) return <span className="dim">–</span>
  return <span className={`mono ${v >= 0 ? 'up' : 'down'}`}>{fmtPct(v)}</span>
}

export function HoldingsPage() {
  const { session, live, connect, connectDemo, connecting, error: walletError } = useWallet()
  const [chain, setChainState] = useState<LiveChain>(getHoldingsChain)
  const setChain = (c: LiveChain) => { setChainState(c); setHoldingsChain(c) }
  const [addr, setAddr] = useState('')
  const [checked, setChecked] = useState<{ chain: LiveChain; addr: string } | null>(null)
  const [res, setRes] = useState<HoldingsResult | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [doneKey, setDoneKey] = useState<string | null>(null)
  const reqKey = checked ? `${checked.chain}:${checked.addr}` : null
  /* derived loading (M4 pattern): doneKey is written only in fetch callbacks */
  const loading = reqKey !== null && doneKey !== reqKey

  /* M2 join: a connected wallet IS the address input — solana sessions check
     sol immediately, evm sessions prefill base. Once per session address. */
  const prefilled = useRef<string | null>(null)
  useEffect(() => {
    if (!session) { prefilled.current = null; return }
    if (prefilled.current === session.address) return
    prefilled.current = session.address
    const c: LiveChain = session.chainFam === 'solana' ? 'sol' : 'base'
    setChainState(c)
    setHoldingsChain(c)
    setAddr(session.address)
    setChecked({ chain: c, addr: session.address })
  }, [session])

  useEffect(() => {
    if (!checked) return
    const ctrl = new AbortController()
    let stale = false
    const key = `${checked.chain}:${checked.addr}`
    fetch(`/api/v1/holdings/${checked.chain}/${encodeURIComponent(checked.addr)}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) {
          let detail = `HTTP ${r.status}`
          try {
            const j = (await r.json()) as { detail?: unknown }
            if (typeof j.detail === 'string') detail = j.detail
          } catch { /* non-JSON error body — keep the HTTP code line */ }
          throw new Error(detail)
        }
        return (await r.json()) as HoldingsResult
      })
      .then((d) => { if (!stale) { setRes(d); setErrMsg(null); setDoneKey(key) } })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (!stale) { setRes(null); setErrMsg(e instanceof Error ? e.message : String(e)); setDoneKey(key) }
      })
    return () => { stale = true; ctrl.abort() }
  }, [checked])

  const run = () => {
    const a = addr.trim()
    if (!a) return
    setChecked({ chain, addr: a })
  }

  /* chain-breakdown bar: USD share of native + each priced holding (the
     unpriced ones are absent from the bar, never zeroed into it) */
  const segs = useMemo(() => {
    if (!res || res.coverage !== 'ok') return []
    const parts: { label: string; value: number; color: string }[] = []
    const nv = valueOf(res.native_amount, res.native_price_usd)
    if (nv) parts.push({ label: res.native_symbol ?? 'native', value: nv, color: BAR_COLORS[0] })
    res.tokens.forEach((t, i) => {
      const v = valueOf(t.amount, t.price_usd)
      if (v) parts.push({ label: t.symbol ?? shorten(t.token), value: v, color: BAR_COLORS[(i + 1) % BAR_COLORS.length] })
    })
    const total = parts.reduce((s, p) => s + p.value, 0)
    return total > 0 ? parts.map((p) => ({ ...p, share: p.value / total })) : []
  }, [res])

  /* CSV export — same Blob pattern as the whale tape; the filename carries
     the chain only, never the address */
  const exportCsv = () => {
    if (!res) return
    const head = 'chain,kind,token,symbol,amount,price_usd,value_usd,change_24h'
    const lines: string[] = []
    if (res.native_amount !== null) {
      lines.push([res.chain, 'native', 'native', res.native_symbol ?? '', res.native_amount,
        res.native_price_usd ?? '', valueOf(res.native_amount, res.native_price_usd) ?? '',
        res.native_change_24h ?? ''].join(','))
    }
    for (const t of res.tokens) {
      lines.push([res.chain, 'token', t.token ?? '', t.symbol ?? '', t.amount ?? '',
        t.price_usd ?? '', valueOf(t.amount, t.price_usd) ?? '', t.change_24h ?? ''].join(','))
    }
    const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `vilmei-holdings-${res.chain}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="ta-page">
      <Head
        title="Holdings Check"
        sub="Paste a PUBLIC wallet address — read-only balances from free-tier sources, priced against each token's deepest pool. We never ask for keys; no custody, ever."
        right={<Badge color="green">NO CUSTODY</Badge>}
      />
      <Card title="CHECK A PUBLIC ADDRESS">
        <div className="ai-mode" style={{ marginBottom: 10 }}>
          {LIVE_CHAINS.map((c) => (
            <button key={c} className={chain === c ? 'on' : ''} data-testid={`hc-chain-${c}`} onClick={() => setChain(c)}>
              {LIVE_CHAIN_LABEL[c].toUpperCase()}
            </button>
          ))}
        </div>
        <div className="ta-searchrow">
          <div className="ta-search">
            <span style={{ color: 'var(--dim)' }}>▣</span>
            <input
              data-testid="hc-addr"
              placeholder={`Public wallet address on ${LIVE_CHAIN_LABEL[chain]} (read-only)…`}
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run()}
              spellCheck={false}
            />
          </div>
          <button className="btn-analyze" data-testid="hc-check" onClick={run}>{loading ? '…' : 'CHECK'}</button>
        </div>
        <div className="mono" style={{ fontSize: 11.5, marginTop: 8, color: 'var(--dim)' }}>
          sol → Helius · bnb → Alchemy · base → Alchemy or keyless Blockscout · hype/hood → honest PARTIAL
        </div>
        {session && session.kind === 'mock' && (
          <div className="mono" style={{ fontSize: 11.5, marginTop: 6, color: 'var(--amber, #fbbf24)' }} data-testid="hc-demo-hint">
            DEMO identity connected — the check runs on the deterministic preview address, not a real wallet
          </div>
        )}
      </Card>

      {!checked && !errMsg && (
        <Card>
          <EmptyState icon="▣" title="No wallet checked yet"
            hint={`Connect a wallet below — address only, nothing is signed — or paste any public address above. ${PRIVACY_LINE}.`} />
          <div className="rug-list" style={{ marginTop: 14, maxWidth: 460, marginInline: 'auto' }}>
            <div className="rug-row">
              <span className="k">Wallet picker</span>
              <span className="v mono dim">address only · read-only build</span>
            </div>
            {live.map((w) => (
              <button type="button" key={w.id} className="ta-wallet-row btn" data-testid={`wallet-live-${w.id}`} onClick={() => connect(w.id)}>
                <span>{w.name}</span>
                <span className="ta-chain-tag">{w.fam === 'solana' ? 'SOL' : 'EVM'} · LIVE</span>
              </button>
            ))}
            <button type="button" className="ta-wallet-row btn" data-testid="wallet-demo" onClick={connectDemo} disabled={connecting !== null}>
              <span>{WALLET_LABEL}</span>
              <span className="dim2">preview only</span>
            </button>
            {walletError && <div className="ta-wallet-row mono dim2" data-testid="wallet-error">{walletError}</div>}
          </div>
        </Card>
      )}
      {errMsg && (
        <Card>
          <EmptyState icon="⚠" title="Check could not run" hint={`${errMsg} — fix the address or chain and retry; nothing was stored.`} />
        </Card>
      )}
      {res && (
        <>
          <div className="grid-2">
            <Card title={`WALLET ${shorten(res.address)}`}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <ChainLogo chain={res.chain as LiveChain} size={18} />
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>{LIVE_CHAIN_LABEL[res.chain as LiveChain]?.toUpperCase() ?? res.chain}</span>
                </span>
                <Badge color={COVERAGE_COLOR[res.coverage]}>{COVERAGE_LABEL[res.coverage]}</Badge>
                {res.pricing_note && (
                  <span data-testid="hc-pricing-chip" title={res.pricing_note}>
                    <Badge color="cyan">heuristic pricing — dex-reserve derived</Badge>
                  </span>
                )}
                <span className="mono dim" style={{ fontSize: 11 }}>{res.sources.length ? `sources: ${res.sources.join(', ')}` : 'no source queried'}</span>
              </div>
              <div className="rug-list">
                <div className="rug-row">
                  <span className="k">{res.native_symbol ?? 'Native'} balance</span>
                  <span className="v mono" data-testid="hc-native">{fmtAmt(res.native_amount)}{res.native_amount !== null && res.native_symbol ? ` ${res.native_symbol}` : ''}</span>
                </div>
                <div className="rug-row">
                  <span className="k">{res.native_symbol ?? 'Native'} value</span>
                  <span className="v mono" data-testid="hc-native-usd">
                    {fmtUsd(valueOf(res.native_amount, res.native_price_usd))} <Delta v={res.native_change_24h} />
                  </span>
                </div>
                <div className="rug-row"><span className="k">Tokens listed</span><span className="v">{res.tokens.length}</span></div>
                <div className="rug-row"><span className="k">Custody</span><span className="v ok-yes">none — read-only, by design</span></div>
              </div>
              {segs.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div className="mono dim" style={{ fontSize: 10.5, marginBottom: 6 }}>CHAIN BREAKDOWN · USD SHARE</div>
                  <div data-testid="hc-bar" style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'rgba(255,255,255,.06)' }}>
                    {segs.map((s, i) => (
                      <div key={`${s.label}-${i}`} title={`${s.label} · ${(s.share * 100).toFixed(1)}%`}
                        style={{ width: `${(s.share * 100).toFixed(2)}%`, background: s.color }} />
                    ))}
                  </div>
                  <div className="mono" style={{ fontSize: 10.5, marginTop: 6, color: 'var(--muted)' }}>
                    {segs.map((s) => `${s.label} ${(s.share * 100).toFixed(1)}%`).join(' · ')}
                  </div>
                </div>
              )}
              {res.tokens.length > 0 && (
                <div className="ta-table-wrap" style={{ marginTop: 12 }}>
                  <table className="ta-table">
                    <thead><tr><th>Token</th><th className="r">Amount</th><th className="r">Price</th><th className="r">Value</th><th className="r">Δ24h</th></tr></thead>
                    <tbody>
                      {res.tokens.map((t, i) => (
                        <tr key={`${t.token}-${i}`}>
                          <td>
                            <span className="mono">{shorten(t.token)}</span>
                            {t.symbol && <span className="dim" style={{ marginLeft: 6 }}>{t.symbol}</span>}
                            {t.price_note && (
                              <div className="mono dim" style={{ fontSize: 10.5 }}>{PRICE_NOTE_LABEL[t.price_note] ?? t.price_note}</div>
                            )}
                          </td>
                          <td className="r mono" data-testid="hc-token-amount">{fmtAmt(t.amount)}</td>
                          <td className="r mono">{fmtUsd(t.price_usd)}</td>
                          <td className="r mono">{fmtUsd(valueOf(t.amount, t.price_usd))}</td>
                          <td className="r"><Delta v={t.change_24h} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn-analyze as-ghost" data-testid="hc-csv" onClick={exportCsv}>EXPORT CSV</button>
              </div>
            </Card>
            <Card title="COVERAGE — WHAT THE TERMINAL CAN SEE">
              {res.reasons.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                  Full coverage on this chain: every balance above is copied verbatim
                  from {res.sources.join(' + ') || 'the wired source'}. Absent values
                  stay absent — nothing here is estimated.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {res.reasons.map((s) => (
                    <p key={s.slice(0, 40)} className="mono" style={{ color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.6 }} data-testid="hc-reason">{s}</p>
                  ))}
                </div>
              )}
              {res.pricing_note && (
                <p className="mono" style={{ color: 'var(--dim)', fontSize: 11, marginTop: 12, lineHeight: 1.6 }}>{res.pricing_note}</p>
              )}
              <p style={{ color: 'var(--dim)', fontSize: 11, marginTop: 14 }}>
                Read-only view from public chain data. This product cannot move funds — by design.
              </p>
            </Card>
          </div>
        </>
      )}
      <Card>
        <p className="mono" data-testid="hc-privacy" style={{ color: 'var(--dim)', fontSize: 11.5, textAlign: 'center' }}>
          PRIVACY — {PRIVACY_LINE}
        </p>
      </Card>
    </div>
  )
}

/* ─────────────── TOKEN GATE ─────────────── */
export function GatePage() {
  return (
    <div className="ta-page">
      <Head title="Token Gate" sub="Access depth, not truth: the plan changes how deep the AI digs — never what the data says." right={<Badge color="purple">SOULBOUND · TIME-BOUND</Badge>} />
      <div className="grid-3">
        <Card title="CURRENT PLAN" glow="#00ffa3">
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 28, fontWeight: 700 }}>Premium Deep</div>
          <div className="mono" style={{ color: 'var(--violet)', fontSize: 12, margin: '4px 0 14px' }}>VALID UNTIL 2026-12-31</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>
            <span>Cycle usage</span><span className="mono">89%</span>
          </div>
          <Meter value={89} color="#00ffa3" />
          <div className="rug-list" style={{ marginTop: 14 }}>
            <div className="rug-row"><span className="k">Deep AI runs</span><span className="v ok-yes">unlimited</span></div>
            <div className="rug-row"><span className="k">Cluster graph export</span><span className="v ok-yes">enabled</span></div>
            <div className="rug-row"><span className="k">Evidence correctness</span><span className="v ok-yes">identical on every tier</span></div>
          </div>
        </Card>
        <Card title="ACCESS TOKEN">
          <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>
            The utility token grants <b style={{ color: 'var(--text)' }}>feature depth</b> only. It is
            non-transferable (soulbound) and time-bound — closer to a software license than an asset.
            A USDC payment path always exists as an alternative.
          </p>
          <div className="rug-list" style={{ marginTop: 12 }}>
            <div className="rug-row"><span className="k">Model</span><span className="v">soulbound (planned)</span></div>
            <div className="rug-row"><span className="k">Custody</span><span className="v ok-yes">none — never required</span></div>
            <div className="rug-row"><span className="k">Governance</span><span className="v">separate token (if ever)</span></div>
          </div>
        </Card>
        <Card title="PAY WITH">
          {[['USDC subscription', '$19 / month', true], ['Access token (soulbound)', 'burn-to-unlock, time-bound', false], ['Desk (multi-seat)', '$99 / month', false]].map(([t, d, hot]) => (
            <div key={t as string} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '11px 4px', borderBottom: '1px dashed var(--line-soft)' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{t as string}</div>
                <div className="mono dim" style={{ fontSize: 11.5 }}>{d as string}</div>
              </div>
              {hot ? <Badge color="green">ACTIVE</Badge> : <button className="btn-analyze" style={{ height: 34, fontSize: 11, padding: '0 14px' }}>SELECT</button>}
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}

/* ─────────────── SETTINGS ─────────────── */
export function SettingsPage() {
  const [prefs, setPrefs] = useState({ anims: true, compact: false, alerts: true, sound: false, cluster: true })
  return (
    <div className="ta-page">
      <Head title="Settings" sub="Local preferences only. No account, no tracking — privacy by architecture." />
      <div className="grid-2">
        <Card title="INTERFACE">
          <div style={{ display: 'grid', gap: 16 }}>
            <Toggle on={prefs.anims} onChange={(v) => setPrefs({ ...prefs, anims: v })} label="Motion & micro-interactions" />
            <Toggle on={prefs.compact} onChange={(v) => setPrefs({ ...prefs, compact: v })} label="Compact density (desks)" />
            <Toggle on={prefs.cluster} onChange={(v) => setPrefs({ ...prefs, cluster: v })} label="Auto wallet-clustering on scan" />
          </div>
        </Card>
        <Card title="ALERTS">
          <div style={{ display: 'grid', gap: 16 }}>
            <Toggle on={prefs.alerts} onChange={(v) => setPrefs({ ...prefs, alerts: v })} label="Push alerts (cluster/whale/rug triggers)" />
            <Toggle on={prefs.sound} onChange={(v) => setPrefs({ ...prefs, sound: v })} label="Sound on HIGH severity" />
          </div>
        </Card>
        <Card title="AI MODEL">
          <p style={{ color: 'var(--muted)', fontSize: 12.5, marginBottom: 12 }}>
            The terminal assigns the model per mode — FREE uses the fast tier, DEEP the reasoning
            tier. The exact model id of every answer is logged in the grounding log; there is no
            provider to pick and nothing to pay.
          </p>
          <div className="ai-mode">
            <button className="on">AUTO · PER MODE</button>
          </div>
        </Card>
        <Card title="DANGER ZONE" glow="#fb7185">
          <p style={{ color: 'var(--muted)', fontSize: 12.5, marginBottom: 12 }}>
            Clear local watchlist & cache. Server-side data (grounding logs) is not personal.
          </p>
          <button className="btn-analyze" style={{ background: 'linear-gradient(135deg,#fb7185,#e11d48)', width: '100%', height: 40 }}>CLEAR LOCAL DATA</button>
        </Card>
      </div>
    </div>
  )
}

/* ─────────────── DOCS ─────────────── */
export function DocsPage() {
  return (
    <div className="ta-page">
      <Head title="Documentation" sub="Everything the terminal does — and everything it refuses to do on purpose." />
      <div className="grid-2">
        <Card title="QUICKSTART">
          <ol style={{ paddingLeft: 18, color: 'var(--muted)', fontSize: 13, display: 'grid', gap: 8 }}>
            <li>Paste a token address (or symbol) into the scanner and hit <b style={{ color: 'var(--text)' }}>ANALYZE</b>.</li>
            <li>Read the six deterministic signals in <b style={{ color: 'var(--text)' }}>Rug Check</b> — thresholds are public.</li>
            <li>Open <b style={{ color: 'var(--text)' }}>Cluster Analysis</b> to see coordinated wallet graphs.</li>
            <li>Ask the <b style={{ color: 'var(--text)' }}>AI Analyst</b> anything — it must cite the evidence or say “data not available”.</li>
          </ol>
        </Card>
        <Card title="THE 6 SIGNALS">
          <div className="rug-list">
            {[['Liquidity depth & lock', '30%'], ['FDV vs liquidity', '25%'], ['Volume vs liquidity', '15%'], ['24h buy/sell balance', '15%'], ['Pair age', '15%'], ['Wallet coordination', '20%']].map(([k, w]) => (
              <div className="rug-row" key={k}><span className="k">{k}</span><span className="v">{w} weight</span></div>
            ))}
          </div>
        </Card>
        <Card title="WHAT WE NEVER DO">
          <ul style={{ paddingLeft: 18, color: 'var(--muted)', fontSize: 13, display: 'grid', gap: 6 }}>
            <li>Execute trades or swaps — zero transaction paths exist.</li>
            <li>Hold funds or ask for private keys — balances are read from public addresses only.</li>
            <li>Sell buy/sell signals — the AI explains conditions, it never instructs.</li>
            <li>Hide missing data — “INSUFFICIENT DATA” is a first-class answer.</li>
          </ul>
        </Card>
        <Card title="API (WHEN WIRED)">
          <div className="mono-line">POST /api/scan { '{chain, address}' }</div>
          <div className="mono-line">POST /api/explain { '{chain, address, provider}' }</div>
          <div className="mono-line">POST /api/whale { '{address}' }</div>
          <div className="mono-line">GET&nbsp; /api/health</div>
          <p style={{ color: 'var(--dim)', fontSize: 11, marginTop: 10 }}>
            The UI already talks to a service layer — pointing it at the live backend is a config flip, not a redesign.
          </p>
        </Card>
      </div>
    </div>
  )
}

/* ─────────────── FEEDBACK ─────────────── */
export function FeedbackPage() {
  const [sent, setSent] = useState(false)
  const [text, setText] = useState('')
  return (
    <div className="ta-page">
      <Head title="Feedback" sub="Found a false positive? A cluster that looked fake but was an airdrop? Tell us — heuristics improve from misses." />
      <div className="grid-2">
        <Card title="SEND FEEDBACK">
          {sent ? <EmptyState icon="✓" title="Feedback received" hint="Thank you — every report trains the heuristics." /> : (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What did the terminal get right, wrong, or weird?"
                style={{ width: '100%', minHeight: 140, background: 'rgba(5,6,15,0.5)', border: '1px solid var(--line)', borderRadius: 10, padding: 14, color: 'var(--text)', fontSize: 13, resize: 'vertical', outline: 'none' }}
              />
              <button className="btn-analyze" style={{ marginTop: 12 }} onClick={() => text.trim() && setSent(true)}>SEND FEEDBACK</button>
            </>
          )}
        </Card>
        <Card title="SYSTEM STATUS">
          {SYSTEM_STATUS.map((s) => (
            <div className="sys-row" key={s.name}>
              <span className="n"><i style={{ background: 'var(--green)', width: 6, height: 6, borderRadius: 99, boxShadow: '0 0 8px var(--green)' }} />{s.name}</span>
              <span className="s" style={{ color: 'var(--green)', fontFamily: 'var(--f-mono)', fontSize: 11.5 }}>{s.state}</span>
            </div>
          ))}
          <div className="sys-foot"><span>REGION: AP-SOUTHEAST-1</span><span>·</span><span>PING: 41MS</span></div>
        </Card>
      </div>
    </div>
  )
}
