/* PROMPT-AI-V AI-4 gate: the terminal AI page is live and honest. Laws under
   test:
   1. ATOMIC CONTEXT (P1): the active-pair identity is captured per ask — a
      mid-stream applySwapToken drops the stale answer instead of blending
      one token's words under another;
   2. GROUNDING LOG TRUTH: a row appears only from a REAL response's
      provenance/usage (model id + tokens), and no fake model name
      (claude/glm) survives anywhere on the page;
   3. never-red-solo: a 503 no-key shows the honest degraded panel and keeps
      the rest of the terminal alive. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiPage } from './Pages2'
import { applySwapToken } from '../lib/tokenStore'
import type { ActivePair } from '../lib/tokenStore'

const BONK: ActivePair = {
  chain: 'sol', tokenAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  symbol: 'BONK', name: 'Bonk', source: 'user',
}
const CAKE: ActivePair = {
  chain: 'bnb', tokenAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
  symbol: 'CAKE', name: 'PancakeSwap', source: 'user',
}

const PROV = 'data: {"type":"provenance","model":"moonshotai/kimi-k3","mode":"free","persona":"analyst","cached":false,"degraded":false,"prompt_version":"ai-v1.0","evidence_sources":["scan:heuristics","fees:planned"]}\n\n'
const delta = (t: string) => `data: {"type":"delta","text":"${t}"}\n\n`
const USAGE = 'data: {"type":"usage","prompt_tokens":10,"completion_tokens":5,"total_tokens":15}\n\n'

function deferredStream() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({ start(c) { ctrl = c } })
  return {
    stream,
    push: (s: string) => ctrl.enqueue(enc.encode(s)),
    close: () => ctrl.close(),
  }
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
beforeEach(() => { applySwapToken(BONK) })

function logRow(text: string): boolean {
  return Array.from(document.querySelectorAll('.mono-line'))
    .some((el) => (el.textContent ?? '').includes(text))
}

describe('AiPage — live streaming', () => {
  it('streams token-by-token and logs the REAL model + tokens in the grounding log', async () => {
    const d = deferredStream()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(d.stream, { status: 200 })))
    render(<AiPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Explain Score' }))
    d.push(PROV)
    d.push(delta('hello '))
    await waitFor(() => expect(document.body.textContent).toContain('hello '))
    d.push(delta('world'))
    d.push(USAGE)
    d.push('data: [DONE]\n\n')
    d.close()
    await waitFor(() => expect(document.body.textContent).toContain('hello world'))
    /* grounding row derives ONLY from provenance + usage events */
    await waitFor(() => expect(logRow('VILMEI · FAST TIER · free · analyst')).toBe(true))
    expect(logRow('15 tok')).toBe(true)
    expect(document.body.textContent).toContain('ai-v1.0')
    /* the canned fake providers are gone for good */
    expect(document.body.textContent).not.toMatch(/claude/i)
    expect(document.body.textContent).not.toMatch(/\bglm\b/i)
    /* evidence sources from the real provenance ride along */
    expect(document.body.textContent).toContain('scan:heuristics · fees:planned')
  })

  it('ATOMIC CONTEXT: swapping the token mid-stream drops the stale answer (P1)', async () => {
    const d = deferredStream()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(d.stream, { status: 200 })))
    render(<AiPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Explain Score' }))
    d.push(PROV)
    d.push(delta('first part'))
    await waitFor(() => expect(document.body.textContent).toContain('first part'))
    applySwapToken(CAKE)                     // generation bumps mid-answer
    d.push(delta(' STALE-PART'))
    d.push('data: [DONE]\n\n')
    d.close()
    await waitFor(() => expect(document.body.textContent)
      .toContain('Token changed mid-answer — the stale answer was dropped. Ask again.'))
    expect(document.body.textContent).not.toContain('STALE-PART')
    /* the context card already shows the new identity — atomically */
    await waitFor(() => expect(document.body.textContent).toContain('CAKE'))
  })

  it('no key → honest 503 panel, never a red wall', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ detail: 'VILMEI AI offline — NVIDIA_API_KEY not set (founder config)' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } })))
    render(<AiPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Explain Score' }))
    await waitFor(() => expect(document.body.textContent)
      .toContain('VILMEI AI offline — NVIDIA_API_KEY not set (founder config)'))
    expect(document.body.textContent)
      .toContain('The rest of the terminal stays live — scans, rug check, whale feed and prices do not need the AI key.')
  })

  it('budget 429 shows the busy sentence from the server, verbatim', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ detail: 'AI budget busy — try again in a minute' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } })))
    render(<AiPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Explain Score' }))
    await waitFor(() => expect(document.body.textContent).toContain('AI budget busy — try again in a minute'))
  })
})

/* ── V5-G2: fast lane ─────────────────────────────────────────────────── */

describe('AiPage — V5-G2 fast lane', () => {
  it('shows the REAL first-byte (TTFB) chip once the first event lands', async () => {
    const d = deferredStream()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(d.stream, { status: 200 })))
    render(<AiPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Explain Score' }))
    d.push(PROV)
    d.push(delta('fast '))
    await waitFor(() => expect(document.body.textContent).toContain('fast '))
    d.push(USAGE)
    d.push('data: [DONE]\n\n')
    d.close()
    await waitFor(() => expect(document.body.textContent).toMatch(/first byte \d+ms/))
  })

  it('unmount aborts the open stream — no orphan reader survives the page', async () => {
    let aborted = false
    const d = deferredStream()
    vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: { signal?: AbortSignal }) => {
      init?.signal?.addEventListener('abort', () => { aborted = true })
      return new Response(d.stream, { status: 200 })
    }) as unknown as typeof fetch)
    const { unmount } = render(<AiPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Explain Score' }))
    d.push(PROV)
    await waitFor(() => expect(document.body.textContent).toContain('VILMEI · FAST TIER'))
    expect(aborted).toBe(false)
    unmount()
    expect(aborted).toBe(true)
  })

  it('an in-stream error renders the honest UPSTREAM panel — never silent loading', async () => {
    const d = deferredStream()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(d.stream, { status: 200 })))
    render(<AiPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Explain Score' }))
    d.push(PROV)
    d.push('data: {"type":"error","kind":"cooldown","detail":"VILMEI AI is paused for a moment — the free tier is stalling right now, so the terminal skips the wait instead of loading. Try again in a minute; everything else stays live. (pause 57s)"}\n\n')
    d.push('data: [DONE]\n\n')
    d.close()
    await waitFor(() => expect(document.body.textContent).toContain('UPSTREAM'))
    await waitFor(() => expect(document.body.textContent).toContain('paused for a moment'))
    await waitFor(() => expect(document.body.textContent).toContain('first byte'))
  })
})
