/* P7 gate (PROMPT-V2B): roadmap ledger displays VM-xx but the #ta-xx anchors
   stay resolvable forever (alias spans carry #vm-xx too). */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RoadmapPage } from './RoadmapPage'

afterEach(() => cleanup())

describe('P7 roadmap ledger rebrand — VM display, TA anchors immortal', () => {
  it('displays VM- ids, keeps #ta- anchors, adds #vm- aliases', () => {
    const { container } = render(<RoadmapPage />)
    /* display rebranded */
    expect(container.textContent).toContain('VM-001')
    expect(container.textContent).toContain('VM-101')
    expect(container.textContent).not.toContain('TA-001')
    /* the stable anchor survives the rename */
    expect(container.querySelector('#ta-001'), '#ta-001 resolvable').toBeTruthy()
    expect(container.querySelector('#ta-104'), '#ta-104 resolvable').toBeTruthy()
    /* the new family alias resolves too */
    expect(container.querySelector('#vm-001'), '#vm-001 alias').toBeTruthy()
    expect(container.querySelector('#vm-104'), '#vm-104 alias').toBeTruthy()
  })
})
