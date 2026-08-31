/* PROMPT-AI-V AI-4 gate: the SSE client is the ONLY door to /api/v1/ai/ask
   and it must survive arbitrary chunk boundaries, honor the wire contract,
   and turn every non-200 into an honest AiHttpError carrying the server's
   own sentence. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AiHttpError, answerKey, askAiOnce, askAiStream, cachedAnswer,
  parseSseBuffer, rememberAnswer,
} from './aiApi'
import type { AiEvent } from './aiApi'

afterEach(() => vi.unstubAllGlobals())

function sseResponse(chunks: string[], status = 200, errBody?: unknown): Response {
  if (status !== 200) {
    return new Response(JSON.stringify(errBody ?? { detail: 'honest sentence' }), {
      status, headers: { 'Content-Type': 'application/json' },
    })
  }
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

const PROV = 'data: {"type":"provenance","model":"moonshotai/kimi-k3","mode":"free","persona":"analyst","cached":false,"degraded":false,"prompt_version":"ai-v1.0","evidence_sources":["scan:heuristics"]}\n\n'
const DELTA = (t: string) => `data: {"type":"delta","text":"${t}"}\n\n`
const USAGE = 'data: {"type":"usage","prompt_tokens":10,"completion_tokens":5,"total_tokens":15}\n\n'

describe('parseSseBuffer — pure wire parser', () => {
  it('parses complete data lines and keeps a torn tail for the next chunk', () => {
    const r1 = parseSseBuffer('data: {"type":"delta","tex')
    expect(r1.events).toEqual([])
    expect(r1.rest).toBe('data: {"type":"delta","tex')
    expect(r1.done).toBe(false)
    const r2 = parseSseBuffer(`${r1.rest}t":"hi"}\n\n`)
    expect(r2.events).toEqual([{ type: 'delta', text: 'hi' }])
    expect(r2.rest).toBe('')
  })

  it('terminates on [DONE] and ignores non-data lines', () => {
    const r = parseSseBuffer(': keep-alive\n\ndata: [DONE]\n\n')
    expect(r.done).toBe(true)
    expect(r.events).toEqual([])
  })

  it('returns several events from one chunk in order', () => {
    const r = parseSseBuffer(PROV + DELTA('a') + DELTA('b') + USAGE)
    expect(r.events.map((e) => e.type)).toEqual(['provenance', 'delta', 'delta', 'usage'])
  })
})

describe('askAiStream — the one door to /api/v1/ai/ask', () => {
  it('posts the request body verbatim and streams every event to [DONE]', async () => {
    let seenBody: Record<string, unknown> = {}
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
      seenBody = JSON.parse(String(init.body))
      return sseResponse([PROV, DELTA('hel') + DELTA('lo'), USAGE, 'data: [DONE]\n\n'])
    }))
    const events: AiEvent[] = []
    await askAiStream({ question: 'q', mode: 'free', surface: 'terminal' }, (e) => events.push(e))
    expect(seenBody).toMatchObject({ question: 'q', mode: 'free', surface: 'terminal' })
    expect(events.map((e) => e.type)).toEqual(['provenance', 'delta', 'delta', 'usage'])
    expect(events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text).join('')).toBe('hello')
  })

  it('turns a 503 into AiHttpError carrying the server sentence — never a red wall', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([], 503,
      { detail: 'VILMEI AI offline — NVIDIA_API_KEY not set (founder config)' })))
    await expect(askAiStream({ question: 'q', mode: 'free', surface: 'terminal' }, () => {}))
      .rejects.toMatchObject({ status: 503, message: 'VILMEI AI offline — NVIDIA_API_KEY not set (founder config)' })
  })

  it('turns a budget 429 into AiHttpError with the busy copy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([], 429,
      { detail: 'AI budget busy — try again in a minute' })))
    try {
      await askAiStream({ question: 'q', mode: 'deep', surface: 'landing' }, () => {})
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(AiHttpError)
      expect((e as AiHttpError).status).toBe(429)
    }
  })
})

describe('askAiOnce — collector used by the dashboard micro-feed', () => {
  it('collects text + provenance + usage into one answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sseResponse([PROV, DELTA('two sentences.'), USAGE, 'data: [DONE]\n\n'])))
    const a = await askAiOnce({ question: 'why', mode: 'free', surface: 'terminal', persona: 'analyst', chain: 'sol', token: 'x' })
    expect(a.text).toBe('two sentences.')
    expect(a.provenance?.model).toBe('moonshotai/kimi-k3')
    expect(a.usage?.total_tokens).toBe(15)
    expect(a.interrupted).toBe(false)
  })
})

describe('session answer cache — dashboard re-renders what the AI page answered', () => {
  it('round-trips by chain:token:question key', () => {
    const key = answerKey('sol', 'tok', 'why?')
    expect(cachedAnswer(key)).toBeNull()
    rememberAnswer(key, { text: 't', provenance: null, usage: null, interrupted: false })
    expect(cachedAnswer(key)?.text).toBe('t')
  })
})
