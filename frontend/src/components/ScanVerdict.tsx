/* V5 visual pass — ScanVerdict: the landing verdict card, ported to the
   terminal. Same engine output (/api/scan), same honesty law — the terminal
   scanner now renders the gauge + metrics strip + signal bars instead of a
   bare key-value list. All colors ride the tokens (--emb-* chain band,
   --brand family); no new hex except the shared risk-rose already in use. */
import { useEffect, useState, type CSSProperties } from 'react'
import type { ScanResult } from '../api'
import { fmtUsdCompact, fmtPrice, fmtPct, fmtCount } from '../lib/liveFormat'

/* chain accent — derives from the embroidery band, no new hex */
const ACCENT: Record<string, string> = {
  sol: 'var(--emb-sol)', bnb: 'var(--emb-bnb)', base: 'var(--emb-base)',
  hype: 'var(--emb-hype)', hood: 'var(--emb-hood)',
}

export function ScanSevBar({ severity }: { severity: number | null }) {
  if (severity === null || severity === undefined) return <span className="lv-ns">NOT SCORED</span>
  if (severity <= 0) return <span className="lv-sev"><span className="ok">✓</span></span>
  const pct = Math.max(0, Math.min(1, severity)) * 100
  return <span className="lv-sev"><span className={`fill${severity >= 0.5 ? ' hot' : ''}`} style={{ width: `${pct}%` }} /></span>
}

/* semi-circular gauge with eased count-up — reduced motion renders instantly */
function Gauge({ score, level }: { score: number | null; level: string }) {
  const color = level === 'low' ? 'var(--emb-sol)' : level === 'medium' ? 'var(--emb-bnb)' : level === 'high' ? '#FB7185' : '#649580'
  const [v, setV] = useState(0)
  useEffect(() => {
    if (score === null || score === undefined) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(score); return }
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700)
      setV(score * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [score])
  const R = 54
  const arc = Math.PI * R
  const filled = ((v ?? 0) / 100) * arc
  return (
    <svg viewBox="0 0 148 84" className="lv-gauge" role="img"
      aria-label={`Risk score ${score ?? 'unavailable'} of 100`}>
      <path d={`M 18 74 A ${R} ${R} 0 0 1 130 74`} fill="none" stroke="rgba(22,53,42,.9)"
        strokeWidth="10" strokeLinecap="round" />
      <path d={`M 18 74 A ${R} ${R} 0 0 1 130 74`} fill="none" stroke={color} strokeWidth="10"
        strokeLinecap="round" strokeDasharray={`${filled} ${arc}`}
        style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      <text x="74" y="62" textAnchor="middle" className="lv-gauge-num"
        style={{ fill: score ? color : 'var(--dim)' }}>{score === null || score === undefined ? '–' : Math.round(v)}</text>
      <text x="74" y="78" textAnchor="middle" className="lv-gauge-sub">/100 RISK</text>
    </svg>
  )
}

export function ScanVerdict({ res, chain }: { res: ScanResult; chain: string }) {
  const p = res.pair
  const a = res.assessment
  const acc = ACCENT[chain] ?? 'var(--brand)'
  const top = [...a.signals].filter((x) => x.severity !== null)
    .sort((x, y) => (y.severity ?? 0) - (x.severity ?? 0))[0]
  const tx = p.txns?.h24
  const lvl = a.level
  return (
    <div className="sc-verdict" style={{ '--acc': acc } as CSSProperties}>
      <div className="lv-verdict">
        <div className="lv-vhd">
          <div className="lv-toktile" aria-hidden="true">{(p.baseToken.symbol ?? '?').slice(0, 1)}</div>
          <div>
            <div className="lv-vhd-row">
              <span className="sym">{p.baseToken.symbol ?? '—'}</span>
              {res.launch_venue && <span className="venue">{res.launch_venue.toUpperCase()}</span>}
              {top && (top.severity ?? 0) >= 0.5 && (
                <span className="lv-toprisk">TOP RISK DRIVER · {top.label.toUpperCase()}</span>
              )}
            </div>
            <div className="pair">{p.baseToken.address} · {(p.quoteToken?.symbol ?? '–').toUpperCase()}</div>
          </div>
          <span style={{ marginLeft: 'auto' }} className={`lv-status ${lvl === 'low' ? 'live' : lvl === 'high' ? 'high' : 'sim'}`}>
            {a.level_label}
          </span>
        </div>
        <div className="lv-scorebox">
          <Gauge score={a.score} level={lvl} />
          <div style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.7, maxWidth: 480 }}>
            Weighted combination of the signals below — thresholds public in
            heuristics/rug_check.py. Higher = riskier. Never a binary verdict.
          </div>
        </div>
        <div className="lv-mstrip">
          <div><span>PRICE</span><b>{fmtPrice(p.priceUsd ?? null)}</b></div>
          <div><span>CHG 24H</span><b className={Number(p.priceChange?.h24 ?? 0) < 0 ? 'down' : 'up'}>{fmtPct(p.priceChange?.h24 ?? null)}</b></div>
          <div><span>LIQUIDITY</span><b>{fmtUsdCompact(p.liquidity?.usd ?? null)}</b></div>
          <div><span>FDV</span><b>{fmtUsdCompact(p.fdv ?? null)}</b></div>
          <div><span>VOL 24H</span><b>{fmtUsdCompact(p.volume?.h24 ?? null)}</b></div>
          <div><span>TXNS 24H</span><b>{tx ? fmtCount(tx.buys + tx.sells) : '–'}</b></div>
        </div>
        <div className="lv-sigs">
          {a.signals.map((sig) => (
            <div className="lv-sig" key={sig.key}>
              <span className="lb">{sig.label}</span>
              <span className="wt">{Math.round(sig.weight * 100)}%</span>
              <ScanSevBar severity={sig.severity} />
              <span className="ev">{sig.evidence || '–'}</span>
            </div>
          ))}
        </div>
        <div className="lv-cluster">
          <b>WALLET CLUSTERING</b>
          <span>{res.clustering.evidence || `${res.clustering.wallets} wallets · ${res.clustering.buys} buys`}</span>
        </div>
        {a.notes.length > 0 && (
          <div className="lv-cluster">
            <b>NOTES</b>
            <span>{a.notes.join(' · ')}</span>
          </div>
        )}
      </div>
      <div className="lv-scanft">
        <span>POST /api/scan · SAME ENGINE AS THE TUI</span>
        <span>SOURCES: {res.sources.join(' + ').toUpperCase()}</span>
        <span>TS {res.ts}</span>
        <span>DATA_MODE {res.data_mode.toUpperCase()}</span>
      </div>
    </div>
  )
}
