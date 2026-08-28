import { useEffect, useRef } from 'react'
import { useCallback } from 'react'

/* ═══ Landing v5 visual engine — glowing dark-green neon, zero deps.
   Level 5: full-DPR render (no more jaggy), lambert-lit wireframe globe,
   beacon nodes + leader-line labels, decluttered radar with lock story.
   Scanner signature: NEON GREEN #00ffa3 on near-black. ═══ */

const GREEN = '#00ffa3'
const GREEN_SOFT = '#aef7dd'
const TAU = Math.PI * 2

interface SceneOpts {
  bloom?: boolean
  crisp?: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void
  deps?: unknown[]
  maxDpr?: number
}

/* Canvas runner with offscreen scene + downsample bloom composite + crisp pass.
   Two layers: draw() = glow layer (gets bloom), crisp() = drawn AFTER bloom on
   the main canvas so lines/ticks/text stay pixel-perfect, never softened.
   DPR is native-exact (1x screen → 1x render, no supersample downscale blur).
   Pauses off-screen, respects reduced motion. */
function useSceneCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void, opts: SceneOpts = {}) {
  const { bloom = false, crisp, deps = [], maxDpr = 2 } = opts
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
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
        b1.getContext('2d')!.drawImage(scene, 0, 0, b1.width, b1.height)
        b2.getContext('2d')!.drawImage(b1, 0, 0, b2.width, b2.height)
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.42
        ctx.drawImage(b2, 0, 0, w, h)
        ctx.globalAlpha = 0.22
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

/* ─────────── HERO radar — one story: sweep → detect → lock → verdict ─────────── */

const ORBITS = [
  { color: '#8dffcf', r: 0.52, speed: 0.11, size: 3.2 },
  { color: '#ffd98a', r: 0.72, speed: -0.08, size: 2.9 },
  { color: '#93c5fd', r: 0.86, speed: 0.065, size: 2.6 },
  { color: '#cbb8ff', r: 0.40, speed: -0.13, size: 2.4 },
  { color: '#ffabab', r: 0.64, speed: 0.09, size: 2.9 },
]

const TARGETS = [
  ['$FROGZILLA', 'SOL', 73], ['PEPEKING', 'BNB', 57], ['BASEDGOD', 'BASE', 34],
  ['WOJAK2.0', 'SOL', 81], ['SNOWBALL', 'AVAX', 72], ['MOONBOI', 'SOL', 49],
  ['HYPERCAT', 'HYPE', 88], ['$LABUBU9', 'BNB', 66], ['GRINDBOG', 'BASE', 41],
  ['$MEMEATCHI', 'SOL', 68], ['BONKLET', 'SOL', 29], ['TURBOCAT', 'BASE', 55],
] as const

const BLIPS = Array.from({ length: 12 }, (_, i) => ({
  a: (i / 12) * TAU + i * 0.83,
  r: 0.18 + ((i * 41) % 66) / 100,
  t: TARGETS[i % TARGETS.length],
}))

const DUST = Array.from({ length: 170 }, (_, i) => ({
  a: (i * 2.399963) % TAU,
  r: Math.sqrt(((i * 7919) % 1000) / 1000) * 0.95 + 0.05,
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
    /* ── GLOW LAYER (bloomed) ── */
    const p = ptr.current
    p.x += (p.tx - p.x) * 0.04
    p.y += (p.ty - p.y) * 0.04
    const cx = w / 2 + p.x * 14, cy = h * 0.54 + p.y * 10
    const RX = Math.min(w * 0.42, 350)
    const RY = RX * 0.36
    const P = (ang: number, rr: number): [number, number] => [cx + Math.cos(ang) * RX * rr, cy + Math.sin(ang) * RY * rr]
    ctx.globalCompositeOperation = 'lighter'

    const disc = ctx.createRadialGradient(cx, cy, RX * 0.04, cx, cy, RX)
    disc.addColorStop(0, 'rgba(0,255,163,0.14)')
    disc.addColorStop(0.55, 'rgba(0,255,163,0.045)')
    disc.addColorStop(1, 'transparent')
    ctx.save()
    ctx.translate(cx, cy); ctx.scale(1, RY / RX); ctx.translate(-cx, -cy)
    ctx.fillStyle = disc
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

    // sweep wedges + beam
    const sweep = t * 1.05
    ctx.save()
    ctx.translate(cx, cy); ctx.scale(1, RY / RX); ctx.translate(-cx, -cy)
    for (let i = 0; i < 56; i++) {
      const a = sweep - i * 0.023
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, RX, a - 0.015, a)
      ctx.closePath()
      ctx.fillStyle = `rgba(0,255,163,${(1 - i / 56) * 0.13})`
      ctx.fill()
    }
    ctx.restore()
    {
      const [ex, ey] = P(sweep, 1)
      const grad = ctx.createLinearGradient(cx, cy, ex, ey)
      grad.addColorStop(0, 'rgba(0,255,163,0.08)')
      grad.addColorStop(1, 'rgba(0,255,163,0.95)')
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.7
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke()
    }

    // blips — risk-colored glows
    BLIPS.forEach((b) => {
      const diff = Math.abs(((sweep - b.a) % TAU + TAU) % TAU)
      const hot = diff < 1.15 ? 1 - diff / 1.15 : 0.06
      const [x, y] = P(b.a, b.r)
      const col = b.t[2] >= 70 ? '#ff9d9d' : b.t[2] >= 50 ? '#ffd98a' : '#8dffcf'
      glowDot(ctx, x, y, 1.5 + hot * 2.4, col, 0.28 + hot)
    })

    // orbiting chain accents
    ORBITS.forEach((c) => {
      const a = t * c.speed * 2 + c.r * 9
      const x = cx + Math.cos(a) * RX * c.r
      const y = cy - 24 + Math.sin(a) * RX * c.r * 0.34
      glowDot(ctx, x, y, c.size, c.color, 0.9)
    })

    // few rising particles
    for (let i = 0; i < 14; i++) {
      const px = cx + Math.sin(i * 12.9898 + t * 0.35) * RX * 0.9
      const prog = ((t * 24 + i * 53) % (RY * 3.2)) / (RY * 3.2)
      const py = cy - prog * RY * 3.2 + RY * 0.4
      ctx.fillStyle = `rgba(0,255,163,${0.24 * (1 - prog)})`
      ctx.fillRect(px, py, 1.4, 1.4)
    }

    // core glow
    const pulse = 1 + Math.sin(t * 2.1) * 0.09
    glowDot(ctx, cx, cy, 10 * pulse, GREEN, 0.95)
    ctx.globalCompositeOperation = 'source-over'
  }, {
    bloom: true,
    deps: [],
    /* ── CRISP LAYER (drawn after bloom — pixel-perfect) ── */
    crisp: (ctx, w, h, t) => {
      const p = ptr.current
      const cx = w / 2 + p.x * 14, cy = h * 0.54 + p.y * 10
      const RX = Math.min(w * 0.42, 350)
      const RY = RX * 0.36
      const P = (ang: number, rr: number): [number, number] => [cx + Math.cos(ang) * RX * rr, cy + Math.sin(ang) * RY * rr]
      const sweep = t * 1.05
      const rev = Math.floor(sweep / TAU)
      const tgt = BLIPS[((rev % BLIPS.length) + BLIPS.length) % BLIPS.length]
      const [sym, chain, risk] = tgt.t
      const [tx2, ty2] = P(tgt.a, tgt.r)

      // depth shadow-discs
      for (let d = 3; d >= 1; d--) {
        ctx.save()
        ctx.translate(cx, cy + d * 8); ctx.scale(1, RY / RX); ctx.translate(-cx, -cy)
        ctx.strokeStyle = `rgba(0,255,163,${0.12 - d * 0.03})`
        ctx.lineWidth = 1.1
        ctx.beginPath(); ctx.arc(cx, cy, RX * (1 - d * 0.016), 0, TAU); ctx.stroke()
        ctx.restore()
      }
      // rings + ticks
      ctx.save()
      ctx.translate(cx, cy); ctx.scale(1, RY / RX); ctx.translate(-cx, -cy)
      for (const rr of [1, 0.66, 0.33]) {
        ctx.strokeStyle = `rgba(0,255,163,${rr === 1 ? 0.45 : 0.15})`
        ctx.lineWidth = rr === 1 ? 1.5 : 1.1
        ctx.beginPath(); ctx.arc(cx, cy, RX * rr, 0, TAU); ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(0,255,163,0.4)'
      for (let d = 0; d < 360; d += 15) {
        const a = (d * Math.PI) / 180
        const len = d % 45 === 0 ? 9 : 4
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * (RX - 1), cy + Math.sin(a) * (RX - 1))
        ctx.lineTo(cx + Math.cos(a) * (RX - len), cy + Math.sin(a) * (RX - len))
        ctx.stroke()
      }
      ctx.restore()

      // blip expand rings (non-target)
      BLIPS.forEach((b) => {
        if (b === tgt) return
        const diff = Math.abs(((sweep - b.a) % TAU + TAU) % TAU)
        const hot = diff < 1.15 ? 1 - diff / 1.15 : 0.06
        if (hot <= 0.5) return
        const [x, y] = P(b.a, b.r)
        const col = b.t[2] >= 70 ? '#ff9d9d' : b.t[2] >= 50 ? '#ffd98a' : '#8dffcf'
        ctx.strokeStyle = col + 'aa'
        ctx.lineWidth = 1.1
        ctx.beginPath(); ctx.arc(x, y, 6 + (1 - hot) * 16, 0, TAU); ctx.stroke()
      })

      // lock brackets on the story target
      {
        const s = 7
        ctx.strokeStyle = risk >= 70 ? '#ffb3b3' : '#8dffcf'
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
        ctx.strokeStyle = c.color + '26'
        ctx.lineWidth = 1.1
        ctx.beginPath(); ctx.ellipse(cx, cy - 24, RX * c.r, RX * c.r * 0.34, 0, 0, TAU); ctx.stroke()
        ctx.strokeStyle = c.color + '59'
        ctx.lineWidth = 1.6
        ctx.beginPath(); ctx.ellipse(cx, cy - 24, RX * c.r, RX * c.r * 0.34, 0, a - Math.sign(c.speed) * 0.5, a); ctx.stroke()
      })

      // core ring + glyph + name
      const pulse = 1 + Math.sin(t * 2.1) * 0.09
      ctx.strokeStyle = `rgba(0,255,163,${0.5 - Math.sin(t * 2.1) * 0.2})`
      ctx.lineWidth = 1.1
      ctx.beginPath(); ctx.arc(cx, cy, 24 * pulse, 0, TAU); ctx.stroke()
      ctx.fillStyle = 'rgba(240,255,249,0.97)'
      markGlyph(ctx, cx, cy + 1, 7)
      ctx.font = '700 10.5px Space Grotesk, sans-serif'
      ctx.fillStyle = 'rgba(0,255,163,0.95)'
      ctx.textAlign = 'center'
      ctx.fillText('TERMINAL ALPHA', cx, cy + RX * 0.15 + 8)

      // verdict readout
      ctx.textAlign = 'right'
      ctx.font = '600 10px JetBrains Mono, monospace'
      const rx2 = cx + RX * 0.97, ry2 = cy - RY * 1.08
      ctx.fillStyle = 'rgba(120,190,165,0.95)'
      ctx.fillText('TARGET LOCKED', rx2, ry2)
      ctx.font = '700 12px JetBrains Mono, monospace'
      ctx.fillStyle = 'rgba(240,255,249,0.97)'
      ctx.fillText(`${sym} · ${chain}`, rx2, ry2 + 17)
      ctx.font = '700 10.5px JetBrains Mono, monospace'
      ctx.fillStyle = risk >= 70 ? '#ffb3b3' : risk >= 50 ? '#ffe0a3' : '#a9ffd9'
      ctx.fillText(`RISK ${risk} — ${risk >= 70 ? 'RUG PATTERN' : risk >= 50 ? 'MONITOR' : 'CLEAN SIGNAL'}`, rx2, ry2 + 33)
    },
  })
  return <canvas ref={ref} className="rv-radar-cv" aria-hidden="true" />
}

/* ─────────── multi-chain globe — glowing dark neon orb ─────────── */

export interface NetChain { id: string; label: string; color: string; live: boolean; stats: string }

export const NET_CHAINS: NetChain[] = [
  { id: 'sol', label: 'SOLANA', color: '#8dffcf', live: true, stats: '1,900+ pairs indexed · live scanning' },
  { id: 'bnb', label: 'BNB CHAIN', color: '#ffd98a', live: true, stats: 'PancakeSwap pools · live scanning' },
  { id: 'base', label: 'BASE', color: '#93c5fd', live: true, stats: 'Aerodrome pools · live scanning' },
  { id: 'hype', label: 'HYPEREVM', color: '#cbb8ff', live: false, stats: 'chainId pending verification — honest by policy' },
  { id: 'avax', label: 'AVALANCHE', color: '#ffabab', live: true, stats: 'TraderJoe pools · live scanning' },
]

const NODE_LL: Record<string, [number, number]> = {
  sol: [0.38, 0.7], bnb: [-0.2, 2.6], base: [0.55, 4.4], hype: [-0.55, 5.5], avax: [0.02, 3.4],
}
const ARCS: [string, string][] = [['sol', 'bnb'], ['bnb', 'base'], ['base', 'sol'], ['sol', 'hype'], ['avax', 'sol'], ['avax', 'base']]

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
      const col = NET_CHAINS.find((c) => c.id === aId)!.color
      ctx.strokeStyle = col
      ctx.globalAlpha = 0.14 + Math.max(0, vis) * 0.32
      ctx.lineWidth = 1 + Math.max(0, vis) * 0.9
      ctx.beginPath()
      let started = false
      for (let s = 0; s <= 26; s++) {
        const k = s / 26
        const m = slerp(A, B, k)
        const lift = 1 + Math.sin(k * Math.PI) * 0.26
        const x = cx + m.x * R * lift
        const y = cy - m.y * R * lift
        if (!started) { ctx.moveTo(x, y); started = true } else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
      const k = (t * 0.5 + ai * 0.17) % 1
      const m = slerp(A, B, k)
      const lift = 1 + Math.sin(k * Math.PI) * 0.26
      glowDot(ctx, cx + m.x * R * lift, cy - m.y * R * lift, 1.8, col, 0.4 + Math.max(0, vis) * 0.6)
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

/* ─────────── neural core — synapse sphere, drifting axes, no bands ─────────── */

const CORE_N = 64
const CORE_PTS: [number, number, number][] = Array.from({ length: CORE_N }, (_, i) => {
  const phi = Math.acos(1 - (2 * (i + 0.5)) / CORE_N)
  const th = Math.PI * (1 + Math.sqrt(5)) * i
  return [Math.sin(phi) * Math.cos(th), Math.sin(phi) * Math.sin(th), Math.cos(phi)]
})
const CORE_EDGES: [number, number][] = (() => {
  const e: [number, number][] = []
  for (let i = 0; i < CORE_N; i++) {
    for (let j = i + 1; j < CORE_N; j++) {
      const d = Math.hypot(CORE_PTS[i][0] - CORE_PTS[j][0], CORE_PTS[i][1] - CORE_PTS[j][1], CORE_PTS[i][2] - CORE_PTS[j][2])
      if (d < 0.62) e.push([i, j])
    }
  }
  return e
})()

export function NeuralCore() {
  const ref = useSceneCanvas((ctx, w, h, t) => {
    /* ── GLOW LAYER (bloomed) ── */
    const cx = w / 2, cy = h / 2
    const R = Math.min(w, h) * 0.34
    const ry = t * 0.5, rx = 0.42 + 0.28 * Math.sin(t * 0.07), rz = t * 0.05
    const pts: [number, number, number][] = CORE_PTS.map(([x, y, z]) => {
      const y1 = y * Math.cos(rx) - z * Math.sin(rx)
      const z1 = y * Math.sin(rx) + z * Math.cos(rx)
      const x1 = x * Math.cos(ry) + z1 * Math.sin(ry)
      const z2 = -x * Math.sin(ry) + z1 * Math.cos(ry)
      const x2 = x1 * Math.cos(rz) - y1 * Math.sin(rz)
      const y2 = x1 * Math.sin(rz) + y1 * Math.cos(rz)
      return [cx + x2 * R, cy - y2 * R, z2]
    })
    ctx.globalCompositeOperation = 'lighter'
    pts.forEach((p) => {
      const depth = (p[2] + 1) / 2
      glowDot(ctx, p[0], p[1], 1 + depth * 1.6, depth > 0.55 ? GREEN_SOFT : GREEN, 0.3 + depth * 0.6)
    })
    const pulse = 1 + Math.sin(t * 2.4) * 0.14
    glowDot(ctx, cx, cy, 7 * pulse, '#b9a5ff', 0.85)
    for (let i = 0; i < 3; i++) {
      const a = t * (0.9 + i * 0.3) + i * 2.1
      glowDot(ctx, cx + Math.cos(a) * R * 1.25, cy + Math.sin(a) * R * 0.5, 2, '#cbb8ff', 0.6)
    }
    ctx.globalCompositeOperation = 'source-over'
  }, {
    bloom: true,
    deps: [],
    /* ── CRISP LAYER (after bloom — edges & synapses stay sharp) ── */
    crisp: (ctx, w, h, t) => {
      const cx = w / 2, cy = h / 2
      const R = Math.min(w, h) * 0.34
      const ry = t * 0.5, rx = 0.42 + 0.28 * Math.sin(t * 0.07), rz = t * 0.05
      const pts: [number, number, number][] = CORE_PTS.map(([x, y, z]) => {
        const y1 = y * Math.cos(rx) - z * Math.sin(rx)
        const z1 = y * Math.sin(rx) + z * Math.cos(rx)
        const x1 = x * Math.cos(ry) + z1 * Math.sin(ry)
        const z2 = -x * Math.sin(ry) + z1 * Math.cos(ry)
        const x2 = x1 * Math.cos(rz) - y1 * Math.sin(rz)
        const y2 = x1 * Math.sin(rz) + y1 * Math.cos(rz)
        return [cx + x2 * R, cy - y2 * R, z2]
      })
      CORE_EDGES.forEach(([i, j]) => {
        const depth = (pts[i][2] + pts[j][2]) / 2
        ctx.strokeStyle = `rgba(0,255,163,${0.02 + (depth + 1) * 0.05})`
        ctx.lineWidth = 0.7
        ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke()
      })
      const gen = Math.floor(t / 0.8)
      for (let k = 0; k < 6; k++) {
        const [i, j] = CORE_EDGES[(gen * 13 + k * 29) % CORE_EDGES.length]
        ctx.strokeStyle = `rgba(140,255,210,${0.5 * Math.abs(Math.sin(t * 3 + k * 1.3))})`
        ctx.lineWidth = 1.1
        ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke()
      }
    },
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
