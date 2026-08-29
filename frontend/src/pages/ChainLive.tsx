/* MEMECOIN LIVE chain view (M.4) — three independent columns per chain:
   NEW | TRENDING | VOLUME·ALPHA. The alpha column is re-ranked server-side
   (liquidity-adjusted volume & activity, zero extra upstream calls) and
   shows α-rank numbers. Dense Axiom-grade rows: logo / identity / price /
   24h change on line one; MC·FDV, VOL, LIQ, TX, AGE, chain + launchpad
   badges and copy-address on line two. Columns fetch staggered ≥1s apart
   and fail independently with a 60s retry cool-down. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { LIVE_CHAINS, LIVE_CHAIN_LABEL, LiveFeedError, fetchLiveFeed } from '../lib/liveApi'
import type { LiveChain, LiveFeed, LiveItem, LiveMode } from '../lib/liveApi'
import { fmtAge, fmtCount, fmtPrice, fmtUsdCompact, fmtUtcClock } from '../lib/liveFormat'
import { ChgBadge, CopyAddr, EmptyBox, ErrBox, Skel, StatusChips, TokenLogo, TradeComingModal, accentStyle } from './liveParts'
import { ChainLogo } from './chainLogos'

const LIMIT = 20
const RETRY_COOLDOWN_S = 60

type ColMode = Extract<LiveMode, 'new' | 'trending' | 'alpha'>

const COLUMNS: { label: string; mode: ColMode; alpha?: boolean; tip?: string }[] = [
  { label: 'NEW', mode: 'new' },
  { label: 'TRENDING', mode: 'trending' },
  { label: 'VOLUME·ALPHA', mode: 'alpha', alpha: true,
    tip: 'ranked by liquidity-adjusted volume & activity (local score)' },
]

type ColState =
  | { st: 'loading' }
  | { st: 'ok'; feed: LiveFeed }
  | { st: 'error'; msg: string }

function FullRow({ item, chain, rank, onOpen }:
  { item: LiveItem; chain: LiveChain; rank?: number; onOpen: (it: LiveItem) => void }) {
  return (
    <div className={`lx-tcard${rank !== undefined ? ' ranked' : ''}`} role="button" tabIndex={0}
      title="Trade — coming soon"
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item) }
      }}>
      {rank !== undefined ? <span className="lx-rank">#{rank}</span> : null}
      <TokenLogo src={item.logo} symbol={item.token_symbol} />
      <div className="lx-idc">
        <span className="lx-sym">{item.token_symbol ?? '–'}</span>
        <span className="lx-name">{item.token_name ?? '–'}</span>
      </div>
      <div className="lx-pric">
        <span className="lx-px">{fmtPrice(item.price_usd)}</span>
        <ChgBadge value={item.change_24h} />
      </div>
      <div className="lx-meta">
        <span><span className="k">MC·FDV </span>{fmtUsdCompact(item.fdv_usd)}</span>
        <span><span className="k">VOL </span>{fmtUsdCompact(item.volume_24h)}</span>
        <span><span className="k">LIQ </span>{fmtUsdCompact(item.liquidity_usd)}</span>
        <span><span className="k">TX </span>{fmtCount(item.txns_24h)}</span>
        <span><span className="k">AGE </span>{fmtAge(item.created_at)}</span>
        <span className="badge">{chain.toUpperCase()}</span>
        {item.launchpad
          ? <span className="badge lp">{item.launchpad}</span>
          : item.dex_id ? <span className="badge">{item.dex_id}</span> : null}
        <CopyAddr address={item.pool_address} />
      </div>
    </div>
  )
}

function TopBar({ active }: { active: string }) {
  return (
    <header className="lx-top">
      <div className="lx-top-in">
        <a className="lx-logo" href="/"><span className="m">◤</span>TERMINAL&nbsp;ALPHA</a>
        <span className="lx-title">MEMECOIN LIVE</span>
        <nav className="lx-top-links">
          <a className={active === 'board' ? 'on' : ''} href="/live">BOARD</a>
          <a className={active !== 'board' ? 'on' : ''} href={`/live/${active}`}>{active.toUpperCase()}</a>
          <a href="/terminal">TERMINAL →</a>
        </nav>
      </div>
    </header>
  )
}

export function ChainLive({ chain }: { chain: string }) {
  const known = (LIVE_CHAINS as readonly string[]).includes(chain)
  const [states, setStates] = useState<Partial<Record<ColMode, ColState>>>({})
  const [cooldown, setCooldown] = useState<Partial<Record<ColMode, number>>>({})
  const [tradeItem, setTradeItem] = useState<LiveItem | null>(null)
  const alive = useRef(true)

  const load = useCallback((mode: ColMode) => {
    setStates((s) => ({ ...s, [mode]: { st: 'loading' } }))
    fetchLiveFeed(chain, mode, LIMIT)
      .then((feed) => {
        if (alive.current) setStates((s) => ({ ...s, [mode]: { st: 'ok', feed } }))
      })
      .catch((err: unknown) => {
        if (!alive.current || (err instanceof DOMException && err.name === 'AbortError')) return
        const msg = err instanceof LiveFeedError ? err.message : 'Fetch failed'
        setStates((s) => ({ ...s, [mode]: { st: 'error', msg } }))
        setCooldown((c) => ({ ...c, [mode]: RETRY_COOLDOWN_S }))
      })
  }, [chain])

  useEffect(() => {
    alive.current = true
    const timers = COLUMNS.map((c, i) => window.setTimeout(() => load(c.mode), i * 1000))
    return () => {
      alive.current = false
      timers.forEach(clearTimeout)
    }
  }, [load])

  useEffect(() => {
    const t = window.setInterval(() => {
      setCooldown((c) => {
        const next = { ...c }
        for (const k of Object.keys(next) as ColMode[]) {
          const v = next[k]
          if (v === undefined) continue
          if (v <= 1) delete next[k]
          else next[k] = v - 1
        }
        return next
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])

  if (!known) {
    return (
      <div className="lvx">
        <TopBar active={chain} />
        <main className="lx-wrap">
          <div className="lx-err">
            <span>⚠ unknown chain '{chain}' — pick one of: {LIVE_CHAINS.join(' | ')}</span>
            <a className="lx-back" href="/live">← ALL CHAINS</a>
          </div>
        </main>
      </div>
    )
  }

  const typedChain = chain as LiveChain
  const anyFeed = COLUMNS.reduce<LiveFeed | null>((acc, c) => {
    if (acc) return acc
    const s = states[c.mode]
    return s?.st === 'ok' ? s.feed : acc
  }, null)

  return (
    <div className="lvx">
      <TopBar active={chain} />
      <main className="lx-wrap">
        <div className="lx-hd">
          <a className="lx-back" href="/live">← ALL CHAINS</a>
          <ChainLogo chain={typedChain} size={64} />
          <h1 className="lx-h1">{LIVE_CHAIN_LABEL[typedChain]}</h1>
          <span className="lx-sub">{anyFeed ? anyFeed.network_id ?? '–' : '·····'}</span>
          {anyFeed
            ? <StatusChips live={anyFeed.live} cached={false} stale={false} />
            : null}
        </div>
        <div className="lx-cols">
          {COLUMNS.map((col) => {
            const st = states[col.mode] ?? { st: 'loading' as const }
            const feed = st.st === 'ok' ? st.feed : null
            return (
              <section className="lx-col" data-chain={typedChain} key={col.mode}
                style={accentStyle(typedChain)}>
                <div className="lx-col-hd">
                  <div className="lx-col-t">
                    {col.label}
                    <span className="lx-mode-tag">{col.mode.toUpperCase()}</span>
                    {col.alpha ? <span className="lx-alpha-chip" title={col.tip}>α</span> : null}
                  </div>
                  <div className="lx-col-meta">
                    {feed
                      ? <StatusChips live={feed.live} cached={feed.cached} stale={feed.stale} />
                      : null}
                    <span className="ts">{feed ? fmtUtcClock(feed.generated_at) : '·····'}</span>
                  </div>
                </div>
                {st.st === 'loading'
                  ? <Skel n={5} />
                  : st.st === 'error'
                    ? <ErrBox msg={st.msg} cooldown={cooldown[col.mode] ?? 0} onRetry={() => load(col.mode)} />
                    : feed && feed.items.length === 0
                      ? <EmptyBox what={feed.live ? `No ${col.mode} pools returned right now.` : 'Not live yet — coming soon.'} />
                      : (
                        <div className="lx-rows">
                          {feed!.items.map((it, i) => (
                            <FullRow key={it.pool_address ?? i} item={it} chain={typedChain}
                              rank={col.alpha ? i + 1 : undefined} onOpen={setTradeItem} />
                          ))}
                        </div>
                      )}
              </section>
            )
          })}
        </div>
        <p className="lx-note">
          FREE LIVE DATA VIA <b>GECKOTERMINAL</b> · α = LIQUIDITY-ADJUSTED VOLUME &amp; ACTIVITY (LOCAL SCORE) · LIMIT {LIMIT}/COLUMN
        </p>
        <TradeComingModal item={tradeItem} onClose={() => setTradeItem(null)} />
      </main>
    </div>
  )
}
