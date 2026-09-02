/* TOKEN PAGE (S2, rebuilt PROMPT-V 2026-08-30) — full-bleed token detail +
   swap rail on ONE identity source (lib/tokenStore): the active pair feeds
   header, chart, bonding, tabs, info panel and the rail — there is no second
   token default anywhere (the old BONK-global is gone).
   $0 sources: quote/rate + pair facts = DexScreener (browser, CORS *); chart
   candles + socials = backend /api/v1/market/ohlcv + /api/v1/socials (the
   browser never calls GeckoTerminal directly — zero third-party-host claim);
   trades = /ws/tape (real GT deltas). Simulated-only surfaces keep their
   declared chips (holders). DNA: 2px bordir, dashed hairlines, mono density. */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { LiveChain } from '../lib/liveApi'
import { LIVE_CHAIN_LABEL } from '../lib/liveApi'
import { shorten } from '../lib/liveFormat'
import { accentStyle } from './liveParts'
import { ChainLogo } from './chainLogos'
import { fetchSwapQuote } from '../services/dexscreener'
import type { SwapQuote } from '../services/dexscreener'
import { fetchSwapCapabilities, fetchServerQuote } from '../services/swapCapabilities'
import type { SwapCapabilities, ServerQuote } from '../services/swapCapabilities'
import { getGeneration, useActivePair } from '../lib/tokenStore'
import type { ActivePair } from '../lib/tokenStore'
import { INDICATOR_LEGEND, ema, rsi, vwap } from '../lib/indicators'
import type { Candle } from '../lib/indicators'
import { demoTokenBalance, WALLET_LABEL } from '../wallet/registry'
import { useWallet } from '../wallet/WalletContext'
import { WalletButton } from '../wallet/WalletButton'
import { AutodetectSearch } from '../layout/AutodetectSearch'
import '../styles/swap.css'

const OHLCV_RESOLUTIONS = ['1m', '15m', '1h', '4h', '1d'] as const
type Resolution = (typeof OHLCV_RESOLUTIONS)[number]

interface OhlcvState {
  candles: Candle[]
  state: 'SEEDING' | 'LIVE' | 'EMPTY' | 'ERROR'
  reason: string | null
  lastTs: number | null
}

interface SocialsState {
  links: { url: string; type: string | null }[]
  websites: { url: string; label: string | null }[]
  imageUrl: string | null
  state: 'LOADING' | 'LIVE' | 'EMPTY' | 'ERROR'
  reason: string | null
}

/* native asset per chain — mirrors providers (sol=SOL, bnb=BNB, base/hood=ETH,
   hype=HYPE); the YOU-PAY side always trades against this */
const NATIVE: Record<LiveChain, string> = {
  sol: 'SOL', bnb: 'BNB', base: 'ETH', hype: 'HYPE', hood: 'ETH',
  // avax: 'AVAX' parked 2026-08-30 (founder: 5-chain lineup)
}
const NATIVE_USD_HINT: Record<LiveChain, number> = {
  sol: 203, bnb: 690, base: 3400, hype: 38, hood: 3400,
}

/* dexId → CTA label — observed-only map (live.py LAUNCHPAD spirit): verbatim
   slug capitalized, known brands named, unknown dex passes through raw */
const DEX_LABEL: Record<string, string> = {
  orca: 'Orca', raydium: 'Raydium', meteora: 'Meteora', pumpswap: 'Pumpswap',
  'pump-fun': 'Pump.fun', pancakeswap: 'PancakeSwap', pancakeswap_v2: 'PancakeSwap',
  uniswap: 'Uniswap', aerodrome: 'Aerodrome', 'aerodrome-slipstream-3': 'Aerodrome',
  hyperlink: 'Hyperlink',
}
const dexLabel = (dexId: string | null | undefined) =>
  (dexId && (DEX_LABEL[dexId] ?? dexId.replace(/[-_]/g, ' '))) || 'DEX'

/* drawing-tool glyphs — crisp 16px strokes, one meaning per icon (TradingView
   convention: crosshair / trendline / measure), never a reused placeholder */
const TOOL_ICONS: Record<string, ReactNode> = {
  cross: (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <circle cx="8" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 .5v3.5M8 12v3.5M.5 8H4M12 8h3.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  trend: (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="M3 13 13 3" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="3" cy="13" r="1.7" fill="currentColor" />
      <circle cx="13" cy="3" r="1.7" fill="currentColor" />
    </svg>
  ),
  measure: (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="M8 2.5v11M4.8 5.7 8 2.5l3.2 3.2M4.8 10.3 8 13.5l3.2-3.2"
        fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
}

function fmtCompact(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: digits }).format(n)
}
function fmtUsd(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : `$${fmtCompact(n)}`
}
function fmtAge(ms: number | null): string {
  if (!ms || ms <= 0) return '—'
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`
  if (h < 48) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
function fmtPrice(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p) || p <= 0) return '—'
  if (p >= 0.01) return `$${p.toFixed(4)}`
  const s = p.toFixed(12)
  const zeros = s.match(/^0\.(0+)/)?.[1].length ?? 0
  return `$0.0${'₀₁₂₃₄₅₆₇₈₉'[zeros] ?? zeros}${s.replace(/^0\.0+/, '').slice(0, 4)}`
}

/* ── live data hooks ──────────────────────────────────────────────────── */

/* P1 stale-response guard: every async loader snapshots the identity
   generation at dispatch; a response arriving after ANY applySwapToken is
   DROPPED — no partial meta from a previous token can ever interleave. */
function useQuote(pair: ActivePair | null): { quote: SwapQuote | null; error: string | null } {
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let on = true
    const gen = getGeneration()
    const fresh = () => on && getGeneration() === gen
    setQuote(null)
    setError(null)
    if (!pair) { setError('no token selected — paste a CA in the search bar above'); return }
    fetchSwapQuote(pair.chain, pair.tokenAddress)
      .then((q) => { if (fresh()) { if (q) setQuote(q); else setError(`no live ${pair.chain.toUpperCase()} quote — dexscreener returned no finite rate for this token`) } })
      .catch(() => { if (fresh()) setError('dexscreener unreachable — rate unavailable') })
    return () => { on = false }
  }, [pair])
  return { quote, error }
}

/* T2 capability registry (one fetch per page): the rail renders the per-chain
   execution state VERBATIM from the backend (quote_only/unwired) — the client
   never derives or caches an execution claim of its own. Registry unreachable
   → no chip, no invented state. */
const CAP_CHIP: Record<string, string> = { quote_only: 'QUOTE ONLY', unwired: 'UNWIRED' }

function useSwapCapabilities(): SwapCapabilities | null {
  const [caps, setCaps] = useState<SwapCapabilities | null>(null)
  useEffect(() => {
    let on = true
    fetchSwapCapabilities().then((c) => { if (on) setCaps(c) })
    return () => { on = false }
  }, [])
  return caps
}

/* T2 server route quote: an EXACT-IN quote for the typed amount, debounced
   and generation-guarded. Only a data_mode=live response is surfaced; the
   unwired/degraded contract maps to null (the DexScreener estimate stays,
   honestly labeled — the server line is additive, never a replacement). */
function useServerQuote(pair: ActivePair | null, dir: 'buy' | 'sell', amount: string): ServerQuote | null {
  const [sq, setSq] = useState<ServerQuote | null>(null)
  useEffect(() => {
    let on = true
    const gen = getGeneration()
    const n = Number.parseFloat(amount)
    if (!pair || !Number.isFinite(n) || n <= 0) { setSq(null); return }
    const t = setTimeout(() => {
      fetchServerQuote({
        chain: pair.chain,
        tokenIn: dir === 'buy' ? 'native' : pair.tokenAddress,
        tokenOut: dir === 'buy' ? pair.tokenAddress : 'native',
        amountIn: String(n),
        slippageBps: 50,
      }).then((q) => {
        if (!on || getGeneration() !== gen) return
        setSq(q && q.minimum_received != null ? q : null)
      }).catch(() => { if (on) setSq(null) })
    }, 400)
    return () => { on = false; clearTimeout(t) }
  }, [pair, dir, amount])
  return sq
}

/* OHLCV via the backend (Fase 4): SEEDING until the first array answers,
   LIVE afterwards, honest EMPTY/ERROR with the degraded reason verbatim */
function useOhlcv(pair: ActivePair | null, resolution: Resolution, pairAddress: string | null | undefined): OhlcvState {
  const [st, setSt] = useState<OhlcvState>({ candles: [], state: 'SEEDING', reason: null, lastTs: null })
  useEffect(() => {
    let on = true
    const gen = getGeneration()
    const fresh = () => on && getGeneration() === gen
    if (!pair || !pairAddress) {
      setSt({ candles: [], state: 'EMPTY', reason: 'no active pair address — open a token with a live pool', lastTs: null })
      return
    }
    setSt((s) => ({ ...s, state: s.candles.length ? 'LIVE' : 'SEEDING', reason: null }))
    fetch(`/api/v1/market/ohlcv?chain=${pair.chain}&pair=${encodeURIComponent(pairAddress)}&resolution=${resolution}&limit=180`)
      .then(async (r) => {
        const j = await r.json().catch(() => null)
        if (!fresh()) return
        if (!r.ok || !j) {
          setSt((s) => ({ ...s, state: 'ERROR', reason: j?.detail ?? `HTTP ${r.status} — ohlcv unavailable` }))
          return
        }
        const candles: Candle[] = j.candles ?? []
        setSt({
          candles,
          state: candles.length ? 'LIVE' : 'EMPTY',
          reason: candles.length ? null : (j.provenance?.degraded ?? 'no candles in feed'),
          lastTs: j.provenance?.freshness?.last_candle_ts ?? null,
        })
      })
      .catch(() => { if (fresh()) setSt((s) => ({ ...s, state: 'ERROR', reason: 'network error — is the API server running?' })) })
    return () => { on = false }
  }, [pair, pairAddress, resolution])
  return st
}

function useSocials(pair: ActivePair | null): SocialsState {
  const [st, setSt] = useState<SocialsState>({ links: [], websites: [], imageUrl: null, state: 'LOADING', reason: null })
  useEffect(() => {
    let on = true
    const gen = getGeneration()
    const fresh = () => on && getGeneration() === gen
    setSt({ links: [], websites: [], imageUrl: pair?.logo ?? null, state: 'LOADING', reason: null })
    if (!pair) return
    fetch(`/api/v1/socials?chain=${pair.chain}&token=${encodeURIComponent(pair.tokenAddress)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null)
        if (!fresh()) return
        if (!r.ok || !j) { setSt((s) => ({ ...s, state: 'ERROR', reason: j?.detail ?? `HTTP ${r.status}` })); return }
        const links = j.links ?? []
        const websites = j.websites ?? []
        setSt({
          links, websites, imageUrl: j.image_url ?? pair.logo ?? null,
          state: links.length + websites.length ? 'LIVE' : 'EMPTY',
          reason: j.provenance?.degraded ?? null,
        })
      })
      .catch(() => { if (fresh()) setSt((s) => ({ ...s, state: 'ERROR', reason: 'network error' })) })
    return () => { on = false }
  }, [pair])
  return st
}

/* real trades over /ws/tape for the ACTIVE pool; falls back to the seeded
   deterministic tape while the socket has nothing (SEEDING chip) */
interface TapeTrade { wallet: string; kind: string | null; ts: string | null; usd: number | null; tx: string | null }
function useTape(pairAddress: string | null | undefined): { trades: TapeTrade[]; live: boolean } {
  const [trades, setTrades] = useState<TapeTrade[]>([])
  const [live, setLive] = useState(false)
  useEffect(() => {
    if (!pairAddress) return
    let ws: WebSocket | null = null
    let closed = false
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${proto}//${window.location.host}/ws/tape?chain=&pool=${encodeURIComponent(pairAddress)}`)
    } catch { return }
    ws.onmessage = (ev) => {
      try {
        const frame = JSON.parse(ev.data) as { type?: string; trades?: TapeTrade[] }
        if (frame.type === 'tape' && Array.isArray(frame.trades)) {
          setLive(true)
          setTrades((prev) => [...frame.trades!, ...prev].slice(0, 40))
        }
      } catch { /* malformed frame — skip, never render invented rows */ }
    }
    ws.onclose = () => { if (!closed) setLive(false) }
    return () => { closed = true; ws?.close() }
  }, [pairAddress])
  return { trades, live }
}

/* ── deterministic seeded fallback tape (declared, per-panel SEEDING) ──── */
function seededTrades(seed: string, symbol: string) {
  let s = 911
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) | 0
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
  return Array.from({ length: 12 }, (_, i) => {
    const buy = rnd() > 0.45
    const w = `${rnd().toString(16).slice(2, 6)}…${rnd().toString(16).slice(2, 6)}`
    return {
      wallet: w, kind: buy ? 'buy' : 'sell', usd: Math.round(rnd() * 90000) / 100,
      ts: null, tx: w,
      _sym: symbol, _ago: ['5M AGO', '12M AGO', '1H AGO', '2H AGO', '1W AGO'][i % 5],
    }
  })
}

/* ── small shared bits ────────────────────────────────────────────────── */

function CopyBtn({ value, label }: { value: string; label: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" className={ok ? 'ok' : ''} aria-label={`copy ${label}`}
      onClick={() => navigator.clipboard?.writeText(value)
        .then(() => { setOk(true); window.setTimeout(() => setOk(false), 1400) }, () => {})}>⧉</button>
  )
}

function TokenLogo({ src, symbol, size = 34 }: { src: string | null; symbol: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (src && !broken) {
    return <img className="sw-logo-img" src={src} alt="" width={size} height={size}
      onError={() => setBroken(true)} referrerPolicy="no-referrer" />
  }
  /* bordir glyph fallback — same tile language as the site logo */
  return (
    <span className="sw-logo-glyph" style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true">{(symbol || '?').slice(0, 1)}</span>
  )
}

const QUICK = [0.001, 0.01, 0.05, 0.1, 0.5]

/* ── R4 fee frontier: the PLANNED fee as inspectable data ─────────────────
   GET /api/v1/fees/estimate serves docs/FEE-MODELS-2026.md as data — a
   policy constant (data_mode 'static'). Nothing is charged; VILMEI is
   read-only. The strip fetches once per open of ADVANCED, never per
   keystroke. */
interface FeeMatrixRow { provider: string; mechanism: string; verdict: string; note: string }
interface FeeEstimate {
  planned_rate_bps: number
  split_bps: Record<string, number>
  estimate_usd: number
  amount_usd: number
  matrix: Record<string, FeeMatrixRow>
  buyback_blocker: string
  honest_note: string
}
function useFeeEstimate(open: boolean, chain: string, notionalUsd: number): FeeEstimate | null {
  const [fees, setFees] = useState<FeeEstimate | null>(null)
  useEffect(() => {
    if (!open) return
    let on = true
    const basis = Number.isFinite(notionalUsd) && notionalUsd > 0 ? Math.round(notionalUsd * 100) / 100 : 1000
    fetch(`/api/v1/fees/estimate?chain=${chain}&amountUsd=${basis}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null)
        if (on && r.ok && j) setFees(j as FeeEstimate)
      })
      .catch(() => { /* policy fetch failed — the strip stays quiet, never red */ })
    return () => { on = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notional is captured at open; typing does not re-fetch
  }, [open, chain])
  return fees
}

/* ── M3 vault map: where the planned slices would land (claim-based) ────────
   GET /api/v1/fees/destinations is policy data (docs/FEE-VAULTS.md): public
   founder-claimed addresses or 'awaiting-founder' sentences. Fetched once per
   ADVANCED open, same quiet discipline as the fee strip. */
interface VaultSlice { address: string | null; status: string; note: string }
interface VaultChainRow { fee_path_verdict: string; vaults: Record<string, VaultSlice> }
interface VaultMap { chains: Record<string, VaultChainRow>; honest_note: string }
function useVaultMap(open: boolean): VaultMap | null {
  const [map, setMap] = useState<VaultMap | null>(null)
  useEffect(() => {
    if (!open) return
    let on = true
    fetch('/api/v1/fees/destinations')
      .then(async (r) => {
        const j = await r.json().catch(() => null)
        if (on && r.ok && j) setMap(j as VaultMap)
      })
      .catch(() => { /* policy fetch failed — the chips stay quiet, never red */ })
    return () => { on = false }
  }, [open])
  return map
}

/* ── the swap rail (Fase 1) ───────────────────────────────────────────── */

function SwapRail({ pair, quote, qErr }: { pair: ActivePair | null; quote: SwapQuote | null; qErr: string | null }) {
  const { session } = useWallet()
  const [dir, setDir] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [pct, setPct] = useState(0)
  const [adv, setAdv] = useState(false)
  const chain = pair?.chain ?? 'sol'
  const caps = useSwapCapabilities()
  const capRow = caps?.chains.find((c) => c.chain === chain) ?? null
  const capChip = capRow ? (CAP_CHIP[capRow.execution_status] ?? capRow.execution_status.toUpperCase()) : null
  const serverQuote = useServerQuote(pair, dir, amount)

  /* ONE balance source (Fase 1.2): wallet store when connected, else the
     deterministic per-chain demo number — the header chip shows the same. */
  const nativeBal = session?.balances?.[chain] ?? 3.421
  const tokenBal = pair ? demoTokenBalance(session?.providerId ?? 'anon', pair.tokenAddress) : 0
  /* SWAP-1 honesty: without a wallet these are DEMO numbers — the strip and
     the YOU PAY row both say so, never posing as a live wallet balance */
  const payBalSource = session ? `${nativeBal.toFixed(3)} ${NATIVE[chain]}` : '3.421 DEMO'
  const nativeUsd = quote ? quote.priceUsd && quote.priceNative ? (quote.priceUsd / quote.priceNative) : NATIVE_USD_HINT[chain] : NATIVE_USD_HINT[chain]
  /* P0-H6: when the quote is missing, nativeUsd is a STATIC hint — every USD
     figure derived from it must say ESTIMATE, never pose as live */
  const nativeUsdIsHint = !(quote?.priceUsd && quote.priceNative)
  const usdTag = nativeUsdIsHint ? <span className="tk-mock">ESTIMATE</span> : null

  /* BUY: pay native, get token. SELL: pay token, get native (1.5). */
  const payingNative = dir === 'buy'
  const getSym = payingNative ? (quote?.token ?? pair?.symbol ?? '—') : NATIVE[chain]
  const paySymbol = payingNative ? NATIVE[chain] : (quote?.token ?? pair?.symbol ?? '—')
  const payBal = payingNative ? nativeBal : tokenBal
  const payBalUsd = payingNative ? nativeBal * nativeUsd : tokenBal * (quote?.priceUsd ?? 0)

  const n = Number.parseFloat(amount)
  const payAmt = Number.isFinite(n) && n >= 0 ? n : 0
  const rate = quote?.priceNative && quote.priceNative > 0 ? 1 / quote.priceNative : 0
  /* interconvert both fields (1.4): the other side always mirrors the input */
  const getAmt = quote ? (payingNative ? payAmt * rate : payAmt / quote.priceNative) : 0

  /* R4 fee strip: planned 0.50% as data — fetch fires only when ADVANCED
     opens; the live line below re-derives from the payload's rate bps */
  const notionalUsd = payingNative ? payAmt * nativeUsd : payAmt * (quote?.priceUsd ?? 0)
  const fees = useFeeEstimate(adv, chain, notionalUsd)
  const vaultMap = useVaultMap(adv)
  const liveFeeUsd = fees ? (notionalUsd > 0 ? (notionalUsd * fees.planned_rate_bps) / 10000 : fees.estimate_usd) : null

  const setFromPay = (v: string) => {
    setAmount(v)
    const x = Number.parseFloat(v)
    setPct(Number.isFinite(x) && payBal > 0 ? Math.round(Math.min(100, Math.max(0, (x / payBal) * 100))) : 0)
  }
  /* MAX never throws (1.4): guard on balance/rate, honest 0 when no rate */
  const setMax = () => {
    if (payingNative) { setAmount(String(Math.floor(payBal * 1000) / 1000)); setPct(100); return }
    setAmount(String(Math.floor(tokenBal * 100) / 100)); setPct(100)
  }
  const flip = () => { setDir((d) => (d === 'buy' ? 'sell' : 'buy')); setAmount(''); setPct(0) }

  return (
    <section className="tk-panel sw-rail" data-chain={chain} style={accentStyle(chain)}>
      <div className="tk-phd">
        <span>VILMEI SWAP</span>
        {quote ? <span className="tk-live">LIVE QUOTE · DEXSCREENER</span> : <span className="tk-mock">NO QUOTE</span>}
        {capChip && <span className="tk-mock" title={`${capRow?.name ?? chain}: ${capRow?.reason ?? ''}`}>{capChip}</span>}
      </div>
      <div className="tk-swap">
        {/* SWAP-1: the wallet zone — ALL detected wallets (EIP-6963 + Solana
           Wallet Standard) plus the labelled demo identity, address-only. */}
        <div className="sw-wallet" data-testid="swap-wallet">
          {session ? (
            <>
              <div className="sw-wallet-id">
                <span className="dot" aria-hidden="true" />
                <span className="mono">{session.address.slice(0, 6)}…{session.address.slice(-4)}</span>
                <span className={`sw-wallet-tag${session.kind === 'live' ? ' live' : ''}`}>
                  {session.kind === 'live' ? `${session.label.toUpperCase()} · CONNECTED` : 'DEMO WALLET · CONNECTED'}
                </span>
              </div>
              <div className="sw-wallet-bal mono">
                <span>{payBalSource}</span>
                <span className="dim2">{session.kind === 'live' ? 'live public address' : 'demo balance'}</span>
              </div>
            </>
          ) : (
            <>
              <div className="sw-wallet-id">
                <span className="dot amber" aria-hidden="true" />
                <span className="sw-wallet-tag amber">NO WALLET — balances below are DEMO</span>
              </div>
            </>
          )}
          <div style={{ marginLeft: 'auto' }}><WalletButton /></div>
        </div>

        <div className="sw-tabs2" role="tablist" aria-label="direction">
          <button type="button" role="tab" aria-selected={dir === 'buy'}
            className={`sw-tab2 buy${dir === 'buy' ? ' on' : ''}`} onClick={() => dir !== 'buy' && flip()}>BUY</button>
          <button type="button" role="tab" aria-selected={dir === 'sell'}
            className={`sw-tab2 sell${dir === 'sell' ? ' on' : ''}`} onClick={() => dir !== 'sell' && flip()}>SELL</button>
        </div>

        <div className="sw2-field">
          <div className="sw2-hd"><span>YOU PAY</span>
            <span className="mono">{payBal.toFixed(payingNative ? 3 : 2)} {paySymbol} · ~{fmtUsd(payBalUsd)}{usdTag}
              {!session && <span className="tk-mock">DEMO BALANCE</span>}
            </span>
          </div>
          <div className="sw2-row">
            <input className="sw2-input" inputMode="decimal" placeholder="0" value={amount}
              onChange={(e) => setFromPay(e.target.value)} aria-label={`amount of ${paySymbol} to pay`} />
            {payingNative ? (
              <div className="sw2-chip" title={`${LIVE_CHAIN_LABEL[chain]} · native asset`}>
                <ChainLogo chain={chain} size={22} />
                <span className="sw-chip-sym">{NATIVE[chain]}</span>
              </div>
            ) : (
              <div className="sw2-chip" title={pair?.name ?? pair?.symbol ?? ''}>
                <TokenLogo src={quote?.logoUrl ?? pair?.logo ?? null} symbol={pair?.symbol ?? '?'} size={22} />
                <span className="sw-chip-sym">{quote?.token ?? pair?.symbol ?? '—'}</span>
              </div>
            )}
          </div>
          <div className="sw2-quick">
            {QUICK.map((q) => (
              <button type="button" key={q} aria-label={`set ${q} ${paySymbol}`}
                onClick={() => { setAmount(String(q)); setPct(payBal > 0 ? Math.round(Math.min(100, (q / payBal) * 100)) : 0) }}>
                {q}
              </button>
            ))}
            <button type="button" onClick={setMax}>MAX</button>
          </div>
          <div className="sw2-rail" role="slider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
            aria-label="percent of balance"
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect()
              const p = Math.round(Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100)))
              setPct(p)
              setAmount(String(Math.floor(payBal * p) / 100 / (p === 100 ? 10 : 10)))
            }}>
            <i className="fill" style={{ width: `${pct}%` }} />
            <i style={{ left: `${pct}%` }} />
          </div>
          <div className="sw2-pct"><span>{pct}%</span><span>of balance</span></div>
        </div>

        <div className="sw2-flip">
          <button type="button" aria-label="flip direction" onClick={flip}>⇅</button>
        </div>

        <div className="sw2-field">
          <div className="sw2-hd"><span>YOU GET</span>
            <span>{pair?.symbol ? <abbr className="sw-abbr" title={pair.tokenAddress}>{pair.symbol}{pair.name ? ` · ${pair.name}` : ''}</abbr> : '—'}</span>
          </div>
          <div className="sw2-row">
            <span className="sw2-input ro">{getAmt ? fmtCompact(getAmt, getAmt < 1000 ? 4 : 2) : '0'}</span>
            {payingNative ? (
              <div className="sw2-chip" title={pair?.name ?? pair?.symbol ?? ''}>
                <TokenLogo src={quote?.logoUrl ?? pair?.logo ?? null} symbol={pair?.symbol ?? '?'} size={22} />
                <span className="sw-chip-sym">{quote?.token ?? pair?.symbol ?? '—'}</span>
              </div>
            ) : (
              <div className="sw2-chip" title={`${LIVE_CHAIN_LABEL[chain]} · native asset`}>
                <ChainLogo chain={chain} size={22} />
                <span className="sw-chip-sym">{NATIVE[chain]}</span>
              </div>
            )}
          </div>
        </div>

        {/* 1.6 compact rate — never the truncated long number */}
        <div className="sw2-rate mono" aria-label="exchange rate">
          {quote && rate > 0 ? (
            <>1 {NATIVE[chain]} ≈ {fmtCompact(rate, 2)} {quote.token}{quote.priceUsd != null && <> · {quote.token} {fmtPrice(quote.priceUsd)}</>}</>
          ) : (
            <>rate —</>
          )}
        </div>

        {/* T2 exact-in route quote from the backend: shown only when a REAL
            keyless provider answered (data_mode=live); the floor is the
            provider's own minimum_received. Quote-only, always. */}
        {serverQuote && serverQuote.minimum_received != null && (
          <div className="sw2-note" data-testid="server-quote"
            title={`quote_id ${serverQuote.quote_id ?? ''} · route ${(serverQuote.route ?? []).join(' → ')}`}>
            SERVER QUOTE · {(serverQuote.provider_quoted ?? 'PROVIDER').toUpperCase()} —
            {' '}≥ {fmtCompact(Number(serverQuote.minimum_received), Number(serverQuote.minimum_received) < 1000 ? 4 : 2)} {getSym} · 0.5% SLIP · QUOTE ONLY
          </div>
        )}

        {/* 1.7 info grid: every growable string ellipsized WITH a title */}
        <div className="sw2-grid">
          <div><span className="l">PRICE<abbr className="sw-info-tip" title="deepest pair price, live DexScreener">ⓘ</abbr></span>
            <b className="mono">{quote?.priceUsd != null ? fmtPrice(quote.priceUsd) : '—'}</b></div>
          <div><span className="l">LIQUIDITY</span><b className="mono">{fmtUsd(quote?.liq)}</b></div>
          <div><abbr className="l" title={quote?.dexId ?? 'dex'}>DEX</abbr>
            <b className="ell" title={dexLabel(quote?.dexId)}>{dexLabel(quote?.dexId)}</b></div>
          <div><span className="l">+24H</span>
            <b className={`mono ${((quote?.change?.h24 ?? 0) >= 0) ? 'pos' : 'neg'}`}>
              {quote?.change?.h24 != null ? `${quote.change.h24 > 0 ? '+' : ''}${quote.change.h24.toFixed(2)}%` : '—'}</b></div>
        </div>

        {qErr && <div className="sw2-note err" role="status">{qErr}</div>}

        <button type="button" className="sw2-adv" aria-expanded={adv} onClick={() => setAdv((a) => !a)}>
          ADVANCED <span>{adv ? '▴' : '▾'}</span>
        </button>
        {adv && (
          <div className="sw2-adv-body">
            <label>SLIPPAGE TOLERANCE <span className="tk-mock">SIMULATED</span><input placeholder="1.0 %" readOnly tabIndex={-1} /></label>
            <label>DEADLINE <span className="tk-mock">SIMULATED</span><input placeholder="30 min" readOnly tabIndex={-1} /></label>

            {/* T2 capability registry — the honest per-chain state, verbatim
                from the backend; candidates are allowlist facts, not claims */}
            <div className="sw2-fees" data-testid="swap-capability">
              <div className="sw2-fees-hd">
                <span className="l">EXECUTION CAPABILITY</span>
                <span className="tk-mock">{capChip ?? 'REGISTRY UNAVAILABLE'}</span>
              </div>
              <div className="sw2-fees-chips">
                {(capRow?.provider_candidates ?? []).map((p) => (
                  <span key={p} className="fee-chip"
                    title="allowlisted route candidate — not yet executable">{p.toUpperCase()}</span>
                ))}
                <span className="fee-chip">SLIPPAGE CAP {caps?.max_slippage_bps ?? 500} BPS</span>
              </div>
              <p className="sw2-fees-note">{capRow?.reason ?? 'capability registry unreachable — no execution claim is made'}</p>
            </div>

            {/* R4 fee frontier — planned, inspectable, never charged */}
            <div className="sw2-fees" data-testid="fee-strip">
              <div className="sw2-fees-hd">
                <span className="l">PLANNED FEE</span><span className="tk-mock">PLANNED</span>
              </div>
              {fees ? (
                <>
                  <div className="sw2-fees-rate mono">
                    <b>{(fees.planned_rate_bps / 100).toFixed(2)}%</b>
                    <span>OPS {(fees.split_bps.ops / 100).toFixed(2)} · BUYBACK {(fees.split_bps.buyback / 100).toFixed(2)} · REWARDS {(fees.split_bps.rewards / 100).toFixed(2)}</span>
                  </div>
                  <div className="sw2-split" data-testid="fee-split">
                    <div className="sw2-split-bar" role="img"
                      aria-label={`planned fee split: ops ${(fees.split_bps.ops / 100).toFixed(2)}%, buyback ${(fees.split_bps.buyback / 100).toFixed(2)}%, rewards ${(fees.split_bps.rewards / 100).toFixed(2)}%`}>
                      <i className="ops" style={{ width: `${(fees.split_bps.ops / fees.planned_rate_bps) * 100}%` }} />
                      <i className="buyback" style={{ width: `${(fees.split_bps.buyback / fees.planned_rate_bps) * 100}%` }} />
                      <i className="rewards" style={{ width: `${(fees.split_bps.rewards / fees.planned_rate_bps) * 100}%` }} />
                    </div>
                    <div className="sw2-split-lg"><span>OPS <b>{(fees.split_bps.ops / 100).toFixed(2)}%</b></span><span>BUYBACK <b>{(fees.split_bps.buyback / 100).toFixed(2)}%</b></span><span>REWARDS <b>{(fees.split_bps.rewards / 100).toFixed(2)}%</b></span></div>
                  </div>
                  <div className="sw2-fees-est mono" title={`server estimate $${fees.estimate_usd.toFixed(2)} at $${fees.amount_usd} — line re-derives from the payload rate`}>
                    ≈ ${liveFeeUsd != null ? liveFeeUsd.toFixed(2) : fees.estimate_usd.toFixed(2)} at {notionalUsd > 0 ? fmtUsd(notionalUsd) : fmtUsd(fees.amount_usd)} notional
                  </div>
                  <div className="sw2-fees-chips">
                    {Object.entries(fees.matrix).map(([c, row]) => (
                      <span key={c} className={`fee-chip${c === chain ? ' on' : ''}`}
                        data-verdict={row.verdict}
                        title={`${row.provider} — ${row.mechanism}. ${row.note}`}>
                        {c.toUpperCase()} · {row.verdict}
                      </span>
                    ))}
                  </div>
                  {vaultMap?.chains?.[chain] && (
                    <div className="sw2-fees-chips" data-testid="vault-chips">
                      {Object.entries(vaultMap.chains[chain].vaults).map(([slice, v]) => (
                        <span key={slice} className="fee-chip vault" data-status={v.status}
                          title={v.note}>
                          {slice.toUpperCase()} · {v.address ? shorten(v.address) : 'AWAITING CLAIM'}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="sw2-fees-note">{fees.honest_note} — buyback slice blocked by <abbr title={fees.buyback_blocker}>VM-fee-01</abbr>.</p>
                </>
              ) : (
                <div className="sw2-fees-est mono dim2">READING THE FEE POLICY</div>
              )}
            </div>
          </div>
        )}

        {quote?.url ? (
          <a className="sw2-cta" href={quote.url} target="_blank" rel="noopener noreferrer">
            OPEN {dexLabel(quote.dexId).toUpperCase()} PAIR ↗
          </a>
        ) : (
          <button type="button" className="sw2-cta" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>NO LIVE PAIR</button>
        )}

        {/* 1.8 ONE unbroken line, natural wrap */}
        <p className="sw2-disclaimer">Read-only terminal — the quote is live (DexScreener); execution never happens here, and chart/trades state is simulated where labeled.</p>
      </div>
    </section>
  )
}

/* ── page ─────────────────────────────────────────────────────────────── */

export function TokenPage() {
  const pair = useActivePair()
  const { quote, error } = useQuote(pair)
  const chain = pair?.chain ?? 'sol'
  const [tool, setTool] = useState('cross')
  const [chartZoom, setChartZoom] = useState(1)
  const [chartFullscreen, setChartFullscreen] = useState(false)
  const chartRef = useRef<HTMLElement>(null)
  /* indicator toggles — the chart lines obey these switches (no fake legend) */
  const [inds, setInds] = useState<Record<'ema' | 'vwap' | 'rsi', boolean>>({ ema: true, vwap: true, rsi: true })
  const [tab, setTab] = useState('TRADES')
  const [resolution, setResolution] = useState<Resolution>('15m')
  const ohlcv = useOhlcv(pair, resolution, pair?.pairAddress)
  const socials = useSocials(pair)
  const tape = useTape(pair?.pairAddress)
  const { session } = useWallet()
  useEffect(() => {
    const onFullscreen = () => setChartFullscreen(document.fullscreenElement === chartRef.current)
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => document.removeEventListener('fullscreenchange', onFullscreen)
  }, [])

  useEffect(() => {
    document.title = `${pair?.symbol ?? 'Token'} · ${chain.toUpperCase()} — VILMEI`
  }, [pair, chain])

  const toggleChartFullscreen = () => {
    const el = chartRef.current
    if (!el) return
    if (document.fullscreenElement) {
      void document.exitFullscreen?.()
      return
    }
    if (chartFullscreen) {
      setChartFullscreen(false)
      return
    }
    if (el.requestFullscreen) {
      void el.requestFullscreen().catch(() => setChartFullscreen(true))
    } else {
      setChartFullscreen(true)
    }
  }

  const resetChartView = () => setChartZoom(1)


  const closes = useMemo(() => ohlcv.candles.map((c) => c.c), [ohlcv.candles])
  const rsiLine = useMemo(() => rsi(closes), [closes])
  const lastRsi = [...rsiLine].reverse().find((v) => v != null) ?? null
  const chart = ohlcv.candles.length ? ohlcv.candles : null
  const price = quote?.priceUsd ?? null
  const ageMs = quote?.pairCreatedAt ? Date.now() - quote.pairCreatedAt : null
  const mcapKnown = quote?.marketCap != null
  const xchain = useXchain(pair)
  const tapeRows = tape.live && tape.trades.length
    ? tape.trades
    : seededTrades(pair?.tokenAddress ?? 'seed', pair?.symbol ?? '—')
  const railBalance = session?.balances?.[chain] ?? 3.421

  return (
    <div className="tk-root" style={accentStyle(chain)}>
      <div className="tk-aurora" aria-hidden="true" />
      <div className="tk-dots" aria-hidden="true" />
      <div className="tk-page">
        <div className="tk-wrap">
          {/* token header — SAME identity source as the rail (Fase 1.1) */}
          <section className="tk-panel tk-hero" data-chain={chain}>
            <div className="tk-hero-top">
              <TokenLogo src={quote?.logoUrl ?? pair?.logo ?? null} symbol={pair?.symbol ?? '?'} size={56} />
              <div className="tk-id">
                <div className="tk-name">
                  {/* P1 dual label: store meta vs live pair-base never overwrite
                      each other — both shown, one element, no interleave */}
                  {pair?.symbol ?? 'NO TOKEN SELECTED'}
                  {quote && pair && quote.token !== pair.symbol && (
                    <span className="tk-alias" title={`store meta vs live pair-base differ — both shown, verbatim`}>({quote.token})</span>
                  )}
                  <span className="tk-ticker">${pair?.symbol ?? '—'}</span>
                  <span className="tk-pair">{pair ? `${quote?.token ?? pair.symbol} / ${quote?.quote ?? NATIVE[chain]}` : '—'}</span>
                  {pair && (
                    <span className="tk-ca">CA: <abbr className="sw-abbr" title={pair.tokenAddress}>{shorten(pair.tokenAddress)}</abbr> <CopyBtn value={pair.tokenAddress} label="token address" /></span>
                  )}
                </div>
                <div className="tk-chips">
                  <span className="tk-chip pos">PRICE <b>{fmtPrice(price)}</b></span>
                  <span className="tk-chip">LIQUIDITY <b>{fmtUsd(quote?.liq)}</b></span>
                  <span className="tk-chip">VOLUME 24H <b>{fmtUsd(quote?.vol24)}</b></span>
                  <span className="tk-chip">AGE <b>{fmtAge(ageMs)}</b></span>
                  <span className="tk-chip" title={mcapKnown ? 'derived: price × supply (DexScreener marketCap field)' : 'no supply in the feed — never guessed'}>
                    MCAP <b>{mcapKnown ? fmtUsd(quote?.marketCap) : '—'}</b>
                  </span>
                  <span className="tk-chip" title={dexLabel(quote?.dexId)}>DEX <b>{dexLabel(quote?.dexId)}</b></span>
                </div>
              </div>
              {/* paste-CA lives HERE — Swap owns token selection; the global
                  topbar no longer redirects Scanner users to the swap page */}
              <div className="tk-hero-search">
                <AutodetectSearch />
              </div>
              <div className="tk-mc">
                <div className="l">{LIVE_CHAIN_LABEL[chain]} · {tape.live ? 'TAPE LIVE' : 'TAPE SEEDING'}</div>
                <div className="v mono">{railBalance.toFixed(3)} {NATIVE[chain]}</div>
                <div className="s">{WALLET_LABEL}</div>
              </div>
              {!quote && <span className="tk-mock" style={{ position: 'absolute', top: 12, right: 14 }}>{error ? 'NO QUOTE' : 'LOADING'}</span>}
            </div>
          </section>

          <div className="tk-main">
            <div className="tk-col-a">
              {/* chart — live OHLCV array; SEEDING watermark <5s, LIVE after.
                  TradingView layout: drawing tools LEFT (vertical), indicator
                  toolbar TOP, timeframe bar BOTTOM. */}
              <section ref={chartRef} className={`tk-panel tk-chart${chartFullscreen ? ' is-fullscreen' : ''}`} data-chain={chain}>
                <div className="tk-tools">
                  {([
                    ['cross', 'Crosshair', TOOL_ICONS.cross],
                    ['trend', 'Trend line', TOOL_ICONS.trend],
                    ['measure', 'Measure', TOOL_ICONS.measure],
                  ] as const).map(([t, title, icon]) => (
                    <button key={t} type="button" title={title} aria-label={title}
                      className={`tk-tool${tool === t ? ' on' : ''}`}
                      onClick={() => setTool(t)}>{icon}</button>
                  ))}
                </div>
                <div className="tk-chart-main">
                  <div className="tk-cb">
                    <span className="tk-cb-lbl">INDICATORS</span>
                    {INDICATOR_LEGEND.map((ind) => (
                      <button key={ind.id} type="button" title={ind.formula}
                        className={`tk-ind${inds[ind.id] ? ' on' : ''}`} data-ind={ind.id}
                        onClick={() => setInds((s) => ({ ...s, [ind.id]: !s[ind.id] }))}>
                        <i />{ind.label}{ind.id === 'rsi' && inds.rsi && lastRsi != null ? ` ${lastRsi.toFixed(0)}` : ''}
                      </button>
                    ))}
                    <span className="tk-watermark" data-state={ohlcv.state}>
                      {ohlcv.state === 'SEEDING' ? 'SEEDING…' : ohlcv.state === 'LIVE' ? 'LIVE · GECKOTERMINAL' : ohlcv.state === 'EMPTY' ? 'NO CANDLES' : 'FEED ERROR'}
                    </span>
                    <div className="tk-chart-actions" aria-label="chart view controls">
                      <button type="button" onClick={() => setChartZoom((z) => Math.max(1, +(z - .25).toFixed(2)))}
                        aria-label="zoom out" title="Zoom out">−</button>
                      <button type="button" className="tk-zoom-value" onClick={resetChartView}
                        aria-label="reset chart zoom" title="Reset zoom">{chartZoom.toFixed(2).replace('.00', '')}x</button>
                      <button type="button" onClick={() => setChartZoom((z) => Math.min(3, +(z + .25).toFixed(2)))}
                        aria-label="zoom in" title="Zoom in">+</button>
                      <span className="tk-action-sep" />
                      <button type="button" className="tk-full-btn" onClick={toggleChartFullscreen}
                        aria-label={chartFullscreen ? 'exit full chart' : 'open full chart'} title={chartFullscreen ? 'Exit full chart' : 'Open full chart'}>
                        {chartFullscreen ? 'EXIT' : 'FULL CHART'}
                      </button>
                    </div>
                  </div>
                  <div className="tk-canvas">
                    <div className="tk-overlay">{pair?.symbol ?? '—'} / {NATIVE[chain]} · O H L C V {ohlcv.state === 'LIVE' ? '· live' : ''}</div>
                    <ChartSvg candles={chart} state={ohlcv.state} showEma={inds.ema} showVwap={inds.vwap} zoom={chartZoom} />
                  </div>
                  <div className="tk-xaxis">
                    <span className="tk-tfs">
                      {OHLCV_RESOLUTIONS.map((r) => (
                        <button key={r} type="button" className={`tg${resolution === r ? ' on' : ''}`}
                          onClick={() => setResolution(r)}>{r}</button>
                      ))}
                    </span>
                    <span>{ohlcv.lastTs ? `${new Date(ohlcv.lastTs * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '—'}</span>
                    <span className="rgt">
                      {ohlcv.reason && <span className="sw-reason" title={ohlcv.reason}>{ohlcv.state}</span>}
                      <span className="tg on">auto</span>
                    </span>
                  </div>
                </div>
              </section>

              {/* bonding — GT pairs carry no graduated/bonding field (probed):
                  a number here would be invented, so it stays an em dash */}
              <section className="tk-panel tk-bond" data-chain={chain}>
                <ChainLogo chain={chain} size={26} />
                <span className="t">BONDING CURVE PROGRESS</span>
                <div className="rail"><i style={{ width: 0 }} /></div>
                <span className="pct">—</span>
                <abbr className="st" title="bonding progress: not in free feed — indexed source on roadmap">NOT IN FEED</abbr>
              </section>

              <section className="tk-panel">
                <div className="tk-tabsrow">
                  {['TRADES', 'HOLDERS', 'XCHAIN', 'SOCIALS'].map((t) => (
                    <span key={t} className={tab === t ? 'on' : ''}
                      onClick={() => setTab(t)} style={{ cursor: 'pointer' }}>{t}</span>
                  ))}
                  <span className="bubble">◉ BUBBLE MAP</span>
                </div>
                <div className="tk-table-wrap">
                  {tab === 'TRADES' && (
                    <table className="tk-table">
                      <thead>
                        <tr><th>ACCOUNT</th><th>TYPE</th><th>VALUE</th><th>DATE</th><th>TX</th></tr>
                      </thead>
                      <tbody>
                        {tapeRows.map((t, i) => {
                          const buy = t.kind === 'buy'
                          return (
                            <tr key={i}>
                              <td className="acc"><span className="dot" style={{ background: buy ? 'var(--brand-2)' : 'var(--rose)' }} />{t.wallet}</td>
                              <td className={buy ? 'buy' : 'sell'}>{buy ? 'BUY' : 'SELL'}</td>
                              <td>{t.usd != null ? fmtUsd(t.usd) : '—'}</td>
                              <td>{'ts' in t && typeof t.ts === 'string' && t.ts ? t.ts.slice(11, 19) : (t as { _ago?: string })._ago ?? '—'}</td>
                              <td className="tx">{t.tx ?? '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                  {tab === 'HOLDERS' && (
                    <div className="tk-simnote">
                      Holders have no $0 source on this terminal.
                      <span className="tk-mock">SIMULATED</span>
                      <p className="dim">Holder counts are not served by the free feeds (GeckoTerminal / DexScreener carry no holder endpoint). Nothing is invented here — the panel stays empty until a real source is wired.</p>
                    </div>
                  )}
                  {tab === 'XCHAIN' && (
                    <div className="tk-simnote">
                      {xchain.length
                        ? <>Also trading on: {xchain.map((c) => <span key={c.chain} className="tk-chip" title={`${c.symbol} · liq ${fmtUsd(c.liquidity_usd)}`}>{c.chain.toUpperCase()} <b>{c.symbol}</b></span>)}</>
                        : <span className="dim">No other live-feed pair found for this token on the other four chains.</span>}
                      <p className="dim">Source: /api/v1/detect on the token CA (DexScreener, $0).</p>
                    </div>
                  )}
                  {tab === 'SOCIALS' && (
                    <div className="tk-simnote">
                      {socials.state === 'LOADING' && <span className="dim">loading links…</span>}
                      {socials.state === 'LIVE' && (
                        <div className="sw-links">
                          {socials.websites.map((w) => (
                            <a key={w.url} className="tk-chip link" href={w.url} target="_blank" rel="noopener noreferrer"
                              title={w.url}>🌐 {w.label ?? 'Website'}</a>
                          ))}
                          {socials.links.map((l) => (
                            <a key={l.url} className="tk-chip link" href={l.url} target="_blank" rel="noopener noreferrer"
                              title={l.url}>
                              {l.type === 'twitter' ? '𝕏' : l.type === 'telegram' ? '✈' : l.type === 'discord' ? '🎮' : '🔗'} {l.type ?? 'link'}
                            </a>
                          ))}
                        </div>
                      )}
                      {socials.state === 'EMPTY' && <span className="dim">No official links in feed.</span>}
                      {socials.state === 'ERROR' && <span className="dim">links unavailable — {socials.reason}</span>}
                      <p className="dim">There will never be fake comments here — only links the feed actually returns.</p>
                    </div>
                  )}
                </div>
              </section>
            </div>

            <aside className="tk-rail-r">
              <SwapRail pair={pair} quote={quote} qErr={error} />

              <section className="tk-panel tk-info" data-chain={chain}>
                <div className="tk-phd">INFORMATION <span className="tk-live">REAL · DEXSCREENER</span></div>
                <div className="tk-info">
                  <div className="tk-info-row">
                    <TokenLogo src={socials.imageUrl ?? quote?.logoUrl ?? pair?.logo ?? null} symbol={pair?.symbol ?? '?'} size={40} />
                    <div className="tk-info-id">
                      <b>{pair?.name ?? pair?.symbol ?? '—'}</b>
                      <span>${pair?.symbol ?? '—'} · {LIVE_CHAIN_LABEL[chain]}</span>
                    </div>
                  </div>
                  <div className="tk-kv"><span>CREATED</span><b>{quote?.pairCreatedAt ? new Date(quote.pairCreatedAt).toISOString().slice(0, 10) : '—'}</b></div>
                  <div className="tk-kv"><span>AGE</span><b>{fmtAge(ageMs)}</b></div>
                  <div className="tk-kv"><span>MARKET CAP</span>
                    <b title={mcapKnown ? 'derived: price × supply (DexScreener marketCap field)' : 'no supply in the feed — never guessed'}>
                      {mcapKnown ? `${fmtUsd(quote?.marketCap)} · LIVE · DEXSCREENER (derived: price×supply)` : '—'}
                    </b></div>
                  <div className="tk-kv"><span>CREATOR</span><b title="creator address is not in the free feed — never guessed">—</b></div>
                  <span className="tk-badge">MEMECOIN</span>
                </div>
              </section>

              <section className="tk-panel" data-chain={chain}>
                <div className="tk-phd">MOVEMENT <span className="tk-live">REAL · DEXSCREENER</span></div>
                <div className="tk-grid2">
                  {[['1H', quote?.change?.h1], ['4H', quote?.change?.h6], ['24H', quote?.change?.h24], ['RSI', lastRsi]].map(([t, v]) => (
                    <div className="tk-cell" key={t as string}>
                      <span className="t">{t as string}</span>
                      <span className={`v ${((v as number | null) ?? 0) >= 0 ? 'pos' : 'neg'}`}>
                        {t === 'RSI' ? ((v as number | null) != null ? (v as number).toFixed(0) : '—')
                          : (v as number | null) != null ? `${(v as number) > 0 ? '+' : ''}${(v as number).toFixed(2)}%` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="tk-split">
                  <div className="tk-split-row"><span className="t">TXNS 24H</span>
                    <span className="b up">BUY {(quote?.txns24?.buys ?? 0).toLocaleString('en-US')}</span>
                    <span className="b dn">SELL {(quote?.txns24?.sells ?? 0).toLocaleString('en-US')}</span></div>
                  <div className="tk-split-bar">
                    <i className="up" style={{ width: `${pctBuys(quote)}%` }} />
                    <i className="dn" style={{ width: `${100 - pctBuys(quote)}%` }} />
                  </div>
                  <div className="tk-split-row"><span className="t">VOL 24H</span>
                    <span className="mono">{fmtUsd(quote?.vol24)}</span></div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}

function pctBuys(q: SwapQuote | null): number {
  const b = q?.txns24?.buys
  const s = q?.txns24?.sells
  if (!b || !s || b + s === 0) return 50
  return Math.round((b / (b + s)) * 100)
}

/* XCHAIN: where else does this token trade? = detect on the CA, minus the
   active chain (real $0 source, was already real, now wired to the tab) */
function useXchain(pair: ActivePair | null) {
  const [cands, setCands] = useState<{ chain: string; symbol: string | null; liquidity_usd: number | null }[]>([])
  useEffect(() => {
    let on = true
    const gen = getGeneration()
    const fresh = () => on && getGeneration() === gen
    setCands([])
    if (!pair) return
    fetch(`/api/v1/detect?address=${encodeURIComponent(pair.tokenAddress)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!fresh() || !j) return
        setCands(((j.candidates ?? []) as { chain: string; symbol: string | null; liquidity_usd: number | null }[])
          .filter((c) => c.chain !== pair.chain))
      })
      .catch(() => { /* tab renders its honest empty state */ })
    return () => { on = false }
  }, [pair])
  return cands
}

/* candle chart over the LIVE array; SEEDING keeps the page honest while the
   first answer is in flight (declared watermark in the toolbar) */
function ChartSvg({ candles, state, showEma, showVwap, zoom }: {
  candles: Candle[] | null; state: string; showEma: boolean; showVwap: boolean; zoom: number
}) {
  const W = 960, H = 400, PADR = 66, VOLH = 74, TOP = 12
  if (!candles || candles.length < 2) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="candlestick chart, awaiting live candles">
        <text x={W / 2} y={H / 2} textAnchor="middle" className="tk-wait">
          {state === 'SEEDING' ? 'SEEDING — first candles in flight…' : state === 'EMPTY' ? 'no candles in the free feed for this pool' : 'chart unavailable'}
        </text>
      </svg>
    )
  }
  const visibleCount = Math.max(2, Math.round(candles.length / zoom))
  const visibleCandles = candles.slice(-visibleCount)
  const hi = Math.max(...visibleCandles.map((b) => b.h))
  const lo = Math.min(...visibleCandles.map((b) => b.l))
  const vmax = Math.max(...visibleCandles.map((b) => b.v), 1e-9)
  const cw = (W - PADR - 16) / visibleCandles.length
  const y = (p: number) => TOP + ((hi - p) / (hi - lo || 1)) * (H - VOLH - TOP - 46)
  const last = visibleCandles[visibleCandles.length - 1]
  const closes = visibleCandles.map((b) => b.c)
  const emaLine = ema(closes, 12)
  const vwLine = vwap(visibleCandles)
  const grid = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="live candlestick chart, GeckoTerminal ohlcv">
      {grid.map((p, i) => (
        <g key={i}>
          <line x1={0} x2={W - PADR} y1={y(p)} y2={y(p)} stroke="var(--border-soft)" strokeDasharray="3 6" />
          <text x={W - PADR + 8} y={y(p) + 3} className="tk-yt">{fmtPrice(p)}</text>
        </g>
      ))}
      {visibleCandles.map((b, i) => {
        const x = 8 + i * cw + cw / 2
        const up = b.c >= b.o
        const col = up ? 'var(--brand-2)' : 'var(--rose)'
        const yTop = y(Math.max(b.o, b.c))
        const h = Math.max(1.5, Math.abs(y(b.o) - y(b.c)))
        return (
          <g key={b.ts}>
            <line x1={x} x2={x} y1={y(b.h)} y2={y(b.l)} stroke={col} strokeWidth="1" />
            <rect x={x - cw * 0.32} y={yTop} width={cw * 0.64} height={h} fill={col} rx="1" />
            <rect x={x - cw * 0.32} y={H - 18 - (b.v / vmax) * (VOLH - 26)} width={cw * 0.64}
              height={(b.v / vmax) * (VOLH - 26)} fill={col} opacity=".45" rx="1" />
          </g>
        )
      })}
      {/* indicators over the SAME live array (Fase 4, deterministic);
          each polyline obeys its toolbar toggle */}
      {showEma && (
        <polyline fill="none" stroke="var(--amber)" strokeWidth="1.2" opacity=".8"
          points={emaLine.map((v, i) => v != null ? `${8 + i * cw + cw / 2},${y(v)}` : null)
            .filter(Boolean).join(' ')} />
      )}
      {showVwap && (
        <polyline fill="none" stroke="var(--blue)" strokeWidth="1.2" opacity=".8"
          points={vwLine.map((v, i) => v != null ? `${8 + i * cw + cw / 2},${y(v)}` : null)
            .filter(Boolean).join(' ')} />
      )}
      <line x1={0} x2={W - PADR} y1={y(last.c)} y2={y(last.c)} stroke="var(--brand)" strokeDasharray="2 4" opacity=".7" />
      <rect x={W - PADR + 4} y={y(last.c) - 9} width={64} height={18} rx="4" fill="var(--brand)" />
      <text x={W - PADR + 36} y={y(last.c) + 4} textAnchor="middle" className="tk-ychip">{fmtPrice(last.c)}</text>
    </svg>
  )
}
