import { useEffect, useRef, useState } from 'react'
import type { Assessment, Pair, ScanResult, Signal } from '../api'

/* ---------- formatting (mirrors ui/dashboard.py) ---------- */

export function usd(v: unknown): string {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  if (typeof n !== 'number' || Number.isNaN(n) || n === 0) return 'n/a'
  if (n > 0 && n < 1) {
    const s = `$${n.toFixed(10)}`.replace(/0+$/, '')
    return s.length <= 14 ? s : `$${n.toExponential(3)}`
  }
  for (const [div, suf] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']] as const) {
    if (Math.abs(n) >= div) return `$${(n / div).toFixed(2)}${suf}`
  }
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export function pct(v: unknown): string {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  if (typeof n !== 'number' || Number.isNaN(n)) return 'n/a'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

export function sevCls(sev: number | null): string {
  if (sev === null) return 'l-dim'
  if (sev >= 0.65) return 'l-high'
  if (sev >= 0.4) return 'l-med'
  if (sev > 0) return 'l-low'
  return 'l-ok'
}

/* ---------- stat cards ---------- */

export function StatCards({ pair, assessment }: { pair: Pair; assessment: Assessment }) {
  const pc = pair.priceChange ?? {}
  const liq = pair.liquidity?.usd
  const delta = (v: unknown) => {
    const n = typeof v === 'string' ? parseFloat(v) : (v as number)
    return typeof n === 'number' && !Number.isNaN(n) ? n : 0
  }
  return (
    <section className="t-topbar">
      <div className="t-card">
        <span className="t-label">Price</span>
        <span className="t-value">{usd(pair.priceUsd)}</span>
        <span className={`t-delta ${delta(pc.m5) > 0 ? 'up' : delta(pc.m5) < 0 ? 'down' : ''}`}>
          {delta(pc.m5) > 0 ? '▲' : delta(pc.m5) < 0 ? '▼' : '•'} {pct(pc.m5)}
        </span>
      </div>
      <div className="t-card">
        <span className="t-label">Liquidity</span>
        <span className="t-value">{usd(liq)}</span>
        <span className="t-delta">source: dexscreener</span>
      </div>
      <div className="t-card">
        <span className="t-label">Vol 24h</span>
        <span className="t-value">{usd(pair.volume?.h24)}</span>
        <span className="t-delta">vs liquidity {usd(liq) !== 'n/a' && liq ? `${((pair.volume?.h24 ?? 0) / liq).toFixed(2)}x` : 'n/a'}</span>
      </div>
      <div className="t-card">
        <span className="t-label">FDV</span>
        <span className="t-value">{usd(pair.fdv ?? pair.marketCap)}</span>
        <span className={`t-delta ${delta(pc.h24) > 0 ? 'up' : delta(pc.h24) < 0 ? 'down' : ''}`}>
          {delta(pc.h24) > 0 ? '▲' : delta(pc.h24) < 0 ? '▼' : '•'} 24h {pct(pc.h24)}
        </span>
      </div>
      <div className={`t-risk r-${assessment.level}`}>
        {assessment.level_label}
        {assessment.score !== null ? ` ${Math.round(assessment.score)}` : ''}
      </div>
    </section>
  )
}

/* ---------- watchlist table ---------- */

export function TokenTable({ entries, activeKey, onPick }: {
  entries: ScanResult[]
  activeKey: string | null
  onPick: (key: string) => void
}) {
  const sorted = [...entries].sort(
    (a, b) => (b.pair.liquidity?.usd ?? 0) - (a.pair.liquidity?.usd ?? 0))
  return (
    <div className="t-table-wrap">
      <table className="t-table">
        <thead>
          <tr>
            <th>Pair</th><th>DEX</th><th className="r">Price</th><th className="r">5m</th>
            <th className="r">1h</th><th className="r">24h</th><th className="r">Liquidity</th>
            <th className="r">Vol 24h</th><th className="r">FDV</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => {
            const key = e.pair.pairAddress ?? e.pair.baseToken.address
            const pc = e.pair.priceChange ?? {}
            return (
              <tr key={key} className={key === activeKey ? 'active' : ''} onClick={() => onPick(key)}>
                <td>{e.pair.baseToken.symbol}/{e.pair.quoteToken.symbol}</td>
                <td className="dim">{e.pair.dexId}</td>
                <td className="r mono">{usd(e.pair.priceUsd)}</td>
                <td className="r mono">{pct(pc.m5)}</td>
                <td className="r mono">{pct(pc.h1)}</td>
                <td className="r mono">{pct(pc.h24)}</td>
                <td className="r mono">{usd(e.pair.liquidity?.usd)}</td>
                <td className="r mono">{usd(e.pair.volume?.h24)}</td>
                <td className="r mono">{usd(e.pair.fdv ?? e.pair.marketCap)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- estimated 24h chart (same math as the TUI) ---------- */

export function PriceChart({ pair }: { pair: Pair | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = cv.clientWidth, h = cv.clientHeight
    cv.width = w * dpr; cv.height = h * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const price = parseFloat(pair?.priceUsd ?? '0') || 0
    const pc = pair?.priceChange ?? {}
    // denominators <= 0 (a literal -100% rug) clamp to 0 — never divide by zero
    const pts = (['h24', 'h6', 'h1', 'm5'] as const).map((k) => {
      const d = 1 + (pc[k] ?? 0) / 100
      return d > 0 ? price / d : 0
    })
    pts.push(price)
    const base = pts[0] || 1
    const rel = pts.map((v) => (v / base) * 100)

    // grid
    ctx.strokeStyle = 'rgba(139,152,169,0.10)'
    ctx.lineWidth = 1
    for (let i = 1; i <= 3; i++) {
      const y = (h - 26) * (i / 4) + 4
      ctx.beginPath(); ctx.moveTo(34, y); ctx.lineTo(w - 6, y); ctx.stroke()
    }
    // area + line
    const min = Math.min(...rel), max = Math.max(...rel)
    const pad = Math.max((max - min) * 0.15, 1)
    const lo = min - pad, hi = max + pad
    const X = (i: number) => 34 + ((w - 46) * i) / (rel.length - 1)
    const Y = (v: number) => 6 + (h - 36) * (1 - (v - lo) / (hi - lo))
    ctx.beginPath()
    rel.forEach((v, i) => (i === 0 ? ctx.moveTo(X(i), Y(v)) : ctx.lineTo(X(i), Y(v))))
    ctx.strokeStyle = '#ffb000'; ctx.lineWidth = 2; ctx.stroke()
    ctx.lineTo(X(rel.length - 1), h - 26); ctx.lineTo(X(0), h - 26); ctx.closePath()
    ctx.fillStyle = 'rgba(255,176,0,0.07)'; ctx.fill()
    // last point
    ctx.beginPath(); ctx.arc(X(rel.length - 1), Y(rel[rel.length - 1]), 3.2, 0, Math.PI * 2)
    ctx.fillStyle = '#ffb000'; ctx.fill()
    // labels
    ctx.fillStyle = '#5c6a7d'; ctx.font = '10px JetBrains Mono, monospace'
    const labels = ['24h', '6h', '1h', '5m', 'now']
    labels.forEach((lb, i) => ctx.fillText(lb, X(i) - 8, h - 8))
    ctx.fillText(`100 = 24h ago · est.`, 34, 14)
    ctx.fillStyle = '#ffb000'
    ctx.fillText(`${rel[rel.length - 1].toFixed(1)}`, X(rel.length - 1) - 10, Y(rel[rel.length - 1]) - 8)
  }, [pair])
  return (
    <div className="t-chart card">
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
      {!pair && <div className="t-chart-empty">no token loaded — /load sol &lt;address&gt;</div>}
    </div>
  )
}

/* ---------- log stream ---------- */

export interface LogLine { cls: string; text: string }

export function LogStream({ lines }: { lines: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [lines])
  return (
    <div className="t-log card" ref={ref}>
      {lines.map((l, i) => (
        <div key={i} className={`t-line ${l.cls}`}>{l.text}</div>
      ))}
    </div>
  )
}

/* ---------- command bar ---------- */

export function CommandBar({ onSubmit, busy, inputRef }: {
  onSubmit: (text: string) => void
  busy: boolean
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  const [value, setValue] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [hIdx, setHIdx] = useState(-1)

  const submit = () => {
    const t = value.trim()
    if (!t || busy) return
    setHistory((h) => [...h.filter((x) => x !== t), t].slice(-40))
    setHIdx(-1)
    setValue('')
    onSubmit(t)
  }

  return (
    <div className="t-cmdbar">
      <span className="t-prompt">α</span>
      <input
        ref={inputRef}
        value={value}
        disabled={busy}
        placeholder={busy ? 'working…' : '/load sol <address>  ·  /verify  ·  /cluster  ·  /explain [claude|glm|kimi]  ·  /whale <address>  ·  /help'}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          else if (e.key === 'ArrowUp' && history.length) {
            e.preventDefault()
            const i = hIdx < 0 ? history.length - 1 : Math.max(0, hIdx - 1)
            setHIdx(i); setValue(history[i])
          } else if (e.key === 'ArrowDown' && hIdx >= 0) {
            e.preventDefault()
            const i = hIdx + 1 >= history.length ? -1 : hIdx + 1
            setHIdx(i); setValue(i < 0 ? '' : history[i])
          }
        }}
        spellCheck={false}
        autoComplete="off"
      />
      <button className="t-run" onClick={submit} disabled={busy}>{busy ? '…' : 'Run'}</button>
    </div>
  )
}

export function signalLine(s: Signal): string {
  const w = `(weight ${Math.round(s.weight * 100)}%)`
  return `${s.label} — ${s.evidence} ${w}`
}
