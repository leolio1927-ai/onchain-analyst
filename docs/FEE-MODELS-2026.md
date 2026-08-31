# FEE-MODELS-2026 — provider matrix + the VILMEI planned fee

Research-first deliverable of PROMPT-V3 R4. Every row below was checked against
official documentation from this environment; URLs + check dates are cited per
row. Nothing in this file is invented: where a fact could not be verified from
here, the cell says so. **Status as of 2026-08-31.**

The question this matrix answers: *for each of the five founder chains, does a
$0 integrator-fee mechanism exist today — without a business agreement — and
what does it take?*

Verdict vocabulary (founder-mandated, three values):

- **SIAP-$0** — verified live, keyless, no agreement. Wire it and it works.
- **PERLU-AGREEMENT-BISNIS** — the path exists but needs a partner tier,
  application, or revenue-share agreement before fees can flow.
- **TIDAK-ADA** — no keyless integrator-fee API exists today. Sub-notes say
  what the non-instant escape hatch is (deploying our own hook) or that the
  docs were unreachable from the probe environment (BD/TBD).

## 1. The matrix

| # | venue | chain(s) | mechanics | official caps | custody | settlement | integration effort | URL (checked) | VERDICT |
|---|-------|----------|-----------|---------------|---------|------------|--------------------|---------------|---------|
| 1 | Jupiter Swap API v1 | sol | `platformFeeBps` on `/quote` + `/swap`; fee paid to integrator-supplied `feeAccount` — any valid token account for a pair mint (ExactIn: input or output mint; ExactOut: input mint). Keyless probe on lite-api.jup.ag accepted `feeBps` 100/101/5000 and echoed `platformFee:{amount,feeBps}` — no key, no agreement (2026-08-31). | none documented on the fee page at check time; historical docs cited 100 bps. Our planned 50 bps ≪ every figure observed. | VILMEI custodies nothing — the fee account is an integrator-owned on-chain token account; the terminal never holds keys. | on-chain, at swap time, in the swap mint | one quote parameter + one token account; $0 on the lite tier | dev.jup.ag/docs/swap/v1/add-fees-to-swap → developers.jup.ag (2026-08-31) | **SIAP-$0** |
| 2 | Jupiter Ultra | sol | Ultra's own platform fee 5–10 bps (up to 50 bps for tokens < 24 h old); "Ultra takes 20% of your integrator fees"; integrators set up referral accounts + token accounts; docs samples carry `x-api-key`. | Ultra platform fee 0–50 bps by asset/age tier; integrator share = 80% of integrator fee | none for VILMEI — referral/token accounts are integrator-owned | on-chain via Ultra execution | partner-tier setup + key; revenue share applies | developers.jup.ag/docs/ultra/fees (2026-08-31) | **PERLU-AGREEMENT-BISNIS** |
| 3 | Uniswap v4 | base · bnb | dynamic LP fee via a hook (`beforeSwap`) + protocol fee via the pool's `ProtocolFeeController`. No integrator-fee parameter exists in any public API. The escape hatch is deploying+auditing our own hook — permissionless, but not $0-instant. | n/a (hook-defined if deployed) | n/a — hook-owned by deployer | n/a | deploy + audit a hook contract per chain | developers.uniswap.org/docs/protocols/v4/concepts/dynamic-fees (303 at fetch; concept confirmed via search index, 2026-08-31) | **TIDAK-ADA** (tanpa deploy hook sendiri) |
| 4 | PancakeSwap Infinity | bnb · base | hooks framework + official `dynamic-fee-hook`: exponential fee curve on price impact, exponentially weighted pool price for arb detection, **max fee cap 5%** "to maintain trader fairness". That hook is an LP/arbitrage tool, not an integrator fee — integrator fees need our own hook. | dynamic-fee-hook hard cap 5% | n/a — hook owned by deployer | n/a | deploy + audit a hook contract | docs.pancakeswap.finance/trade/pancakeswap-infinity/hooks/dynamic-fee-hook (2026-08-31) | **TIDAK-ADA** (tanpa deploy hook sendiri) |
| 5 | Aerodrome | base | veAERO/gauge model; no keyless integrator-fee API found. Docs host unreachable from the probe environment (000). | unknown (unreachable) | unknown | unknown | BD conversation first | aerodrome.finance/docs (unreachable 2026-08-31) | **TIDAK-ADA** (BD/TBD) |
| 6 | Hyperliquid / HyperEVM | hype | HIP-3 builder-deployed perps with builder fee share + builder codes; HyperEVM spot itself is gas-only — no integrator-fee scheme for spot. | builder share per HIP-3 terms | n/a (builder-owned) | per HIP-3 | builder application required | hyperliquid.gitbook.io/hyperliquid-docs (root + builder-tools 200; HIP-3 via search index, 2026-08-31) | **PERLU-AGREEMENT-BISNIS** (builder application) |
| 7 | Robinhood Chain | hood (id 4663) | no public integrator-fee scheme found; docs host unreachable from probe. Chain liveness proven via GoPlus supported_chains (code 1, id 4663). | unknown (unreachable) | unknown | unknown | BD conversation first | docs.robinhood.com/chain (unreachable) + GoPlus supported_chains (probed 2026-08-31) | **TIDAK-ADA** (TBD — chain baru) |

**Conclusion (same as mandate 0-V3, now with caps + custody columns):** the only
$0 integrator-fee scheme verified live, keyless, and agreement-free today is
**Jupiter Swap API `platformFeeBps` on Solana**. Everything else is either a
hook we would deploy and audit ourselves (Uni v4, Pancake Infinity), a partner
tier (Jupiter Ultra, Hyperliquid builders), or a BD conversation (Aerodrome,
Robinhood Chain).

## 2. The VILMEI planned fee (policy constant, not a charge)

- **Planned total: 0.50% (50 bps)** of a swap's notional, if and only if a
  fee surface ever ships. Split, fixed in this document and mirrored in code
  (`providers/fee_models.py`):
  - **0.30% (30 bps) — operations**: infra, upstream goodwill, upkeep.
  - **0.10% (10 bps) — buyback**: see blocker VM-fee-01 below.
  - **0.10% (10 bps) — rewards**: signal-quality/data contributors.
- **Today nothing is charged.** VILMEI is a read-only terminal: no execution,
  no custody, no keys. The estimator endpoint and the UI strip exist so the
  policy is inspectable, quotable, and testable before a single basis point
  could ever flow.
- Where a fee would attach per chain (if it ever ships): sol = Jupiter
  `platformFeeBps` (SIAP-$0 today); bnb/base = only via a self-deployed hook
  (TIDAK-ADA today); hype/hood = no mechanism known (TBD). The API says exactly
  this per chain, verbatim from this matrix.

## 3. Blocker VM-fee-01 — the buyback slice has no engine

The 0.10% buyback slice is **blocked**: VILMEI ships no execution surface, so
there is nothing that could buy back anything. Designing a buyback engine would
require (a) an execution path (banned by the custody posture), (b) a treasury
custody decision (banned), and (c) token-design work (explicitly out of scope
for R4 — no new token is designed here). Until VM-fee-01 is resolved by a
founder decision, the slice stays declared-but-unwired in every surface:
estimator payload, UI strip, and this document. See `/roadmap` (VM-fee-01) and
`/docs` §17.

## 4. Founder tasks (BD queue — human work, not code)

1. **Jupiter**: decide lite-tier (keyless, probed) vs keyed tier; create the
   fee token account + mint policy when (if) the fee ships. Fee account is
   integrator-owned; VILMEI terminal never holds it.
2. **Aerodrome (base)**: open a BD conversation — docs unreachable from the
   probe environment; ask about integrator fee sharing.
3. **Hyperliquid (hype)**: file the HIP-3 builder application if perps ever
   enter scope; spot HyperEVM has no fee scheme.
4. **Robinhood Chain (hood)**: contact chain team once docs open; chain is
   alive (GoPlus id 4663) but no fee surface is public.
5. **Hook path (Uni v4 / Pancake Infinity)**: only if BD paths fail — scope a
   hook deploy + audit budget; this is the slow lane, per-chain, per-venue.

## 5. Machine surfaces

- `GET /api/v1/fees/estimate?chain=&amountUsd=` — the planned fee as data:
  rate + split in bps and USD, per-chain provider status verbatim from this
  matrix, and the honest note that nothing is charged. `data_mode: "static"` —
  a policy constant, not a live feed.
- `POST /mcp` → tool `fee_view` — same payload through the read-only MCP door.
- This file is the provenance both cite.
