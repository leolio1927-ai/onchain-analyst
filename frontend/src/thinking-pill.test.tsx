/* PROMPT-W B2 — the THINKING pill lifecycle: while the first upstream token
   is pending the pill is visible; the first delta removes it. The mocked
   route stalls 400 ms before answering, so the pill state is deterministic. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Landing from './landing'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const PROV = 'data: {"type":"provenance","model":"any-upstream","mode":"free","persona":"guide","cached":false,"degraded":false,"prompt_version":"lc-v2.0","evidence_sources":[]}\n\n'

function delayedStreamResponse(delayMs: number): Promise<Response> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const enc = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode(PROV))
          c.enqueue(enc.encode('data: {"type":"delta","text":"VILMEI answers."}\n\n'))
          c.enqueue(enc.encode('data: [DONE]\n\n'))
          c.close()
        },
      })
      resolve(new Response(stream, { status: 200 }))
    }, delayMs)
  })
}

describe('PROMPT-W B2 — THINKING pill lifecycle (landing §06)', () => {
  it('visible while waiting (t≈150ms of a 400ms stall) → gone after the first delta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => delayedStreamResponse(400)))
    render(<Landing />)
    fireEvent.click(screen.getByText('What is VILMEI?'))

    /* the pill rides the wait window (400ms stall → still pending at ~150ms) */
    await new Promise((r) => setTimeout(r, 150))
    expect(screen.getByTestId('thinking-pill')).toBeTruthy()
    expect(screen.getByTestId('thinking-pill').textContent).toContain('THINKING')
    expect(document.body.textContent).not.toContain('VILMEI answers.')

    /* the first delta removes it */
    await waitFor(() => expect(document.body.textContent).toContain('VILMEI answers.'))
    expect(screen.queryByTestId('thinking-pill')).toBeNull()
  })

  it('the pill never carries vendor/model vocabulary', async () => {
    /* deterministic: a 400ms stall leaves a wide window to inspect the pill */
    vi.stubGlobal('fetch', vi.fn(async () => delayedStreamResponse(400)))
    render(<Landing />)
    fireEvent.click(screen.getByText('What is VILMEI?'))
    const pill = await waitFor(() => {
      const el = screen.queryByTestId('thinking-pill')
      expect(el).toBeTruthy()
      return el as HTMLElement
    }, { timeout: 5000, interval: 20 })
    const low = pill.textContent!.toLowerCase()
    for (const s of ['glm', 'gpt', 'nvidia', 'model']) expect(low.includes(s)).toBe(false)
    await waitFor(() => expect(screen.queryByTestId('thinking-pill')).toBeNull(),
      { timeout: 5000 })
  })
})
