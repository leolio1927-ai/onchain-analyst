/**
 * Settlement Cockpit Page (Slot D.4)
 * Institutional-grade non-custodial settlement visualizer, 3D pipeline stage,
 * deterministic narrator, and cryptographic audit event blackbox.
 */

import { useEffect, useMemo, useState } from 'react'
import { Pipeline3D } from '../components/settlement/Pipeline3D'
import { DEMO_SETTLEMENTS, getDemoDetail } from '../mock/settlementDemo'
import {
  fetchSettlementDetail,
  fetchSettlements,
  getDeterministicNarrative,
  getStateStyle,
  type SettlementDetail,
  type SettlementItem,
} from '../services/settlementService'

export function SettlementCockpitPage() {
  const [isDemo, setIsDemo] = useState(false)
  const [dbHealthy, setDbHealthy] = useState<boolean | null>(null)
  const [items, setItems] = useState<SettlementItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SettlementDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [stuckOnly, setStuckOnly] = useState(false)
  const [stateFilter, setStateFilter] = useState<string>('ALL')

  // Load settlements
  const loadData = async (demoMode = isDemo) => {
    setLoading(true)
    setErrorMsg(null)

    if (demoMode) {
      setItems(DEMO_SETTLEMENTS)
      if (!selectedQuoteId && DEMO_SETTLEMENTS.length > 0) {
        setSelectedQuoteId(DEMO_SETTLEMENTS[0].quote_id)
      }
      setLoading(false)
      return
    }

    try {
      const res = await fetchSettlements({
        stuck: stuckOnly,
        limit: 100,
      })
      setItems(res.items)
      setDbHealthy(true)
      if (!selectedQuoteId && res.items.length > 0) {
        setSelectedQuoteId(res.items[0].quote_id)
      }
    } catch (err: unknown) {
      // Backend unavailable / 503 -> Fall back gracefully to Demo mode
      setDbHealthy(false)
      setErrorMsg('Internal SQLite DB unavailable (503). Auto-switching to demo fixtures.')
      setIsDemo(true)
      setItems(DEMO_SETTLEMENTS)
      if (!selectedQuoteId && DEMO_SETTLEMENTS.length > 0) {
        setSelectedQuoteId(DEMO_SETTLEMENTS[0].quote_id)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(isDemo)
  }, [isDemo, stuckOnly])

  // Load detail for selected item
  useEffect(() => {
    if (!selectedQuoteId) {
      setDetail(null)
      return
    }

    if (isDemo) {
      setDetail(getDemoDetail(selectedQuoteId))
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

    return () => {
      active = false
    }
  }, [selectedQuoteId, isDemo])

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
        color: '#f8fafc',
        fontFamily: 'var(--f-ui, sans-serif)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        maxWidth: '1600px',
        margin: '0 auto',
      }}
    >
      {/* ── 1. Header Bar ────────────────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderRadius: '16px',
          background: 'rgba(15, 23, 42, 0.65)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1
              style={{
                fontFamily: 'var(--f-display, sans-serif)',
                fontSize: '22px',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                margin: 0,
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
                fontFamily: 'var(--f-mono, monospace)',
                fontWeight: 700,
                background: isDemo ? 'rgba(251, 191, 36, 0.18)' : 'rgba(0, 255, 163, 0.18)',
                color: isDemo ? '#fbbf24' : '#00ffa3',
                border: isDemo ? '1px solid rgba(251, 191, 36, 0.45)' : '1px solid rgba(0, 255, 163, 0.45)',
                cursor: 'pointer',
              }}
              title="Toggle Live Backend vs Local Synthetic Demo Fixtures"
            >
              {isDemo ? 'DEMO FIXTURES' : 'LIVE DB'}
            </button>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontFamily: 'var(--f-mono, monospace)',
                color: dbHealthy ? '#34d399' : '#fbbf24',
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: dbHealthy ? '#34d399' : '#fbbf24',
                }}
              />
              {dbHealthy ? 'database ready' : 'database fallback'}
            </div>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
            non-custodial settlement inspector • source submitted ≠ completed • verified receipts only
          </p>
        </div>

        {/* Global Search & Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            type="text"
            placeholder="Search quote / wallet / provider / chain..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              background: 'rgba(2, 6, 23, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#fff',
              fontSize: '12px',
              width: '280px',
              fontFamily: 'var(--f-mono, monospace)',
            }}
          />
          <button
            onClick={() => loadData(isDemo)}
            disabled={loading}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#fff',
              fontSize: '12px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--f-mono, monospace)',
            }}
          >
            {loading ? 'Fetching...' : 'Refresh'}
          </button>
        </div>
      </header>

      {/* Optional Warning Banner if Fallback Active */}
      {errorMsg && (
        <div
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            background: 'rgba(251, 191, 36, 0.12)',
            border: '1px solid rgba(251, 191, 36, 0.35)',
            color: '#fbbf24',
            fontSize: '11px',
            fontFamily: 'var(--f-mono, monospace)',
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
          { label: 'Active in Flight', val: kpis.active, col: '#38bdf8' },
          { label: 'Honest Stuck', val: kpis.stuck, col: '#f43f5e' },
          { label: 'Completed', val: kpis.completed, col: '#00ffa3' },
          { label: 'Refund Actions', val: kpis.refund, col: '#fb923c' },
          { label: '24h Volume', val: 'TBD (honest)', col: '#94a3b8' },
          { label: 'Unwired Chains', val: kpis.unwired, col: '#64748b' },
        ].map((k) => (
          <div
            key={k.label}
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              background: 'rgba(15, 23, 42, 0.45)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {k.label}
            </span>
            <span
              style={{
                fontFamily: 'var(--f-mono, monospace)',
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
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            borderRadius: '14px',
            background: 'rgba(15, 23, 42, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            padding: '14px',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', color: '#94a3b8' }}>
                QUEUE ({filteredItems.length})
              </span>
              <button
                onClick={() => setStuckOnly(!stuckOnly)}
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--f-mono, monospace)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: stuckOnly ? '1px solid #f43f5e' : '1px solid rgba(255, 255, 255, 0.1)',
                  background: stuckOnly ? 'rgba(244, 63, 94, 0.15)' : 'transparent',
                  color: stuckOnly ? '#f43f5e' : '#94a3b8',
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
                background: 'rgba(2, 6, 23, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#cbd5e1',
                fontSize: '11px',
                fontFamily: 'var(--f-mono, monospace)',
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
            {filteredItems.map((item) => {
              const isSelected = item.quote_id === selectedQuoteId
              const sStyle = getStateStyle(item.state)
              return (
                <div
                  key={item.quote_id}
                  onClick={() => setSelectedQuoteId(item.quote_id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: isSelected ? 'rgba(30, 41, 59, 0.7)' : 'rgba(15, 23, 42, 0.4)',
                    border: isSelected ? `1px solid ${sStyle.border}` : '1px solid rgba(255, 255, 255, 0.04)',
                    boxShadow: isSelected ? sStyle.glow : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--f-mono, monospace)', fontSize: '11px', fontWeight: 600 }}>
                      {item.quote_id.slice(0, 14)}
                    </span>
                    <span
                      style={{
                        fontSize: '9px',
                        fontFamily: 'var(--f-mono, monospace)',
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

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>
                      {item.provider?.toUpperCase() || 'UNKNOWN'} · {item.src_chain.slice(0, 6)} →{' '}
                      {item.dest_chain.slice(0, 6)}
                    </span>
                    <span style={{ color: '#cbd5e1' }}>{item.amount_in || '—'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        {/* Center Hero: 3D Pipeline Stage & Narrator */}
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* 3D Visualizer */}
          <Pipeline3D settlement={selectedItem} />

          {/* Deterministic Narrator Card */}
          <div
            style={{
              padding: '18px 20px',
              borderRadius: '14px',
              background: 'rgba(15, 23, 42, 0.55)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#00ffa3', fontSize: '14px' }}>✦</span>
                <span
                  style={{
                    fontFamily: 'var(--f-display, sans-serif)',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                  }}
                >
                  {narrative.headline}
                </span>
              </div>
              <span
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--f-mono, monospace)',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: '#94a3b8',
                }}
              >
                provider mapping draft / unverified
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: '1.5' }}>{narrative.body}</p>
          </div>

          {/* Collapsible Evidence Payload Preview */}
          <details
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: 'rgba(2, 6, 23, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              fontSize: '11px',
              fontFamily: 'var(--f-mono, monospace)',
            }}
          >
            <summary style={{ cursor: 'pointer', color: '#94a3b8', fontWeight: 600 }}>
              CRYPTOGRAPHIC EVIDENCE PAYLOAD PREVIEW
            </summary>
            <pre
              style={{
                marginTop: '10px',
                padding: '10px',
                borderRadius: '6px',
                background: '#020617',
                color: '#34d399',
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
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            borderRadius: '14px',
            background: 'rgba(15, 23, 42, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            padding: '16px',
          }}
        >
          {/* Detail Metadata */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em' }}>
                  SETTLEMENT INSPECTOR
                </span>
                {detailLoading && (
                  <span style={{ fontSize: '10px', color: '#fbbf24', fontFamily: 'var(--f-mono, monospace)' }}>
                    (syncing...)
                  </span>
                )}
              </div>
              <button
                onClick={() => copyToClipboard(selectedItem?.quote_id)}
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--f-mono, monospace)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: '#fff',
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
                fontFamily: 'var(--f-mono, monospace)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Wallet:</span>
                <span style={{ color: '#f8fafc' }}>{selectedItem?.wallet || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Provider:</span>
                <span style={{ color: '#00ffa3' }}>{selectedItem?.provider?.toUpperCase() || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Chains:</span>
                <span>
                  {selectedItem?.src_chain} → {selectedItem?.dest_chain}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Amount In:</span>
                <span>{selectedItem?.amount_in || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Expected Out:</span>
                <span>{selectedItem?.amount_out_expected || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Fee bps:</span>
                <span>{selectedItem?.fee_expected_bps ?? '—'}</span>
              </div>

              {/* Source Tx Hash */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                <span style={{ color: '#94a3b8' }}>Source Tx:</span>
                {selectedItem?.source_tx_hash ? (
                  <a
                    href={selectedItem.source_explorer_link || '#'}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#38bdf8', textDecoration: 'underline', wordBreak: 'break-all' }}
                  >
                    {selectedItem.source_tx_hash.slice(0, 24)}...
                  </a>
                ) : (
                  <span style={{ color: '#64748b' }}>None</span>
                )}
              </div>

              {/* Destination Tx Hash */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ color: '#94a3b8' }}>Destination Tx:</span>
                {selectedItem?.dest_tx_hash ? (
                  <a
                    href={selectedItem.dest_explorer_link || '#'}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#34d399', textDecoration: 'underline', wordBreak: 'break-all' }}
                  >
                    {selectedItem.dest_tx_hash.slice(0, 24)}...
                  </a>
                ) : (
                  <span style={{ color: '#64748b' }}>Awaiting destination confirmation</span>
                )}
              </div>
            </div>
          </div>

          <hr style={{ borderColor: 'rgba(255, 255, 255, 0.06)', margin: '4px 0' }} />

          {/* Terminal / Event Blackbox */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em' }}>
                EVENT BLACKBOX ({detail?.events.length || 0})
              </span>
              <button
                onClick={downloadAuditJson}
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--f-mono, monospace)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: '#fff',
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
                background: '#020617',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '8px',
                padding: '10px',
                fontFamily: 'var(--f-mono, monospace)',
                fontSize: '10px',
                color: '#cbd5e1',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {detail?.events && detail.events.length > 0 ? (
                detail.events.map((ev) => (
                  <div
                    key={ev.id}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      paddingBottom: '6px',
                    }}
                  >
                    <span style={{ color: '#64748b' }}>{ev.created_at.slice(11, 19)}</span>{' '}
                    <span style={{ color: '#00ffa3' }}>
                      [{ev.state_from} → {ev.state_to}]
                    </span>
                    <div style={{ color: '#94a3b8', marginTop: '2px' }}>{ev.reason || ev.event_type}</div>
                  </div>
                ))
              ) : (
                <div style={{ color: '#64748b' }}>No audit events logged yet.</div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
