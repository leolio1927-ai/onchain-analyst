# FEE-VAULTS — where the planned fee slices would land

PROMPT-V4 M3 deliverable (2026-08-31). This document defines the vault
architecture behind **GET /api/v1/fees/destinations**: the 5-chain × 3-slice
map of PUBLIC addresses that would receive the planned VILMEI fee
(0.50% = ops 0.30 · buyback 0.10 · rewards 0.10 — see docs/FEE-MODELS-2026.md)
if and when a fee path is ever wired. **Nothing flows today** — VILMEI is
read-only, and the vault map is policy data published BEFORE a single basis
point could move.

## 1. The laws (non-negotiable)

1. **Founder holds every key.** This repository never generates, derives,
   imports, stores or asks for a vault key. The only vault material that may
   ever appear in the repo — code, env, docs, git history — is a PUBLIC
   address.
2. **Claim-based.** A slice vault exists in the surface only after the founder
   claims it by setting `VAULT_{CHAIN}_{SLICE}_ADDRESS` in `.env`. An
   unclaimed slice renders `awaiting-founder` with the exact env var to set —
   a declared null, never a fabricated address, never an error.
3. **The map is data, not plumbing.** `/api/v1/fees/destinations` and the MCP
   tool `fee_destinations` return the same payload (one truth, two doors);
   `data_mode` is `static`. No route executes, signs or transfers.
4. **Settlement is off-chain.** Fee intake per chain follows the
   FEE-MODELS-2026 matrix verdicts; the ledger of what was collected and how
   it is split across the three vaults stays off-chain, manual, and
   claim-reconciled (VM-fee-03). There is no on-chain engine in this build.

## 2. The env convention

```
VAULT_{CHAIN}_{SLICE}_ADDRESS
```

- CHAIN ∈ SOL · BNB · BASE · HYPE · HOOD (upper; the five founder chains)
- SLICE ∈ OPS · BUYBACK · REWARDS (the SPLIT_BPS slices, providers/fee_models.py)
- Value = the public address only. Blank or whitespace = unclaimed.

15 variables in total; all ship empty in `.env.example`. The `.env` file never
enters git, and the tolerant parser (`webapp/envfile.py`, shipped M3) skips
malformed lines instead of crashing — the founder's real `.env` carries a
broken bare `=` on line 2 (probe 2026-08-31) and the server must survive it.
`scripts/dev-server.sh` exports every well-formed line through that parser.

## 3. The surface

| surface | what it answers |
|---|---|
| GET /api/v1/fees/destinations | the 5×3 vault map: per chain, the fee-path verdict (verbatim from FEE-MODELS-2026) + three slice vaults (address \| null, status, note); `claimed` / `total` counters; honest_note + provenance |
| POST /mcp → `fee_destinations` | the identical payload for agents (no arguments) |
| swap rail ADVANCED → VAULT chips | the current chain's three slice chips: shortened claimed address, or "awaiting founder claim" |

Honesty guarantees carried by the payload: an unclaimed slice says what the
founder must do (`set VAULT_X_Y_ADDRESS in .env`); a claimed slice states it
is a public address only; the buyback slice also inherits the VM-fee-01
blocker (no buyback engine exists).

## 4. What this is NOT

- Not custody: VILMEI never holds, touches or proxies vault assets.
- Not an execution rail: the fee paths of FEE-MODELS-2026 (Jupiter
  platformFeeBps on sol; hooks/BD elsewhere) are the ONLY possible intake,
  and none is wired in V1.
- Not key management: rotation, multi-sig and cold storage are founder
  concerns that live entirely outside this repository.

## 5. Roadmap hooks

- **VM-fee-01** (pre-existing): buyback engine — unblocks the buyback slice.
- **VM-fee-02** (M3): vault claim gate — flips slices from `awaiting-founder`
  to `claimed` as the founder sets addresses.
- **VM-fee-03** (M3): settlement ledger — off-chain accounting + manual claim
  reconciliation once any fee path goes live.
