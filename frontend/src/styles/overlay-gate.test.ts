/* P2 alpha-gate: every popover/modal surface must be SOLID (background alpha
   ≥ .97) — computed styles are meaningless in jsdom (no cascade), so this
   gate parses the CSS source itself: the guarantee is real and testable.
   Overflow-hidden without a title is lint-checked in review; here we hold
   the see-through law the founder complained about. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/* vitest root = frontend/ → cwd-relative read is deterministic */
const css = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8')

describe('P2 solid-overlay gate (2026-08-31)', () => {
  it('z-scale tokens exist and are used (no 1200-style magic numbers)', () => {
    for (const t of ['--z-canvas: 1', '--z-header: 20', '--z-popover: 60', '--z-modal: 80']) {
      expect(css).toContain(t)
    }
    expect(css).toContain('z-index: var(--z-popover)')
    expect(css).toContain('z-index: var(--z-modal)')
    expect(css).not.toMatch(/z-index:\s*(1[0-9]{3}|[2-9][0-9]{2})/)
  })

  it('popover + modal surfaces are opaque: no rgba()/oklch alpha < .97 on their blocks', () => {
    for (const sel of ['.ta-search-drop', '.wl-modal', '.ta-modal-veil']) {
      const idx = css.indexOf(sel)
      expect(idx, `${sel} block exists`).toBeGreaterThan(-1)
      const block = css.slice(idx, idx + 700)
      const alphas = [...block.matchAll(/rgba?\([^)]*\/\s*(0?\.\d+)\)/g)].map((m) => Number(m[1]))
        .concat([...block.matchAll(/oklch\([^)]*\/\s*(0?\.\d+)\)/g)].map((m) => Number(m[1])))
      expect(alphas.every((a) => a >= 0.97), `${sel} has see-through alpha: ${alphas}`).toBe(true)
      expect(block).toMatch(/background:\s*(var\(--surf-solid\)|[^;]*0?\.9[7-9])/)
    }
  })

  it('blur is never the only differentiator — border + shadow required on overlays', () => {
    for (const sel of ['.ta-search-drop', '.wl-modal']) {
      const block = css.slice(css.indexOf(sel), css.indexOf(sel) + 700)
      expect(block).toMatch(/border:\s*1px solid/)
      expect(block).toMatch(/box-shadow:/)
    }
  })
})
