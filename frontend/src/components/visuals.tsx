import { useEffect, useRef } from 'react'
import { useCallback } from 'react'

/* ═══ Landing v4 visual engine — canvas 2D + real bloom pipeline, zero deps.
   Scanner signature color: NEON GREEN #00ffa3 (green dominant, level 4).
   Chains keep identity colors. Reduced-motion respected. ═══ */

const GREEN = '#00ffa3'
const GREEN_SOFT = '#aef7dd'

interface SceneOpts {
  bloom?: boolean
  deps?: unknown[]
  maxDpr?: number
}

/* Canvas runner with offscreen scene + downsample bloom composite.
   Pauses off-screen, respects reduced motion (renders one static frame). */
function useSceneCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void, opts: SceneOpts = {}) {
  const { bloom = false, deps = [], maxDpr = 2 } = opts
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const dprCap = bloom ? Math.min(1.5, maxDpr) : maxDpr
    const scene = document.createElement('canvas')
    const sctx = scene.getContext('2d')!
    const b1 = document.createElement('canvas')
    const b2 = document.createElement('canvas')
    let raf = 0
    let stop = false
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let visible = true
    const io = new IntersectionObserver((es) => { visible = es[0]?.isIntersecting ?? true }, { threshold: 0 })
    io.observe(cv)

    const render = (t: number) => {
      if (stop || !visible) return
      const dpr = Math.min(dprCap, window.devicePixelRatio || 1)
      const w = cv.clientWidth, h = cv.clientHeight
      if (!w || !h) return
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr)
        scene.width = cv.width; scene.height = cv.height
        b1.width = Math.max(1, Math.round(cv.width / 2)); b1.height = Math.max(1, Math.round(cv.height / 2))
        b2.width = Math.max(1, Math.round(cv.width / 4)); b2.height = Math.max(1, Math.round(cv.height / 4))
      }
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sctx.clearRect(0, 0, w, h)
      draw(sctx, w, h, t / 1000)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(scene, 0, 0, w, h)
      if (bloom) {
        b1.getContext('2d')!.drawImage(scene, 0, 0, b1.width, b1.height)
        b2.getContext('2d')!.drawImage(b1, 0, 0, b2.width, b2.height)
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.55
        ctx.drawImage(b2, 0, 0, w, h)
        ctx.globalAlpha = 0.28
        ctx.drawImage(b1, 0, 0, w, h)
        ctx.restore()
      }
    }
    const loop = (t: number) => { render(t); if (!stop && !reduced) raf = requestAnimationFrame(loop) }
    render(0)
    if (!reduced) raf = requestAnimationFrame(loop)
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

/* ─────────── fixed page background: green aurora + grid + drift + sweep ─────────── */

export function PageBackground() {
  const ref = useSceneCanvas((ctx, w, h, t) => {
    ctx.fillStyle = 'rgba(0,255,163,0.09)'
    const step = 32
    const off = (t * 4) % step
    for (let x = -step; x < w + step; x += step) {
      for (let y = -step; y < h + step; y += step) {
        ctx.fillRect(x + off, y + off * 0.4, 1.3, 1.3)
      }
    }
    for (let i = 0; i < 52; i++) {
      const px = (i * 137.5 + Math.sin(t * 0.22 + i) * 70) % (w + 40) - 20
      const py = (h - ((t * 13 + i * 97) % (h + 80))) + 40
      ctx.fillStyle = `rgba(0,255,163,${0.16 + (i % 5) * 0.05})`
      ctx.fillRect(px, py, 1.5, 1.5)
    }
    const bandY = ((t * 46) % (h + 400)) - 200
    const grad = ctx.createLinearGradient(0, bandY - 130, w, bandY + 130)
    grad.addColorStop(0, 'rgba(0,255,163,0)')
    grad.addColorStop(0.5, 'rgba(0,255,163,0.07)')
    grad.addColorStop(1, 'rgba(0,255,163,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, bandY - 130, w, 260)
  }, { maxDpr: 1.25 })
  return <canvas ref={ref} className="lvp-bg" aria-hidden="true" />
}

/* ─────────── HERO radar — volumetric neon scanner (level 4) ─────────── */

const CHAIN_ORBITS = [
  { label: 'SOLANA', color: '#00ffa3', r: 0.52, speed: 0.11, size: 3.6 },
  { label: 'BNB CHAIN', color: '#fbbf24', r: 0.72, speed: -0.08, size: 3.2 },
  { label: 'BASE', color: '#60a5fa', r: 0.86, speed: 0.065, size: 2.9 },
  { label: 'HYPEREVM', color: '#a78bfa', r: 0.40, speed: -0.13, size: 2.7 },
  { label: 'AVALANCHE', color: '#fb7185', r: 0.64, speed: 0.09, size: 3.2 },
]

const DUST = Array.from({ length: 460 }, (_, i) => ({
  a: (i * 2.399963) % (Math.PI * 2),
  r: Math.sqrt(((i * 7919) % 1000) / 1000) * 0.97 + 0.03,
  tw: (i * 0.618) % (Math.PI * 2),
  big: i % 29 === 0,
}))

const BLIPS = Array.from({ length: 22 }, (_, i) => ({
  a: (i / 22) * Math.PI * 2 + i * 0.63,
  r: 0.16 + ((i * 41) % 72) / 100,
  risk: [88, 34, 72, 49, 91, 23, 66, 38][i % 8],
  seed: i * 13.37,
}))

function markGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath()
  ctx.moveTo(x - s, y + s * 0.9)
  ctx.lineTo(x + s, y + s * 0.9)
  ctx.lineTo(x - s, y - s)
  ctx.closePath()
  ctx.fill()
}

export function RadarScanner() {
  const ptr = useRef({ x: 0, y: 0, tx: 0, ty: 0 })
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return
    const on = (e: MouseEvent) => {
      ptr.current.tx = (e.clientX / innerWidth - 0.5) * 2
      ptr.current.ty = (e.clientY / innerHeight - 0.5) * 2
    }
    window.addEventListener('mousemove', on)
    return () => window.removeEventListener('mousemove', on)
  }, [])

  const ref = useSceneCanvas((ctx, w, h, t) => {
    const p = ptr.current
    p.x += (p.tx - p.x) * 0.04
    p.y += (p.ty - p.y) * 0.04
    const cx = w / 2 + p.x * 16, cy = h * 0.55 + p.y * 12
    const RX = Math.min(w * 0.44, 360)
    const RY = RX * 0.36
    const P = (ang: number, rr: number): [number, number] => [cx + Math.cos(ang) * RX * rr, cy + Math.sin(ang) * RY * rr]
    ctx.globalCompositeOperation = 'lighter'

    // depth: stacked under-discs (volumetric platform)
    for (let d = 6; d >= 1; d--) {
      ctx.save()
      ctx.translate(cx, cy + d * 7); ctx.scale(1, RY / RX); ctx.translate(-cx, -cy)
      ctx.strokeStyle = `rgba(0,255,163,${0.14 - d * 0.02})`
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(cx, cy, RX * (1 - d * 0.014), 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }
    // platform disc glow
    const disc = ctx.createRadialGradient(cx, cy, RX * 0.04, cx, cy, RX)
    disc.addColorStop(0, 'rgba(0,255,163,0.16)')
    disc.addColorStop(0.55, 'rgba(0,255,163,0.05)')
    disc.addColorStop(1, 'transparent')
    ctx.save()
    ctx.translate(cx, cy); ctx.scale(1, RY / RX); ctx.translate(-cx, -cy)
    ctx.fillStyle = disc
    ctx.beginPath(); ctx.arc(cx, cy, RX, 0, Math.PI * 2); ctx.fill()
    // rings + ticks
    for (const rr of [1, 0.8, 0.6, 0.4, 0.2]) {
      ctx.strokeStyle = `rgba(0,255,163,${rr === 1 ? 0.45 : 0.14})`
      ctx.lineWidth = rr === 1 ? 1.5 : 1
      ctx.beginPath(); ctx.arc(cx, cy, RX * rr, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(0,255,163,0.42)'
    for (let d = 0; d < 360; d += 5) {
      const a = (d * Math.PI) / 180
      const len = d % 30 === 0 ? 10 : d % 15 === 0 ? 6 : 3
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * (RX - 1), cy + Math.sin(a) * (RX - 1))
      ctx.lineTo(cx + Math.cos(a) * (RX - len), cy + Math.sin(a) * (RX - len))
      ctx.stroke()
    }
    ctx.restore()
    // cross hairs
    ctx.strokeStyle = 'rgba(0,255,163,0.15)'
    for (const ang of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const [x1, y1] = P(ang, 1), [x2, y2] = P(ang + Math.PI, 1)
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    }

    // dust field — additive particles inside the disc volume
    for (const dtw of DUST) {
      const a = dtw.a + t * 0.05
      const [x, y] = P(a, dtw.r)
      const tw = 0.35 + Math.sin(t * 2.2 + dtw.tw) * 0.3
      ctx.fillStyle = dtw.big ? `rgba(174,247,221,${0.5 * tw})` : `rgba(0,255,163,${0.34 * tw})`
      const s = dtw.big ? 1.8 : 1.1
      ctx.fillRect(x, y, s, s)
    }

    // sweep — 56-wedge additive trail + bright edge + afterglow
    const sweep = t * 1.05
    ctx.save()
    ctx.translate(cx, cy); ctx.scale(1, RY / RX); ctx.translate(-cx, -cy)
    for (let i = 0; i < 56; i++) {
      const a = sweep - i * 0.023
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, RX, a - 0.015, a)
      ctx.closePath()
      ctx.fillStyle = `rgba(0,255,163,${(1 - i / 56) * 0.15})`
      ctx.fill()
    }
    ctx.restore()
    {
      const [ex, ey] = P(sweep, 1)
      const grad = ctx.createLinearGradient(cx, cy, ex, ey)
      grad.addColorStop(0, 'rgba(0,255,163,0.08)')
      grad.addColorStop(1, 'rgba(0,255,163,0.95)')
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.8
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke()
      ctx.strokeStyle = 'rgba(234,255,247,0.8)'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(cx, cy, RX, sweep - 0.09, sweep); ctx.stroke()
    }

    // blips + lock-on brackets
    BLIPS.forEach((b) => {
      const diff = Math.abs(((sweep - b.a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2))
      const hot = diff < 1.15 ? 1 - diff / 1.15 : 0.06
      const [x, y] = P(b.a, b.r)
      const col = b.risk >= 70 ? '#fb7185' : b.risk >= 50 ? '#fbbf24' : GREEN
      glowDot(ctx, x, y, 1.5 + hot * 2.8, col, 0.3 + hot)
      if (hot > 0.5) {
        ctx.strokeStyle = col + Math.round(hot * 220).toString(16).padStart(2, '0')
        ctx.lineWidth = 1.2
        ctx.beginPath(); ctx.arc(x, y, 6 + (1 - hot) * 19, 0, Math.PI * 2); ctx.stroke()
        if (hot > 0.9) {
          const s = 6
          ctx.strokeStyle = col
          ctx.beginPath()
          ctx.moveTo(x - s, y - s + 3); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s + 3, y - s)
          ctx.moveTo(x + s - 3, y - s); ctx.lineTo(x + s, y - s); ctx.lineTo(x + s, y - s + 3)
          ctx.moveTo(x + s, y + s - 3); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s - 3, y + s)
          ctx.moveTo(x - s + 3, y + s); ctx.lineTo(x - s, y + s); ctx.lineTo(x - s, y + s - 3)
          ctx.stroke()
        }
      }
    })

    // orbiting chain nodes with trails
    ctx.font = '600 10px JetBrains Mono, monospace'
    ctx.textAlign = 'center'
    CHAIN_ORBITS.forEach((c) => {
      const a = t * c.speed * 2 + c.r * 9
      const x = cx + Math.cos(a) * RX * c.r
      const y = cy - 26 + Math.sin(a) * RX * c.r * 0.34
      // orbit path
      ctx.strokeStyle = c.color + '14'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.ellipse(cx, cy - 26, RX * c.r, RX * c.r * 0.34, 0, 0, Math.PI * 2); ctx.stroke()
      // trail
      ctx.strokeStyle = c.color + '55'
      ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.ellipse(cx, cy - 26, RX * c.r, RX * c.r * 0.34, 0, a - Math.sign(c.speed) * 0.7, a); ctx.stroke()
      glowDot(ctx, x, y, c.size, c.color)
      ctx.fillStyle = 'rgba(232,236,249,0.9)'
      ctx.fillText(c.label, x, y - 11)
    })

    // rising data particles
    for (let i = 0; i < 26; i++) {
      const px = cx + Math.sin(i * 12.9898 + t * 0.35) * RX * 0.92
      const prog = ((t * 24 + i * 53) % (RY * 3.4)) / (RY * 3.4)
      const py = cy - prog * RY * 3.4 + RY * 0.4
      ctx.fillStyle = `rgba(0,255,163,${0.3 * (1 - prog)})`
      ctx.fillRect(px, py, 1.5, 1.5)
    }

    // core — vector mark + pulsing rings
    const pulse = 1 + Math.sin(t * 2.1) * 0.09
    glowDot(ctx, cx, cy, 10 * pulse, GREEN, 0.95)
    ctx.strokeStyle = `rgba(0,255,163,${0.5 - Math.sin(t * 2.1) * 0.2})`
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(cx, cy, 26 * pulse, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = 'rgba(240,255,249,0.96)'
    markGlyph(ctx, cx, cy + 1, 7)
    ctx.font = '700 10.5px Space Grotesk, sans-serif'
    ctx.fillStyle = 'rgba(0,255,163,0.95)'
    ctx.fillText('TERMINAL ALPHA', cx, cy + RX * 0.17 + 8)
    ctx.globalCompositeOperation = 'source-over'
  }, { bloom: true, deps: [] })
  return <canvas ref={ref} className="rv-radar-cv" aria-hidden="true" />
}

/* ─────────── multi-chain globe — wireframe sphere + arcs (level 4) ─────────── */

export interface NetChain { id: string; label: string; color: string; live: boolean; stats: string }

export const NET_CHAINS: NetChain[] = [
  { id: 'sol', label: 'SOLANA', color: '#00ffa3', live: true, stats: '1,900+ pairs indexed · live scanning' },
  { id: 'bnb', label: 'BNB CHAIN', color: '#fbbf24', live: true, stats: 'PancakeSwap pools · live scanning' },
  { id: 'base', label: 'BASE', color: '#60a5fa', live: true, stats: 'Aerodrome pools · live scanning' },
  { id: 'hype', label: 'HYPEREVM', color: '#a78bfa', live: false, stats: 'chainId pending verification — honest by policy' },
  { id: 'avax', label: 'AVALANCHE', color: '#fb7185', live: true, stats: 'TraderJoe pools · live scanning' },
]

const NODE_LL: Record<string, [number, number]> = {
  sol: [0.35, 0.6], bnb: [-0.15, 2.4], base: [0.5, 4.2], hype: [-0.5, 5.3], avax: [0.05, 3.3],
}
const ARCS: [string, string][] = [['sol', 'bnb'], ['bnb', 'base'], ['base', 'sol'], ['sol', 'hype'], ['avax', 'sol'], ['avax', 'base']]

const STARS = Array.from({ length: 90 }, (_, i) => ({ x: (i * 0.618) % 1, y: (i * 0.382) % 1, tw: (i * 0.9) % 6 }))

function project(lat: number, lon: number, rot: number): { x: number; y: number; z: number } {
  const cl = Math.cos(lat)
  let x = cl * Math.sin(lon + rot)
  const y = Math.sin(lat)
  let z = cl * Math.cos(lon + rot)
  const tilt = 0.32
  const y2 = y * Math.cos(tilt) - z * Math.sin(tilt)
  z = y * Math.sin(tilt) + z * Math.cos(tilt)
  return { x, y: y2, z }
}

export function ChainGlobe({ hovered, onHover }: { hovered: string | null; onHover: (id: string | null) => void }) {
  const hit = useRef<{ x: number; y: number; id: string }[]>([])
  const ref = useSceneCanvas((ctx, w, h, t) => {
    const cx = w / 2, cy = h * 0.47
    const R = Math.min(w, h) * 0.33
    const rot = t * 0.14
    ctx.globalCompositeOperation = 'lighter'

    // starfield
    for (const s of STARS) {
      const a = 0.14 + Math.abs(Math.sin(t * 0.7 + s.tw)) * 0.3
      ctx.fillStyle = `rgba(174,247,221,${a})`
      ctx.fillRect(s.x * w, s.y * h * 0.86, 1.3, 1.3)
    }

    // wireframe sphere — lat bands
    ctx.lineWidth = 1
    for (let la = -60; la <= 60; la += 20) {
      const lat = (la * Math.PI) / 180
      ctx.beginPath()
      let started = false
      for (let lo = 0; lo <= 360; lo += 6) {
        const p = project(lat, (lo * Math.PI) / 180, rot)
        if (p.z > 0) {
          const x = cx + p.x * R, y = cy - p.y * R
          if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y)
        } else started = false
      }
      ctx.strokeStyle = 'rgba(0,255,163,0.16)'
      ctx.stroke()
    }
    // long bands
    for (let lo = 0; lo < 360; lo += 20) {
      const lon = (lo * Math.PI) / 180
      ctx.beginPath()
      let started = false
      for (let la = -90; la <= 90; la += 6) {
        const p = project((la * Math.PI) / 180, lon, rot)
        if (p.z > 0) {
          const x = cx + p.x * R, y = cy - p.y * R
          if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y)
        } else started = false
      }
      ctx.strokeStyle = 'rgba(0,255,163,0.1)'
      ctx.stroke()
    }
    // sphere rim + inner fill
    ctx.globalCompositeOperation = 'source-over'
    const rim = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R)
    rim.addColorStop(0, 'rgba(0,255,163,0.07)')
    rim.addColorStop(0.85, 'rgba(0,255,163,0.03)')
    rim.addColorStop(1, 'rgba(0,255,163,0.12)')
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(1, Math.cos(0.32))
    ctx.fillStyle = rim
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
    ctx.globalCompositeOperation = 'lighter'

    // arcs between chains — great circles lifted above surface
    ARCS.forEach(([aId, bId], ai) => {
      const A = project(NODE_LL[aId][0], NODE_LL[aId][1], rot)
      const B = project(NODE_LL[bId][0], NODE_LL[bId][1], rot)
      const col = NET_CHAINS.find((c) => c.id === aId)!.color
      ctx.strokeStyle = col + '44'
      ctx.lineWidth = 1.1
      ctx.beginPath()
      let started = false
      for (let s = 0; s <= 24; s++) {
        const k = s / 24
        const lift = 1 + Math.sin(k * Math.PI) * 0.3
        const x = cx + (A.x + (B.x - A.x) * k) * R * lift
        const y = cy - (A.y + (B.y - A.y) * k) * R * lift
        if (A.z > -0.2 || B.z > -0.2) { if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y) }
      }
      ctx.stroke()
      // packet
      const k = (t * 0.5 + ai * 0.17) % 1
      const lift = 1 + Math.sin(k * Math.PI) * 0.3
      const px = cx + (A.x + (B.x - A.x) * k) * R * lift
      const py = cy - (A.y + (B.y - A.y) * k) * R * lift
      if (A.z > -0.2 || B.z > -0.2) glowDot(ctx, px, py, 2, col, 0.9)
    })

    // chain nodes on surface
    ctx.font = '700 10px JetBrains Mono, monospace'
    ctx.textAlign = 'center'
    hit.current = []
    NET_CHAINS.forEach((c) => {
      const [la, lo] = NODE_LL[c.id]
      const p = project(la, lo, rot)
      const x = cx + p.x * R * 1.02, y = cy - p.y * R * 1.02
      hit.current.push({ x, y, id: c.id })
      const front = p.z > 0
      const on = hovered === c.id
      if (front) {
        glowDot(ctx, x, y, on ? 5.4 : 3.8, c.color, on ? 1 : 0.9)
        if (on) {
          ctx.strokeStyle = c.color
          ctx.lineWidth = 1.2
          ctx.beginPath(); ctx.arc(x, y, 14 + Math.sin(t * 4) * 2.5, 0, Math.PI * 2); ctx.stroke()
        }
        ctx.fillStyle = on ? '#f0fff9' : 'rgba(232,236,249,0.85)'
        ctx.fillText(c.label, x, y - 13)
        if (!c.live) {
          ctx.fillStyle = 'rgba(139,145,180,0.8)'
          ctx.font = '600 8px Inter, sans-serif'
          ctx.fillText('SOON', x, y + 22)
          ctx.font = '700 10px JetBrains Mono, monospace'
        }
      } else {
        glowDot(ctx, x, y, 2.2, c.color, 0.25)
      }
    })

    // pulse ring every ~2.4s on a rotating node
    const hot = NET_CHAINS[Math.floor(t / 2.4) % NET_CHAINS.length]
    const hp = project(NODE_LL[hot.id][0], NODE_LL[hot.id][1], rot)
    if (hp.z > 0) {
      const k = ((t * 1.4) % 1)
      ctx.strokeStyle = hot.color + Math.round((1 - k) * 140).toString(16).padStart(2, '0')
      ctx.lineWidth = 1.4
      ctx.beginPath(); ctx.arc(cx + hp.x * R * 1.02, cy - hp.y * R * 1.02, 6 + k * 26, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'
  }, { bloom: true, deps: [hovered] })

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

/* ─────────── neural core (AI section) ─────────── */

export function NeuralCore() {
  const ref = useSceneCanvas((ctx, w, h, t) => {
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
    ctx.globalCompositeOperation = 'lighter'
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
      glowDot(ctx, p[0], p[1], 1.1 + depth * 1.8, depth > 0.55 ? GREEN_SOFT : GREEN, 0.35 + depth * 0.65)
    })
    const pulse = 1 + Math.sin(t * 2.4) * 0.14
    glowDot(ctx, cx, cy, 7 * pulse, '#a78bfa', 0.9)
    for (let i = 0; i < 3; i++) {
      const a = t * (0.9 + i * 0.3) + i * 2.1
      glowDot(ctx, cx + Math.cos(a) * R * 1.25, cy + Math.sin(a) * R * 0.5, 2, '#a78bfa', 0.8)
    }
    ctx.globalCompositeOperation = 'source-over'
  }, { bloom: true, deps: [] })
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
