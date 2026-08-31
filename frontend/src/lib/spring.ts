/* P5 micro — spring counter: one tiny dep-free spring integrator (rAF,
   critically-tuned stiffness/damping) for headline numbers. Text content,
   no layout animation; motion respects prefers-reduced-motion (jumps). */
import { useEffect, useRef, useState } from 'react'

export function useSpringNumber(target: number, stiffness = 120, damping = 22): number {
  const [shown, setShown] = useState(target)
  const st = useRef({ v: 0, x: target, raf: 0, last: 0 })

  useEffect(() => {
    if (!Number.isFinite(target)) { setShown(target); return }
    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) { setShown(target); st.current.x = target; return }

    const s = st.current
    s.last = performance.now()
    cancelAnimationFrame(s.raf)
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - s.last) / 1000)
      s.last = now
      const f = -stiffness * (s.x - target) - damping * s.v
      s.v += f * dt
      s.x += s.v * dt
      setShown(s.x)
      if (Math.abs(s.x - target) > 0.005 || Math.abs(s.v) > 0.005) {
        s.raf = requestAnimationFrame(tick)
      } else { s.x = target; s.v = 0; setShown(target) }
    }
    s.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(s.raf)
  }, [target, stiffness, damping])

  return shown
}
