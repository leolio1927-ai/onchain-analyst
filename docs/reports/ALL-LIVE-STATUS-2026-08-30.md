# ALL-LIVE $0 — STATUS 2026-08-30 (mandate executed through FASE 7)
Baseline 184P → now 198P+ (+1 snapshot) · ruff 0 · tsc 0 · build OK · no push (law 8).
Probes: `capability-probe-2026-08-30.md` (F5a-R, with keys) + `phase1-probe-2026-08-30.md` (FASE 1).

## Chain lineup (FASE 0)
**5 chains: sol · bnb · base · hood · hype.** avax DISABLED everywhere by founder mandate —
parked verbatim (CHAIN_IDS comment, DISABLED_CHAINS in webapp/chains.py, live.py/chains_map
comment rows, FE marks/accents commented) — re-enable = one-line moves. Scan route refuses
avax (tested). Every FE chain count/card/pill/list now iterates the 5-chain lineup.

## Capability × chain — LIVE vs SOON (the honest table)

| capability | sol | bnb | base | hood | hype |
|---|---|---|---|---|---|
| live feed | LIVE (GT) | LIVE (GT) | LIVE (GT) | LIVE (GT) | LIVE (GT) |
| scan verdict | LIVE | LIVE | LIVE | LIVE (5-signal denominator) | null — DS chainId unverified (route 400, by catalog) |
| deployer | LIVE Helius (create-tx fee_payer; window-100) | LIVE GoPlus keyless (creator_address; **unverified-tx flag**) | LIVE Blockscout (law-3 verified: to=null & from=claim, AERO) + GoPlus cross-check | null — no $0 source | null — no $0 source |
| holders (top-10 share) | LIVE Helius (getTokenLargestAccounts + getTokenSupply) | null — indexer needed (probe) | null — indexer needed | null | null |
| sell_test | LIVE Jupiter lite (tri-state) | null — 1inch needs key (401 probed) | null — 1inch needs key | null — no route concept | null — no route concept |
| whales (transfers+netflow) | LIVE Helius enhanced txs + DexScreener USD | null — birdeye trades 404 free | null — same | null | null |
| rug_flags | LIVE Helius DAS (update_authorities, mutable — BONK live-probed) | LIVE GoPlus (honeypot/tax/mintable/freezable) | LIVE GoPlus | null | null |
| dead providers (probed, never wired) | — | Routescan (chain not supported), Etherscan V2 free (founder-proven dead), alchemy transfers (category 'contract' rejected) | same | — | — |

## Module states (founder's six-word mandate honored)
- Dashboard: **LIVE** — real /api/scan verdicts, real whale feed, real health; mock-only
  surfaces (candles, cluster graph, AI narrative, alerts) render declared-SOON empty states.
- Rug check: **LIVE** engine unchanged (weights/score bitwise guarded by tests) + rug_flags
  context beside it.
- Token Scanner: **LIVE** 5-chain (hype refused by catalog).
- Whale Tracker: **LIVE on sol**; bnb/base = null + probe reason (no $0 trade feed).
- Swap: was already running (SIMULATED surface per TA-006 — unchanged).
- Cluster / AI analyst / Alerts / Portfolio / Token Gate: **SOON — untouched**, exactly as mandated.

## Verification & honesty mechanics shipped this mandate
- law-3 gate: `providers/evm.py verify_creation` — creator claims ship only with
  `to=null && from==claim`; GoPlus claims (no tx hash) always flagged unverified-tx.
- every context value carries `data_sources` / `notes` verbatim lines; null + reason is
  the universal "no $0 path" answer; suite-wide canning keeps the test grid network-free.
- snapshot drift gate + catalog⇄provider + wiring⇄catalog guards: three drift classes
  fail CI-style before they can lie to a user.
