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
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let mx = 0, my = 0, tx = 0, ty = 0, raf = 0, pw = 0, phh = 0
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      if (!r.width || !r.height) return
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2
    }
    const paint = (t: number) => {
      const ctx = cv.getContext('2d')
      if (!ctx) return
      const w = cv.clientWidth, h = cv.clientHeight
      if (!w || !h) return
      const dpr = window.devicePixelRatio || 1
      if (w !== pw || h !== phh) {
        cv.width = w * dpr; cv.height = h * dpr
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        pw = w; phh = h
      }
      ctx.clearRect(0, 0, w, h)
      mx += (tx - mx) * 0.07
      my += (ty - my) * 0.07
      const offs = clusters.map((_, gi) => ({
        x: Math.sin(t * 0.13 + gi * 1.7) * w * 0.018 + mx * (7 + gi * 2.4),
        y: Math.cos(t * 0.11 + gi * 2.3) * h * 0.018 + my * (6 + gi * 2),
      }))
      const px = (gi: number, nd: { x: number; y: number; r: number }) => ({
        x: nd.x * w + offs[gi].x + nd.r * 1.9 * mx,
        y: nd.y * h + offs[gi].y + nd.r * 1.9 * my,
      })
      // collect wires first (3 passes: core, current, packet)
      const wires: { a: { x: number; y: number }; b: { x: number; y: number }; col: string; sp: number }[] = []
      clusters.forEach((g, gi) => {
        g.nodes.forEach((a, ii) => {
          g.nodes.slice(ii + 1).forEach((b) => {
            const d = Math.hypot((a.x - b.x) * w, (a.y - b.y) * h)
            if (d > w * 0.16) return
            wires.push({ a: px(gi, a), b: px(gi, b), col: g.color, sp: 18 + ((ii * 7 + gi * 13) % 16) })
          })
        })
      })
      // pass 1: core cable (wide glow + inner line)
      wires.forEach((w2) => {
        ctx.strokeStyle = w2.col + '15'
        ctx.lineWidth = 2.4
        ctx.beginPath(); ctx.moveTo(w2.a.x, w2.a.y); ctx.lineTo(w2.b.x, w2.b.y); ctx.stroke()
        ctx.strokeStyle = w2.col + '4d'
        ctx.lineWidth = 0.8
        ctx.beginPath(); ctx.moveTo(w2.a.x, w2.a.y); ctx.lineTo(w2.b.x, w2.b.y); ctx.stroke()
      })
      // pass 2: flowing current (dash motion, per-edge direction & speed)
      ctx.setLineDash([5, 16])
      wires.forEach((w2, wi) => {
        ctx.strokeStyle = w2.col + 'cc'
        ctx.lineWidth = 1
        ctx.lineDashOffset = -(t * w2.sp + wi * 37)
        ctx.beginPath(); ctx.moveTo(w2.a.x, w2.a.y); ctx.lineTo(w2.b.x, w2.b.y); ctx.stroke()
      })
      ctx.setLineDash([])
      // pass 3: packets riding the wire, sine fade + vertical wobble
      wires.forEach((w2, wi) => {
        if (wi % 3 !== 0) return
        const dx = w2.b.x - w2.a.x, dy = w2.b.y - w2.a.y
        const len = Math.hypot(dx, dy) || 1
        const nx = -dy / len, ny = dx / len
        const f = ((t * 0.22 + (wi % 10) / 10 + (wi * 0.13)) % 1)
        const wob = Math.sin(f * Math.PI * 3) * 1.6
        const x = w2.a.x + dx * f + nx * wob, y = w2.a.y + dy * f + ny * wob
        const al = Math.sin(f * Math.PI)
        const pg = ctx.createRadialGradient(x, y, 0, x, y, 5)
        pg.addColorStop(0, w2.col + Math.round(al * 200).toString(16).padStart(2, '0'))
        pg.addColorStop(1, 'transparent')
        ctx.fillStyle = pg
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = w2.col
        ctx.globalAlpha = al * 0.9
        ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 1
      })
      // cross-cluster bridges flow slowly too
      ctx.setLineDash([2, 10])
      ctx.strokeStyle = 'rgba(139,145,180,0.22)'
      ctx.lineWidth = 0.7
      ctx.lineDashOffset = -(t * 9)
      for (let gi = 0; gi < clusters.length - 1; gi++) {
        const a = clusters[gi].nodes[0], b = clusters[gi + 1].nodes[0]
        if (a && b) {
          const p2 = px(gi, a), q = px(gi + 1, b)
          ctx.beginPath(); ctx.moveTo(p2.x, p2.y); ctx.lineTo(q.x, q.y); ctx.stroke()
        }
      }
      ctx.setLineDash([])
      // nodes breathing (same as v2, slightly deeper)
      clusters.forEach((g, gi) => {
        g.nodes.forEach((nd, ni) => {
          const p2 = px(gi, nd)
          const br = Math.sin(t * 1.25 + gi * 2.1 + ni * 0.7)
          const r = nd.r * (1 + 0.22 * br)
          const grad = ctx.createRadialGradient(p2.x, p2.y, 0, p2.x, p2.y, r * 3.2)
          grad.addColorStop(0, g.color + '77')
          grad.addColorStop(1, 'transparent')
          ctx.fillStyle = grad
          ctx.beginPath(); ctx.arc(p2.x, p2.y, r * 3.2, 0, Math.PI * 2); ctx.fill()
          ctx.globalAlpha = 0.6 + 0.4 * (0.5 + 0.5 * br)
          ctx.beginPath(); ctx.arc(p2.x, p2.y, r, 0, Math.PI * 2)
          ctx.fillStyle = g.color; ctx.fill()
          ctx.globalAlpha = 1
        })
      })
    }
    const loop = () => {
      paint(performance.now() / 1000)
      raf = requestAnimationFrame(loop)
    }
    const onVis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden && !reduce) raf = requestAnimationFrame(loop)
    }
    if (reduce) paint(0)
    else {
      cv.addEventListener('pointermove', onMove)
      document.addEventListener('visibilitychange', onVis)
      raf = requestAnimationFrame(loop)
    }
    const ro = new ResizeObserver(() => paint(reduce ? 0 : performance.now() / 1000))
    ro.observe(cv)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      cv.removeEventListener('pointermove', onMove)
      document.removeEventListener('visibilitychange', onVis)
    }
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
