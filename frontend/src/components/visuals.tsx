import { useEffect, useRef } from 'react'
import { useCallback } from 'react'
import { ARCS, NET_CHAINS, NODE_LL, colorOf } from '../lib/netChains'

/* ═══ Landing v6 visual engine — glowing dark-green neon, zero deps.
   Level 6: dual-pass render (glow layer + crisp layer — text/lines never soften),
   dark-orb radar matching the globe, full feature-flow system diagram.
   Scanner signature: NEON GREEN #00ffa3 on near-black. ═══ */

const GREEN = '#00ffa3'
const TAU = Math.PI * 2

interface SceneOpts {
  bloom?: boolean
  crisp?: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void
  deps?: unknown[]
  maxDpr?: number
}

/* Canvas runner: offscreen scene (glow layer, gets bloom) + crisp pass drawn
   AFTER bloom on the main canvas so lines/ticks/text stay pixel-perfect.
   DPR is native-exact. Pauses off-screen, respects reduced motion. */
function useSceneCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void, opts: SceneOpts = {}) {
  const { bloom = false, crisp, deps = [], maxDpr = 2 } = opts
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const scene = document.createElement('canvas')
    const sctx = scene.getContext('2d')
    if (!sctx) return
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
      const dpr = Math.min(maxDpr, Math.max(1, window.devicePixelRatio || 1))
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
        const b1ctx = b1.getContext('2d')
        if (!b1ctx) return
        b1ctx.clearRect(0, 0, b1.width, b1.height)
        b1ctx.drawImage(scene, 0, 0, b1.width, b1.height)
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.16
        ctx.drawImage(b1, 0, 0, w, h)
        ctx.restore()
      }
      if (crisp) crisp(ctx, w, h, t / 1000)
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

/* ─────────── fixed page background ─────────── */

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

/* ─────────── HERO radar — dark glowing platform, chain colors, lock story ─────────── */

/* orbiting chain accents — one per NET_CHAINS entry, colored by the single
   source of truth (never a hand-copied palette) */
const ORBITS = [
  { r: 0.52, speed: 0.11, size: 3 },
  { r: 0.72, speed: -0.08, size: 2.7 },
  { r: 0.86, speed: 0.065, size: 2.4 },
  { r: 0.40, speed: -0.13, size: 2.2 },
  { r: 0.64, speed: 0.09, size: 2.7 },
].map((o, i) => ({ ...o, color: NET_CHAINS[i % NET_CHAINS.length].color }))

/* the radar sweeps the real feed universe — derived from NET_CHAINS so the
   board can never show a chain the feed does not serve (the six-chain
   literal list was deleted with the 2026-08-30 parking) */
const SCANCHAINS: readonly (readonly [string, string, string])[] = NET_CHAINS.map(
  (c) => [c.id.toUpperCase(), c.label, c.color] as const,
)

const BLIPS = Array.from({ length: 12 }, (_, i) => ({
  a: (i / 12) * TAU + i * 0.83,
  r: 0.2 + ((i * 41) % 62) / 100,
  t: SCANCHAINS[i % SCANCHAINS.length],
}))

const DUST = Array.from({ length: 60 }, (_, i) => ({
  a: (i * 2.399963) % TAU,
  r: Math.sqrt(((i * 7919) % 1000) / 1000) * 0.94 + 0.06,
  tw: (i * 0.618) % TAU,
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
    /* ── GLOW LAYER (bloomed) — dark platform + colored life ── */
    const p = ptr.current
    p.x += (p.tx - p.x) * 0.04
    p.y += (p.ty - p.y) * 0.04
    const cx = w / 2 + p.x * 14, cy = h * 0.54 + p.y * 10
    const RX = Math.min(w * 0.42, 350)
    const RY = RX * 0.36
    const P = (ang: number, rr: number): [number, number] => [cx + Math.cos(ang) * RX * rr, cy + Math.sin(ang) * RY * rr]
    ctx.globalCompositeOperation = 'lighter'

    // dark platform body — same treatment as the chain globe
    ctx.save()
    ctx.translate(cx, cy); ctx.scale(1, RY / RX); ctx.translate(-cx, -cy)
    const body = ctx.createRadialGradient(cx - RX * 0.3, cy - RY * 0.4, RX * 0.06, cx, cy, RX)
    body.addColorStop(0, 'rgba(9,40,27,0.94)')
    body.addColorStop(0.55, 'rgba(4,18,12,0.95)')
    body.addColorStop(1, 'rgba(1,9,6,0.97)')
    ctx.fillStyle = body
    ctx.beginPath(); ctx.arc(cx, cy, RX, 0, TAU); ctx.fill()
    const inner = ctx.createRadialGradient(cx, cy + RX * 0.04, 0, cx, cy, RX * 0.8)
    inner.addColorStop(0, 'rgba(0,255,163,0.12)')
    inner.addColorStop(0.6, 'rgba(0,255,163,0.04)')
    inner.addColorStop(1, 'rgba(0,255,163,0)')
    ctx.fillStyle = inner
    ctx.beginPath(); ctx.arc(cx, cy, RX, 0, TAU); ctx.fill()
    ctx.restore()

    // sparse dust
    for (const dtw of DUST) {
      const a = dtw.a + t * 0.05
      const [x, y] = P(a, dtw.r)
      const tw = 0.3 + Math.sin(t * 2.2 + dtw.tw) * 0.28
      ctx.fillStyle = `rgba(0,255,163,${0.3 * tw})`
      ctx.fillRect(x, y, 1.2, 1.2)
    }

    // sweep — wedges + beam (quiet, on the dark body)
    const sweep = t * 1.05
    ctx.save()
    ctx.translate(cx, cy); ctx.scale(1, RY / RX); ctx.translate(-cx, -cy)
    for (let i = 0; i < 56; i++) {
      const a = sweep - i * 0.023
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, RX, a - 0.015, a)
      ctx.closePath()
      ctx.fillStyle = `rgba(0,255,163,${(1 - i / 56) * 0.1})`
      ctx.fill()
    }
    ctx.restore()
    {
      const [ex, ey] = P(sweep, 1)
      const grad = ctx.createLinearGradient(cx, cy, ex, ey)
      grad.addColorStop(0, 'rgba(0,255,163,0.06)')
      grad.addColorStop(1, 'rgba(0,255,163,0.9)')
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke()
    }

    // blips — risk-colored glows
    BLIPS.forEach((b) => {
      const diff = Math.abs(((sweep - b.a) % TAU + TAU) % TAU)
      const hot = diff < 1.15 ? 1 - diff / 1.15 : 0.06
      const [x, y] = P(b.a, b.r)
      const col = b.t[2]
      glowDot(ctx, x, y, 1.3 + hot * 2, col, 0.26 + hot)
    })

    // orbiting chain accents — the only colors, matching the globe
    ORBITS.forEach((c) => {
      const a = t * c.speed * 2 + c.r * 9
      const x = cx + Math.cos(a) * RX * c.r
      const y = cy - 24 + Math.sin(a) * RX * c.r * 0.34
      glowDot(ctx, x, y, c.size, c.color, 0.95)
    })

    // core glow
    const pulse = 1 + Math.sin(t * 2.1) * 0.09
    glowDot(ctx, cx, cy, 8 * pulse, GREEN, 0.95)
    ctx.globalCompositeOperation = 'source-over'
  }, {
    bloom: true,
    deps: [],
    /* ── CRISP LAYER (after bloom — rings, ticks, text pixel-perfect) ── */
    crisp: (ctx, w, h, t) => {
      const p = ptr.current
      const cx = w / 2 + p.x * 14, cy = h * 0.54 + p.y * 10
      const RX = Math.min(w * 0.42, 350)
      const RY = RX * 0.36
      const P = (ang: number, rr: number): [number, number] => [cx + Math.cos(ang) * RX * rr, cy + Math.sin(ang) * RY * rr]
      const sweep = t * 1.05
      const rev = Math.floor(sweep / TAU)
      const tgt = BLIPS[((rev % BLIPS.length) + BLIPS.length) % BLIPS.length]
      const [sym, label, colr] = tgt.t
      const [tx2, ty2] = P(tgt.a, tgt.r)

      // platform rim — faint full ellipse + bright arc on the light side
      ctx.save()
      ctx.translate(cx, cy); ctx.scale(1, RY / RX); ctx.translate(-cx, -cy)
      ctx.strokeStyle = 'rgba(0,255,163,0.16)'
      ctx.lineWidth = 1.2
      ctx.beginPath(); ctx.arc(cx, cy, RX, 0, TAU); ctx.stroke()
      ctx.strokeStyle = 'rgba(140,255,210,0.5)'
      ctx.lineWidth = 1.6
      ctx.beginPath(); ctx.arc(cx, cy, RX, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke()
      ctx.restore()

      // rings + sparse ticks
      ctx.save()
      ctx.translate(cx, cy); ctx.scale(1, RY / RX); ctx.translate(-cx, -cy)
      for (const rr of [0.66, 0.33]) {
        ctx.strokeStyle = 'rgba(0,255,163,0.16)'
        ctx.lineWidth = 1.1
        ctx.beginPath(); ctx.arc(cx, cy, RX * rr, 0, TAU); ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(0,255,163,0.38)'
      for (let d = 0; d < 360; d += 15) {
        const a = (d * Math.PI) / 180
        const len = d % 45 === 0 ? 9 : 4
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * (RX - 1), cy + Math.sin(a) * (RX - 1))
        ctx.lineTo(cx + Math.cos(a) * (RX - len), cy + Math.sin(a) * (RX - len))
        ctx.stroke()
      }
      ctx.restore()

      // non-target blip rings
      BLIPS.forEach((b) => {
        if (b === tgt) return
        const diff = Math.abs(((sweep - b.a) % TAU + TAU) % TAU)
        const hot = diff < 1.15 ? 1 - diff / 1.15 : 0.06
        if (hot <= 0.5) return
        const [x, y] = P(b.a, b.r)
        const col = b.t[2]
        ctx.strokeStyle = col + 'aa'
        ctx.lineWidth = 1.1
        ctx.beginPath(); ctx.arc(x, y, 6 + (1 - hot) * 15, 0, TAU); ctx.stroke()
      })

      // lock brackets on the story target
      {
        const s = 7
        ctx.strokeStyle = colr
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(tx2 - s, ty2 - s + 3); ctx.lineTo(tx2 - s, ty2 - s); ctx.lineTo(tx2 - s + 3, ty2 - s)
        ctx.moveTo(tx2 + s - 3, ty2 - s); ctx.lineTo(tx2 + s, ty2 - s); ctx.lineTo(tx2 + s, ty2 - s + 3)
        ctx.moveTo(tx2 + s, ty2 + s - 3); ctx.lineTo(tx2 + s, ty2 + s); ctx.lineTo(tx2 + s - 3, ty2 + s)
        ctx.moveTo(tx2 - s + 3, ty2 + s); ctx.lineTo(tx2 - s, ty2 + s); ctx.lineTo(tx2 - s, ty2 + s - 3)
        ctx.stroke()
      }

      // orbit paths + trails
      ORBITS.forEach((c) => {
        const a = t * c.speed * 2 + c.r * 9
        ctx.strokeStyle = c.color + '2e'
        ctx.lineWidth = 1.1
        ctx.beginPath(); ctx.ellipse(cx, cy - 24, RX * c.r, RX * c.r * 0.34, 0, 0, TAU); ctx.stroke()
        ctx.strokeStyle = c.color + '66'
        ctx.lineWidth = 1.6
        ctx.beginPath(); ctx.ellipse(cx, cy - 24, RX * c.r, RX * c.r * 0.34, 0, a - Math.sign(c.speed) * 0.5, a); ctx.stroke()
      })

      // core ring + glyph + name
      const pulse = 1 + Math.sin(t * 2.1) * 0.09
      ctx.strokeStyle = `rgba(0,255,163,${0.5 - Math.sin(t * 2.1) * 0.2})`
      ctx.lineWidth = 1.1
      ctx.beginPath(); ctx.arc(cx, cy, 20 * pulse, 0, TAU); ctx.stroke()
      ctx.fillStyle = 'rgba(240,255,249,0.97)'
      markGlyph(ctx, cx, cy + 1, 6)
      ctx.font = '700 10.5px Space Grotesk, sans-serif'
      ctx.fillStyle = 'rgba(0,255,163,0.95)'
      ctx.textAlign = 'center'
      ctx.fillText('VILMEI', cx, cy + RX * 0.15 + 8)

      // verdict readout
      ctx.textAlign = 'right'
      ctx.font = '600 10px JetBrains Mono, monospace'
      const rx2 = cx + RX * 0.97, ry2 = cy - RY * 1.08
      ctx.fillStyle = 'rgba(120,190,165,0.95)'
      ctx.fillText('FEED LOCKED', rx2, ry2)
      ctx.font = '700 12px JetBrains Mono, monospace'
      ctx.fillStyle = 'rgba(240,255,249,0.97)'
      ctx.fillText(`${sym} · ${label}`, rx2, ry2 + 17)
      ctx.font = '700 10.5px JetBrains Mono, monospace'
      ctx.fillStyle = '#a9ffd9'
      ctx.fillText('LIVE · KEYLESS · 180s CACHE', rx2, ry2 + 33)
    },
  })
  return <canvas ref={ref} className="rv-radar-cv" aria-hidden="true" />
}

/* ─────────── multi-chain globe — glowing dark neon orb ─────────── */
/* chain metadata AND globe geometry (NODE_LL/ARCS) live in lib/netChains.ts,
   typed against ChainId: a parked id in an arc or node is a compile error,
   never a frame-0 `find() → undefined → .color` throw. */

const STARS = Array.from({ length: 70 }, (_, i) => ({ x: (i * 0.618) % 1, y: (i * 0.382) % 1, tw: (i * 0.9) % 6 }))

const TILT = 0.32
const COS_T = Math.cos(TILT)
/* light from top-left-front, math space (y up) */
const L = (() => { const v = { x: -0.5, y: 0.38, z: 0.78 }; const m = Math.hypot(v.x, v.y, v.z); return { x: v.x / m, y: v.y / m, z: v.z / m } })()

function project(lat: number, lon: number, rot: number): { x: number; y: number; z: number } {
  const cl = Math.cos(lat)
  const x0 = cl * Math.sin(lon + rot)
  const y0 = Math.sin(lat)
  const z0 = cl * Math.cos(lon + rot)
  const y = y0 * Math.cos(TILT) - z0 * Math.sin(TILT)
  const z = y0 * Math.sin(TILT) + z0 * Math.cos(TILT)
  return { x: x0, y, z }
}
function lambert(p: { x: number; y: number; z: number }) {
  return Math.max(0, p.x * L.x + p.y * L.y + p.z * L.z)
}
function slerp(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, k: number) {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))
  const om = Math.acos(dot) || 1e-4
  const so = Math.sin(om)
  const wa = Math.sin((1 - k) * om) / so
  const wb = Math.sin(k * om) / so
  return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb, z: a.z * wa + b.z * wb }
}

/* label slots on a fixed ring around the orb — leader lines, zero overlap */
const SLOT_ANG = [148, 180, 212, -32, 0, 32, 105, 255]

export function ChainGlobe({ hovered, onHover }: { hovered: string | null; onHover: (id: string | null) => void }) {
  const hit = useRef<{ x: number; y: number; id: string }[]>([])
  const ref = useSceneCanvas((ctx, w, h, t) => {
    /* ── GLOW LAYER (bloomed) ── */
    const cx = w / 2, cy = h * 0.47
    const R = Math.min(w, h) * 0.32
    const rot = t * 0.14

    // dark glowing body — deep space orb (backmost element)
    ctx.save()
    ctx.translate(cx, cy); ctx.scale(1, COS_T)
    const body = ctx.createRadialGradient(-R * 0.38, -R * 0.32, R * 0.08, 0, 0, R)
    body.addColorStop(0, 'rgba(10,46,32,0.94)')
    body.addColorStop(0.5, 'rgba(4,20,14,0.96)')
    body.addColorStop(1, 'rgba(1,9,6,0.98)')
    ctx.fillStyle = body
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill()
    // emissive glow from within
    const inner = ctx.createRadialGradient(0, R * 0.16, 0, 0, R * 0.16, R * 0.85)
    inner.addColorStop(0, 'rgba(0,255,163,0.16)')
    inner.addColorStop(0.6, 'rgba(0,255,163,0.05)')
    inner.addColorStop(1, 'rgba(0,255,163,0)')
    ctx.fillStyle = inner
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill()
    // specular highlight
    const spec = ctx.createRadialGradient(-R * 0.42, -R * 0.4, 0, -R * 0.42, -R * 0.4, R * 0.2)
    spec.addColorStop(0, 'rgba(214,255,239,0.2)')
    spec.addColorStop(1, 'rgba(214,255,239,0)')
    ctx.fillStyle = spec
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill()
    ctx.restore()

    ctx.globalCompositeOperation = 'lighter'

    // arcs — true great circles, opacity/weight staggered by depth
    ARCS.forEach(([aId, bId], ai) => {
      const A = project(NODE_LL[aId][0], NODE_LL[aId][1], rot)
      const B = project(NODE_LL[bId][0], NODE_LL[bId][1], rot)
      const vis = Math.max(A.z, B.z)
      if (vis < -0.05) return
      const col = colorOf[aId]
      ctx.strokeStyle = col
      ctx.globalAlpha = 0.1 + Math.max(0, vis) * 0.22
      ctx.lineWidth = 0.8 + Math.max(0, vis) * 0.6
      ctx.beginPath()
      let started = false
      for (let s = 0; s <= 26; s++) {
        const k = s / 26
        const m = slerp(A, B, k)
        const lift = 1 + Math.sin(k * Math.PI) * 0.13
        const x = cx + m.x * R * lift
        const y = cy - m.y * R * lift
        if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
      const k = (t * 0.5 + ai * 0.17) % 1
      const m = slerp(A, B, k)
      const lift = 1 + Math.sin(k * Math.PI) * 0.13
      glowDot(ctx, cx + m.x * R * lift, cy - m.y * R * lift, 1.4, col, 0.35 + Math.max(0, vis) * 0.45)
    })

    // beacon halos
    const nodes = NET_CHAINS.map((c) => {
      const [la, lo] = NODE_LL[c.id]
      const p = project(la, lo, rot)
      return { c, p, x: cx + p.x * R * 1.01, y: cy - p.y * R * 1.01 }
    })
    hit.current = nodes.map((n) => ({ x: n.x, y: n.y, id: n.c.id }))
    nodes.forEach((n) => {
      if (n.p.z > 0.12) {
        const halo = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 16)
        halo.addColorStop(0, n.c.color + '66')
        halo.addColorStop(1, n.c.color + '00')
        ctx.fillStyle = halo
        ctx.beginPath(); ctx.arc(n.x, n.y, 16, 0, TAU); ctx.fill()
      }
    })
    ctx.globalCompositeOperation = 'source-over'
  }, {
    bloom: true,
    deps: [hovered],
    /* ── CRISP LAYER (after bloom — wireframe, rim, beacons, labels stay sharp) ── */
    crisp: (ctx, w, h, t) => {
      const cx = w / 2, cy = h * 0.47
      const R = Math.min(w, h) * 0.32
      const rot = t * 0.14

      // starfield
      for (const s of STARS) {
        const a = 0.12 + Math.abs(Math.sin(t * 0.7 + s.tw)) * 0.26
        ctx.fillStyle = `rgba(174,247,221,${a})`
        ctx.fillRect(s.x * w, s.y * h * 0.86, 1.3, 1.3)
      }

      // lambert-lit wireframe — lit faces glow, limb fades out
      ctx.lineWidth = 1.1
      for (let la = -60; la <= 60; la += 30) {
        const lat = (la * Math.PI) / 180
        ctx.beginPath()
        let started = false
        let sx = 0, sy = 0
        for (let lo = 0; lo <= 360; lo += 6) {
          const p = project(lat, (lo * Math.PI) / 180, rot)
          if (p.z > 0.02) {
            const x = cx + p.x * R, y = cy - p.y * R
            if (!started) { ctx.moveTo(x, y); sx = p.x; sy = p.y; started = true } else ctx.lineTo(x, y)
          } else if (started) { break }
        }
        if (started) {
          const lam = lambert({ x: sx, y: sy, z: 0.6 })
          ctx.strokeStyle = `rgba(0,255,163,${0.05 + Math.pow(lam, 1.4) * 0.17})`
          ctx.stroke()
        }
      }
      for (let lo = 0; lo < 360; lo += 30) {
        const lon = (lo * Math.PI) / 180
        ctx.beginPath()
        let started = false
        let sx = 0, sy = 0
        for (let la = -90; la <= 90; la += 6) {
          const p = project((la * Math.PI) / 180, lon, rot)
          if (p.z > 0.02) {
            const x = cx + p.x * R, y = cy - p.y * R
            if (!started) { ctx.moveTo(x, y); sx = p.x; sy = p.y; started = true } else ctx.lineTo(x, y)
          } else if (started) { break }
        }
        if (started) {
          const lam = lambert({ x: sx, y: sy, z: 0.6 })
          ctx.strokeStyle = `rgba(0,255,163,${0.04 + Math.pow(lam, 1.4) * 0.13})`
          ctx.stroke()
        }
      }

      // fresnel rim — bright arc on the light side, faint elsewhere
      ctx.save()
      ctx.translate(cx, cy); ctx.scale(1, COS_T)
      ctx.strokeStyle = 'rgba(0,255,163,0.1)'
      ctx.lineWidth = 1.3
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke()
      ctx.strokeStyle = 'rgba(140,255,210,0.6)'
      ctx.lineWidth = 1.7
      ctx.beginPath(); ctx.arc(0, 0, R, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke()
      ctx.restore()

      // beacon cores + rings
      const nodes = NET_CHAINS.map((c) => {
        const [la, lo] = NODE_LL[c.id]
        const p = project(la, lo, rot)
        return { c, p, x: cx + p.x * R * 1.01, y: cy - p.y * R * 1.01 }
      })
      nodes.forEach((n) => {
        const on = hovered === n.c.id
        if (n.p.z > 0.12) {
          ctx.fillStyle = '#f0fff9'
          ctx.beginPath(); ctx.arc(n.x, n.y, 2.1, 0, TAU); ctx.fill()
          ctx.strokeStyle = n.c.color + (on ? 'ff' : 'bb')
          ctx.lineWidth = 1.2
          ctx.beginPath(); ctx.arc(n.x, n.y, on ? 8 : 6.2, 0, TAU); ctx.stroke()
          if (on) {
            ctx.strokeStyle = n.c.color
            ctx.lineWidth = 1.1
            ctx.beginPath(); ctx.arc(n.x, n.y, 13 + Math.sin(t * 4) * 2, 0, TAU); ctx.stroke()
          }
        } else {
          ctx.fillStyle = n.c.color + '4d'
          ctx.beginPath(); ctx.arc(n.x, n.y, 1.6, 0, TAU); ctx.fill()
        }
      })

      // labels on fixed ring slots — leader lines, greedy nearest-slot
      const RX2 = R * 1.52, RY2 = R * 1.12
      const slots = SLOT_ANG.map((deg) => {
        const a = (deg * Math.PI) / 180
        const x = Math.max(58, Math.min(w - 58, cx + Math.cos(a) * RX2))
        const y = Math.max(30, Math.min(h - 46, cy + Math.sin(a) * RY2))
        return { x, y, taken: false, left: Math.cos(a) < 0 }
      })
      const front = nodes.filter((n) => n.p.z > 0.2).sort((a, b) => b.p.z - a.p.z)
      ctx.font = '700 10px JetBrains Mono, monospace'
      front.forEach((n) => {
        let best = -1, bd = 1e9
        slots.forEach((s, si) => {
          if (s.taken) return
          const d = Math.hypot(s.x - n.x, s.y - n.y)
          if (d < bd) { bd = d; best = si }
        })
        if (best < 0 || bd > R * 2.2) return
        const s = slots[best]
        s.taken = true
        const on = hovered === n.c.id
        const dx = s.x - n.x, dy = s.y - n.y
        const dd = Math.hypot(dx, dy) || 1
        const sxp = n.x + (dx / dd) * 9, syp = n.y + (dy / dd) * 9
        ctx.strokeStyle = n.c.color + '77'
        ctx.lineWidth = 1.1
        ctx.beginPath(); ctx.moveTo(sxp, syp); ctx.lineTo(s.x, s.y); ctx.stroke()
        ctx.fillStyle = n.c.color
        ctx.beginPath(); ctx.arc(s.x, s.y, 1.7, 0, TAU); ctx.fill()
        ctx.textAlign = s.left ? 'right' : 'left'
        ctx.fillStyle = on ? '#f0fff9' : 'rgba(234,255,247,0.9)'
        const off = s.left ? -7 : 7
        ctx.fillText(n.c.label, s.x + off, s.y + 3.5)
        if (!n.c.live) {
          ctx.font = '600 8px Inter, sans-serif'
          ctx.fillStyle = 'rgba(139,145,180,0.85)'
          ctx.fillText('SOON', s.x + off, s.y + 15)
          ctx.font = '700 10px JetBrains Mono, monospace'
        }
      })

      // one subtle pulse on a front node
      const hot = NET_CHAINS[Math.floor(t / 2.4) % NET_CHAINS.length]
      const hn = nodes.find((n) => n.c.id === hot.id)
      if (hn && hn.p.z > 0.2) {
        const k = (t * 1.4) % 1
        ctx.strokeStyle = hot.color + Math.round((1 - k) * 130).toString(16).padStart(2, '0')
        ctx.lineWidth = 1.2
        ctx.beginPath(); ctx.arc(hn.x, hn.y, 8 + k * 22, 0, TAU); ctx.stroke()
      }
    },
  })

  const onMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left, y = e.clientY - rect.top
    const near = hit.current.find((p) => Math.hypot(p.x - x, p.y - y) < 24)
    onHover(near ? near.id : null)
  }, [onHover])

  return (
    <canvas ref={ref} className="rv-net-cv" onMouseMove={onMove} onMouseLeave={() => onHover(null)} />
  )
}

/* ─────────── system flow diagram — full feature chain, live cables ─────────── */

interface FlowBox { t: string; s: string; accent: string; live?: boolean; chains?: boolean }
const FLOW: FlowBox[] = [
  { t: 'DATA LAYER', s: 'DEXSCREENER · GECKO · HELIUS', accent: '#8dffcf' },
  { t: 'MULTI-CHAIN SCANNER', s: 'SOL · BNB · BASE · HYPE · HOOD', accent: '#ffd98a', chains: true },
  { t: 'RUG CHECK', s: 'LIQUIDITY · MINT · LP · OWNER', accent: '#ff9d9d' },
  { t: 'WALLET CLUSTERING', s: 'COORDINATED WALLETS', accent: '#93c5fd' },
  { t: 'WHALE TRACKING', s: 'NET FLOW · ACCUMULATION', accent: '#cbb8ff' },
  { t: 'RISK ENGINE', s: 'DETERMINISTIC SCORE 0–100', accent: '#8dffcf', live: true },
  { t: 'VILMEI AI', s: 'EVIDENCE-FIRST ANSWERS', accent: '#8dffcf' },
  { t: 'TERMINAL', s: 'DASHBOARD · ALERTS · WATCHLIST', accent: '#8dffcf' },
]
const FUTURE = ['SNIPER DETECTION', 'FUNDING SOURCE', 'DEEP RESEARCH']

export function SystemDiagram() {
  const ref = useSceneCanvas((ctx, w, h, t) => {
    /* ── GLOW LAYER — cables + traveling pulses + engine heartbeat ── */
    const bw = Math.min(206, (w - 48 - 34) / 2)
    const bh = 54
    const xL = 24, xR = w - 24 - bw
    const vgap = Math.min(30, (h - 52 - 4 * bh - 120) / 3)
    const box = (i: number) => {
      const row = Math.floor(i / 2)
      const leftFirst = row % 2 === 0
      const col = leftFirst ? i % 2 : 1 - (i % 2)
      return { x: col === 0 ? xL : xR, y: 22 + row * (bh + vgap), row, col }
    }
    const cablePath = (i: number) => {
      const a = box(i), b = box(i + 1)
      const ax = a.x + (a.col === 0 ? bw : 0), ay = a.y + bh / 2
      const bx = b.x + (b.col === 1 ? 0 : bw), by = b.y + bh / 2
      if (a.row === b.row) {
        const mx = (ax + bx) / 2
        return { p0: [ax, ay], c: [mx, ay - 12], p1: [bx, by] } as const
      }
      const bow = a.col === 1 ? bw + 14 : -14
      return { p0: [a.x + bw / 2, a.y + bh], c: [a.x + bw / 2 + bow, (a.y + bh + b.y) / 2], p1: [a.x + bw / 2, b.y] } as const
    }
    ctx.globalCompositeOperation = 'lighter'
    // cables — soft energy tube + bright core
    for (let i = 0; i < FLOW.length - 1; i++) {
      const { p0, c, p1 } = cablePath(i)
      ctx.strokeStyle = FLOW[i + 1].accent + '33'
      ctx.lineWidth = 5
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(c[0], c[1], p1[0], p1[1]); ctx.stroke()
      ctx.strokeStyle = FLOW[i + 1].accent + 'cc'
      ctx.lineWidth = 1.8
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(c[0], c[1], p1[0], p1[1]); ctx.stroke()
      // pulse packets
      for (let k = 0; k < 2; k++) {
        const pt = (t * 0.4 + i * 0.23 + k * 0.5) % 1
        const q = 1 - pt
        const px = q * q * p0[0] + 2 * q * pt * c[0] + pt * pt * p1[0]
        const py = q * q * p0[1] + 2 * q * pt * c[1] + pt * pt * p1[1]
        glowDot(ctx, px, py, 2.2, FLOW[i + 1].accent, 0.9)
      }
    }
    // engine heartbeat
    const eng = box(5)
    const beat = (Math.sin(t * 4) + 1) / 2
    glowDot(ctx, eng.x + bw - 16, eng.y + 16, 3, '#8dffcf', 0.3 + beat * 0.7)
    ctx.globalCompositeOperation = 'source-over'
  }, {
    bloom: true,
    deps: [],
    /* ── CRISP LAYER — boxes, labels, badges ── */
    crisp: (ctx, w, h, t) => {
      const bw = Math.min(206, (w - 48 - 34) / 2)
      const bh = 54
      const xL = 24, xR = w - 24 - bw
      const vgap = Math.min(30, (h - 52 - 4 * bh - 120) / 3)
      const box = (i: number) => {
        const row = Math.floor(i / 2)
        const leftFirst = row % 2 === 0
        const col = leftFirst ? i % 2 : 1 - (i % 2)
        return { x: col === 0 ? xL : xR, y: 22 + row * (bh + vgap), row, col }
      }
      const roundRect = (x: number, y: number, ww: number, hh: number, r: number) => {
        ctx.beginPath()
        ctx.moveTo(x + r, y)
        ctx.arcTo(x + ww, y, x + ww, y + hh, r)
        ctx.arcTo(x + ww, y + hh, x, y + hh, r)
        ctx.arcTo(x, y + hh, x, y, r)
        ctx.arcTo(x, y, x + ww, y, r)
        ctx.closePath()
      }
      ctx.textAlign = 'left'
      FLOW.forEach((f, i) => {
        const { x, y } = box(i)
        roundRect(x, y, bw, bh, 10)
        ctx.fillStyle = 'rgba(3,14,9,0.92)'
        ctx.fill()
        ctx.strokeStyle = f.accent + '59'
        ctx.lineWidth = 1.2
        ctx.stroke()
        ctx.fillStyle = f.accent
        ctx.fillRect(x + 10, y + 12, 3, bh - 24)
        ctx.font = '700 11px JetBrains Mono, monospace'
        ctx.fillStyle = '#eafff6'
        ctx.fillText(f.t, x + 22, y + 23)
        ctx.font = '500 7.5px JetBrains Mono, monospace'
        ctx.fillStyle = 'rgba(120,190,165,0.95)'
        ctx.fillText(f.s, x + 22, y + 39)
        if (f.chains) {
          const dots = NET_CHAINS.map((c) => c.color)
          dots.forEach((dc, k) => {
            ctx.fillStyle = dc
            ctx.beginPath(); ctx.arc(x + bw - 14 - k * 9, y + 17, 2, 0, TAU); ctx.fill()
          })
        }
        if (f.live) {
          ctx.strokeStyle = '#8dffcf'
          ctx.lineWidth = 1.2
          ctx.beginPath(); ctx.arc(x + bw - 16, y + 16, 5.5, 0, TAU); ctx.stroke()
          const beat = (Math.sin(t * 4) + 1) / 2
          ctx.fillStyle = `rgba(141,255,207,${0.4 + beat * 0.6})`
          ctx.beginPath(); ctx.arc(x + bw - 16, y + 16, 2.4, 0, TAU); ctx.fill()
        }
      })
      // future zone
      const fy = 22 + 4 * bh + 3 * vgap + 20
      const fw = (w - 48 - 28) / 3
      ctx.font = '700 8px JetBrains Mono, monospace'
      FUTURE.forEach((ft, k) => {
        const fx = 24 + k * (fw + 14)
        roundRect(fx, fy, fw, 38, 9)
        ctx.fillStyle = 'rgba(2,10,6,0.85)'
        ctx.fill()
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = 'rgba(0,255,163,0.3)'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(120,190,165,0.95)'
        ctx.textAlign = 'center'
        ctx.fillText(ft, fx + fw / 2, fy + 17)
        ctx.fillStyle = 'rgba(100,149,128,0.9)'
        ctx.font = '600 7px JetBrains Mono, monospace'
        ctx.fillText('ROADMAP V3', fx + fw / 2, fy + 29)
        ctx.font = '700 8px JetBrains Mono, monospace'
      })
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(100,149,128,0.85)'
      ctx.font = '600 8px JetBrains Mono, monospace'
      ctx.fillText('LIVE PIPELINE — EVERY SCAN FLOWS THROUGH THIS CHAIN', w / 2, fy + 58)
    },
  })
  return <canvas ref={ref} className="rv-flow-cv" aria-hidden="true" />
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
      <circle r="1.7" fill="#00ffa3">
        <animateMotion dur="2.2s" begin="0.7s" repeatCount="indefinite" path="M2 12 C 30 2, 60 22, 88 10 S 112 14, 118 12" />
      </circle>
    </svg>
  )
}
