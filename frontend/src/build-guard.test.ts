/* PROMPT-W A2 guard: the shipped bundle carries ZERO AI-vendor vocabulary.
   The model/vendor layer is infrastructure, never product copy — the UI
   attributes every answer to VILMEI itself.
   Scope: dist/*.html + dist/assets/*.js (the code the browser executes). */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

/* case-insensitive substrings; glm/gpt/NIM are word-boundary regexes —
   minified three.js contains "glMultisampled…" and similar coincidences */
const FORBIDDEN_CI = ['nvidia', 'api.b.ai', 'model id', 'free tier',
  'api_key=', 'api-key=', 'bearer ', 'vendor-key']
const FORBIDDEN_RE: [string, RegExp][] = [
  ['NIM', /\bNIM\b/],
  ['glm', /\bglm\b/i],
  ['gpt', /\bgpt\b/i],
  ['sk-…', /\bsk-[A-Za-z0-9]{12,}/],
]

describe('PROMPT-W A2 — bundle vendor-leak guard', () => {
  const dist = join(process.cwd(), 'dist')
  const files = walk(dist).filter((f) => /\.(html|js)$/.test(f))

  it('dist build exists (run npm run build first)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('no vendor/infra vocabulary in any html/js the browser executes', () => {
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const t = readFileSync(f, 'utf8')
      const low = t.toLowerCase()
      for (const s of FORBIDDEN_CI) {
        expect(low.includes(s), `${f} ships "${s}"`).toBe(false)
      }
      for (const [name, re] of FORBIDDEN_RE) {
        expect(re.test(t), `${f} ships "${name}"`).toBe(false)
      }
    }
  })
})
