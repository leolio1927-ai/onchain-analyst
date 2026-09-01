/* PROMPT-W D3 — hero text is FINAL at every frame: load/0ms, 500ms, 2000ms
   produce a 0-diff, and the hero's innerHTML carries zero glyph-shuffle /
   CJK characters. Renders the full landing (the hero is module-private). */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Landing from './landing'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const CJK = /[\u4e00-\u9fff\u3040-\u30ff]/
const FINAL = 'See What Others Miss.VERIFY EVERYTHING.'

function heroText(): string {
  const l1 = document.querySelector('.lv-h1 .l1')?.textContent ?? ''
  const l2 = document.querySelector('.lv-h1 .l2')?.textContent ?? ''
  return `${l1}${l2}`
}

describe('PROMPT-W D3 — hero instant, no scramble/CJK', () => {
  it('text is final at 0ms, 500ms, 2000ms (0-diff across frames)', { timeout: 20000 }, async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Promise<Response>(() => {})))
    render(<Landing />)
    const frames: string[] = []
    for (const wait of [0, 500, 2000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait))
      frames.push(heroText())
    }
    expect(frames[0]).toContain('See What Others Miss.')
    expect(frames[0]).toContain('VERIFY EVERYTHING.')
    expect(new Set(frames).size).toBe(1)          // 0-diff across all 3 frames
    expect(frames[0]).toBe(FINAL)                 // exactly the final copy
  })

  it('hero innerHTML has zero CJK / glyph-noise characters', { timeout: 20000 }, () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Promise<Response>(() => {})))
    render(<Landing />)
    const hero = document.querySelector('.lv-h1')!
    expect(CJK.test(hero.innerHTML)).toBe(false)
    expect(hero.textContent).toContain('See What Others Miss.')
    expect(hero.textContent).toContain('VERIFY EVERYTHING.')
  })
})
