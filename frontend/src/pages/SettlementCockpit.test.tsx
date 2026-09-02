/**
 * Tests for Slot D.4: Settlement Cockpit UI & Service Invariants
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_SETTLEMENTS } from '../mock/settlementDemo'
import {
  fetchSettlementDetail,
  fetchSettlements,
  getDeterministicNarrative,
  getStateStyle,
  STATE_STYLES,
} from '../services/settlementService'
import { SettlementCockpitPage } from './SettlementCockpitPage'

describe('Settlement Cockpit Core Requirements', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
    global.fetch = originalFetch
  })

  it('test_state_color_pill_matches_canonical_state: state colors match prompt specification', () => {
    // Check color mappings
    expect(getStateStyle('SUBMITTED_PENDING').color).toBe('#38bdf8') // cyan
    expect(getStateStyle('SOURCE_CONFIRMED').color).toBe('#fbbf24') // amber
    expect(getStateStyle('SOLVER_FILLING').color).toBe('#a855f7') // violet
    expect(getStateStyle('DEST_CONFIRMED').color).toBe('#34d399') // green
    expect(getStateStyle('COMPLETED').color).toBe('#00ffa3') // neon green
    expect(getStateStyle('FAILED').color).toBe('#f87171') // red
    expect(getStateStyle('REFUND_AVAILABLE').color).toBe('#fb923c') // orange
    expect(getStateStyle('REFUNDED').color).toBe('#2dd4bf') // teal
    expect(getStateStyle('STUCK_UNKNOWN').color).toBe('#f43f5e') // magenta/rose
    expect(getStateStyle('EXPIRED').color).toBe('#94a3b8') // grey
    expect(getStateStyle('HOOD_UNAVAILABLE').color).toBe('#64748b') // slate

    // Every key in STATE_STYLES has valid style properties
    for (const [key, style] of Object.entries(STATE_STYLES)) {
      expect(style.label).toBe(key)
      expect(style.color).toBeTruthy()
      expect(style.bg).toBeTruthy()
      expect(style.desc).toBeTruthy()
    }
  })

  it('test_narrator_for_source_confirmed_stuck_does_not_claim_completed: narrator never claims success prematurely', () => {
    // 1. SOURCE_CONFIRMED narrative
    const srcConfirmedItem = DEMO_SETTLEMENTS.find((s) => s.state === 'SOURCE_CONFIRMED')!
    const srcNarrative = getDeterministicNarrative(srcConfirmedItem)
    expect(srcNarrative.headline).not.toContain('Finalized')
    expect(srcNarrative.headline).not.toContain('Completed')
    expect(srcNarrative.body.toLowerCase()).toContain('bridge')
    expect(srcNarrative.body.toLowerCase()).not.toContain('terminal success')

    // 2. STUCK_UNKNOWN narrative
    const stuckItem = DEMO_SETTLEMENTS.find((s) => s.state === 'STUCK_UNKNOWN')!
    const stuckNarrative = getDeterministicNarrative(stuckItem)
    expect(stuckNarrative.headline).toContain('Honest Degradation')
    expect(stuckNarrative.body).toContain('never assumed successful')
    expect(stuckNarrative.severity).toBe('danger')

    // 3. Only COMPLETED narrative claims finalized success
    const completedItem = DEMO_SETTLEMENTS.find((s) => s.state === 'COMPLETED')!
    const completedNarrative = getDeterministicNarrative(completedItem)
    expect(completedNarrative.headline).toContain('Finalized')
    expect(completedNarrative.body).toContain('terminal success')
  })

  it('test_fetch_only_targets_internal_settlement_api: strictly targets internal endpoints, never external provider domains', async () => {
    const requestedUrls: string[] = []

    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      requestedUrls.push(url)

      if (url.includes('/api/v1/swap/settlements')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            items: [],
            count: 0,
            db_enabled: true,
            generated_at: new Date().toISOString(),
          }),
        })
      }

      if (url.includes('/api/v1/swap/settlement/')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            quote_id: 'q_test',
            src_chain: 'eip155:1',
            dest_chain: 'eip155:8453',
            state: 'SUBMITTED_PENDING',
            events: [],
          }),
        })
      }

      return Promise.reject(new Error(`Unexpected call to ${url}`))
    })

    // Call service functions
    await fetchSettlements({ limit: 20 })
    await fetchSettlementDetail('q_test_123')

    expect(requestedUrls.length).toBe(2)
    for (const url of requestedUrls) {
      // Must start with internal /api/v1/swap/settlement
      expect(url.startsWith('/api/v1/swap/settlement')).toBe(true)

      // Must NEVER target external third-party provider domains
      expect(url).not.toContain('li.fi')
      expect(url).not.toContain('relay.link')
      expect(url).not.toContain('jup.ag')
      expect(url).not.toContain('mayan.finance')
      expect(url).not.toContain('debridge.finance')
    }
  })

  it('test_demo_mode_selects_settlement_and_events_render: renders queue, 3D stage/fallback, and events in demo mode', async () => {
    // Mock fetch rejection to trigger auto-fallback to demo fixtures
    global.fetch = vi.fn().mockRejectedValue(new Error('503 backend off'))

    render(<SettlementCockpitPage />)

    // Wait for queue and header to render
    await waitFor(() => {
      expect(screen.getByText(/SETTLEMENT COCKPIT/i)).toBeDefined()
    })

    // Assert demo toggle badge is present
    expect(screen.getAllByText(/DEMO FIXTURES/i).length).toBeGreaterThan(0)

    // Assert queue shows items
    expect(screen.getByText(/QUEUE/i)).toBeDefined()

    // Assert KPI cards rendered
    expect(screen.getByText(/Active in Flight/i)).toBeDefined()
    expect(screen.getByText(/Honest Stuck/i)).toBeDefined()
    expect(screen.getAllByText(/Completed/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/VOLUME/i)).toBeDefined()

    // Click another settlement in the queue
    const secondItem = DEMO_SETTLEMENTS[1]
    const secondItemRow = screen.getByText(secondItem.quote_id.slice(0, 14))
    fireEvent.click(secondItemRow)

    // Check inspector updates
    await waitFor(() => {
      expect(screen.getAllByText(new RegExp(secondItem.provider!, 'i')).length).toBeGreaterThan(0)
    })
  })

  it('test_live_empty_db_renders_placeholder_not_throw: empty DB shows placeholder and 3D stage does not throw', async () => {
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/api/v1/swap/settlements')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            items: [],
            count: 0,
            db_enabled: true,
            dev_feeder: true,
            generated_at: new Date().toISOString(),
          }),
        })
      }
      return Promise.reject(new Error(`Unexpected call to ${url}`))
    })

    render(<SettlementCockpitPage />)

    await waitFor(() => {
      expect(screen.getByText(/NO SETTLEMENT ROWS IN DB/i)).toBeDefined()
    })
    expect(screen.getByText(/READ-ONLY • LIVE DB \(empty\)/i)).toBeDefined()
    expect(screen.getByText(/AWAITING TELEMETRY/i)).toBeDefined()
  })

  it('test_dev_feeder_controls_visible_and_trigger_actions: advance and seed buttons call dev endpoints', async () => {
    const postUrls: string[] = []

    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method || 'GET'

      if (method === 'POST') {
        postUrls.push(url)
        if (url.includes('/api/v1/dev/settlement-feeder/tick')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              advanced: [{ quote_id: 'q_sim_01', state_from: 'CREATED', state_to: 'SUBMITTED_PENDING' }],
              errors: 0,
            }),
          })
        }
        if (url.includes('/api/v1/dev/settlement-feeder/seed')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              seeded: 8,
              skipped_hood: 1,
              errors: 0,
            }),
          })
        }
      }

      if (url.includes('/api/v1/swap/settlements')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                quote_id: 'q_sim_lifi_01',
                provider: 'lifi',
                src_chain: 'eip155:8453',
                dest_chain: 'eip155:42161',
                state: 'SUBMITTED_PENDING',
                amount_in: '1.0 ETH',
              },
            ],
            count: 1,
            db_enabled: true,
            dev_feeder: true,
            generated_at: new Date().toISOString(),
          }),
        })
      }

      if (url.includes('/api/v1/swap/settlement/')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            quote_id: 'q_sim_lifi_01',
            provider: 'lifi',
            src_chain: 'eip155:8453',
            dest_chain: 'eip155:42161',
            state: 'SUBMITTED_PENDING',
            events: [],
          }),
        })
      }

      return Promise.reject(new Error(`Unexpected call to ${url}`))
    })

    render(<SettlementCockpitPage />)

    await waitFor(() => {
      expect(screen.getAllByText(/ADVANCE SIM/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/SEED SCENARIOS/i).length).toBeGreaterThan(0)
    })

    // Click ADVANCE SIM
    const advBtn = screen.getAllByText(/ADVANCE SIM/i)[0]
    fireEvent.click(advBtn)

    await waitFor(() => {
      expect(postUrls).toContain('/api/v1/dev/settlement-feeder/tick')
    })
  })

  it('test_dev_feeder_controls_hidden_when_disabled: hides dev buttons when dev_feeder is false', async () => {
    global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/api/v1/swap/settlements')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                quote_id: 'q_real_01',
                provider: 'lifi',
                src_chain: 'eip155:8453',
                dest_chain: 'eip155:42161',
                state: 'COMPLETED',
                amount_in: '1.0 ETH',
              },
            ],
            count: 1,
            db_enabled: true,
            dev_feeder: false,
            generated_at: new Date().toISOString(),
          }),
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          quote_id: 'q_real_01',
          state: 'COMPLETED',
          events: [],
        }),
      })
    })

    render(<SettlementCockpitPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^READ-ONLY • LIVE DB$/i })).toBeDefined()
    })
    expect(screen.queryByText(/ADVANCE SIM/i)).toBeNull()
    expect(screen.queryByText(/SEED SCENARIOS/i)).toBeNull()
  })
})
