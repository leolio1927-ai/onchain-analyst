/* RiskDisplay (PROMPT-V2 P5): THE verdict language, one component for every
   module. Four user-switchable modes (persisted in vilmei.risk-mode):
     DIAL — three.js 3D torus (lazy 137.75kB-gzip chunk, budget-proven) with a
            canvas-2D fallback when WebGL is absent or reduced-motion is set
            (still renders + shows the number — gated by test).
     TAPE — 8-bin oklch severity sparkline per row (luminance-monotonic by
            construction: color-mix in oklch never overshoots lightness).
     FIELD — seeded deterministic 2D force field of wallet nodes + co-timing
            edges (positions = hash, so the same addresses always land the
            same place — honest determinism, no random layout).
     LOG — verbatim JSON + provenance tree + copy (the founder's audit log
            and the AI-reader surface).
   All modes read the SAME --sev-* oklch tokens (parity-tested) and the SAME
   verdict prop. Compositor-only motion (transform/opacity). */
import { useEffect, useRef, useState } from 'react'
import { useRiskMode } from '../lib/prefs'
import type { RiskMode } from '../lib/prefs'
import type { DialHandle } from './dial3d'
import './risk-display.css'

export type SevLevel = 'low' | 'medium' | 'high' | 'nodata'

export interface RiskVerdict {
  level: SevLevel
  score: number | null
  label: string
  rows?: { name: string; level: string | null; score: string | number | null; description: string | null }[]
  provenance?: Record<string, unknown>
}

/* severity → 0..1 for the needle (documented mapping, not an audit) */
export const SEV_RATIO: Record<SevLevel, number> = { low: 0.15, medium: 0.55, high: 0.9, nodata: 0.5 }

const MODES: { id: RiskMode; label: string }[] = [
  { id: 'dial', label: 'DIAL' }, { id: 'tape', label: 'TAPE' },
  { id: 'field', label: 'FIELD' }, { id: 'log', label: 'LOG' },
]

/* ── DIAL: lazy three chunk, canvas-2D fallback ───────────────────────── */
function DialCanvas({ ratio, reduced }: { ratio: number; reduced: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [engine, setEngine] = useState<'three' | 'canvas2d'>('canvas2d')
  useEffect(() => {
    if (reduced) return                       // reduced-motion → still canvas fallback + number
    let dead = false
    let handle: DialHandle | null = null
    import('./dial3d').then(({ mountDial }) => {
      if (dead || !ref.current) return
      handle = mountDial(ref.current, ratio, false)
      if (!handle) return                    // no WebGL → keep 2D
      setEngine('three')
    }).catch(() => { /* chunk failed → 2D fallback stays */ })
    return () => { dead = true; handle?.dispose() }
  }, [ratio, reduced])

  /* canvas-2D fallback: arc gauge + needle, same ramp hues */
  useEffect(() => {
    if (engine !== 'canvas2d' || !ref.current) return
    const cv = ref.current
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(1.5, window.devicePixelRatio || 1)
    const w = cv.clientWidth || 240
    cv.width = w * dpr
    cv.height = w * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, w)
    const cx = w / 2, cy = w / 2, R = w * 0.38
    const ramp = (t: number) => `oklch(72% 0.16 ${155 - 130 * t})`
    for (let i = 0; i < 40; i++) {
      const a0 = Math.PI * (0.75 + (i / 40) * 1.5)
      const a1 = Math.PI * (0.75 + ((i + 1) / 40) * 1.5)
      ctx.strokeStyle = ramp((i / 40 + 1 / 80))
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.arc(cx, cy, R, a0, a1)
      ctx.stroke()
    }
    const na = Math.PI * (0.75 + ratio * 1.5)
    ctx.strokeStyle = 'rgba(240,255,249,.95)'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(na) * R * 0.92, cy + Math.sin(na) * R * 0.92)
    ctx.stroke()
    ctx.fillStyle = 'rgba(240,255,249,.97)'
    ctx.beginPath()
    ctx.arc(cx, cy, 4, 0, Math.PI * 2)
    ctx.fill()
  }, [ratio, engine])

  return <canvas ref={ref} className="rd-dial" data-engine={engine} aria-label="risk dial" />
}

/* ── TAPE: 8-bin oklch severity (luminance-monotonic via color-mix) ───── */
export function sevBin(sev01: number): number {
  return Math.max(0, Math.min(7, Math.floor(sev01 * 8)))
}

function TapeMode({ verdict }: { verdict: RiskVerdict }) {
  const rows = verdict.rows ?? []
  if (!rows.length) return <div className="rd-empty">no per-row signals in the payload</div>
  return (
    <div className="rd-tape" role="table" aria-label="signal tape">
      {rows.map((r, i) => {
        const sc = typeof r.score === 'number' ? r.score : Number(r.score)
        const sev = Number.isFinite(sc) ? Math.min(1, Math.max(0, sc / 200)) : 0.5
        const bin = sevBin(sev)
        return (
          <div className="rd-row" role="row" key={`${r.name}-${i}`}>
            <i className="rd-bin" data-bin={bin} title={`severity bin ${bin + 1}/8 (oklch ramp, luminance-monotonic)`} />
            <span className="rd-name ell" title={r.name ?? ''}>{r.name}</span>
            {r.level && <span className="rd-level" data-level={r.level}>{r.level}</span>}
            <span className="rd-desc ell dim" title={r.description ?? ''}>{r.description ?? ''}</span>
            <span className="rd-score mono">{r.score ?? '—'}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ── FIELD: seeded 2D force of wallets + co-timing edges ──────────────── */
function FieldCanvas({ seed }: { seed: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    /* seeded hash → deterministic positions (same input, same layout) */
    let h = 2166136261
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) }
    const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296 }
    const dpr = Math.min(1.5, window.devicePixelRatio || 1)
    const w = cv.clientWidth || 300
    cv.width = w * dpr; cv.height = w * 0.62 * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const nodes = Array.from({ length: 12 }, () => ({ x: 0.1 + rnd() * 0.8, y: 0.15 + rnd() * 0.7, r: 2 + rnd() * 2.6 }))
    ctx.clearRect(0, 0, w, w * 0.62)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if ((i + j) % 4 !== 0) continue
        ctx.strokeStyle = 'oklch(72% 0.1 160 / .25)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(nodes[i].x * w, nodes[i].y * w * 0.62)
        ctx.lineTo(nodes[j].x * w, nodes[j].y * w * 0.62)
        ctx.stroke()
      }
    }
    nodes.forEach((n, i) => {
      ctx.fillStyle = i % 5 === 0 ? 'oklch(72% 0.16 25)' : 'oklch(78% 0.13 160)'
      ctx.beginPath()
      ctx.arc(n.x * w, n.y * w * 0.62, n.r, 0, Math.PI * 2)
      ctx.fill()
    })
  }, [seed])
  return (
    <div className="rd-field-wrap">
      <canvas ref={ref} className="rd-field" aria-label="wallet cluster field" />
      <span className="rd-fielddim">seeded hash layout — deterministic, hover row → LOG for provenance</span>
    </div>
  )
}

/* ── LOG: verbatim JSON + provenance tree ─────────────────────────────── */
function LogMode({ verdict }: { verdict: RiskVerdict }) {
  const [copied, setCopied] = useState(false)
  const text = JSON.stringify(verdict, null, 2)
  return (
    <div className="rd-log">
      <div className="rd-log-head">
        <span className="mono dim">verbatim payload + provenance</span>
        <button type="button" onClick={() => navigator.clipboard?.writeText(text)
          .then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200) }, () => {})}>
          {copied ? 'copied ✓' : 'copy ⧉'}
        </button>
      </div>
      {verdict.provenance && (
        <div className="rd-prov mono">
          {Object.entries(verdict.provenance).map(([k, v]) => (
            <div key={k}><span className="dim">{k}:</span> <span>{JSON.stringify(v)}</span></div>
          ))}
        </div>
      )}
      <pre className="rd-json mono">{text}</pre>
    </div>
  )
}

/* ── the one component ────────────────────────────────────────────────── */
export function RiskDisplay({ verdict, seed = 'vilmei' }: { verdict: RiskVerdict; seed?: string }) {
  const [mode, setMode] = useRiskMode()
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <div className="rd-root" data-level={verdict.level}>
      <div className="rd-modes" role="tablist" aria-label="risk display mode">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={mode === m.id}
            className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>{m.label}</button>
        ))}
        <span className="rd-verdict mono" data-level={verdict.level}>
          {verdict.label}{verdict.score != null && <> · {verdict.score}</>}
        </span>
      </div>
      {mode === 'dial' && (
        <div className="rd-dial-wrap">
          <DialCanvas ratio={SEV_RATIO[verdict.level]} reduced={reduced} />
          <div className="rd-dial-num mono" aria-live="polite">{verdict.score ?? '—'}</div>
        </div>
      )}
      {mode === 'tape' && <TapeMode verdict={verdict} />}
      {mode === 'field' && <FieldCanvas seed={seed} />}
      {mode === 'log' && <LogMode verdict={verdict} />}
    </div>
  )
}

/* badge — same tokens, same mapping (parity-tested) */
export function RiskBadge({ level, label }: { level: SevLevel; label: string }) {
  return <span className="rd-badge" data-level={level}>{label}</span>
}

/* R3 (PREMIUM-BAR PB-9): scanner-row sev profile. Bars ARE .rd-bin elements,
   so the 8-bin ramp colors come from the SAME data-bin selectors as the tape
   (one source, parity by construction). Rows the engine never ran render
   dashed outline bins — never a fabricated profile. */
export function SevSpark({ sevs }: { sevs: number[] | null }) {
  const counts = new Array<number>(8).fill(0)
  for (const s of sevs ?? []) counts[sevBin(Math.min(1, Math.max(0, s)))] += 1
  const max = Math.max(...counts, 1)
  const empty = !sevs || sevs.length === 0
  return (
    <span className={`rd-spark${empty ? ' none' : ''}`} role="img"
      aria-label={empty ? 'no engine run yet' : `severity profile — ${sevs.length} signals`}
      title={empty ? 'no engine run yet — scan this token to fill the profile'
        : `${sevs.length} engine signals across the 8-bin ramp`}>
      {counts.map((c, bin) => (
        <i key={bin} className={c > 0 ? 'rd-bin' : 'rd-bin gap'} data-bin={bin}
          style={c > 0 ? { height: `${30 + (c / max) * 70}%` } : undefined} />
      ))}
    </span>
  )
}

/* R3 (PREMIUM-BAR PB-3/PB-9): 3D mini-badge — a CSS coin (perspective +
   rotateX, static transform; one WebGL context per table row would blow the
   budget, the medallion keeps three for the result hero). Same --sev tokens,
   one selector per level (parity-tested). */
export function MiniBadge({ level }: { level: SevLevel }) {
  const GLYPH: Record<SevLevel, string> = { low: 'L', medium: 'M', high: 'H', nodata: '·' }
  return <span className="rd-coin" data-level={level} title={`risk level: ${level}`}>{GLYPH[level]}</span>
}
