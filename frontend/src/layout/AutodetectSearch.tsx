/* Global topbar search (PROMPT-V Fase 3.1/3.3) — paste a CA or $TICKER,
   auto-detect across the five live chains. NEVER silently defaults:
   one hit → select + navigate; several → candidate chips; zero → honest
   not-found + scanner link. Recents come from the vilmei.* store. */
import { useEffect, useRef, useState } from 'react'
import { classifyQuery } from '../lib/detect'
import type { DetectCandidate } from '../lib/detect'
import { fetchDetect } from '../lib/detect'
import { applySwapToken, candidateToPair, useRecents } from '../lib/tokenStore'

type Phase =
  | { id: 'idle' }
  | { id: 'busy' }
  | { id: 'pick'; candidates: DetectCandidate[] }
  | { id: 'empty' }
  | { id: 'error'; message: string }

const fmtLiq = (n: number | null) =>
  n == null ? '—' : `$${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`

export function AutodetectSearch() {
  const [q, setQ] = useState('')
  const [phase, setPhase] = useState<Phase>({ id: 'idle' })
  const [open, setOpen] = useState(false)
  const recents = useRecents()
  const boxRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const choose = (c: DetectCandidate) => {
    const pair = candidateToPair(c, 'detect')
    if (pair) {
      applySwapToken(pair)   // atomic commit + generation bump (P1)
      window.location.hash = '#/swap'
      setPhase({ id: 'idle' })
      setQ('')
      setOpen(false)
    }
  }

  const run = () => {
    const query = q.trim()
    setOpen(true)
    if (!query) { setPhase({ id: 'idle' }); return }
    const kind = classifyQuery(query)
    if (kind === 'invalid') {
      setPhase({ id: 'error', message: 'paste a token address (CA) or $TICKER — 1-24 chars' })
      return
    }
    setPhase({ id: 'busy' })
    fetchDetect(query)
      .then((res) => {
        if (res.candidates.length === 1) {
          choose(res.candidates[0])
        } else if (res.candidates.length > 1) {
          setPhase({ id: 'pick', candidates: res.candidates })
        } else {
          setPhase({ id: 'empty' })
        }
      })
      .catch((e: unknown) => setPhase({ id: 'error', message: e instanceof Error ? e.message : 'detect failed' }))
  }

  return (
    <form className="ta-search tk-token-search" ref={boxRef} onSubmit={(e) => { e.preventDefault(); run() }}>
      <div className="tk-token-field">
        <input
          className="ta-search-input tk-token-input"
          value={q}
          placeholder="PASTE CA OR $TICKER"
          aria-label="paste a token address or ticker"
          onChange={(e) => { setQ(e.target.value); setPhase({ id: 'idle' }) }}
          onFocus={() => setOpen(true)}
        />
      </div>
      <button className="tk-token-send" type="submit" disabled={phase.id === 'busy'}>
        {phase.id === 'busy' ? '...' : 'SEND'}
      </button>
      {open && (
        <div className="ta-search-drop" role="listbox" aria-label="detection results">
          {phase.id === 'busy' && <div className="ta-search-row dim">detecting on the five live feeds…</div>}
          {phase.id === 'error' && <div className="ta-search-row err">{phase.message}</div>}
          {phase.id === 'empty' && (
            <div className="ta-search-row dim">
              Not found on the five live feeds — <a href="#/scanner">scan the token manually ↗</a>
            </div>
          )}
          {phase.id === 'pick' && (
            <>
              <div className="ta-search-row dim">found on {phase.candidates.length} chains — pick one:</div>
              {phase.candidates.map((c) => (
                <button type="button" key={`${c.chain}-${c.token_address}`}
                  className="ta-search-cand" role="option" aria-selected={false}
                  onClick={() => choose(c)}>
                  <b>{c.symbol ?? '?'}</b>
                  <span className="ell" title={`${c.name ?? ''} · ${c.chain_id}`}>{c.chain?.toUpperCase()} · {c.dex_id ?? '—'}</span>
                  <span className="mono">{fmtLiq(c.liquidity_usd)}</span>
                </button>
              ))}
            </>
          )}
          {phase.id === 'idle' && recents.length > 0 && (
            <>
              <div className="ta-search-row dim">recent</div>
              {recents.map((r) => (
                <button type="button" key={`${r.chain}-${r.tokenAddress}`}
                  className="ta-search-cand" role="option" aria-selected={false}
                  onClick={() => { applySwapToken(r); window.location.hash = '#/swap'; setOpen(false) }}>
                  <b>{r.symbol}</b>
                  <span className="ell" title={r.name ?? r.symbol}>{r.chain.toUpperCase()}</span>
                  <span className="mono dim2">{r.source === 'detect' ? 'DETECTED' : 'PICKED'}</span>
                </button>
              ))}
            </>
          )}
          {phase.id === 'idle' && recents.length === 0 && (
            <div className="ta-search-row dim">no recents yet — paste an address or ticker</div>
          )}
        </div>
      )}
    </form>
  )
}
