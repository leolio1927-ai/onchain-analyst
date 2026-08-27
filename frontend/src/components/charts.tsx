import { useEffect, useRef } from 'react'
import type { Candle, Cluster } from '../mock/data'

/* Canvas charts — DPR-crisp, deterministic, zero deps. */

function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const render = () => {
      const ctx = cv.getContext('2d')
      if (!ctx) return
      const dpr = window.devicePixelRatio || 1
      const w = cv.clientWidth, h = cv.clientHeight
      cv.width = w * dpr; cv.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      draw(ctx, w, h)
    }
    render()
    const ro = new ResizeObserver(render)
    ro.observe(cv)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return ref
}

export function CandleChart({ candles }: { candles: Candle[] }) {
  const ref = useCanvas((ctx, w, h) => {
    const padR = 52, padB = 22, padT = 8
    const cw = w - padR, ch = h - padB - padT
    const min = Math.min(...candles.map((c) => c.l))
    const max = Math.max(...candles.map((c) => c.h))
    const Y = (v: number) => padT + (1 - (v - min) / (max - min)) * ch
    // grid + right axis labels
    ctx.font = '9.5px JetBrains Mono, monospace'
    ctx.fillStyle = '#4c5478'
    ctx.strokeStyle = 'rgba(139,145,180,0.08)'
    for (let i = 0; i <= 4; i++) {
      const v = min + ((max - min) * i) / 4
      const y = Y(v)
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke()
      ctx.fillText(v.toExponential(1).replace('e-', 'e-'), cw + 6, y + 3)
    }
    // candles
    const slot = cw / candles.length
    const bw = Math.max(1.5, slot * 0.62)
    candles.forEach((c, i) => {
      const x = i * slot + slot / 2
      const up = c.c >= c.o
      ctx.strokeStyle = up ? '#34d399' : '#fb7185'
      ctx.fillStyle = up ? 'rgba(52,211,153,0.9)' : 'rgba(251,113,133,0.9)'
      ctx.beginPath(); ctx.moveTo(x, Y(c.h)); ctx.lineTo(x, Y(c.l)); ctx.lineWidth = 1; ctx.stroke()
      const y1 = Y(Math.max(c.o, c.c)), y2 = Y(Math.min(c.o, c.c))
      ctx.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1))
      // volume ghost
      ctx.fillStyle = up ? 'rgba(52,211,153,0.16)' : 'rgba(251,113,133,0.16)'
      const vh = (c.v / 520_000) * (ch * 0.22)
      ctx.fillRect(x - bw / 2, h - padB - vh, bw, vh)
    })
    // x labels
    ctx.fillStyle = '#4c5478'
    const times = ['12:00', '18:00', '00:00', '06:00', '12:00']
    times.forEach((t, i) => ctx.fillText(t, (cw / 4) * i, h - 6))
  }, [candles])
  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
}

export function RadarChart({ values, labels }: { values: number[]; labels: string[] }) {
  const ref = useCanvas((ctx, w, h) => {
    const cx = w / 2, cy = h / 2 + 4, R = Math.min(w, h) / 2 - 30
    const n = values.length
    const pt = (i: number, r: number) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n
      return [cx + Math.cos(a) * R * r, cy + Math.sin(a) * R * r]
    }
    // web
    ctx.strokeStyle = 'rgba(139,145,180,0.18)'
    for (const ring of [0.33, 0.66, 1]) {
      ctx.beginPath()
      for (let i = 0; i <= n; i++) {
        const [x, y] = pt(i % n, ring)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(i, 1)
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke()
    }
    // polygon
    ctx.beginPath()
    values.forEach((v, i) => {
      const [x, y] = pt(i, Math.max(0.08, v))
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.fillStyle = 'rgba(251,191,36,0.14)'
    ctx.fill()
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 1.6
    ctx.stroke()
    values.forEach((v, i) => {
      const [x, y] = pt(i, Math.max(0.08, v))
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2)
      ctx.fillStyle = '#fbbf24'; ctx.fill()
    })
    // labels
    ctx.font = '9.5px Inter, sans-serif'
    ctx.fillStyle = '#8a91b4'
    labels.forEach((lb, i) => {
      const [x, y] = pt(i, 1.22)
      ctx.textAlign = 'center'
      ctx.fillText(lb, x, y + 3)
    })
  }, [values])
  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
}

export function ClusterGraph({ clusters }: { clusters: Cluster[] }) {
  const ref = useCanvas((ctx, w, h) => {
    // edges between nodes of the same cluster
    clusters.forEach((g) => {
      ctx.strokeStyle = g.color + '33'
      ctx.lineWidth = 0.7
      g.nodes.forEach((a, i) => {
        g.nodes.slice(i + 1).forEach((b) => {
          const dx = (a.x - b.x) * w, dy = (a.y - b.y) * h
          if (Math.hypot(dx, dy) < w * 0.16) {
            ctx.beginPath()
            ctx.moveTo(a.x * w, a.y * h)
            ctx.lineTo(b.x * w, b.y * h)
            ctx.stroke()
          }
        })
      })
    })
    // cross-cluster faint edges
    ctx.strokeStyle = 'rgba(139,145,180,0.07)'
    for (let gi = 0; gi < clusters.length - 1; gi++) {
      const a = clusters[gi].nodes[0], b = clusters[gi + 1].nodes[0]
      if (a && b) { ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke() }
    }
    // nodes with glow
    clusters.forEach((g) => {
      g.nodes.forEach((nd) => {
        const x = nd.x * w, y = nd.y * h, r = nd.r
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 3)
        grad.addColorStop(0, g.color + '66')
        grad.addColorStop(1, 'transparent')
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = g.color; ctx.fill()
      })
    })
  }, [clusters])
  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
}

export function Spark({ seed, up }: { seed: number; up: boolean }) {
  const ref = useCanvas((ctx, w, h) => {
    let s = seed >>> 0
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
    const pts = Array.from({ length: 24 }, () => rnd())
    const min = Math.min(...pts), max = Math.max(...pts)
    ctx.beginPath()
    pts.forEach((v, i) => {
      const x = (w * i) / 23, y = 2 + (h - 4) * (1 - (v - min) / (max - min || 1))
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.strokeStyle = up ? '#34d399' : '#fb7185'
    ctx.lineWidth = 1.4
    ctx.stroke()
  }, [seed, up])
  return <canvas ref={ref} style={{ width: 72, height: 22, display: 'block' }} />
}

export function ScoreDial({ score, max = 100, label }: { score: number; max?: number; label: string }) {
  const pctv = score / max
  const color = score >= 75 ? '#fb7185' : score >= 45 ? '#fbbf24' : '#34d399'
  const ref = useCanvas((ctx, w, h) => {
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 8
    ctx.lineWidth = 8; ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(139,145,180,0.15)'
    ctx.beginPath(); ctx.arc(cx, cy, R, 0.75 * Math.PI, 2.25 * Math.PI); ctx.stroke()
    ctx.strokeStyle = color
    ctx.shadowColor = color; ctx.shadowBlur = 10
    ctx.beginPath(); ctx.arc(cx, cy, R, 0.75 * Math.PI, 0.75 * Math.PI + 1.5 * Math.PI * pctv)
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.fillStyle = color
    ctx.font = `700 ${R * 0.62}px Inter, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(String(score), cx, cy + R * 0.18)
    ctx.fillStyle = '#8a91b4'
    ctx.font = `500 ${R * 0.17}px Inter, sans-serif`
    ctx.fillText(label, cx, cy + R * 0.52)
  }, [score, label])
  return <canvas ref={ref} style={{ width: 110, height: 110, display: 'block' }} />
}
