/* PROMPT-AI-V AI-4 gate: landing §06 label state machine. THE LABEL LAW —
   the chip always says what is actually true: a live answer shows the REAL
   model id from its own provenance; any failure falls back to the scripted
   trace labeled SIMULATED (live AI offline). No third state is allowed.
   Renders the FULL landing page (the section is module-private) with a
   URL-routing fetch stub: AI asks get the scripted response, every other
   landing fetch stays on the never-settling setup stub. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Landing from './landing'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const prov = (model: string) =>
  `data: {"type":"provenance","model":"${model}","mode":"free","persona":"guide","cached":false,"degraded":false,"prompt_version":"ai-v1.0","evidence_sources":[]}\n\n`

function stubAi(aiResponse: () => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = String(input)
    if (url.includes('/api/v1/ai/ask') || url.includes('/api/v1/landing/chat')) return aiResponse()
    return new Promise<Response>(() => {})   // keep every other panel honest-loading
  }))
}

function streamResponse(chunks: string[]): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(c) { for (const s of chunks) c.enqueue(enc.encode(s)); c.close() },
  })
  return new Response(stream, { status: 200 })
}

describe('landing §06 — label state machine (label always == truth)', () => {
  it('idle: four preset questions wired; no NOT-WIRED copy remains', () => {
    stubAi(() => new Promise<Response>(() => {}))
    render(<Landing />)
    for (const q of ['What is VILMEI?', 'Is this token a rug?', 'Is your AI safe?', 'What\'s the roadmap?']) {
      expect(screen.getByText(q)).toBeTruthy()
    }
    expect(document.body.textContent).toContain('four questions · free tier')
    expect(document.body.textContent).not.toContain('NOT WIRED YET')
    expect(document.body.textContent).not.toContain('ILLUSTRATIVE TRACE')
  })

  it('live answer: chip carries the REAL model id from provenance, answer streams in', async () => {
    stubAi(() => streamResponse([
      prov('moonshotai/kimi-k3'),
      'data: {"type":"delta","text":"VILMEI is a read-only terminal."}\n\n',
      'data: {"type":"usage","prompt_tokens":1,"completion_tokens":2,"total_tokens":3}\n\n',
      'data: [DONE]\n\n',
    ]))
    render(<Landing />)
    fireEvent.click(screen.getByText('What is VILMEI?'))
    await waitFor(() => expect(document.body.textContent)
      .toContain('live · vilmei ai · analyst free tier'))
    await waitFor(() => expect(document.body.textContent)
      .toContain('VILMEI is a read-only terminal.'))
    /* truth-run: a live state never renders the simulated chip */
    expect(document.body.textContent).not.toContain('simulated (live AI offline)')
  })

  it('no key → SIMULATED fallback labeled honestly, scripted trace only', async () => {
    stubAi(() => new Response(
      JSON.stringify({ detail: 'VILMEI AI offline — NVIDIA_API_KEY not set (founder config)' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }))
    render(<Landing />)
    fireEvent.click(screen.getByText('What is VILMEI?'))
    await waitFor(() => expect(document.body.textContent).toContain('simulated (live AI offline)'))
    expect(document.body.textContent).toContain('DETERMINISTIC SCRIPTED TRACE')
    expect(document.body.textContent).toContain('AI ANALYST — LIVE WHEN THE FOUNDER KEY IS CONFIGURED')
    expect(document.body.textContent).toContain('MEDIUM RISK · 68/100')
  })

  it('budget 429 → SIMULATED fallback carries the honest busy reason', async () => {
    stubAi(() => new Response(
      JSON.stringify({ detail: 'AI budget busy — try again in a minute' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }))
    render(<Landing />)
    fireEvent.click(screen.getByText('What is VILMEI?'))
    await waitFor(() => expect(document.body.textContent).toContain('simulated (live AI offline)'))
    expect(document.body.textContent).toContain('AI BUDGET BUSY — TRY AGAIN IN A MINUTE')
  })
})

/* ── V6-2: real chat — free-text composer + multi-turn history ── */
describe('landing §06 — chat composer (V6-2)', () => {
  it('free-text ask sends the typed question and streams the answer bubble', async () => {
    stubAi(() => streamResponse([
      prov('x-test/analyst'),
      'data: {"type":"delta","text":"Words."}\n\n',
      'data: {"type":"usage","prompt_tokens":1,"completion_tokens":1,"total_tokens":2}\n\n',
      'data: [DONE]\n\n',
    ]))
    render(<Landing />)
    fireEvent.change(screen.getByLabelText('ask the analyst'), { target: { value: 'What is the honesty law?' } })
    fireEvent.click(screen.getByLabelText('send'))
    await waitFor(() => expect(document.body.textContent).toContain('Words.'))
    expect(document.body.textContent).toContain('What is the honesty law?')
    expect(document.body.textContent).toContain('ANALYST')   /* the reply is attributed to the Analyst, never a vendor */
  })

  it('multi-turn: a second ask keeps the first exchange in the thread', async () => {
    let n = 0
    stubAi(() => {
      n += 1
      return streamResponse(n === 1
        ? [prov('x-test/analyst'), 'data: {"type":"delta","text":"one"}\n\n', 'data: [DONE]\n\n']
        : [prov('x-test/analyst'), 'data: {"type":"delta","text":"two"}\n\n', 'data: [DONE]\n\n'])
    })
    render(<Landing />)
    fireEvent.change(screen.getByLabelText('ask the analyst'), { target: { value: 'first question' } })
    fireEvent.click(screen.getByLabelText('send'))
    await waitFor(() => expect(document.body.textContent).toContain('one'))
    fireEvent.change(screen.getByLabelText('ask the analyst'), { target: { value: 'second question' } })
    fireEvent.click(screen.getByLabelText('send'))
    await waitFor(() => expect(document.body.textContent).toContain('two'))
    expect(document.body.textContent).toContain('first question')
    expect(document.body.textContent).toContain('second question')
  })
})
