/* V5-G3 gate: the brand sweep is total and the embroidery is uniform.
   1. brand-grep: 'terminal alpha' appears NOWHERE active in src or the html
      shells — only the documented DocsPage rename-history sentence may
      mention the old name (asserted as exactly one match).
   2. the 6-chain band is defined ONCE in tokens.css (--emb-*) and consumed
      via var() — no surface hardcodes the chain hexes again.
   3. the .embroidery utility is attached to ≥3 terminal surfaces. */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.') || name.includes('.test.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|css|html)$/.test(name)) out.push(p)
  }
  return out
}

const FILES = walk(ROOT)

describe('V5-G3 — brand sweep + embroidery uniform', () => {
  it('TERMINAL ALPHA: zero active usage (only the one documented rename-history line)', () => {
    const hits: string[] = []
    for (const f of FILES) {
      const t = readFileSync(f, 'utf8')
      if (/terminal[ _-]?alpha/i.test(t.replace(/&nbsp;/g, ' '))) hits.push(f)
    }
    expect(hits).toEqual([join(ROOT, 'src/pages/DocsPage.tsx')])
    const doc = readFileSync(hits[0] ?? '', 'utf8')
    expect(doc.match(/Terminal Alpha/gi)?.length).toBe(1)  // the history sentence, nothing more
  })

  it('the 6-chain band hexes live ONCE (tokens.css) — no surface re-hardcodes the band', () => {
    /* a re-hardcode = ≥3 chain hexes braided into ONE line (the band
       pattern). A single hex with its own semantics (syntax-highlight
       token, a var() fallback) is not the embroidery bar. */
    const hexes = ['#14f195', '#f0b90b', '#4d8dff', '#2dd4bf', '#00c805', '#e84142']
    let tokensDeclaresBand = false
    for (const f of FILES) {
      for (const line of readFileSync(f, 'utf8').toLowerCase().split('\n')) {
        const braided = hexes.filter((h) => line.includes(h))
        if (braided.length >= 3) {
          if (f.endsWith('tokens.css')) { tokensDeclaresBand = true; continue }
          throw new Error(`${f} re-hardcodes the embroidery band: ${braided.join(' ')}`)
        }
      }
    }
    expect(tokensDeclaresBand).toBe(true)  // the single source exists
  })

  it('the embroidery utility rides ≥3 terminal surfaces (sidebar · topbar · page head)', () => {
    const shell = readFileSync(join(ROOT, 'src/layout/Shell.tsx'), 'utf8')
    expect(shell.match(/embroidery/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    const pages = readFileSync(join(ROOT, 'src/pages/Pages2.tsx'), 'utf8')
    expect(pages).toContain('page-head embroidery')
    const app = readFileSync(join(ROOT, 'src/styles/app.css'), 'utf8')
    expect(app).toContain('var(--emb-band)')
    expect(app).toContain('prefers-reduced-motion')
  })
})
