/* swapCapabilities.ts — browser adapter for the T2 chain-aware swap
   capability registry (GET /api/v1/swap/capabilities, providers/swap_policy.py).
   The backend is the SINGLE source of truth for per-chain execution status:
   the rail never derives or caches an execution claim client-side. null on
   failure → the caller keeps quiet instead of inventing a capability state. */

export interface SwapChainCapability {
  chain: string
  name: string
  namespace: string
  caip2: string | null
  native_symbol: string | null
  execution_status: string
  reason: string
  provider_candidates: string[]
}

export interface SwapCapabilities {
  data_mode: string
  chains: SwapChainCapability[]
  provider_allowlist: string[]
  max_slippage_bps: number
  execution_enabled: boolean
  honest_note: string
}

export async function fetchSwapCapabilities(): Promise<SwapCapabilities | null> {
  try {
    const r = await fetch('/api/v1/swap/capabilities')
    if (!r.ok) return null
    const j = (await r.json()) as unknown
    if (typeof j !== 'object' || j === null || !Array.isArray((j as SwapCapabilities).chains)) return null
    return j as SwapCapabilities
  } catch {
    return null
  }
}

/* ── server route quote (T2): an EXACT-IN quote for the typed amount ──
   Only responses carrying a real amount_out are surfaced (data_mode=live);
   unwired/degraded responses map to null → the rail silently keeps its
   DexScreener estimate and never invents a quote. */
export interface ServerQuote {
  data_mode: string
  amount_out: string | null
  minimum_received: string | null
  provider_quoted: string | null
  quote_id: string | null
  route: string[]
  degraded: string | null
  execution_status: string
}

export interface ServerQuoteParams {
  chain: string
  tokenIn: string
  tokenOut: string
  amountIn: string
  slippageBps: number
}

export async function fetchServerQuote(p: ServerQuoteParams): Promise<ServerQuote | null> {
  try {
    const q = new URLSearchParams({
      source_chain: p.chain, destination_chain: p.chain,
      token_in: p.tokenIn, token_out: p.tokenOut,
      amount_in: p.amountIn, slippage_bps: String(p.slippageBps),
    })
    const r = await fetch(`/api/v1/swap/quote?${q.toString()}`)
    if (!r.ok) return null
    const j = (await r.json()) as unknown
    if (typeof j !== 'object' || j === null) return null
    const quote = j as ServerQuote
    if (quote.data_mode !== 'live' || quote.amount_out == null) return null
    return quote
  } catch {
    return null
  }
}
