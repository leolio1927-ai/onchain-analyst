import { useEffect, useMemo, useState } from 'react'
import { ALERTS, MEMEATCHI, SYSTEM_STATUS } from '../mock/data'
import { AiPanel } from '../components/AiPanel'
import type { LiveChain } from '../lib/liveApi'
import { LIVE_CHAINS, LIVE_CHAIN_LABEL } from '../lib/liveApi'
import { fmtPct, fmtPrice, fmtUsdCompact, fmtUtcClock, shorten } from '../lib/liveFormat'
import { WATCH_CAP, addWatchItem, removeWatchItem, setWatchAmount, useWatchlist } from '../lib/watchlist'
import { Badge, Card, EmptyState, Meter, Skeleton, Tabs, Toggle } from '../components/ui'

function Head({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div><div className="page-title">{title}</div><div className="page-sub">{sub}</div></div>
      {right}
    </div>
  )
}

/* ─────────────── AI ANALYST (full page) ─────────────── */
export function AiPage() {
  return (
    <div className="ta-page">
      <Head title="AI Analyst" sub="Evidence-first reasoning: the model only sees the heuristic evidence block. Free and Deep differ in depth — never in data correctness." right={<Badge color="purple">DEEP ANALYSIS</Badge>} />
      <div className="grid-23">
        <Card>
          <AiPanel token={MEMEATCHI} full />
        </Card>
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <Card title="ACTIVE CONTEXT">
            <div className="rug-list">
              <div className="rug-row"><span className="k">Token</span><span className="v">{MEMEATCHI.symbol}</span></div>
              <div className="rug-row"><span className="k">Chain</span><span className="v">SOLANA</span></div>
              <div className="rug-row"><span className="k">Risk</span><span className="v ok-warn">{MEMEATCHI.risk.level} · {MEMEATCHI.risk.score}/100</span></div>
              <div className="rug-row"><span className="k">Evidence block</span><span className="v ok-yes">6 signals</span></div>
            </div>
          </Card>
          <Card title="GROUNDING LOG">
            <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>
              Every answer is logged next to the exact evidence the model saw — replayable and
              comparable across Claude / GLM / Kimi. What isn't in the data doesn't exist here.
            </p>
            <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
              {['claude · deep · 1,204 tok', 'glm · free · 640 tok', 'kimi · free · 702 tok'].map((l) => (
                <div key={l} className="mono-line">{l}</div>
              ))}
            </div>
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

/* ─────────────── HOLDINGS CHECK ─────────────── */
export function HoldingsPage() {
  const [addr, setAddr] = useState('')
  const [checked, setChecked] = useState(false)
  return (
    <div className="ta-page">
      <Head title="Holdings Check" sub="Paste a PUBLIC wallet address — we read balances, we never ask for keys. No custody, ever." right={<Badge color="green">NO CUSTODY</Badge>} />
      <div className="ta-searchrow">
        <div className="ta-search">
          <span style={{ color: 'var(--dim)' }}>▣</span>
          <input placeholder="Public wallet address (read-only)…" value={addr} onChange={(e) => setAddr(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setChecked(true)} spellCheck={false} />
        </div>
        <button className="btn-analyze" onClick={() => setChecked(true)}>CHECK</button>
      </div>
      {!checked ? (
        <Card><EmptyState icon="▣" title="No wallet checked yet" hint="Paste a public address — we never connect wallets or ask for private keys" /></Card>
      ) : (
        <div className="grid-2">
          <Card title={`WALLET ${addr.slice(0, 8) || '7xKX…pump'}…`}>
            <div className="rug-list">
              <div className="rug-row"><span className="k">SOL balance</span><span className="v">142.06</span></div>
              <div className="rug-row"><span className="k">Tokens held</span><span className="v">6</span></div>
              <div className="rug-row"><span className="k">Estimated value</span><span className="v">$24,318</span></div>
              <div className="rug-row"><span className="k">Top position</span><span className="v">{MEMEATCHI.symbol} (34%)</span></div>
            </div>
          </Card>
          <Card title="EXPOSURE BY RISK">
            {[['Low risk', 38, '#34d399'], ['Medium risk', 44, '#fbbf24'], ['High risk', 18, '#fb7185']].map(([k, v, c]) => (
              <div key={k as string} style={{ margin: '10px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>
                  <span>{k as string}</span><span className="mono">{v as number}%</span>
                </div>
                <Meter value={v as number} color={c as string} />
              </div>
            ))}
            <p style={{ color: 'var(--dim)', fontSize: 11, marginTop: 12 }}>Read-only view from public chain data. This product cannot move funds — by design.</p>
          </Card>
        </div>
      )}
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
        <Card title="AI PROVIDER">
          <p style={{ color: 'var(--muted)', fontSize: 12.5, marginBottom: 12 }}>
            Same evidence block goes to whichever brain you pick — compare answers in the grounding log.
          </p>
          <div className="ai-mode">
            <button className="on">CLAUDE</button><button>GLM</button><button>KIMI</button>
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
