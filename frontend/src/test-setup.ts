/* Vitest setup — jsdom WITHOUT the canvas package ("jsdom-canvas").
   The visual components already guard every getContext('2d') with a null
   check (2026-08-30 root fix), so a null context is an honest no-render.
   matchMedia answers `matches: true` for every query on purpose: that takes
   the prefers-reduced-motion and pointer:coarse early-return paths, which
   keeps the smoke test free of animation timers. */
import { vi } from 'vitest'

window.matchMedia = ((query: string) => ({
  matches: true,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia

class EmptyObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): never[] {
    return []
  }
}
window.IntersectionObserver = EmptyObserver as unknown as typeof IntersectionObserver
window.ResizeObserver = EmptyObserver as unknown as typeof ResizeObserver

/* jsdom's real getContext would log "Not implemented" — return the null the
   components are built to handle instead */
HTMLCanvasElement.prototype.getContext = () => null

/* the landing fetches live feeds on mount; a never-settling promise leaves
   every panel in its honest loading state (no fabricated data in tests) */
vi.stubGlobal('fetch', () => new Promise<Response>(() => {}))
