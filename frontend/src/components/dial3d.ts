/* DIAL 3D — three.js torus with the oklch risk ramp + gauge needle
   (PROMPT-V2 P5). LAZY chunk: three (137.75 kB gzip measured, ≤ the
   150 kB founder budget — see docs/TECH-DECISIONS.md row 8) loads only
   when the user actually views the DIAL mode. DPR capped at 1.5; one
   InstancedMesh for the tick ring (1 draw call); auto-rotate pauses on
   hover. No WebGL / reduced-motion → the parent renders the canvas-2D
   fallback; this module is only imported dynamically. */
import {
  AmbientLight,
  BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  TorusGeometry,
  WebGLRenderer,
} from 'three'

/* severity ramp — MUST stay in parity with tokens.css --sev-* (tested) */
export const SEV_RAMP = { low: 155, mid: 90, high: 25 } // oklch hue per level

export interface DialHandle {
  dispose(): void
  setVerdict(ratio01: number): void   // 0 = low … 1 = high
}

export function mountDial(canvas: HTMLCanvasElement, ratio01: number, reduced: boolean): DialHandle | null {
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
  if (!gl) return null
  const scene = new Scene()
  const camera = new PerspectiveCamera(38, 1, 0.1, 20)
  camera.position.set(0, 0.55, 3.1)
  camera.lookAt(0, 0, 0)

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)) // founder DPR cap

  /* torus: gradient risk ramp via vertex colors (oklch hue → sRGB per stop) */
  const torus = new TorusGeometry(1, 0.16, 24, 96)
  const pos = torus.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const hueAt = (t: number) => SEV_RAMP.low + (SEV_RAMP.high - SEV_RAMP.low) * t
  const c = { r: 0, g: 0, b: 0 }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i)
    const t = (Math.atan2(y, x) + Math.PI) / (2 * Math.PI)   // angle → 0..1
    oklchToRgb(0.72, 0.16, hueAt(t), c)
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
  }
  torus.setAttribute('color', new BufferAttribute(colors, 3))
  const ring = new Mesh(torus, new MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.15 }))
  const glass = new Group()   // stand-in glass shell (subtle rim light only)
  scene.add(ring, glass, new AmbientLight(0xffffff, 1.4))

  /* tick ring — ONE InstancedMesh = one draw call (founder budget) */
  const ticks = new InstancedMesh(
    new TorusGeometry(1.32, 0.012, 6, 5),
    new MeshStandardMaterial({ color: 0x0f5f43, roughness: 0.6 }),
    48,
  )
  const dummy = new Object3D()
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2
    dummy.position.set(Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0)
    dummy.rotation.z = a
    dummy.updateMatrix()
    ticks.setMatrixAt(i, dummy.matrix)
  }
  ticks.rotation.x = Math.PI / 2
  scene.add(ticks)

  /* needle = verdict live */
  const needle = new Group()
  const stick = new Mesh(new TorusGeometry(0.72, 0.02, 6, 24, Math.PI / 7))
  ;(stick.material as MeshStandardMaterial).color.set(0xf0fff9)
  needle.add(stick)
  scene.add(needle)

  let ratio = ratio01
  const applyRatio = () => { needle.rotation.z = Math.PI / 2 - ratio * Math.PI }
  applyRatio()

  let rot = 0
  let hover = false
  canvas.addEventListener('pointerenter', () => { hover = true })
  canvas.addEventListener('pointerleave', () => { hover = false })

  let raf = 0
  let dead = false
  const frame = () => {
    if (dead) return
    if (!hover && !reduced) {
      rot += 0.004
      ring.rotation.z = rot
      ticks.rotation.z = rot * 0.6
    }
    renderer.render(scene, camera)
    raf = requestAnimationFrame(frame)
  }
  const resize = () => {
    const w = canvas.clientWidth || 260
    const h = canvas.clientHeight || 260
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()
  frame()

  return {
    dispose() { dead = true; cancelAnimationFrame(raf); renderer.dispose() },
    setVerdict(r01: number) { ratio = r01; applyRatio() },
  }
}

/* minimal OKLab→sRGB (CSS Color 4 math) so the ramp matches --sev-* hues */
export function oklchToRgb(l: number, chroma: number, hueDeg: number, out: { r: number; g: number; b: number }): void {
  const h = (hueDeg * Math.PI) / 180
  const a = Math.cos(h) * chroma
  const b = Math.sin(h) * chroma
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b
  const L = l_ ** 3, M = m_ ** 3, S = s_ ** 3
  const lr = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S
  const lg = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S
  const lb = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S
  const gamma = (v: number) => {
    const v2 = Math.max(0, Math.min(1, v))
    return v2 <= 0.0031308 ? 12.92 * v2 : 1.055 * Math.pow(v2, 1 / 2.4) - 0.055
  }
  out.r = gamma(lr); out.g = gamma(lg); out.b = gamma(lb)
}
