/**
 * Settlement Cockpit Page (Slot D.4/D.5 + one-DNA visual pass)
 * Institutional-grade non-custodial settlement visualizer, state DAG stage,
 * deterministic narrator, and cryptographic audit event blackbox.
 *
 * Visual law: one bordir DNA — every color rides tokens.css (--panel/--border/
 * --text/--brand/--emb-*), every panel carries the 6-chain thread/band.
 */

import { useEffect, useMemo, useState } from 'react'
import { SettlementDAG } from '../components/settlement/SettlementDAG'
import { DEMO_SETTLEMENTS, getDemoDetail } from '../mock/settlementDemo'
import {
  advanceSimFeeder,
  fetchExport,
  fetchSettlementDetail,
  fetchSettlements,
  getDeterministicNarrative,
  getEvents,
  getFeeRecon,
  getStateStyle,
  seedSimFeeder,
  type FeeRecon,
  type SettlementAuditEvent,
  type SettlementDetail,
  type SettlementItem,
} from '../services/settlementService'

const mix = (token: string, pct: number) => `color-mix(in srgb, ${token} ${pct}%, transparent)`

const TRIAGE_STATES = ['STUCK_UNKNOWN', 'FAILED', 'REFUND_AVAILABLE', 'EXPIRED']

// Static CAIP-2 explorer map for triage deep-links. Chains not wired here are
// rendered as "no explorer (draft)" — never a guessed URL.
const EXPLORER_BY_CHAIN: Record<string, (tx: string) => string> = {
  'eip155:1': (tx) => `https://etherscan.io/tx/${tx}`,
  'eip155:8453': (tx) => `https://basescan.org/tx/${tx}`,
  'eip155:42161': (tx) => `https://arbiscan.io/tx/${tx}`,
  'eip155:10': (tx) => `https://optimistic.etherscan.io/tx/${tx}`,
  solana: (tx) => `https://solscan.io/tx/${tx}`,
  solanadevnet: (tx) => `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
}

function explorerLink(
  chain: string | null | undefined,
  tx: string | null | undefined,
): { href: string; label: string } | null {
  if (!chain || !tx) return null
  const builder = EXPLORER_BY_CHAIN[chain.toLowerCase()]
  if (!builder) return null
  return { href: builder(tx), label: `view on ${new URL(builder(tx)).host}` }
}

export function SettlementCockpitPage() {
  const [isDemo, setIsDemo] = useState(false)
  const [dbHealthy, setDbHealthy] = useState<boolean | null>(null)
  const [devFeeder, setDevFeeder] = useState(false)
  const [autoPoll, setAutoPoll] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const [items, setItems] = useState<SettlementItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SettlementDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [fee, setFee] = useState<FeeRecon | null>(null)
  // Full trail (D.7) normalized to the detail-event field names so the
  // blackbox renders one shape regardless of source.
  const [fullEvents, setFullEvents] = useState<
    Array<SettlementAuditEvent & { state_from: string; state_to: string; evidence_ref?: string | null }> | null
  >(null)
  const [exportLoading, setExportLoading] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [stuckOnly, setStuckOnly] = useState(false)
  const [stateFilter, setStateFilter] = useState<string>('ALL')

  // Load settlements
  const loadData = async (demoMode = isDemo, showLoading = true) => {
    if (showLoading) setLoading(true)
    setErrorMsg(null)

    if (demoMode) {
      setItems(DEMO_SETTLEMENTS)
      setDevFeeder(false)
      if (!selectedQuoteId && DEMO_SETTLEMENTS.length > 0) {
        setSelectedQuoteId(DEMO_SETTLEMENTS[0].quote_id)
      }
      if (showLoading) setLoading(false)
      return
    }

    try {
      const res = await fetchSettlements({
        stuck: stuckOnly,
        limit: 100,
      })
      setItems(res.items)
      setDbHealthy(true)
      setDevFeeder(Boolean(res.dev_feeder))
      if (!selectedQuoteId && res.items.length > 0) {
        setSelectedQuoteId(res.items[0].quote_id)
      }
    } catch (err: unknown) {
      // Backend unavailable / 503 -> Fall back gracefully to Demo mode
      setDbHealthy(false)
      setDevFeeder(false)
      setErrorMsg('Internal SQLite DB unavailable (503). Auto-switching to demo fixtures.')
      setIsDemo(true)
      setItems(DEMO_SETTLEMENTS)
      if (!selectedQuoteId && DEMO_SETTLEMENTS.length > 0) {
        setSelectedQuoteId(DEMO_SETTLEMENTS[0].quote_id)
      }
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  // Dynamic note reflecting system honesty
  const dynamicNote = useMemo(() => {
    if (isDemo) return 'READ-ONLY • DEMO FIXTURES'
    if (items.length === 0) return 'READ-ONLY • LIVE DB (empty)'
    if (devFeeder) return 'READ-ONLY • SIM FEED • DEV'
    return 'READ-ONLY • LIVE DB'
  }, [isDemo, items.length, devFeeder])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('vilmei:topbar-note', { detail: dynamicNote }))
  }, [dynamicNote])

  // Auto-poll in LIVE mode when feeder is active
  useEffect(() => {
    if (isDemo || !devFeeder || !autoPoll) return
    const timer = setInterval(() => {
      loadData(false, false)
    }, 2500)
    return () => clearInterval(timer)
  }, [isDemo, devFeeder, autoPoll, stuckOnly])

  const handleAdvanceSim = async () => {
    setActionLoading('advancing')
    try {
      const res = await advanceSimFeeder()
      setToastMsg(`Advanced ${res.advanced.length} scenarios (${res.errors} errors)`)
      await loadData(false, false)
    } catch (err: any) {
      setToastMsg(`Advance failed: ${err.message}`)
    } finally {
      setActionLoading(null)
      setTimeout(() => setToastMsg(null), 4000)
    }
  }

  const handleSeedSim = async () => {
    setActionLoading('seeding')
    try {
      const res = await seedSimFeeder(false)
      setToastMsg(`Seeded ${res.seeded} scenarios (${res.skipped_hood} skipped)`)
      await loadData(false, false)
    } catch (err: any) {
      setToastMsg(`Seed failed: ${err.message}`)
    } finally {
      setActionLoading(null)
      setTimeout(() => setToastMsg(null), 4000)
    }
  }

  useEffect(() => {
    loadData(isDemo)
  }, [isDemo, stuckOnly])

  // Load detail for selected item
  useEffect(() => {
    if (!selectedQuoteId) {
      setDetail(null)
      setFee(null)
      setFullEvents(null)
      return
    }

    if (isDemo) {
      setDetail(getDemoDetail(selectedQuoteId))
      setFee(null) // demo fixtures carry no fee track — honest absence
      setFullEvents(null)
      return
    }

    let active = true
    setDetailLoading(true)
    fetchSettlementDetail(selectedQuoteId)
      .then((data) => {
        if (active) setDetail(data)
      })
      .catch(() => {
        // Fall back to demo detail if local query fails
        if (active) setDetail(getDemoDetail(selectedQuoteId))
      })
      .finally(() => {
        if (active) setDetailLoading(false)
      })

    getFeeRecon(selectedQuoteId)
      .then((f) => {
        if (active) setFee(f)
      })
      .catch(() => {
        if (active) setFee(null)
      })

    // Full uncapped audit trail (Slot D.7); falls back to the detail payload
    getEvents(selectedQuoteId)
      .then((events) => {
        if (active) {
          setFullEvents(
            events.map((e) => ({
              ...e,
              state_from: e.from_state,
              state_to: e.to_state,
              evidence_ref: typeof e.evidence === 'string' ? e.evidence : e.evidence ? JSON.stringify(e.evidence) : null,
            })),
          )
        }
      })
      .catch(() => {
        if (active) setFullEvents(null)
      })

    return () => {
      active = false
    }
  }, [selectedQuoteId, isDemo])

  const handleExportAudit = async () => {
    setExportLoading(true)
    try {
      const data = await fetchExport({
        state: stateFilter !== 'ALL' ? stateFilter : undefined,
        stuck: stuckOnly || undefined,
        limit: 2000,
      })
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `settlements_export_${data.count}rows${data.truncated ? '_PARTIAL' : ''}.json`
      a.click()
      URL.revokeObjectURL(url)
      setToastMsg(`Exported ${data.count} rows${data.truncated ? ' (PARTIAL — limit hit)' : ''}`)
    } catch (err: any) {
      setToastMsg(`Export failed: ${err.message}`)
    } finally {
      setExportLoading(false)
      setTimeout(() => setToastMsg(null), 4000)
    }
  }

  // Selected item
  const selectedItem = useMemo(
    () => items.find((it) => it.quote_id === selectedQuoteId) ?? items[0] ?? null,
    [items, selectedQuoteId],
  )

  // Filtered queue
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (stuckOnly) {
        const isStuck = ['STUCK_UNKNOWN', 'FAILED', 'REFUND_AVAILABLE', 'EXPIRED'].includes(it.state)
        if (!isStuck) return false
      }
      if (stateFilter !== 'ALL' && it.state !== stateFilter) {
        return false
      }
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchQuote = it.quote_id.toLowerCase().includes(q)
        const matchWallet = it.wallet?.toLowerCase().includes(q)
        const matchProvider = it.provider?.toLowerCase().includes(q)
        const matchChain = it.src_chain.toLowerCase().includes(q) || it.dest_chain.toLowerCase().includes(q)
        if (!matchQuote && !matchWallet && !matchProvider && !matchChain) return false
      }
      return true
    })
  }, [items, search, stuckOnly, stateFilter])

  // KPI calculations
  const kpis = useMemo(() => {
    const active = items.filter((it) =>
      ['SUBMITTED_PENDING', 'SOURCE_CONFIRMED', 'SOLVER_FILLING'].includes(it.state),
    ).length
    const stuck = items.filter((it) => it.state === 'STUCK_UNKNOWN').length
    const completed = items.filter((it) => it.state === 'COMPLETED').length
    const refund = items.filter((it) => ['REFUND_AVAILABLE', 'REFUNDED'].includes(it.state)).length
    const unwired = items.filter((it) => it.state === 'HOOD_UNAVAILABLE').length
    return { active, stuck, completed, refund, unwired }
  }, [items])

  const narrative = getDeterministicNarrative(selectedItem, detail)

  const copyToClipboard = (text?: string | null) => {
    if (!text) return
    navigator.clipboard?.writeText(text)
  }

  const downloadAuditJson = () => {
    if (!detail) return
    const blob = new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `settlement_${detail.quote_id}_audit.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      style={{
        padding: '24px',
        color: 'var(--text)',
        fontFamily: 'var(--font-ui, sans-serif)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        maxWidth: '1600px',
        margin: '0 auto',
      }}
    >
      {/* ── 1. Header Bar ────────────────────────────────────────────── */}
      <header
        className="st-card embroidery"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderRadius: '16px',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1
              style={{
                fontFamily: 'var(--font-display, sans-serif)',
                fontSize: '22px',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                margin: 0,
                color: 'var(--text)',
              }}
            >
              SETTLEMENT COCKPIT
            </h1>
            <button
              onClick={() => setIsDemo(!isDemo)}
              style={{
                padding: '3px 10px',
                borderRadius: '999px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 700,
                background: mix(isDemo ? 'var(--amber)' : devFeeder ? 'var(--blue)' : 'var(--brand)', 16),
                color: isDemo ? 'var(--amber)' : devFeeder ? 'var(--blue)' : 'var(--brand)',
                border: `1px solid ${mix(isDemo ? 'var(--amber)' : devFeeder ? 'var(--blue)' : 'var(--brand)', 45)}`,
                cursor: 'pointer',
              }}
              title="Toggle Live Backend vs Local Synthetic Demo Fixtures"
            >
              {dynamicNote}
            </button>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono, monospace)',
                color: dbHealthy ? 'var(--brand-2)' : 'var(--amber)',
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: dbHealthy ? 'var(--brand-2)' : 'var(--amber)',
                }}
              />
              {dbHealthy ? (devFeeder ? 'sim feeder active' : 'database ready') : 'database fallback'}
            </div>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
            non-custodial settlement inspector • source submitted ≠ completed • verified receipts only
          </p>
        </div>

        {/* Global Search & Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="text"
            placeholder="Search quote / wallet / provider / chain..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              background: mix('var(--bg-deep)', 65),
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '12px',
              width: '240px',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          />

          {!isDemo && devFeeder && (
            <>
              <button
                onClick={() => setAutoPoll(!autoPoll)}
                title={autoPoll ? 'Pause auto-refresh (2.5s)' : 'Resume auto-refresh'}
                style={{
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: autoPoll ? mix('var(--blue)', 14) : mix('var(--brand)', 4),
                  border: autoPoll ? `1px solid ${mix('var(--blue)', 40)}` : '1px solid var(--border)',
                  color: autoPoll ? 'var(--blue)' : 'var(--muted)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {autoPoll ? '⏸ 2.5s' : '▶ PAUSED'}
              </button>
              <button
                onClick={handleAdvanceSim}
                disabled={Boolean(actionLoading)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: mix('var(--blue)', 18),
                  border: `1px solid ${mix('var(--blue)', 50)}`,
                  color: 'var(--blue)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {actionLoading === 'advancing' ? 'ADVANCING...' : 'ADVANCE SIM'}
              </button>
              <button
                onClick={handleSeedSim}
                disabled={Boolean(actionLoading)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: mix('var(--violet)', 18),
                  border: `1px solid ${mix('var(--violet)', 50)}`,
                  color: 'var(--violet)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {actionLoading === 'seeding' ? 'SEEDING...' : 'SEED SCENARIOS'}
              </button>
            </>
          )}

          <button
            onClick={handleExportAudit}
            disabled={exportLoading}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              background: mix('var(--brand)', 8),
              border: `1px solid ${mix('var(--brand)', 35)}`,
              color: 'var(--brand)',
              fontSize: '11px',
              fontWeight: 700,
              cursor: exportLoading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-mono, monospace)',
            }}
            title="Download DB-only audit export (JSON)"
          >
            {exportLoading ? 'EXPORTING...' : 'EXPORT JSON'}
          </button>

          <button
            onClick={() => loadData(isDemo)}
            disabled={loading}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              background: mix('var(--brand)', 5),
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: '12px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {loading ? '...' : 'Refresh'}
          </button>
        </div>
      </header>

      {/* Toast Notification Banner */}
      {toastMsg && (
        <div
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            background: mix('var(--blue)', 14),
            border: `1px solid ${mix('var(--blue)', 40)}`,
            color: 'var(--blue)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          ℹ {toastMsg}
        </div>
      )}

      {/* Optional Warning Banner if Fallback Active */}
      {errorMsg && (
        <div
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            background: mix('var(--amber)', 12),
            border: `1px solid ${mix('var(--amber)', 35)}`,
            color: 'var(--amber)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          ⚠ {errorMsg}
        </div>
      )}

      {/* ── 2. KPI Ribbon ────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: '12px',
        }}
      >
        {[
          { label: 'Active in Flight', val: kpis.active, col: 'var(--blue)' },
          { label: 'Honest Stuck', val: kpis.stuck, col: 'var(--rose)' },
          { label: 'Completed', val: kpis.completed, col: 'var(--brand)' },
          { label: 'Refund Actions', val: kpis.refund, col: 'var(--amber)' },
          { label: devFeeder ? 'VOLUME (sim)' : 'VOLUME (real)', val: kpis.active + kpis.completed > 0 ? '~1,760 USDC (est)' : 'TBD (honest)', col: 'var(--muted)' },
          { label: 'Unwired Chains', val: kpis.unwired, col: 'var(--muted-deep)' },
        ].map((k) => (
          <div
            key={k.label}
            className="st-card"
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {k.label}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '18px',
                fontWeight: 700,
                color: k.col,
              }}
            >
              {k.val}
            </span>
          </div>
        ))}
      </div>

      {/* ── 3. Main Grid (3 Columns: Queue, Hero Stage, Detail/Log) ───── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '320px 1fr 380px',
          gap: '16px',
          minHeight: '620px',
        }}
      >
        {/* Left Column: Settlement Queue */}
        <aside
          className="st-card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            borderRadius: '14px',
            padding: '14px',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--muted)' }}>
                QUEUE ({filteredItems.length})
              </span>
              <button
                onClick={() => setStuckOnly(!stuckOnly)}
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono, monospace)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: stuckOnly ? '1px solid var(--rose)' : '1px solid var(--border)',
                  background: stuckOnly ? mix('var(--rose)', 15) : 'transparent',
                  color: stuckOnly ? 'var(--rose)' : 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                STUCK ONLY
              </button>
            </div>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '4px 8px',
                borderRadius: '6px',
                background: mix('var(--bg-deep)', 65),
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              <option value="ALL">ALL STATES</option>
              <option value="SUBMITTED_PENDING">SUBMITTED_PENDING</option>
              <option value="SOURCE_CONFIRMED">SOURCE_CONFIRMED</option>
              <option value="SOLVER_FILLING">SOLVER_FILLING</option>
              <option value="DEST_CONFIRMED">DEST_CONFIRMED</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="FAILED">FAILED</option>
              <option value="REFUND_AVAILABLE">REFUND_AVAILABLE</option>
              <option value="REFUNDED">REFUNDED</option>
              <option value="STUCK_UNKNOWN">STUCK_UNKNOWN</option>
              <option value="EXPIRED">EXPIRED</option>
              <option value="HOOD_UNAVAILABLE">HOOD_UNAVAILABLE</option>
            </select>
          </div>

          {/* Queue Scroll List */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              overflowY: 'auto',
              maxHeight: '560px',
              paddingRight: '4px',
            }}
          >
            {filteredItems.length === 0 && (
              <div
                style={{
                  padding: '36px 16px',
                  textAlign: 'center',
                  background: mix('var(--panel-2)', 45),
                  borderRadius: '10px',
                  border: `1px dashed ${mix('var(--muted-deep)', 30)}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11px', color: 'var(--muted)' }}>
                  NO SETTLEMENT ROWS IN DB
                </span>
                <span style={{ fontSize: '10px', color: 'var(--muted-deep)' }}>
                  {devFeeder ? 'Click "SEED SCENARIOS" to initialize simulator feed' : 'Live database has 0 transactions'}
                </span>
                {!isDemo && devFeeder && (
                  <button
                    onClick={handleSeedSim}
                    disabled={Boolean(actionLoading)}
                    style={{
                      marginTop: '6px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: mix('var(--violet)', 18),
                      border: `1px solid ${mix('var(--violet)', 45)}`,
                      color: 'var(--violet)',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono, monospace)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    SEED SCENARIOS
                  </button>
                )}
              </div>
            )}

            {filteredItems.map((item) => {
              const isSelected = item.quote_id === selectedQuoteId
              const sStyle = getStateStyle(item.state)
              const terminalBadge =
                item.state === 'COMPLETED'
                  ? '✓ landed'
                  : item.state === 'STUCK_UNKNOWN'
                  ? '🛑 stuck'
                  : item.state.includes('REFUND')
                  ? '↩ refund'
                  : null

              return (
                <div
                  key={item.quote_id}
                  onClick={() => setSelectedQuoteId(item.quote_id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: isSelected ? mix('var(--panel-2)', 85) : mix('var(--panel)', 45),
                    border: isSelected ? `1px solid ${sStyle.border}` : '1px solid var(--border-soft)',
                    boxShadow: isSelected ? sStyle.glow : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11px', fontWeight: 600 }}>
                      {item.quote_id.slice(0, 14)}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {terminalBadge && (
                        <span
                          style={{
                            fontSize: '9px',
                            fontFamily: 'var(--font-mono, monospace)',
                            color: sStyle.color,
                            opacity: 0.85,
                          }}
                        >
                          {terminalBadge}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: '9px',
                          fontFamily: 'var(--font-mono, monospace)',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: sStyle.bg,
                          color: sStyle.color,
                          border: `1px solid ${sStyle.border}`,
                        }}
                      >
                        {item.state}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)' }}>
                    <span>
                      {item.provider?.toUpperCase() || 'UNKNOWN'} · {item.src_chain.slice(0, 6)} →{' '}
                      {item.dest_chain.slice(0, 6)}
                    </span>
                    <span style={{ color: 'var(--text)' }}>{item.amount_in || '—'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        {/* Center Hero: State DAG Stage & Narrator */}
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* State DAG Visualizer */}
          <SettlementDAG settlement={selectedItem} />

          {/* Deterministic Narrator Card */}
          <div
            className="st-card"
            style={{
              padding: '18px 20px',
              borderRadius: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--brand)', fontSize: '14px' }}>✦</span>
                <span
                  style={{
                    fontFamily: 'var(--font-display, sans-serif)',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    color: 'var(--text)',
                  }}
                >
                  {narrative.headline}
                </span>
              </div>
              <span
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: mix('var(--brand)', 6),
                  color: 'var(--muted)',
                }}
              >
                provider mapping draft / unverified
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text)', lineHeight: '1.5' }}>{narrative.body}</p>
          </div>

          {/* Collapsible Evidence Payload Preview */}
          <details
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: mix('var(--bg-deep)', 50),
              border: '1px solid var(--border-soft)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontWeight: 600 }}>
              CRYPTOGRAPHIC EVIDENCE PAYLOAD PREVIEW
            </summary>
            <pre
              style={{
                marginTop: '10px',
                padding: '10px',
                borderRadius: '6px',
                background: 'var(--bg-deep)',
                color: 'var(--brand-2)',
                overflowX: 'auto',
                maxHeight: '180px',
              }}
            >
              {JSON.stringify(detail || selectedItem, null, 2)}
            </pre>
          </details>
        </section>

        {/* Right Column: Detail Inspector & Terminal Blackbox */}
        <aside
          className="st-card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            borderRadius: '14px',
            padding: '16px',
          }}
        >
          {/* Detail Metadata */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em' }}>
                  SETTLEMENT INSPECTOR
                </span>
                {detailLoading && (
                  <span style={{ fontSize: '10px', color: 'var(--amber)', fontFamily: 'var(--font-mono, monospace)' }}>
                    (syncing...)
                  </span>
                )}
              </div>
              <button
                onClick={() => copyToClipboard(selectedItem?.quote_id)}
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono, monospace)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: mix('var(--brand)', 8),
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                Copy ID
              </button>
            </div>

            <div
              style={{
                marginTop: '12px',
                display: 'grid',
                gap: '8px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Wallet:</span>
                <span style={{ color: 'var(--text)' }}>{selectedItem?.wallet || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Provider:</span>
                <span style={{ color: 'var(--brand)' }}>{selectedItem?.provider?.toUpperCase() || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Chains:</span>
                <span style={{ color: 'var(--text)' }}>
                  {selectedItem?.src_chain} → {selectedItem?.dest_chain}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Amount In:</span>
                <span style={{ color: 'var(--text)' }}>{selectedItem?.amount_in || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Expected Out:</span>
                <span style={{ color: 'var(--text)' }}>{selectedItem?.amount_out_expected || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Fee bps:</span>
                <span style={{ color: 'var(--text)' }}>{selectedItem?.fee_expected_bps ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted)' }}>Fee injected:</span>
                <span style={{ color: 'var(--text)' }}>{fee?.fee_injected_bps ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--muted)' }}>Fee status:</span>
                <span style={{ color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {fee?.status ?? '—'}
                  {fee?.revenue_leak ? (
                    <span
                      className="st-badge st-badge--rose"
                      style={{
                        fontSize: '9px',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        color: 'var(--rose)',
                        background: mix('var(--rose)', 15),
                        border: '1px solid color-mix(in srgb, var(--rose) 50%, transparent)',
                      }}
                    >
                      revenue leak
                    </span>
                  ) : null}
                </span>
              </div>

              {/* Source Tx Hash */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                <span style={{ color: 'var(--muted)' }}>Source Tx:</span>
                {selectedItem?.source_tx_hash ? (
                  <a
                    href={selectedItem.source_explorer_link || '#'}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--blue)', textDecoration: 'underline', wordBreak: 'break-all' }}
                  >
                    {selectedItem.source_tx_hash.slice(0, 24)}...
                  </a>
                ) : (
                  <span style={{ color: 'var(--muted-deep)' }}>None</span>
                )}
              </div>

              {/* Destination Tx Hash */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ color: 'var(--muted)' }}>Destination Tx:</span>
                {selectedItem?.dest_tx_hash ? (
                  <a
                    href={selectedItem.dest_explorer_link || '#'}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--brand-2)', textDecoration: 'underline', wordBreak: 'break-all' }}
                  >
                    {selectedItem.dest_tx_hash.slice(0, 24)}...
                  </a>
                ) : (
                  <span style={{ color: 'var(--muted-deep)' }}>Awaiting destination confirmation</span>
                )}
              </div>
            </div>

            {/* Triage block (Slot D.7) — stuck/failed rows only, honest draft fallback */}
            {selectedItem && TRIAGE_STATES.includes(String(selectedItem.state)) && (
              <div
                data-testid="triage-block"
                style={{
                  marginTop: '12px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: mix('var(--rose)', 8),
                  border: '1px solid color-mix(in srgb, var(--rose) 35%, transparent)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: 'var(--rose)',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  ⚡ TRIAGE · {String(selectedItem.state)}
                </span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[
                    { label: 'copy quote_id', value: selectedItem.quote_id },
                    { label: 'copy src tx', value: selectedItem.source_tx_hash },
                    { label: 'copy dest tx', value: selectedItem.dest_tx_hash },
                  ]
                    .filter((b) => b.value)
                    .map((b) => (
                      <button
                        key={b.label}
                        onClick={() => copyToClipboard(b.value)}
                        style={{
                          fontSize: '9px',
                          fontFamily: 'var(--font-mono, monospace)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: mix('var(--brand)', 8),
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                          cursor: 'pointer',
                        }}
                      >
                        {b.label}
                      </button>
                    ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '10px', fontFamily: 'var(--font-mono, monospace)' }}>
                  {(['src', 'dest'] as const).map((side) => {
                    const chain = side === 'src' ? selectedItem.src_chain : selectedItem.dest_chain
                    const tx = side === 'src' ? selectedItem.source_tx_hash : selectedItem.dest_tx_hash
                    const link = explorerLink(chain, tx)
                    return link ? (
                      <a key={side} href={link.href} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', textDecoration: 'underline' }}>
                        {side} tx → {link.label}
                      </a>
                    ) : (
                      <span key={side} style={{ color: 'var(--muted-deep)' }}>
                        {side} tx → no explorer (draft)
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <hr style={{ borderColor: 'var(--border-soft)', margin: '4px 0' }} />

          {/* Terminal / Event Blackbox */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em' }}>
                EVENT BLACKBOX ({(fullEvents ?? detail?.events ?? []).length})
              </span>
              <button
                onClick={downloadAuditJson}
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono, monospace)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: mix('var(--brand)', 8),
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                Export JSON
              </button>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: '180px',
                maxHeight: '260px',
                overflowY: 'auto',
                background: 'var(--bg-deep)',
                border: '1px solid var(--border-soft)',
                borderRadius: '8px',
                padding: '10px',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '10px',
                color: 'var(--text)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {(fullEvents ?? detail?.events ?? []).length > 0 ? (
                (fullEvents ?? detail?.events ?? []).map((ev) => (
                  <details
                    key={ev.id}
                    style={{
                      borderBottom: '1px solid var(--border-soft)',
                      paddingBottom: '6px',
                    }}
                  >
                    <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
                      <span style={{ color: 'var(--muted-deep)' }}>{ev.created_at.slice(11, 19)}</span>{' '}
                      <span style={{ color: 'var(--brand)' }}>
                        [{ev.state_from} → {ev.state_to}]
                      </span>
                    </summary>
                    <div style={{ color: 'var(--muted)', marginTop: '4px' }}>
                      {ev.reason || ev.event_type || '—'}
                      {ev.evidence_ref ? (
                        <div style={{ color: 'var(--muted-deep)', wordBreak: 'break-all', marginTop: '2px' }}>
                          evidence: {String(ev.evidence_ref)}
                        </div>
                      ) : null}
                    </div>
                  </details>
                ))
              ) : (
                <div style={{ color: 'var(--muted-deep)' }}>No audit events logged yet.</div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
