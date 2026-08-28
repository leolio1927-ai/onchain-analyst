import { useMemo, useState } from 'react'
import { ALERTS, MEMEATCHI, PORTFOLIO, SYSTEM_STATUS } from '../mock/data'
import { AiPanel } from '../components/AiPanel'
import { Spark } from '../components/charts'
import { Badge, Card, EmptyState, Meter, Tabs, Toggle } from '../components/ui'

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

/* ─────────────── PORTFOLIO WATCH ─────────────── */
export function PortfolioPage() {
  const total = useMemo(() => PORTFOLIO.reduce((s, p) => s + p.value, 0), [])
  return (
    <div className="ta-page">
      <Head title="Portfolio Watch" sub="Watchlist values from public market data only — no wallet connection, no custody." right={<Badge color="cyan">READ-ONLY</Badge>} />
      <div className="grid-3">
        <Card title="TOTAL VALUE"><div style={{ fontFamily: 'var(--f-display)', fontSize: 30, fontWeight: 700 }}>${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div className="up mono" style={{ fontSize: 13, marginTop: 4 }}>+18.4% (24h)</div></Card>
        <Card title="POSITIONS"><div style={{ fontFamily: 'var(--f-display)', fontSize: 30, fontWeight: 700 }}>{PORTFOLIO.length}</div>
          <div className="mono" style={{ fontSize: 13, marginTop: 4, color: 'var(--muted)' }}>avg risk 52/100</div></Card>
        <Card title="TOP MOVER"><div style={{ fontFamily: 'var(--f-display)', fontSize: 30, fontWeight: 700 }}>PEPEKING</div>
          <div className="up mono" style={{ fontSize: 13, marginTop: 4 }}>+41.2% (24h)</div></Card>
      </div>
      <Card title="HOLDINGS">
        <div className="ta-table-wrap">
          <table className="ta-table">
            <thead><tr><th>Token</th><th>Chain</th><th className="r">Amount</th><th className="r">Value</th><th className="r">24h</th><th>Trend</th><th className="r">Risk</th></tr></thead>
            <tbody>
              {PORTFOLIO.map((p) => (
                <tr key={p.symbol}>
                  <td><b>{p.symbol}</b></td>
                  <td className="mono dim">{p.chain.toUpperCase()}</td>
                  <td className="r mono">{p.amount.toLocaleString('en-US')}</td>
                  <td className="r mono">${p.value.toFixed(2)}</td>
                  <td className={`r mono ${p.chg >= 0 ? 'up' : 'down'}`}>+{p.chg}%</td>
                  <td><Spark seed={p.spark} up={p.chg >= 0} /></td>
                  <td className="r"><span className={`ta-badge ${p.risk >= 70 ? 'b-red' : p.risk >= 50 ? 'b-amber' : 'b-green'}`}>{p.risk}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
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
          <div className="mono" style={{ color: 'var(--purple-2)', fontSize: 12, margin: '4px 0 14px' }}>VALID UNTIL 2026-12-31</div>
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
