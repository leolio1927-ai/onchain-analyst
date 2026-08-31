/* PROMPT-AI-V AI-4 gate: sidebar matrix — a pill is a claim, this test
   holds it to it. Every LIVE pill must sit on a page that is actually
   wired; AI Analyst is LIVE after PROMPT-AI-V and never SOON again. */
import { describe, expect, it } from 'vitest'
import { NAV } from './navModel'

/* the routes terminal.tsx wires as real pages today */
const LIVE_PAGES = new Set(['dashboard', 'swap', 'scanner', 'rugcheck', 'whale', 'ai', 'portfolio', 'holdings'])
/* pages that carry no pill by design (they are the frame, not a feature) */
const UNPILLED = new Set(['dashboard', 'scanner'])

describe('sidebar matrix — pill == truth', () => {
  it('every LIVE pill sits on a wired page', () => {
    for (const n of NAV) {
      if (n.pill === 'LIVE') {
        expect(LIVE_PAGES.has(n.id), `nav '${n.id}' claims LIVE but is not wired`).toBe(true)
      }
    }
  })

  it('every wired feature page is not marked SOON', () => {
    for (const n of NAV) {
      if (LIVE_PAGES.has(n.id) && !UNPILLED.has(n.id)) {
        expect(n.soon, `nav '${n.id}' is wired but still marked SOON`).toBeFalsy()
      }
    }
  })

  it('AI Analyst is LIVE after PROMPT-AI-V', () => {
    const ai = NAV.find((n) => n.id === 'ai')
    expect(ai?.pill).toBe('LIVE')
    expect(ai?.soon).toBeFalsy()
  })

  it('no item claims LIVE and SOON at the same time', () => {
    for (const n of NAV) {
      expect(n.pill === 'LIVE' && n.soon === true, `'${n.id}' is both LIVE and SOON`).toBe(false)
    }
  })
})
