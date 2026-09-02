/**
 * Settlement Demo Fixtures (Slot D.4)
 * Deterministic synthetic settlements for Cockpit demo mode and local development.
 *
 * Clearly labeled as DEMO DATA. Zero network calls, zero backend mutations.
 */
import type { SettlementDetail, SettlementItem } from '../services/settlementService'

export const DEMO_SETTLEMENTS: SettlementItem[] = [
  {
    quote_id: 'q_demo_sub_01',
    wallet: '0x71c...3892',
    provider: 'relay',
    src_chain: 'eip155:8453', // Base
    dest_chain: 'eip155:42161', // Arbitrum
    state: 'SUBMITTED_PENDING',
    reason: 'Deposit transaction broadcast to Base sequencer',
    source_tx_hash: '0x3a4b9c1d8e7f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b',
    dest_tx_hash: null,
    source_explorer_link: 'https://basescan.org/tx/0x3a4b9c1d8e7f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b',
    dest_explorer_link: null,
    amount_in: '250.0 USDC',
    amount_out_expected: '249.45 USDC',
    amount_out_min: '247.50 USDC',
    fee_expected_bps: 12,
    created_at: '2026-09-02T13:40:10Z',
    updated_at: '2026-09-02T13:40:12Z',
  },
  {
    quote_id: 'q_demo_src_02',
    wallet: '0x88e...104b',
    provider: 'lifi',
    src_chain: 'eip155:1', // Ethereum
    dest_chain: 'eip155:8453', // Base
    state: 'SOURCE_CONFIRMED',
    reason: 'Block 21984210 confirmed on Ethereum (12 confirmations)',
    source_tx_hash: '0x992b1a8c3d7e5f1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b',
    dest_tx_hash: null,
    source_explorer_link: 'https://etherscan.io/tx/0x992b1a8c3d7e5f1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b',
    dest_explorer_link: null,
    amount_in: '1.5 ETH',
    amount_out_expected: '1.4985 ETH',
    amount_out_min: '1.4850 ETH',
    fee_expected_bps: 20,
    created_at: '2026-09-02T13:38:00Z',
    updated_at: '2026-09-02T13:39:15Z',
  },
  {
    quote_id: 'q_demo_fill_03',
    wallet: '0x12a...982f',
    provider: 'relay',
    src_chain: 'eip155:10', // Optimism
    dest_chain: 'sol', // Solana
    state: 'SOLVER_FILLING',
    reason: 'Relay solver rebalancing liquidity across Wormhole/CCTP',
    source_tx_hash: '0x442a1b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a',
    dest_tx_hash: null,
    source_explorer_link: 'https://optimistic.etherscan.io/tx/0x442a1b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a',
    dest_explorer_link: null,
    amount_in: '500.0 USDT',
    amount_out_expected: '3.42 SOL',
    amount_out_min: '3.38 SOL',
    fee_expected_bps: 25,
    created_at: '2026-09-02T13:35:10Z',
    updated_at: '2026-09-02T13:37:45Z',
  },
  {
    quote_id: 'q_demo_dst_04',
    wallet: '0x43b...7721',
    provider: 'debridge',
    src_chain: 'eip155:42161', // Arbitrum
    dest_chain: 'eip155:8453', // Base
    state: 'DEST_CONFIRMED',
    reason: 'DLN order fulfilled by taker; verifying receipt inclusion',
    source_tx_hash: '0xaa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b',
    dest_tx_hash: '0xbb2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c',
    source_explorer_link: 'https://arbiscan.io/tx/0xaa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b',
    dest_explorer_link: 'https://basescan.org/tx/0xbb2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c',
    amount_in: '1000.0 USDC',
    amount_out_expected: '998.20 USDC',
    amount_out_min: '992.00 USDC',
    fee_expected_bps: 18,
    created_at: '2026-09-02T13:32:00Z',
    updated_at: '2026-09-02T13:34:22Z',
  },
  {
    quote_id: 'q_demo_cmp_05',
    wallet: '0x99f...44a1',
    provider: 'jupiter',
    src_chain: 'sol', // Solana
    dest_chain: 'sol', // Solana same-chain
    state: 'COMPLETED',
    reason: 'Atomic Solana swap executed and verified on-chain',
    source_tx_hash: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp3aB4cC5dE6fG7hI8jK9lM0nO1pQ2rS3t',
    dest_tx_hash: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp3aB4cC5dE6fG7hI8jK9lM0nO1pQ2rS3t',
    source_explorer_link: 'https://solscan.io/tx/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp3aB4cC5dE6fG7hI8jK9lM0nO1pQ2rS3t',
    dest_explorer_link: 'https://solscan.io/tx/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp3aB4cC5dE6fG7hI8jK9lM0nO1pQ2rS3t',
    amount_in: '10.0 SOL',
    amount_out_expected: '1485.50 USDC',
    amount_out_min: '1475.00 USDC',
    fee_expected_bps: 10,
    created_at: '2026-09-02T13:25:00Z',
    updated_at: '2026-09-02T13:25:04Z',
  },
  {
    quote_id: 'q_demo_stuck_06',
    wallet: '0x55a...3312',
    provider: 'mayan',
    src_chain: 'eip155:1', // Ethereum
    dest_chain: 'sol', // Solana
    state: 'STUCK_UNKNOWN',
    reason: 'Polling timeout: destination evidence unobserved after 900s',
    source_tx_hash: '0x771a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a',
    dest_tx_hash: null,
    source_explorer_link: 'https://etherscan.io/tx/0x771a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a',
    dest_explorer_link: null,
    amount_in: '2.0 ETH',
    amount_out_expected: '48.20 SOL',
    amount_out_min: '47.50 SOL',
    fee_expected_bps: 35,
    created_at: '2026-09-02T13:00:00Z',
    updated_at: '2026-09-02T13:16:30Z',
  },
  {
    quote_id: 'q_demo_ref_avail_07',
    wallet: '0x33d...881c',
    provider: 'mayan',
    src_chain: 'sol', // Solana
    dest_chain: 'eip155:8453', // Base
    state: 'REFUND_AVAILABLE',
    reason: 'Wormhole VAA generated; swap expired due to slippage spike; refund claimable',
    source_tx_hash: '3qX7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7',
    dest_tx_hash: null,
    source_explorer_link: 'https://solscan.io/tx/3qX7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7',
    dest_explorer_link: null,
    amount_in: '15.0 SOL',
    amount_out_expected: '2200.0 USDC',
    amount_out_min: '2190.0 USDC',
    fee_expected_bps: 30,
    created_at: '2026-09-02T12:45:00Z',
    updated_at: '2026-09-02T12:55:10Z',
  },
  {
    quote_id: 'q_demo_refunded_08',
    wallet: '0x66f...994e',
    provider: 'relay',
    src_chain: 'eip155:8453', // Base
    dest_chain: 'eip155:10', // Optimism
    state: 'REFUNDED',
    reason: 'Relay gas surge triggered auto-refund back to Base wallet',
    source_tx_hash: '0x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
    dest_tx_hash: '0x99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa',
    source_explorer_link: 'https://basescan.org/tx/0x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
    dest_explorer_link: 'https://basescan.org/tx/0x99887766554433221100ffeeddccbbaa99887766554433221100ffeeddccbbaa',
    amount_in: '300.0 USDC',
    amount_out_expected: '299.10 USDC',
    amount_out_min: '297.00 USDC',
    fee_expected_bps: 15,
    created_at: '2026-09-02T12:10:00Z',
    updated_at: '2026-09-02T12:12:40Z',
  },
  {
    quote_id: 'q_demo_failed_09',
    wallet: '0x22c...117a',
    provider: 'lifi',
    src_chain: 'eip155:42161', // Arbitrum
    dest_chain: 'eip155:1', // Ethereum
    state: 'FAILED',
    reason: 'Uniswap pool revert on source: slippage limit exceeded',
    source_tx_hash: '0x5566778899aabbccddeeff00112233445566778899aabbccddeeff0011223344',
    dest_tx_hash: null,
    source_explorer_link: 'https://arbiscan.io/tx/0x5566778899aabbccddeeff00112233445566778899aabbccddeeff0011223344',
    dest_explorer_link: null,
    amount_in: '10.0 ETH',
    amount_out_expected: '9.98 ETH',
    amount_out_min: '9.95 ETH',
    fee_expected_bps: 15,
    created_at: '2026-09-02T11:50:00Z',
    updated_at: '2026-09-02T11:51:15Z',
  },
  {
    quote_id: 'q_demo_exp_10',
    wallet: '0x44d...662b',
    provider: 'relay',
    src_chain: 'eip155:10', // Optimism
    dest_chain: 'eip155:8453', // Base
    state: 'EXPIRED',
    reason: 'User abandoned transaction; quote TTL elapsed',
    source_tx_hash: null,
    dest_tx_hash: null,
    source_explorer_link: null,
    dest_explorer_link: null,
    amount_in: '50.0 USDC',
    amount_out_expected: '49.85 USDC',
    amount_out_min: '49.50 USDC',
    fee_expected_bps: 12,
    created_at: '2026-09-02T11:00:00Z',
    updated_at: '2026-09-02T11:05:00Z',
  },
  {
    quote_id: 'q_demo_hood_11',
    wallet: '0x000...0000',
    provider: 'hood',
    src_chain: 'hood:unwired', // Robinhood
    dest_chain: 'eip155:8453',
    state: 'HOOD_UNAVAILABLE',
    reason: 'Robinhood chain (chain_id: null) rejected: settlement not wired',
    source_tx_hash: null,
    dest_tx_hash: null,
    source_explorer_link: null,
    dest_explorer_link: null,
    amount_in: '100.0 USD',
    amount_out_expected: null,
    amount_out_min: null,
    fee_expected_bps: null,
    created_at: '2026-09-02T10:30:00Z',
    updated_at: '2026-09-02T10:30:00Z',
  },
]

export function getDemoDetail(quoteId: string): SettlementDetail {
  const item = DEMO_SETTLEMENTS.find((s) => s.quote_id === quoteId) ?? DEMO_SETTLEMENTS[0]

  const events = [
    {
      id: 101,
      quote_id: item.quote_id,
      state_from: 'CREATED',
      state_to: 'SUBMITTED_PENDING',
      event_type: 'quote_submitted',
      reason: 'Origin transaction submitted to mempool',
      evidence_ref: item.source_tx_hash ? `tx:${item.source_tx_hash.slice(0, 14)}...` : null,
      created_at: item.created_at || '2026-09-02T12:00:00Z',
    },
  ]

  if (item.state !== 'SUBMITTED_PENDING' && item.state !== 'EXPIRED' && item.state !== 'HOOD_UNAVAILABLE') {
    events.push({
      id: 102,
      quote_id: item.quote_id,
      state_from: 'SUBMITTED_PENDING',
      state_to: 'SOURCE_CONFIRMED',
      event_type: 'source_settled',
      reason: 'Origin chain receipt block inclusion confirmed',
      evidence_ref: item.source_tx_hash ? `block_receipt:${item.source_tx_hash.slice(0, 14)}...` : null,
      created_at: '2026-09-02T12:01:10Z',
    })
  }

  if (['SOLVER_FILLING', 'DEST_CONFIRMED', 'COMPLETED', 'REFUND_AVAILABLE', 'REFUNDED'].includes(item.state)) {
    events.push({
      id: 103,
      quote_id: item.quote_id,
      state_from: 'SOURCE_CONFIRMED',
      state_to: 'SOLVER_FILLING',
      event_type: 'relayer_rebalance',
      reason: 'Solver accepted order commitments',
      evidence_ref: 'provider:order_accepted',
      created_at: '2026-09-02T12:02:00Z',
    })
  }

  if (['DEST_CONFIRMED', 'COMPLETED'].includes(item.state)) {
    events.push({
      id: 104,
      quote_id: item.quote_id,
      state_from: 'SOLVER_FILLING',
      state_to: 'DEST_CONFIRMED',
      event_type: 'dest_receipt_verified',
      reason: 'Destination chain receipt verified on-chain',
      evidence_ref: item.dest_tx_hash ? `dest_tx:${item.dest_tx_hash.slice(0, 14)}...` : null,
      created_at: '2026-09-02T12:03:30Z',
    })
  }

  if (item.state === 'COMPLETED') {
    events.push({
      id: 105,
      quote_id: item.quote_id,
      state_from: 'DEST_CONFIRMED',
      state_to: 'COMPLETED',
      event_type: 'terminal_finalized',
      reason: 'Settlement state machine closed with verified destination proof',
      evidence_ref: 'cryptographic_closure_verified',
      created_at: '2026-09-02T12:03:35Z',
    })
  }

  if (item.state === 'STUCK_UNKNOWN') {
    events.push({
      id: 106,
      quote_id: item.quote_id,
      state_from: 'SOLVER_FILLING',
      state_to: 'STUCK_UNKNOWN',
      event_type: 'honest_degradation',
      reason: 'Polling timeout exceeded without destination proof',
      evidence_ref: 'timeout_exceeded_fail_closed',
      created_at: item.updated_at || '2026-09-02T12:16:30Z',
    })
  }

  return {
    ...item,
    stuck_reason: item.state === 'STUCK_UNKNOWN' ? 'timeout_exceeded' : null,
    claim_token: 'd41d8cd9-8f00-4b20-4e98-00998ecf8427',
    underlying_route_id: `route_${item.provider || 'unknown'}_${item.quote_id}`,
    events,
    sources: ['demo_fixtures_deterministic'],
  }
}
