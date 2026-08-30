/* MEMECOIN LIVE board (M.3) — one premium card per chain, founder-locked
   order. Each card previews that chain's top-3 trending pools, fetched
   STAGGERED ≥1s apart (the 180s server TTL makes this cheap on the free
   tier). Cards fail independently: per-card error + retry with a 60s
   cool-down. Honesty law: "–" for absent, skeletons while loading. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { LIVE_CHAINS, LIVE_CHAIN_LABEL, LiveFeedError, fetchLiveFeed } from '../lib/liveApi'
import type { LiveChain, LiveFeed, LiveItem } from '../lib/liveApi'
import { fmtPrice, fmtUsdCompact, truncAddr } from '../lib/liveFormat'
import { ChgBadge, EmptyBox, ErrBox, Skel, SocialLinks, StatusChips, TokenLogo, TradeComingModal, accentStyle } from './liveParts'
import { ChainLogo } from './chainLogos'

type CardState =
  | { st: 'loading' }
  | { st: 'ok'; feed: LiveFeed }
  | { st: 'error'; msg: string }

const RETRY_COOLDOWN_S = 60

function distinctLaunchpads(items: LiveItem[]): number {
  return new Set(items.map((i) => i.launchpad).filter((v): v is string => v !== null)).size
}

function MiniRow({ item, onOpen }: { item: LiveItem; onOpen: (it: LiveItem) => void }) {
  return (
    <div className="lx-tcard" role="button" tabIndex={0} title="Trade — execution not wired yet"
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item) }
      }}>
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
        {item.launchpad ? <span className="badge lp">{item.launchpad}</span> : null}
        <span><span className="k">VOL </span>{fmtUsdCompact(item.volume_24h)}</span>
        <span><span className="k">LIQ </span>{fmtUsdCompact(item.liquidity_usd)}</span>
        <SocialLinks socials={item.socials} />
        <span>{truncAddr(item.pool_address)}</span>
      </div>
    </div>
  )
}

export function LiveBoard() {
  const [states, setStates] = useState<Partial<Record<LiveChain, CardState>>>({})
  const [cooldown, setCooldown] = useState<Partial<Record<LiveChain, number>>>({})
  const [tradeItem, setTradeItem] = useState<LiveItem | null>(null)
  const alive = useRef(true)

  const load = useCallback((chain: LiveChain) => {
    setStates((s) => ({ ...s, [chain]: { st: 'loading' } }))
    fetchLiveFeed(chain, 'trending', 3)
      .then((feed) => {
        if (alive.current) setStates((s) => ({ ...s, [chain]: { st: 'ok', feed } }))
      })
      .catch((err: unknown) => {
        if (!alive.current || (err instanceof DOMException && err.name === 'AbortError')) return
        const msg = err instanceof LiveFeedError ? err.message : 'Fetch failed'
        setStates((s) => ({ ...s, [chain]: { st: 'error', msg } }))
        setCooldown((c) => ({ ...c, [chain]: RETRY_COOLDOWN_S }))
      })
  }, [])

  useEffect(() => {
    // staggered first paint: one chain card per second (M.3), StrictMode-safe,
    // then one staggered auto-refresh sweep per 60s — the 180s server cache
    // absorbs the load; the CACHED chip tells the truth about each response
    alive.current = true
    let timers = LIVE_CHAINS.map((c, i) => window.setTimeout(() => load(c), i * 1000))
    const iv = window.setInterval(() => {
      timers.forEach(clearTimeout)
      timers = LIVE_CHAINS.map((c, i) => window.setTimeout(() => load(c), i * 1000))
    }, 60000)
    return () => {
      alive.current = false
      timers.forEach(clearTimeout)
      clearInterval(iv)
    }
  }, [load])

  useEffect(() => {
    const t = window.setInterval(() => {
      setCooldown((c) => {
        const next = { ...c }
        for (const k of Object.keys(next) as LiveChain[]) {
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

  return (
    <div className="lvx">
      <header className="lx-top">
        <div className="lx-top-in">
          <a className="lx-logo" href="/"><span className="m">◤</span>TERMINAL&nbsp;ALPHA</a>
          <span className="lx-title">MEMECOIN LIVE</span>
          <nav className="lx-top-links">
            <a className="on" href="/live">BOARD</a>
            <a className="boxed" href="/docs">DOCS</a>
            <a className="boxed" href="/roadmap">ROADMAP</a>
            <a href="/terminal">TERMINAL →</a>
          </nav>
        </div>
      </header>
      <main className="lx-wrap">
        <div className="lx-hd">
          <h1 className="lx-h1">MEMECOIN <em>LIVE</em></h1>
          <span className="lx-sub">5 CHAINS · TRENDING PREVIEW · KEYLESS GECKOTERMINAL · AUTO-REFRESH 60s</span>
        </div>
        <div className="lx-board">
          {LIVE_CHAINS.map((chain) => {
            const st = states[chain] ?? { st: 'loading' as const }
            const feed = st.st === 'ok' ? st.feed : null
            return (
              <article className="lx-card" data-chain={chain} key={chain} style={accentStyle(chain)}>
                <div className="lx-card-hd">
                  <ChainLogo chain={chain} size={56} />
                  <div className="lx-card-id">
                    <span className="lx-card-name">
                      <a href={`/live/${chain}`}>{LIVE_CHAIN_LABEL[chain]}</a>
                    </span>
                    <span className="lx-card-net">{feed ? feed.network_id ?? '–' : '·····'}</span>
                  </div>
                  <div className="lx-chips">
                    {feed
                      ? <StatusChips live={feed.live} cached={feed.cached} stale={feed.stale} />
                      : null}
                  </div>
                </div>
                {st.st === 'loading'
                  ? <Skel n={3} />
                  : st.st === 'error'
                    ? <ErrBox msg={st.msg} cooldown={cooldown[chain] ?? 0} onRetry={() => load(chain)} />
                    : feed && feed.items.length === 0
                      ? <EmptyBox what={feed.live ? 'No trending pools returned right now.' : 'Not live yet — network not served upstream.'} />
                      : (
                        <div className="lx-rows">
                          {feed!.items.map((it, i) => (
                            <MiniRow key={it.pool_address ?? i} item={it} onOpen={setTradeItem} />
                          ))}
                        </div>
                      )}
                <div className="lx-card-ft">
                  <span className="lx-chip lp">
                    LAUNCHPADS ×{feed ? distinctLaunchpads(feed.items) : '–'}
                  </span>
                  <a className="lx-open" href={`/live/${chain}`}>OPEN CHAIN →</a>
                </div>
              </article>
            )
          })}
        </div>
        <p className="lx-note">FREE LIVE DATA VIA <b>GECKOTERMINAL</b> · SERVER CACHE 180s · ABSENT DATA STAYS “–”</p>
        <TradeComingModal item={tradeItem} onClose={() => setTradeItem(null)} />
      </main>
    </div>
  )
}
