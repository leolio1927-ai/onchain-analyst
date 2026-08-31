/* P5 gates (PROMPT-V2B): the VILMEI signal language laws, tested.
   1. reduced-motion → the dial STILL renders (2D fallback) + the number is
      visible — accessibility never costs the verdict.
   2. --sev-* oklch tokens are THE single source: the 3D ramp endpoints
      (dial3d SEV_RAMP) equal the CSS hues; every level has a selector.
   3. mode switching persists under vilmei.risk-mode.
   4. compositor law: risk-display.css ships zero @keyframes (all motion is
      canvas/three transform work) — transform/opacity only, by construction.
   5. the 8-bin tape quantizer is monotonic. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RiskDisplay, SEV_RATIO, sevBin } from './RiskDisplay'
import type { RiskVerdict } from './RiskDisplay'
import { SEV_RAMP } from './dial3d'

const css = readFileSync(join(process.cwd(), 'src/components/risk-display.css'), 'utf8')

const VERDICT: RiskVerdict = {
  level: 'high', score: 66, label: 'TEST VERDICT',
  rows: [
    { name: 'Mutable metadata', level: 'warn', score: 100, description: 'owner can change it' },
    { name: 'LP locked', level: 'danger', score: 12, description: null },
  ],
}

function stubMedia(reduced: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduced && q.includes('reduce'), media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }))
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('P5 RiskDisplay — one verdict language', () => {
  it('reduced-motion: dial still renders + the number stays visible', () => {
    stubMedia(true)
    const { container } = render(<RiskDisplay verdict={VERDICT} />)
    const canvas = container.querySelector('canvas.rd-dial')
    expect(canvas, 'the 2D fallback canvas renders').toBeTruthy()
    expect(canvas?.getAttribute('data-engine'), 'three is never mounted under reduced-motion').toBe('canvas2d')
    expect(container.textContent).toContain('66')       // the number is the verdict
    expect(container.textContent).toContain('TEST VERDICT')
  })

  it('--sev-* tokens are the single source (CSS hues === 3D ramp endpoints)', () => {
    const hueOf = (tok: string): number => {
      const m = css.match(new RegExp(`${tok}:\\s*oklch\\([^)]*?\\s(\\d+(?:\\.\\d+)?)\\)`))
      expect(m, `${tok} defined in risk-display.css`).toBeTruthy()
      return Number(m![1])
    }
    expect(hueOf('--sev-low')).toBe(SEV_RAMP.low)
    expect(hueOf('--sev-high')).toBe(SEV_RAMP.high)
    /* every level has a verdict + badge selector — no orphan severity */
    for (const lvl of Object.keys(SEV_RATIO)) {
      expect(css).toContain(`.rd-verdict[data-level='${lvl}']`)
      expect(css).toContain(`.rd-badge[data-level='${lvl}']`)
    }
    /* tokens are declared exactly once */
    expect(css.match(/--sev-low:/g)?.length).toBe(1)
    expect(css.match(/--sev-high:/g)?.length).toBe(1)
  })

  it('mode switch persists under vilmei.risk-mode', () => {
    stubMedia(false)
    const { getByRole } = render(<RiskDisplay verdict={VERDICT} />)
    fireEvent.click(getByRole('tab', { name: 'TAPE' }))
    expect(JSON.parse(localStorage.getItem('vilmei.risk-mode') ?? 'null')).toBe('tape')
    fireEvent.click(getByRole('tab', { name: 'LOG' }))
    expect(JSON.parse(localStorage.getItem('vilmei.risk-mode') ?? 'null')).toBe('log')
  })

  it('compositor law: zero CSS keyframes in the risk surface', () => {
    expect(css).not.toMatch(/@keyframes/)
  })

  it('tape bins are monotonic 0..7', () => {
    expect(sevBin(0)).toBe(0)
    expect(sevBin(0.999)).toBe(7)
    expect(sevBin(1.5)).toBe(7)
    expect(sevBin(-1)).toBe(0)
    for (let i = 1; i < 8; i++) expect(sevBin(i / 8)).toBeGreaterThanOrEqual(sevBin((i - 1) / 8))
  })
})
