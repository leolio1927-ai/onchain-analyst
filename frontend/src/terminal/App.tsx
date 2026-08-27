import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api, CHAINS, CHAIN_LABEL } from '../api'
import type { Chain, ScanResult } from '../api'
import {
  CommandBar, LogStream, PriceChart, StatCards, TokenTable, sevCls, signalLine,
} from './components'
import type { LogLine } from './components'
import '../styles/base.css'
import '../styles/terminal.css'

const STORE_KEY = 'alpha.watchlist.v1'

function loadWatchlist(): ScanResult[] {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? (JSON.parse(raw) as ScanResult[]) : []
  } catch {
    return []
  }
}

export default function Terminal() {
  const [entries, setEntries] = useState<ScanResult[]>(loadWatchlist)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [lines, setLines] = useState<LogLine[]>([
    { cls: 'l-head', text: 'Terminal Alpha — web terminal (read-only, no custody)' },
    { cls: 'l-dim', text: 'Evidence-first: analysis comes only from provider data. Try /load sol DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
    { cls: 'l-dim', text: 'Research & education tool — NOT financial advice. Scores are automated heuristics, not an audit. DYOR.' },
  ])
  const [busy, setBusy] = useState(false)
  const [apiOk, setApiOk] = useState<boolean | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const active = entries.find((e) => (e.pair.pairAddress ?? e.pair.baseToken.address) === activeKey) ?? null

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(entries.slice(-20)))
  }, [entries])

  useEffect(() => {
    api.health().then((h) => setApiOk(h.status === 'ok')).catch(() => setApiOk(false))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const say = useCallback((cls: string, text: string) => {
    setLines((ls) => [...ls, { cls, text }])
  }, [])

  const upsert = useCallback((scan: ScanResult) => {
    const key = scan.pair.pairAddress ?? scan.pair.baseToken.address
    setEntries((es) => [...es.filter((e) => (e.pair.pairAddress ?? e.pair.baseToken.address) !== key), scan])
    setActiveKey(key)
    return key
  }, [])

  const chainOf = (scan: ScanResult): Chain => {
    const cid = scan.pair.chainId ?? ''
    const hit = CHAINS.find((c) => CHAIN_LABEL[c].toLowerCase() === cid.toLowerCase())
    return hit ?? 'sol'
  }

  const runCommand = useCallback(async (text: string) => {
    const [cmd, ...args] = text.split(/\s+/)
    say('l-cmd', `α ${text}`)

    try {
      if (cmd === '/help') {
        say('l-info', '/load <chain> <address> — scan a token (chains: sol | bnb | base | avax)')
        say('l-info', '/verify — full signal breakdown for the active token')
        say('l-info', '/cluster — force-refresh wallet coordination (fresh GeckoTerminal fetch)')
        say('l-info', '/explain [claude|glm|kimi] — evidence-first AI analysis (rate limited)')
        say('l-info', '/whale <address> — public wallet balances via Helius (needs provider key)')
        return
      }

      if (cmd === '/load') {
        const chain = args[0]?.toLowerCase() as Chain
        const address = args[1]
        if (!args || args.length !== 2 || !CHAINS.includes(chain)) {
          say('l-err', `Usage: /load <${CHAINS.join('|')}> <address>`)
          return
        }
        setBusy(true); say('l-dim', `Loading ${CHAIN_LABEL[chain]}:${address.slice(0, 12)}…`)
        const scan = await api.scan(chain, address)
        upsert(scan)
        const a = scan.assessment
        say('l-ok', `${scan.pair.baseToken.symbol} loaded · risk ${a.level_label}${a.score !== null ? ` ${Math.round(a.score)}/100` : ''}`)
        say('l-dim', `[source: ${scan.sources.join(' + ')} @ ${new Date().toISOString().slice(11, 19)} UTC] — run /verify for signal details`)
        return
      }

      if (cmd === '/verify') {
        if (!active) { say('l-warn', 'No token yet — /load <chain> <address> first.'); return }
        const a = active.assessment
        const sym = active.pair.baseToken.symbol
        say('l-head', a.score === null
          ? `VERIFY — ${sym} · INSUFFICIENT DATA`
          : `VERIFY — ${sym} · score ${Math.round(a.score)}/100 → ${a.level_label}`)
        for (const s of a.signals) {
          say(sevCls(s.severity), s.severity === null
            ? `· ${s.label}: data not available (${s.evidence})`
            : `■ ${signalLine(s)}`)
        }
        for (const n of a.notes) say('l-dim', `§ ${n}`)
        say('l-dim', `[source: dexscreener ${active.pair.dexId ?? ''} · deterministic heuristics v0 — not financial advice]`)
        return
      }

      if (cmd === '/cluster') {
        if (!active) { say('l-warn', 'No token yet — /load <chain> <address> first.'); return }
        setBusy(true); say('l-dim', 'refreshing wallet coordination (GeckoTerminal)…')
        const scan = await api.scan(chainOf(active), active.pair.baseToken.address, true)
        upsert(scan)
        const cl = scan.clustering
        if (cl.severity !== null) say('l-dim', `clustering: ${cl.evidence}`)
        else say('l-warn', `clustering: ${cl.evidence}`)
        return
      }

      if (cmd === '/explain') {
        if (!active) { say('l-warn', 'No token yet — /load <chain> <address> first.'); return }
        const prov = args[0]?.toLowerCase() ?? 'claude'
        setBusy(true)
        say('l-dim', `${prov} analyzing… context = heuristic results + provider data (no external additions)`)
        const out = await api.explain(chainOf(active), active.pair.baseToken.address, prov)
        const sym = active.pair.baseToken.symbol
        say('l-head', `AI ANALYST · ${out.provider} · ${sym} · tier ${out.tier}`)
        if (out.parse_ok) {
          say('l-ai', out.summary)
          for (const s of out.key_signals) say('l-dim', `· ${s.label}: ${s.evidence}`)
          if (out.limitations) say('l-dim', `§ limitations: ${out.limitations}`)
        } else {
          say('l-ai', out.summary)
          say('l-dim', '[output was not valid JSON — shown raw]')
        }
        say('l-dim', '[grounding: evidence + output logged server-side → logs/grounding/*.jsonl]')
        return
      }

      if (cmd === '/whale') {
        if (args.length !== 1) { say('l-err', 'Usage: /whale <address>'); return }
        setBusy(true); say('l-dim', `checking balance ${args[0].slice(0, 12)}… (helius)`)
        const b = await api.whale(args[0])
        say('l-head', `WHALE · ${args[0].slice(0, 8)}…`)
        say('l-info', `SOL: ${b.sol.toLocaleString('en-US', { minimumFractionDigits: 4 })}`)
        for (const t of (b.tokens ?? []).slice(0, 5)) {
          say('l-dim', `${(t.mint ?? '?').slice(0, 12)}… · ${t.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`)
        }
        say('l-dim', '[source: helius · response not runtime-verified · read-only public address]')
        return
      }

      say('l-dim', `Unknown command: ${text} — /help for the list`)
    } catch (e) {
      const err = e as ApiError
      if (err instanceof ApiError && (err.status === 429 || err.status === 503)) say('l-warn', err.message)
      else say('l-err', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setBusy(false)
    }
  }, [active, say, upsert])

  return (
    <div className="t-app">
      <header className="t-nav">
        <a href="/" className="logo"><span className="mark">◤</span> TERMINAL<span className="tld">ALPHA</span></a>
        <div className="t-nav-right">
          <span className={`t-chip ${apiOk === false ? 'off' : 'on'}`}>
            {apiOk === null ? 'API …' : apiOk ? 'API ONLINE' : 'API OFFLINE'}
          </span>
          <span className="t-chip">READ-ONLY · NO CUSTODY</span>
        </div>
      </header>

      {active
        ? <StatCards pair={active.pair} assessment={active.assessment} />
        : <section className="t-topbar t-topbar-empty">No token loaded — /load sol &lt;address&gt;</section>}

      <main className="t-body">
        <div className="t-left">
          <div className="t-pair-title">
            {active
              ? <>◈ <b>{active.pair.baseToken.symbol}</b> · {active.pair.baseToken.name} · {active.pair.dexId}</>
              : 'No pair — /load <chain> <address>'}
          </div>
          <TokenTable entries={entries} activeKey={activeKey} onPick={setActiveKey} />
        </div>
        <div className="t-right">
          <PriceChart pair={active?.pair ?? null} />
          <LogStream lines={lines} />
        </div>
      </main>

      <footer className="t-footer">
        <CommandBar onSubmit={runCommand} busy={busy} inputRef={inputRef} />
        <p className="t-foot-note">
          Research & education tool — NOT financial advice. Scores are automated heuristics, not an
          audit. DYOR. Read-only: no transactions, no custody.
        </p>
      </footer>
    </div>
  )
}
