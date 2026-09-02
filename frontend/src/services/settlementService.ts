/**
 * Settlement Service (Slot D.4)
 * Read-only interface to backend settlement endpoints (/api/v1/swap/settlement*).
 *
 * HARD INVARIANT: NEVER calls external provider domains directly.
 * All data flows through internal SQLite backend or local demo fixtures.
 */

export type CanonicalState =
  | 'SUBMITTED_PENDING'
  | 'SOURCE_CONFIRMED'
  | 'SOLVER_FILLING'
  | 'DEST_CONFIRMED'
  | 'COMPLETED'
  | 'FAILED'
  | 'REFUND_AVAILABLE'
  | 'REFUNDED'
  | 'STUCK_UNKNOWN'
  | 'EXPIRED'
  | 'HOOD_UNAVAILABLE'

export interface SettlementEvent {
  id: number
  quote_id: string
  state_from: string
  state_to: string
  event_type: string
  reason?: string | null
  evidence_ref?: string | null
  created_at: string
}

export interface SettlementItem {
  quote_id: string
  wallet?: string | null
  provider?: string | null
  src_chain: string
  dest_chain: string
  state: CanonicalState | string
  reason?: string | null
  source_tx_hash?: string | null
  dest_tx_hash?: string | null
  source_explorer_link?: string | null
  dest_explorer_link?: string | null
  amount_in?: string | null
  amount_out_expected?: string | null
  amount_out_min?: string | null
  fee_expected_bps?: number | null
  created_at?: string | null
  updated_at?: string | null
}

export interface SettlementDetail extends SettlementItem {
  stuck_reason?: string | null
  claim_token?: string | null
  underlying_route_id?: string | null
  events: SettlementEvent[]
  sources?: string[]
}

export interface SettlementListResponse {
  items: SettlementItem[]
  count: number
  db_enabled: boolean
  generated_at: string
}

export interface StateStyle {
  label: string
  color: string
  bg: string
  border: string
  glow: string
  desc: string
}

export const STATE_STYLES: Record<string, StateStyle> = {
  SUBMITTED_PENDING: {
    label: 'SUBMITTED_PENDING',
    color: '#38bdf8', // cyan
    bg: 'rgba(56, 189, 248, 0.12)',
    border: 'rgba(56, 189, 248, 0.35)',
    glow: '0 0 14px rgba(56, 189, 248, 0.3)',
    desc: 'Source tx submitted to cluster/mempool, awaiting on-chain confirmation',
  },
  SOURCE_CONFIRMED: {
    label: 'SOURCE_CONFIRMED',
    color: '#fbbf24', // amber
    bg: 'rgba(251, 191, 36, 0.12)',
    border: 'rgba(251, 191, 36, 0.35)',
    glow: '0 0 14px rgba(251, 191, 36, 0.3)',
    desc: 'Confirmed on origin chain; waiting for bridge or destination fill',
  },
  SOLVER_FILLING: {
    label: 'SOLVER_FILLING',
    color: '#a855f7', // violet
    bg: 'rgba(168, 85, 247, 0.14)',
    border: 'rgba(168, 85, 247, 0.4)',
    glow: '0 0 14px rgba(168, 85, 247, 0.3)',
    desc: 'Bridge relayer / intent solver actively filling order on destination',
  },
  DEST_CONFIRMED: {
    label: 'DEST_CONFIRMED',
    color: '#34d399', // green
    bg: 'rgba(52, 211, 153, 0.14)',
    border: 'rgba(52, 211, 153, 0.4)',
    glow: '0 0 14px rgba(52, 211, 153, 0.3)',
    desc: 'Destination transaction observed and verified on-chain',
  },
  COMPLETED: {
    label: 'COMPLETED',
    color: '#00ffa3', // neon green
    bg: 'rgba(0, 255, 163, 0.16)',
    border: 'rgba(0, 255, 163, 0.55)',
    glow: '0 0 20px rgba(0, 255, 163, 0.45)',
    desc: 'Settlement complete with full destination receipt and slippage satisfaction',
  },
  FAILED: {
    label: 'FAILED',
    color: '#f87171', // red
    bg: 'rgba(248, 113, 113, 0.14)',
    border: 'rgba(248, 113, 113, 0.4)',
    glow: '0 0 14px rgba(248, 113, 113, 0.3)',
    desc: 'Execution reverted or provider route rejected',
  },
  REFUND_AVAILABLE: {
    label: 'REFUND_AVAILABLE',
    color: '#fb923c', // orange
    bg: 'rgba(251, 146, 60, 0.14)',
    border: 'rgba(251, 146, 60, 0.4)',
    glow: '0 0 14px rgba(251, 146, 60, 0.3)',
    desc: 'Origin swap unfulfilled; refund claimable by user/caller',
  },
  REFUNDED: {
    label: 'REFUNDED',
    color: '#2dd4bf', // teal
    bg: 'rgba(45, 212, 191, 0.14)',
    border: 'rgba(45, 212, 191, 0.4)',
    glow: '0 0 14px rgba(45, 212, 191, 0.3)',
    desc: 'Funds safely returned to source wallet on origin chain',
  },
  STUCK_UNKNOWN: {
    label: 'STUCK_UNKNOWN',
    color: '#f43f5e', // magenta/rose
    bg: 'rgba(244, 63, 94, 0.16)',
    border: 'rgba(244, 63, 94, 0.5)',
    glow: '0 0 18px rgba(244, 63, 94, 0.4)',
    desc: 'Honest degradation — destination evidence unverified or polling timeout reached',
  },
  EXPIRED: {
    label: 'EXPIRED',
    color: '#94a3b8', // grey
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.3)',
    glow: 'none',
    desc: 'Quote window expired before source transaction broadcast',
  },
  HOOD_UNAVAILABLE: {
    label: 'HOOD_UNAVAILABLE',
    color: '#64748b', // slate
    bg: 'rgba(100, 116, 139, 0.12)',
    border: 'rgba(100, 116, 139, 0.3)',
    glow: 'none',
    desc: 'Robinhood chain not wired (chain_id: null); settlement unavailable',
  },
}

export function getStateStyle(state: string): StateStyle {
  const norm = state.toUpperCase().replace(/\s+/g, '_')
  return (
    STATE_STYLES[norm] ?? {
      label: norm,
      color: '#94a3b8',
      bg: 'rgba(148, 163, 184, 0.12)',
      border: 'rgba(148, 163, 184, 0.3)',
      glow: 'none',
      desc: 'Unknown state',
    }
  )
}

/**
 * Deterministic narrator explaining settlement status from state invariants.
 * No LLM hallucinations: every word is derived directly from state evidence.
 */
export function getDeterministicNarrative(item?: SettlementItem | null, detail?: SettlementDetail | null): {
  headline: string
  body: string
  badge: string
  severity: 'info' | 'warn' | 'success' | 'danger'
} {
  if (!item) {
    return {
      headline: 'Awaiting Settlement Selection',
      body: 'Select a settlement quote from the queue to inspect lifecycle events, cryptographic proofs, and 3D pipeline routing.',
      badge: 'STANDBY',
      severity: 'info',
    }
  }

  const s = String(item.state).toUpperCase()
  const isSameChain = item.src_chain === item.dest_chain
  const hasDestTx = Boolean(item.dest_tx_hash || detail?.dest_tx_hash)

  switch (s) {
    case 'SUBMITTED_PENDING':
      return {
        headline: 'Transaction In Flight (Unconfirmed)',
        body: 'Source deposit has been broadcast to mempool. Invariant guard active: source submission never equals completed.',
        badge: 'BROADCAST_PENDING',
        severity: 'info',
      }
    case 'SOURCE_CONFIRMED':
      return {
        headline: 'Origin Settled — Awaiting Bridge Fill',
        body: isSameChain
          ? 'Transaction recorded on origin block. Validating execution receipt.'
          : 'Source deposit confirmed on origin block. Bridge relayer or intent solver must now provide destination liquidity.',
        badge: 'SOURCE_SETTLED',
        severity: 'warn',
      }
    case 'SOLVER_FILLING':
      return {
        headline: 'Bridge Relayer / Solver Active',
        body: `Order is being processed by ${item.provider?.toUpperCase() || 'bridge solver'}. No destination receipt confirmed yet.`,
        badge: 'FILLING_LIQUIDITY',
        severity: 'info',
      }
    case 'DEST_CONFIRMED':
      return {
        headline: 'Destination Receipt Verified',
        body: hasDestTx
          ? `Destination transaction confirmed on-chain. Ready for final policy receipt closure.`
          : `Destination fill reported by provider, validating on-chain receipt hash.`,
        badge: 'RECEIPT_CONFIRMED',
        severity: 'success',
      }
    case 'COMPLETED':
      return {
        headline: 'Full Non-Custodial Settlement Finalized',
        body: 'Both origin and destination cryptographically proven. Slippage tolerance met, state machine reached terminal success.',
        badge: 'FINAL_COMPLETED',
        severity: 'success',
      }
    case 'FAILED':
      return {
        headline: 'Execution Reverted on Chain',
        body: item.reason
          ? `Transaction failed: ${item.reason}. Non-custodial law: inspect refund availability.`
          : 'Transaction reverted during execution.',
        badge: 'REVERTED',
        severity: 'danger',
      }
    case 'REFUND_AVAILABLE':
      return {
        headline: 'Refund Path Unlocked',
        body: 'Origin swap unfulfilled by bridge/solver. Refund claimable through provider emergency contract or VAA claim.',
        badge: 'ACTION_REQUIRED',
        severity: 'warn',
      }
    case 'REFUNDED':
      return {
        headline: 'Deposit Safely Returned',
        body: 'Principal funds returned to user origin wallet. Non-custodial capital protection satisfied.',
        badge: 'RESTORED',
        severity: 'info',
      }
    case 'STUCK_UNKNOWN':
      return {
        headline: 'Honest Degradation: State Ambiguous',
        body: 'Timeout reached without verifiable destination evidence. Fail-closed law: degraded honestly to STUCK_UNKNOWN, never assumed successful.',
        badge: 'HONEST_STUCK',
        severity: 'danger',
      }
    case 'EXPIRED':
      return {
        headline: 'Quote Expired Without Action',
        body: 'Quote lifecycle TTL expired before deposit transaction broadcast.',
        badge: 'TTL_EXPIRED',
        severity: 'info',
      }
    case 'HOOD_UNAVAILABLE':
      return {
        headline: 'Chain Not Wired',
        body: 'Robinhood chain (chain_id: null) rejected at quote boundary. No on-chain settlement state created.',
        badge: 'NO_OP',
        severity: 'info',
      }
    default:
      return {
        headline: `State: ${s}`,
        body: item.reason || 'Processing settlement lifecycle.',
        badge: 'ACTIVE',
        severity: 'info',
      }
  }
}

/**
 * Fetch list of settlements from internal backend API only.
 */
export async function fetchSettlements(params?: {
  quote_id?: string
  wallet?: string
  chain?: string
  state?: string
  provider?: string
  stuck?: boolean
  limit?: number
}): Promise<SettlementListResponse> {
  const query = new URLSearchParams()
  if (params?.quote_id) query.set('quote_id', params.quote_id)
  if (params?.wallet) query.set('wallet', params.wallet)
  if (params?.chain) query.set('chain', params.chain)
  if (params?.state) query.set('state', params.state)
  if (params?.provider) query.set('provider', params.provider)
  if (params?.stuck) query.set('stuck', 'true')
  if (params?.limit) query.set('limit', String(params.limit))

  const qs = query.toString()
  const url = `/api/v1/swap/settlements${qs ? `?${qs}` : ''}`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch settlements: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

/**
 * Fetch single settlement detail and audit trail events from internal backend API only.
 */
export async function fetchSettlementDetail(quoteId: string): Promise<SettlementDetail> {
  const url = `/api/v1/swap/settlement/${encodeURIComponent(quoteId)}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch settlement detail for ${quoteId}: ${res.status} ${res.statusText}`)
  }
  return res.json()
}
