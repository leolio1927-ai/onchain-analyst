import { useEffect, useRef } from 'react'
import { useCallback } from 'react'

/* ═══ Landing v3 visual engine — canvas 2D + glow, zero deps.
   Scanner signature color: NEON GREEN #00ffa3 (user directive).
   Chains keep their identity colors. Reduced-motion respected. ═══ */

const GREEN = '#00ffa3'

function useGlowCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void, deps: unknown[] = []) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let raf = 0
    let stop = false
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let visible = true
    const io = new IntersectionObserver((es) => { visible = es[0]?.isIntersecting ?? true }, { threshold: 0 })
    io.observe(cv)
    const render = (t: number) => {
      if (!stop && visible) {
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const w = cv.clientWidth, h = cv.clientHeight
        if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, w, h)
        draw(ctx, w, h, t / 1000)
      }
      if (!stop && !reduced) raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)
    const ro = new ResizeObserver(() => { if (stop || reduced) render(0) })
    ro.observe(cv)
    return () => { stop = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return ref
}

function glowDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2)
  g.addColorStop(0, color + 'cc')
  g.addColorStop(0.4, color + '55')
  g.addColorStop(1, color + '00')
  ctx.globalAlpha = a
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
}

/* ─────────── fixed page background: green grid + drift + slow sweep ─────────── */

export function PageBackground() {
  const ref = useGlowCanvas((ctx, w, h, t) => {
    // faint dot grid
    ctx.fillStyle = 'rgba(0,255,163,0.05)'
    const step = 34
    const off = (t * 4) % step
    for (let x = -step; x < w + step; x += step) {
      for (let y = -step; y < h + step; y += step) {
        ctx.fillRect(x + off, y + off * 0.4, 1.2, 1.2)
      }
    }
    // drifting motes
    for (let i = 0; i < 34; i++) {
      const px = (i * 137.5 + Math.sin(t * 0.22 + i) * 60) % (w + 40) - 20
      const py = (h - ((t * 12 + i * 97) % (h + 80))) + 40
      ctx.fillStyle = `rgba(0,255,163,${0.10 + (i % 5) * 0.03})`
      ctx.fillRect(px, py, 1.4, 1.4)
    }
    // slow diagonal scan band
    const bandY = ((t * 46) % (h + 400)) - 200
    const grad = ctx.createLinearGradient(0, bandY - 130, w, bandY + 130)
    grad.addColorStop(0, 'rgba(0,255,163,0)')
    grad.addColorStop(0.5, 'rgba(0,255,163,0.045)')
    grad.addColorStop(1, 'rgba(0,255,163,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, bandY - 130, w, 260)
  }, [])
  return <canvas ref={ref} className="lvp-bg" aria-hidden="true" />
}

/* ─────────── HERO radar — neon green scanner ─────────── */

const CHAIN_ORBITS = [
  { label: 'SOLANA', color: '#22d3ee', r: 0.52, speed: 0.11, size: 3.4 },
  { label: 'BNB CHAIN', color: '#fbbf24', r: 0.72, speed: -0.08, size: 3.0 },
  { label: 'BASE', color: '#3b82f6', r: 0.86, speed: 0.065, size: 2.7 },
  { label: 'HYPEREVM', color: '#a78bfa', r: 0.40, speed: -0.13, size: 2.5 },
  { label: 'AVALANCHE', color: '#fb7185', r: 0.64, speed: 0.09, size: 3.0 },
]

const BLIPS = Array.from({ length: 16 }, (_, i) => ({
  a: (i / 16) * Math.PI * 2 + i * 0.63,
  r: 0.16 + ((i * 41) % 72) / 100,
  color: [GREEN, '#e8fff6', GREEN, '#aef7dd'][i % 4],
}))

export function RadarScanner() {
  const ref = useGlowCanvas((ctx, w, h, t) => {
    const cx = w / 2, cy = h * 0.56
    const RX = Math.min(w * 0.44, 350)
    const RY = RX * 0.36
    const P = (ang: number, rr: number): [number, number] => [cx + Math.cos(ang) * RX * rr, cy + Math.sin(ang) * RY * rr]

    // 3D depth: stacked under-discs
    for (let d = 3; d >= 1; d--) {
      ctx.save()
      ctx.translate(cx, cy + d * 9); ctx.scale(1, RY / RX); ctx.translate(-cx, -cy)
      ctx.strokeStyle = `rgba(0,255,163,${0.16 - d * 0.04})`
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(cx, cy, RX * (1 - d * 0.012), 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }
    // platform disc
    const disc = ctx.createRadialGradient(cx, cy, RX * 0.05, cx, cy, RX)
    disc.addColorStop(0, 'rgba(0,255,163,0.13)')
    disc.addColorStop(0.6, 'rgba(0,255,163,0.045)')
    disc.addColorStop(1, 'transparent')
    ctx.save()
    ctx.translate(cx, cy); ctx.scale(1, RY / RX); ctx.translate(-cx, -cy)
    ctx.fillStyle = disc
    ctx.beginPath(); ctx.arc(cx, cy, RX, 0, Math.PI * 2); ctx.fill()
    // rings + degree ticks
    for (const rr of [1, 0.78, 0.56, 0.34]) {
      ctx.strokeStyle = `rgba(0,255,163,${rr === 1 ? 0.4 : 0.16})`
      ctx.lineWidth = rr === 1 ? 1.4 : 1
      ctx.beginPath(); ctx.arc(cx, cy, RX * rr, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(0,255,163,0.4)'
    for (let d = 0; d < 360; d += 10) {
      const a = (d * Math.PI) / 180
      const len = d % 30 === 0 ? 9 : 4
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * (RX - 1), cy + Math.sin(a) * (RX - 1))
      ctx.lineTo(cx + Math.cos(a) * (RX - len), cy + Math.sin(a) * (RX - len))
      ctx.stroke()
    }
    ctx.restore()
    // cross hairs
    ctx.strokeStyle = 'rgba(0,255,163,0.16)'
    for (const ang of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const [x1, y1] = P(ang, 1), [x2, y2] = P(ang + Math.PI, 1)
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    }

    // sweep — green beam with fading trail
    const sweep = t * 1.05
    ctx.save()
    ctx.translate(cx, cy); ctx.scale(1, RY / RX); ctx.translate(-cx, -cy)
    for (let i = 0; i < 40; i++) {
      const a = sweep - i * 0.026
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, RX, a - 0.017, a)
      ctx.closePath()
      ctx.fillStyle = `rgba(0,255,163,${(1 - i / 40) * 0.17})`
      ctx.fill()
    }
    ctx.restore()
    {
      const [ex, ey] = P(sweep, 1)
      const grad = ctx.createLinearGradient(cx, cy, ex, ey)
      grad.addColorStop(0, 'rgba(0,255,163,0.06)')
      grad.addColorStop(1, 'rgba(0,255,163,0.9)')
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.7
      ctx.shadowColor = GREEN
      ctx.shadowBlur = 8
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke()
      ctx.shadowBlur = 0
    }

    // blips light up under the beam
    BLIPS.forEach((b) => {
      const diff = Math.abs(((sweep - b.a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2))
      const hot = diff < 1.1 ? 1 - diff / 1.1 : 0.07
      const [x, y] = P(b.a, b.r)
      glowDot(ctx, x, y, 1.6 + hot * 2.6, b.color, 0.25 + hot)
      if (hot > 0.5) {
        ctx.strokeStyle = b.color + Math.round(hot * 200).toString(16).padStart(2, '0')
        ctx.beginPath(); ctx.arc(x, y, 5 + (1 - hot) * 17, 0, Math.PI * 2); ctx.stroke()
      }
    })

    // orbiting chain nodes
    ctx.font = '600 9.5px JetBrains Mono, monospace'
    ctx.textAlign = 'center'
    CHAIN_ORBITS.forEach((c) => {
      const a = t * c.speed * 2 + c.r * 9
      const x = cx + Math.cos(a) * RX * c.r
      const y = cy - 26 + Math.sin(a) * RX * c.r * 0.34
      glowDot(ctx, x, y, c.size, c.color)
      ctx.fillStyle = 'rgba(232,236,249,0.85)'
      ctx.fillText(c.label, x, y - 10)
    })

    // center core
    const pulse = 1 + Math.sin(t * 2.1) * 0.08
    glowDot(ctx, cx, cy, 9 * pulse, GREEN, 0.95)
    ctx.font = `700 ${Math.round(RX * 0.16)}px Space Grotesk, sans-serif`
    ctx.fillStyle = 'rgba(234,255,247,0.96)'
    ctx.fillText('◤', cx, cy + RX * 0.055)
    ctx.font = '700 10px Space Grotesk, sans-serif'
    ctx.fillStyle = 'rgba(0,255,163,0.95)'
    ctx.fillText('TERMINAL ALPHA', cx, cy + RX * 0.16 + 6)

    // rising data particles
    for (let i = 0; i < 22; i++) {
      const px = cx + Math.sin(i * 12.9898 + t * 0.35) * RX * 0.92
      const py = cy - ((t * 24 + i * 53) % (RY * 3.4)) + RY * 0.4
      ctx.fillStyle = `rgba(0,255,163,${0.30 * (1 - ((t * 24 + i * 53) % (RY * 3.4)) / (RY * 3.4))})`
      ctx.fillRect(px, py, 1.5, 1.5)
    }
  })
  return <canvas ref={ref} className="rv-radar-cv" aria-hidden="true" />
}

/* ─────────── multi-chain network ─────────── */

export interface NetChain { id: string; label: string; color: string; live: boolean; stats: string }

export const NET_CHAINS: NetChain[] = [
  { id: 'sol', label: 'SOLANA', color: '#22d3ee', live: true, stats: '1,900+ pairs indexed · live scanning' },
  { id: 'bnb', label: 'BNB CHAIN', color: '#fbbf24', live: true, stats: 'PancakeSwap pools · live scanning' },
  { id: 'base', label: 'BASE', color: '#3b82f6', live: true, stats: 'Aerodrome pools · live scanning' },
  { id: 'hype', label: 'HYPEREVM', color: '#a78bfa', live: false, stats: 'chainId pending verification — honest by policy' },
  { id: 'avax', label: 'AVALANCHE', color: '#fb7185', live: true, stats: 'TraderJoe pools · live scanning' },
]

export function ChainNetwork({ hovered, onHover }: { hovered: string | null; onHover: (id: string | null) => void }) {
  const hit = useRef<{ x: number; y: number; id: string }[]>([])
  const ref = useGlowCanvas((ctx, w, h, t) => {
    const cx = w / 2, cy = h / 2
    const R = Math.min(w, h) * 0.34
    ctx.strokeStyle = 'rgba(0,255,163,0.06)'
    const hor = cy + R * 0.85
    for (let i = 0; i <= 10; i++) {
      const x = (w / 10) * i
      ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(w / 2 + (x - w / 2) * 0.4, hor); ctx.stroke()
    }
    for (let i = 0; i < 5; i++) {
      const y = hor + ((h - hor) / 5) * i * (i / 5 + 0.4)
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
    }
    const nodes = NET_CHAINS.map((c, i) => {
      const a = -Math.PI / 2 + (Math.PI * 2 * i) / NET_CHAINS.length
      const wob = Math.sin(t * 1.4 + i * 1.7) * 6
      return { ...c, x: cx + Math.cos(a) * R * 1.15 + wob, y: cy + Math.sin(a) * R * 0.72 + wob * 0.5 }
    })
    hit.current = nodes.map((n) => ({ x: n.x, y: n.y, id: n.id }))
    nodes.forEach((n, i) => {
      const mx = (cx + n.x) / 2 + Math.sin(t + i) * 18
      const my = (cy + n.y) / 2 + Math.cos(t * 0.8 + i) * 14
      const active = hovered === null || hovered === n.id
      ctx.strokeStyle = hovered === n.id ? n.color + 'aa' : n.color + (active ? '3d' : '18')
      ctx.lineWidth = hovered === n.id ? 2 : 1.2
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(mx, my, n.x, n.y); ctx.stroke()
      const pt = (t * 0.35 + i * 0.2) % 1
      const px = (1 - pt) * (1 - pt) * cx + 2 * (1 - pt) * pt * mx + pt * pt * n.x
      const py = (1 - pt) * (1 - pt) * cy + 2 * (1 - pt) * pt * my + pt * pt * n.y
      glowDot(ctx, px, py, 2.2, n.color, active ? 0.95 : 0.3)
    })
    const pulse = 1 + Math.sin(t * 1.8) * 0.1
    ctx.save()
    ctx.translate(cx, cy); ctx.rotate(t * 0.25)
    ctx.strokeStyle = 'rgba(0,255,163,0.5)'
    ctx.lineWidth = 1.2
    ctx.setLineDash([6, 10])
    ctx.beginPath(); ctx.arc(0, 0, 44 * pulse, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
    glowDot(ctx, cx, cy, 10, GREEN, 0.95)
    ctx.font = '700 9.5px Space Grotesk, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#e8ecf9'
    ctx.fillText('TERMINAL', cx, cy - 2)
    ctx.fillText('ALPHA', cx, cy + 10)
    ctx.font = '700 10px JetBrains Mono, monospace'
    nodes.forEach((n) => {
      const on = hovered === n.id
      const r = (on ? 5.4 : 4) + Math.sin(t * 2 + n.x) * 0.6
      glowDot(ctx, n.x, n.y, r, n.color, on ? 1 : 0.85)
      if (on) {
        ctx.strokeStyle = n.color
        ctx.beginPath(); ctx.arc(n.x, n.y, 13 + Math.sin(t * 4) * 2.5, 0, Math.PI * 2); ctx.stroke()
      }
      ctx.fillStyle = on ? '#e8ecf9' : 'rgba(232,236,249,0.6)'
      ctx.fillText(n.label, n.x, n.y - 12)
      if (!n.live) {
        ctx.fillStyle = 'rgba(139,145,180,0.75)'
        ctx.font = '600 8px Inter, sans-serif'
        ctx.fillText('SOON', n.x, n.y + 20)
        ctx.font = '700 10px JetBrains Mono, monospace'
      }
    })
  }, [hovered])

  const onMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left, y = e.clientY - rect.top
    const near = hit.current.find((p) => Math.hypot(p.x - x, p.y - y) < 26)
    onHover(near ? near.id : null)
  }, [onHover])

  return (
    <canvas ref={ref} className="rv-net-cv" onMouseMove={onMove} onMouseLeave={() => onHover(null)} />
  )
}

/* ─────────── neural core ─────────── */

export function NeuralCore() {
  const ref = useGlowCanvas((ctx, w, h, t) => {
    const cx = w / 2, cy = h / 2
    const R = Math.min(w, h) * 0.34
    const N = 64
    const pts: [number, number, number][] = []
    for (let i = 0; i < N; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / N)
      const th = Math.PI * (1 + Math.sqrt(5)) * i
      let x = Math.sin(phi) * Math.cos(th), y = Math.sin(phi) * Math.sin(th), z = Math.cos(phi)
      const ry = t * 0.5, rx = 0.42
      const y2 = y * Math.cos(rx) - z * Math.sin(rx)
      let z2 = y * Math.sin(rx) + z * Math.cos(rx)
      const x2 = x * Math.cos(ry) + z2 * Math.sin(ry)
      z2 = -x * Math.sin(ry) + z2 * Math.cos(ry)
      pts.push([cx + x2 * R, cy + y2 * R, z2])
    }
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])
        if (d < R * 0.42) {
          const depth = (pts[i][2] + pts[j][2]) / 2
          ctx.strokeStyle = `rgba(0,255,163,${0.04 + (depth + 1) * 0.08})`
          ctx.lineWidth = 0.7
          ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke()
        }
      }
    }
    pts.forEach((p) => {
      const depth = (p[2] + 1) / 2
      glowDot(ctx, p[0], p[1], 1.1 + depth * 1.8, depth > 0.55 ? '#aef7dd' : GREEN, 0.35 + depth * 0.65)
    })
    const pulse = 1 + Math.sin(t * 2.4) * 0.14
    glowDot(ctx, cx, cy, 7 * pulse, '#a78bfa', 0.9)
    for (let i = 0; i < 3; i++) {
      const a = t * (0.9 + i * 0.3) + i * 2.1
      glowDot(ctx, cx + Math.cos(a) * R * 1.25, cy + Math.sin(a) * R * 0.5, 2, '#a78bfa', 0.8)
    }
  })
  return <canvas ref={ref} className="rv-core-cv" aria-hidden="true" />
}

/* ─────────── pipeline data stream ─────────── */

export function DataStream({ className = '' }: { className?: string }) {
  return (
    <svg className={`rv-stream ${className}`} viewBox="0 0 120 24" fill="none" aria-hidden="true" preserveAspectRatio="none">
      <path d="M2 12 C 30 2, 60 22, 88 10 S 112 14, 118 12" stroke="rgba(0,255,163,0.4)" strokeWidth="1.4" strokeDasharray="5 7">
        <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1.1s" repeatCount="indefinite" />
      </path>
      <circle r="2.4" fill={GREEN}>
        <animateMotion dur="2.2s" repeatCount="indefinite" path="M2 12 C 30 2, 60 22, 88 10 S 112 14, 118 12" />
      </circle>
      <circle r="1.7" fill="#a78bfa">
        <animateMotion dur="2.2s" begin="0.7s" repeatCount="indefinite" path="M2 12 C 30 2, 60 22, 88 10 S 112 14, 118 12" />
      </circle>
    </svg>
  )
}
