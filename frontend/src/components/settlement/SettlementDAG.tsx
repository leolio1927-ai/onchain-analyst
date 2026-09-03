/**
 * Settlement State DAG (visual pass — replaces the retired 3D lane stage).
 * Renders the REAL legal transition graph, mirrored 1:1 from
 * providers/settlement_repository.py :: transition() — no invented edges.
 *
 * Pure SVG (zero WebGL dependency, nothing to fall back from), one bordir
 * DNA via tokens.css, reduced-motion safe via CSS media query only.
 *
 * Honest semantics:
 * - lit (brand-green, animated) = canonical prefix the current state PROVES
 *   (e.g. SOLVER_FILLING necessarily passed SUBMITTED → SOURCE_CONFIRMED)
 * - rose/state dashed = legal inbound edges into the current state
 * - HOOD_UNAVAILABLE = isolated boundary no-op, exactly like the backend:
 *   no settlement row, no transitions.
 */

import { useMemo } from 'react'
import { getStateStyle, type SettlementItem } from '../../services/settlementService'
import '../../styles/settlement.css'

interface DagNode {
  id: string
  x: number
  y: number
  isolated?: boolean
}

interface DagEdgeDef {
  from: string
  to: string
  d: string
}

const NODE_W = 118
const NODE_H = 32

const DAG_NODES: DagNode[] = [
  { id: 'SUBMITTED_PENDING', x: 88, y: 104 },
  { id: 'SOURCE_CONFIRMED', x: 246, y: 104 },
  { id: 'SOLVER_FILLING', x: 404, y: 104 },
  { id: 'DEST_CONFIRMED', x: 562, y: 104 },
  { id: 'COMPLETED', x: 720, y: 104 },
  { id: 'EXPIRED', x: 88, y: 214 },
  { id: 'FAILED', x: 246, y: 214 },
  { id: 'STUCK_UNKNOWN', x: 404, y: 214 },
  { id: 'REFUND_AVAILABLE', x: 566, y: 214 },
  { id: 'REFUNDED', x: 716, y: 214 },
  { id: 'HOOD_UNAVAILABLE', x: 88, y: 288, isolated: true },
]

/** Every edge is a LEGAL transition in settlement_repository.transition(). */
const DAG_EDGES: DagEdgeDef[] = [
  { from: 'SUBMITTED_PENDING', to: 'SOURCE_CONFIRMED', d: 'M 147 104 L 187 104' },
  { from: 'SOURCE_CONFIRMED', to: 'SOLVER_FILLING', d: 'M 305 104 L 345 104' },
  { from: 'SOLVER_FILLING', to: 'DEST_CONFIRMED', d: 'M 463 104 L 503 104' },
  { from: 'DEST_CONFIRMED', to: 'COMPLETED', d: 'M 621 104 L 661 104' },
  { from: 'SUBMITTED_PENDING', to: 'EXPIRED', d: 'M 88 120 L 88 198' },
  { from: 'SUBMITTED_PENDING', to: 'FAILED', d: 'M 120 120 C 150 152, 200 176, 230 198' },
  { from: 'SUBMITTED_PENDING', to: 'STUCK_UNKNOWN', d: 'M 141 116 C 220 152, 320 176, 388 198' },
  { from: 'SOURCE_CONFIRMED', to: 'DEST_CONFIRMED', d: 'M 250 88 C 320 42, 480 42, 556 88' },
  { from: 'SOURCE_CONFIRMED', to: 'FAILED', d: 'M 246 120 L 246 198' },
  { from: 'SOURCE_CONFIRMED', to: 'STUCK_UNKNOWN', d: 'M 282 116 C 330 146, 370 172, 390 198' },
  { from: 'SOLVER_FILLING', to: 'FAILED', d: 'M 372 116 C 330 146, 280 176, 262 198' },
  { from: 'SOLVER_FILLING', to: 'STUCK_UNKNOWN', d: 'M 404 120 L 404 198' },
  { from: 'DEST_CONFIRMED', to: 'FAILED', d: 'M 536 117 C 460 166, 360 182, 285 198' },
  { from: 'DEST_CONFIRMED', to: 'STUCK_UNKNOWN', d: 'M 540 118 C 490 152, 452 172, 432 198' },
  { from: 'FAILED', to: 'REFUND_AVAILABLE', d: 'M 305 214 L 507 214' },
  { from: 'REFUND_AVAILABLE', to: 'REFUNDED', d: 'M 625 214 L 657 214' },
  { from: 'REFUND_AVAILABLE', to: 'STUCK_UNKNOWN', d: 'M 507 214 L 463 214' },
  { from: 'STUCK_UNKNOWN', to: 'DEST_CONFIRMED', d: 'M 428 198 C 470 164, 520 144, 548 120' },
  { from: 'STUCK_UNKNOWN', to: 'FAILED', d: 'M 345 214 L 305 214' },
]

const HAPPY_PATH = ['SUBMITTED_PENDING', 'SOURCE_CONFIRMED', 'SOLVER_FILLING', 'DEST_CONFIRMED', 'COMPLETED']

export function SettlementDAG({ settlement }: { settlement?: SettlementItem | null }) {
  const state = String(settlement?.state || 'SUBMITTED_PENDING').toUpperCase()
  const style = getStateStyle(state)
  const isSameChain = Boolean(settlement && settlement.src_chain === settlement.dest_chain)

  const { litNodes, litEdges, activeInbound } = useMemo(() => {
    const idx = HAPPY_PATH.indexOf(state)
    const nodes = idx >= 0 ? new Set(HAPPY_PATH.slice(0, idx + 1)) : new Set<string>()
    const edges = new Set<string>()
    for (let i = 0; i < idx; i++) edges.add(`${HAPPY_PATH[i]}->${HAPPY_PATH[i + 1]}`)
    const inbound = new Set(
      DAG_EDGES.filter((e) => e.to === state && !edges.has(`${e.from}->${e.to}`)).map((e) => `${e.from}->${e.to}`),
    )
    return { litNodes: nodes, litEdges: edges, activeInbound: inbound }
  }, [state])

  return (
    <div
      className="sdag-stage embroidery"
      style={{
        height: '320px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: style.glow !== 'none' ? style.glow : undefined,
      }}
    >
      <div className="sdag-grid" />

      <svg
        viewBox="0 0 780 320"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Settlement state DAG for state ${state}`}
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <defs>
          <marker id="sdag-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 8 4 L 0 8 z" style={{ fill: 'var(--muted-deep)' }} />
          </marker>
        </defs>

        {/* Legal edges — base web, then honest emphasis layers */}
        {DAG_EDGES.map((e) => {
          const key = `${e.from}->${e.to}`
          const lit = litEdges.has(key)
          const inbound = activeInbound.has(key)
          return (
            <g key={key}>
              <path
                d={e.d}
                fill="none"
                style={{ stroke: 'var(--border)' }}
                strokeWidth={1.1}
                opacity={0.9}
                markerEnd="url(#sdag-arrow)"
              />
              {lit && (
                <path
                  d={e.d}
                  fill="none"
                  className="sdag-flow"
                  style={{ stroke: 'var(--brand)' }}
                  strokeWidth={1.8}
                  opacity={0.95}
                />
              )}
              {inbound && (
                <path
                  d={e.d}
                  fill="none"
                  stroke={style.color}
                  strokeWidth={1.4}
                  opacity={0.5}
                  strokeDasharray="2 3"
                />
              )}
            </g>
          )
        })}

        {/* State nodes */}
        {DAG_NODES.map((n) => {
          const st = getStateStyle(n.id)
          const isCurrent = n.id === state
          const lit = litNodes.has(n.id)
          const dim = !isCurrent && !lit
          return (
            <g
              key={n.id}
              data-dag-node="true"
              data-state={n.id}
              data-dag-current={isCurrent || undefined}
              opacity={dim ? 0.55 : 1}
            >
              {isCurrent && (
                <rect
                  x={n.x - NODE_W / 2 - 5}
                  y={n.y - NODE_H / 2 - 5}
                  width={NODE_W + 10}
                  height={NODE_H + 10}
                  rx={12}
                  fill="none"
                  stroke={st.color}
                  strokeWidth={1}
                  className="sdag-pulse"
                />
              )}
              <rect
                x={n.x - NODE_W / 2}
                y={n.y - NODE_H / 2}
                width={NODE_W}
                height={NODE_H}
                rx={9}
                style={{
                  fill:
                    isCurrent || lit
                      ? `color-mix(in srgb, ${st.color} 16%, var(--panel-2))`
                      : 'var(--panel-2)',
                  stroke: st.color,
                  strokeWidth: isCurrent ? 2 : lit ? 1.5 : 0.9,
                  filter: isCurrent ? `drop-shadow(0 0 8px ${st.color})` : undefined,
                }}
              />
              <text
                x={n.x}
                y={n.y + 3}
                textAnchor="middle"
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: n.id.length > 15 ? 7.4 : 8.6,
                  fontWeight: 700,
                  letterSpacing: '.03em',
                  fill: isCurrent || lit ? st.color : 'var(--muted)',
                }}
              >
                {n.id}
              </text>
              {n.isolated && (
                <text
                  x={n.x}
                  y={n.y + 24}
                  textAnchor="middle"
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 7,
                    letterSpacing: '.08em',
                    fill: 'var(--muted-deep)',
                  }}
                >
                  BOUNDARY NO-OP · NO EDGES
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* Route chips: source → destination, same-chain honesty, provider */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '14px',
          right: '150px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexWrap: 'wrap',
        }}
      >
        <span className="sdag-chip">
          {settlement?.src_chain ?? '—'} → {settlement?.dest_chain ?? '—'}
        </span>
        {isSameChain && (
          <span
            className="sdag-chip"
            data-testid="sdag-same-chain"
            style={{
              color: 'var(--amber)',
              borderColor: 'color-mix(in srgb, var(--amber) 45%, transparent)',
              background: 'color-mix(in srgb, var(--amber) 12%, transparent)',
              fontWeight: 700,
            }}
          >
            SAME-CHAIN · SINGLE LANE
          </span>
        )}
        {settlement?.provider && <span className="sdag-chip">{settlement.provider.toUpperCase()}</span>}
      </div>

      {/* Floating state banner overlay */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 12px',
          borderRadius: '999px',
          background: style.bg,
          border: `1px solid ${style.border}`,
          backdropFilter: 'blur(8px)',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: style.color,
            boxShadow: `0 0 8px ${style.color}`,
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '11px',
            fontWeight: 700,
            color: style.color,
            letterSpacing: '0.04em',
          }}
        >
          {style.label}
        </span>
      </div>

      {/* Honest degradation overlays */}
      {state === 'STUCK_UNKNOWN' && (
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '4px 14px',
            borderRadius: '6px',
            background: 'color-mix(in srgb, var(--rose) 16%, transparent)',
            border: '1px solid color-mix(in srgb, var(--rose) 50%, transparent)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '10px',
            color: 'var(--rose)',
            fontWeight: 600,
          }}
        >
          ⚠ NO DESTINATION EVIDENCE VERIFIED
        </div>
      )}

      {state === 'HOOD_UNAVAILABLE' && (
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '4px 14px',
            borderRadius: '6px',
            background: 'color-mix(in srgb, var(--muted-deep) 16%, transparent)',
            border: '1px solid color-mix(in srgb, var(--muted-deep) 50%, transparent)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '10px',
            color: 'var(--muted)',
            fontWeight: 600,
          }}
        >
          CHAIN NOT WIRED (chain_id: null)
        </div>
      )}

      {!settlement && (
        <div
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '4px 14px',
            borderRadius: '6px',
            background: 'color-mix(in srgb, var(--muted-deep) 14%, transparent)',
            border: '1px solid color-mix(in srgb, var(--muted-deep) 40%, transparent)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '10px',
            color: 'var(--muted)',
            fontWeight: 600,
          }}
        >
          AWAITING TELEMETRY · QUEUE EMPTY
        </div>
      )}

      {/* Honesty caption */}
      <div
        style={{
          position: 'absolute',
          bottom: '10px',
          right: '14px',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '8.5px',
          letterSpacing: '.08em',
          color: 'var(--muted-deep)',
        }}
      >
        STATE DAG · MIRRORS settlement_repository.transition() · FAIL-CLOSED
      </div>
    </div>
  )
}
