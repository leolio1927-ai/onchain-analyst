/* VILMEI AI client (PROMPT-AI-V AI-4) — the ONLY door from the browser to
   POST /api/v1/ai/ask. The server owns persona + evidence assembly; this
   client sends only the question + token identity and parses the SSE wire
   contract: provenance → delta* → usage → [DONE].
   LABEL LAW: every model/mode/cached chip a surface renders derives from the
   provenance/usage events of a real response — never from a hardcoded name. */

export type AiMode = 'free' | 'deep'
export type AiSurface = 'terminal' | 'landing'
export type AiPersona = 'analyst' | 'guide'

export interface AiProvenance {
  model: string
  mode: AiMode
  persona: AiPersona
  cached: boolean
  degraded: boolean
  prompt_version: string
  evidence_sources: string[]
}

export interface AiUsage {
  prompt_tokens: number | null
  completion_tokens: number | null
  total_tokens: number | null
  cached?: boolean
}

export type AiEvent =
  | ({ type: 'provenance' } & AiProvenance)
  | { type: 'delta'; text: string }
  | ({ type: 'usage' } & AiUsage)
  | { type: 'error'; kind: string; detail: string }

export interface AiAskRequest {
  question: string
  mode: AiMode
  surface: AiSurface
  persona?: AiPersona
  chain?: string
  token?: string
  history?: { role: 'user' | 'assistant'; content: string }[]
}

export class AiHttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'AiHttpError'
    this.status = status
  }
}

/* Pure SSE line parser — survives arbitrary chunk boundaries. Feed it the
   running buffer; it returns complete events plus the unparsed tail. */
export function parseSseBuffer(buffer: string): { events: AiEvent[]; rest: string; done: boolean } {
  const events: AiEvent[] = []
  let done = false
  const endsWithNewline = buffer.endsWith('\n')
  const parts = buffer.split('\n')
  const rest = endsWithNewline ? '' : (parts.pop() ?? '')
  for (const line of parts) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const payload = trimmed.slice(5).trim()
    if (payload === '[DONE]') { done = true; break }
    try {
      const obj = JSON.parse(payload) as AiEvent
      if (obj && typeof obj === 'object' && typeof (obj as { type?: unknown }).type === 'string') {
        events.push(obj)
      }
    } catch { /* a torn JSON line cannot happen once line-splitting is intact; skip */ }
  }
  return { events, rest, done }
}

export async function askAiStream(
  req: AiAskRequest,
  onEvent: (e: AiEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/v1/ai/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  })
  if (!res.ok || !res.body) {
    let detail = `HTTP ${res.status}`
    try {
      const j = (await res.json()) as { detail?: unknown }
      if (typeof j.detail === 'string') detail = j.detail
    } catch { /* non-JSON error body — keep the HTTP code line */ }
    throw new AiHttpError(res.status, detail)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const parsed = parseSseBuffer(buf)
      buf = parsed.rest
      for (const e of parsed.events) onEvent(e)
      if (parsed.done) break
    }
  } finally {
    reader.releaseLock()
  }
}

export interface AiAnswer {
  text: string
  provenance: AiProvenance | null
  usage: AiUsage | null
  interrupted: boolean
}

export async function askAiOnce(req: AiAskRequest, signal?: AbortSignal): Promise<AiAnswer> {
  const answer: AiAnswer = { text: '', provenance: null, usage: null, interrupted: false }
  await askAiStream(req, (e) => {
    if (e.type === 'provenance') answer.provenance = e
    else if (e.type === 'delta') answer.text += e.text
    else if (e.type === 'usage') answer.usage = e
    else if (e.type === 'error') answer.interrupted = true
  }, signal)
  return answer
}

/* Session answer cache shared between surfaces: the AI page remembers what
   the server answered for a token, the dashboard micro-feed re-renders it
   with ZERO extra requests (server-side cache absorbs the rest). */
const _sessionAnswers = new Map<string, AiAnswer>()

export function answerKey(chain: string, token: string, question: string): string {
  return `${chain}:${token}:${question}`
}

export function rememberAnswer(key: string, answer: AiAnswer): void {
  _sessionAnswers.set(key, answer)
  if (_sessionAnswers.size > 32) {
    const first = _sessionAnswers.keys().next().value
    if (first !== undefined) _sessionAnswers.delete(first)
  }
}

export function cachedAnswer(key: string): AiAnswer | null {
  return _sessionAnswers.get(key) ?? null
}
