/* Render smoke for the landing — the 2026-08-30 white-screen was a frame-0
   throw inside a landing-only canvas component that killed the whole React
   tree. This test mounts the FULL page in jsdom (no canvas backing store):
   if any landing component throws during mount, "/" would be white again. */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Landing from './landing'

describe('<Landing /> render smoke', () => {
  it('mounts the full page without throwing (white-screen regression)', () => {
    const { container } = render(<Landing />)
    expect(container.querySelector('.lv')).toBeTruthy()
  })

  it('renders the brand and the honest five-chain claim', () => {
    const { container } = render(<Landing />)
    const text = container.textContent ?? ''
    expect(text).toContain('VILMEI')
    expect(text).toContain('all five live on the keyless feed today')
  })

  it('never mentions the parked chain on the active surface', () => {
    const { container } = render(<Landing />)
    expect(container.textContent ?? '').not.toMatch(/AVAX|Avalanche/)
  })
})
