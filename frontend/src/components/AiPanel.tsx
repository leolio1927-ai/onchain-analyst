import { useCallback, useEffect, useRef, useState } from 'react'
import type { TokenData } from '../mock/data'

export interface AiMsg { who: 'ai' | 'you'; body: ReactNodeSafe[] }
type ReactNodeSafe = string | { sect: string } | { ul: string[] } | { typing: true }

/* Evidence-first canned analyst. Free vs Deep changes DEPTH only — never the facts. */

function deepAnswer(t: TokenData): ReactNodeSafe[] {
  return [
    `Based on comprehensive analysis, here's my take on ${t.symbol}:`,
    { sect: '▤ OVERALL ASSESSMENT' },
    t.ai.assessment.paragraph,
    t.ai.assessment.concerns,
    { sect: '⌕ DETAILED INSIGHTS' },
    { ul: t.ai.insights },
    { sect: '◎ RECOMMENDATION' },
    { ul: t.ai.recommendation },
    { sect: '⚠ DISCLAIMER' },
    'This analysis is for informational purposes only and is not financial advice.',
  ]
}

function freeAnswer(t: TokenData): ReactNodeSafe[] {
  return [
    `Quick read on ${t.symbol} (free depth):`,
    { ul: [t.ai.assessment.paragraph, t.ai.insights[0], t.ai.insights[3]] },
    'Deeper cluster trace, whale intent and level mapping are available in Deep mode.',
    'This analysis is for informational purposes only and is not financial advice.',
  ]
}

function followup(q: string, t: TokenData): ReactNodeSafe[] {
  const lower = q.toLowerCase()
  if (lower.includes('score')) {
    return [
      `The ${t.risk.score}/100 comes from weighted deterministic signals — no AI guesswork in the number itself:`,
      { ul: [
        'Liquidity depth & lock — locked 98.6% for 364 days (reduces risk)',
        'Holder distribution — top 10 at 22.43%, slightly above comfort (adds risk)',
        'Wallet coordination — 3 early clusters, 64/100 clustering risk (adds risk)',
        'Trade balance & age — healthy buy flow, 2d 14h pair age',
      ] },
      'The AI explains the score; the heuristics compute it. Same input → same verdict.',
    ]
  }
  if (lower.includes('whale')) {
    return [
      'Whale read (24h):',
      { ul: [
        '7xKX…pump accumulated $125.3K — largest single buyer',
        'Buy/sell ratio among top wallets ≈ 4:1 — accumulation-leaning',
        'Sell pressure so far is small-cap retail sized (<$80K)',
      ] },
      'Watch for: unusual whale movements above $100K in single blocks.',
    ]
  }
  if (lower.includes('cluster')) {
    return [
      'Clustering trace:',
      { ul: [
        'Cluster 1 (15 wallets) controls 42.3% — formed in first 2h',
        'Cluster 2 (8 wallets) at 18.7% shows synchronized buy timing',
        'Amount uniformity CV 0.29 — borderline scripted pattern',
      ] },
      'Clustering risk 64/100. Fair-launch patterns can look identical — this is context, not a verdict.',
    ]
  }
  return [
    'Here is what the evidence says:',
    { ul: [t.ai.insights[Math.floor(Math.random() * t.ai.insights.length)], t.ai.assessment.concerns] },
    'For informational purposes only — not financial advice.',
  ]
}

export function AiPanel({ token, full }: { token: TokenData; full?: boolean }) {
  const [mode, setMode] = useState<'FREE' | 'DEEP'>('DEEP')
  const [msgs, setMsgs] = useState<AiMsg[]>([{ who: 'ai', body: deepAnswer(token) }])
  const [typing, setTyping] = useState(false)
  const [input, setInput] = useState('')
  const [upgradeNudge, setUpgradeNudge] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  // reset the conversation when the token changes (adjust-state-during-render,
  // per React docs — avoids a setState-in-effect cascade)
  const [prevToken, setPrevToken] = useState(token)
  if (prevToken !== token) {
    setPrevToken(token)
    setMsgs([{ who: 'ai', body: deepAnswer(token) }])
  }

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, typing])

  const send = useCallback((q: string) => {
    if (!q.trim()) return
    setMsgs((m) => [...m, { who: 'you', body: [q] }])
    setInput('')
    setTyping(true)
    setTimeout(() => {
      setTyping(false)
      const body = mode === 'DEEP' ? followup(q, token) : freeAnswer(token)
      setMsgs((m) => [...m, { who: 'ai', body }])
    }, 900)
  }, [mode, token])

  const toggleMode = (m: 'FREE' | 'DEEP') => {
    if (m === 'DEEP') { setMode('DEEP'); return }
    setMode('FREE')
    setMsgs((ms) => [...ms, { who: 'ai', body: ['Switched to FREE depth — shorter answers, identical data correctness.'] }])
  }

  const render = (body: ReactNodeSafe[], key: number) => (
    <div key={key} style={{ display: 'grid', gap: 4 }}>
      {body.map((part, i) => {
        if (typeof part === 'string') return <p key={i}>{part}</p>
        if ('sect' in part) return <div key={i} className="sect">{part.sect}</div>
        if ('ul' in part) return <ul key={i}>{part.ul.map((x, j) => <li key={j}>{x}</li>)}</ul>
        return null
      })}
    </div>
  )

  return (
    <>
      <div className="ai-head">
        <span className="ico">✦</span>
        <div>
          <div style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 15 }}>VILMEI AI ANALYST</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--cyan)', letterSpacing: '0.14em' }}>
            {mode} MODE · EVIDENCE-FIRST
          </div>
        </div>
        <div className="ai-mode">
          <button className={mode === 'FREE' ? 'on' : ''} onClick={() => toggleMode('FREE')}>FREE</button>
          <button className={mode === 'DEEP' ? 'on' : ''} onClick={() => toggleMode('DEEP')}>DEEP</button>
        </div>
      </div>

      <div className="ai-scroll" ref={scroller} style={full ? { maxHeight: 'calc(100vh - 320px)' } : undefined}>
        {msgs.map((m, i) => (
          <div className="ai-msg" key={i}>
            <div className="who" style={{ color: m.who === 'you' ? 'var(--green)' : 'var(--cyan)' }}>
              {m.who === 'you' ? 'YOU' : 'VILMEI AI ANALYST'}
            </div>
            {render(m.body, i)}
          </div>
        ))}
        {typing && <div className="typing"><i /><i /><i /></div>}
        {upgradeNudge && (
          <div className="ai-disclaimer" style={{ color: 'var(--violet)' }}>
            ⚡ Deeper runs are a plan limit, not a data limit — upgrade in Token Gate (data correctness never changes).
          </div>
        )}
      </div>

      <div className="ai-input">
        <input
          value={input}
          placeholder="Ask a follow-up question…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send(input)}
        />
        <button className="ai-send" onClick={() => send(input)}>➤</button>
      </div>
      <div className="ai-actions">
        <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => {
          if (mode === 'FREE') { setUpgradeNudge(true); setTimeout(() => setUpgradeNudge(false), 4000); return }
          send('Run a deeper analysis — cluster trace, whale intent, level mapping')
        }}>DEEPER ANALYSIS</button>
        <button className="btn-ghost" style={{ marginTop: 0 }} onClick={() => send('Explain the risk score signal by signal')}>EXPLAIN SCORE</button>
      </div>
    </>
  )
}
