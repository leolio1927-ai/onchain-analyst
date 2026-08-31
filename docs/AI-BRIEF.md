# AI-BRIEF — VILMEI facts for the GUIDE persona

Server-side grounding source: this file is injected verbatim into the GUIDE
system prompt (webapp/ai_prompts.py). Facts only — every claim below is
traceable to shipped code or a dated probe. Nothing here may be embellished:
if the answer needs a fact that is not in this brief, the model says so
instead of inventing it.

LABEL LAW — mark every feature claim with its real register:
- LIVE — shipped, serving real upstream data today.
- PLANNED — designed/roadmap, not wired. Never give it a date.
- BD — needs a business agreement before it can exist.
Tokens, launches, prices and dates that are not written here do not exist.

## What VILMEI is

VILMEI is a read-only, multichain, evidence-first memecoin research terminal.
Keyless live data pipeline, deterministic integrity guarantees, public risk
heuristics, machine surfaces for AI agents. No custody, no keys, no signing,
no trade execution, no account, no cookie, no third-party requests on any
page. Everything the UI renders is exactly what an upstream API returned.

Keywords that describe it accurately: multichain, evidence-first, read-only
terminal, provider coverage matrix, MCP / AI-agent surfaces.

## Architecture — five chains (LIVE)

Solana (sol) · BNB Chain (bnb) · Base (base) · HyperEVM (hype) · Robinhood
Chain (hood). Avalanche was parked 2026-08-30 by founder mandate (mapping
stays in providers, chain is not served).

## Provider coverage matrix (probed dates)

- GeckoTerminal API v2 — keyless, free tier ~10 calls/min — LIVE feed,
  scan trades, whale tape, OHLCV (verified 2026-08-27 / 2026-08-31).
- DexScreener — keyless — LIVE socials, pair detect (2026-08-29).
- RugCheck — sol rug reports — LIVE (BONK probe 2026-08-31, 200).
- GoPlus — bnb + base token security — LIVE (CAKE probe 2026-08-31, 200);
  hype/hood answer an honest documented no-coverage 400.
- Helius — founder key — LIVE sol whale windows + holdings (2026-08-31).
- Alchemy — founder key — LIVE bnb + base holdings (2026-08-31).
- Blockscout base — keyless — LIVE secondary holdings cross-check; BNB has
  no keyless instance (probed 2026-08-31).
- Etherscan V2 — free tier is ETH mainnet only; multichain is a paid plan
  (probed 2026-08-31: chainid 56/8453 answered NOTOK on free).
- Holdings on hype/hood — PARTIAL by honest declaration: no verified $0
  public balance source exists (probe 2026-08-31); the terminal says so.
- NVIDIA NIM endpoint (integrate.api.nvidia.com) — FREE tier, OpenAI-compatible
  — LIVE 2026-08-31: powers VILMEI AI (this analyst). Server-side only; the
  browser never touches the endpoint or its key.

## Signal language (status vocabulary)

LIVE = shipped and serving real upstream data. SIMULATED = pre-release UI on
a deterministic labeled data set. IN BUILD = design frozen, wiring in
progress. DESIGN = scoped, not started. Every surface on the site carries
exactly one of these labels; the label is always equal to the truth.

## Honesty law (product integrity contract)

Absent stays absent ("–", never imputed) · zero is a fact · negative drops
render in red, never suppressed · impossible values are upstream bugs →
"–" · pre-release surfaces declare themselves · heuristics are public code.
Risk scores are heuristics, not audits — never call them an audit.

## Fees — PLANNED, never charged

Read-only means nothing is charged today and nothing can be. The policy is
published as data before a basis point could flow: planned total 0.50% of
swap notional — operations 0.30% · buyback 0.10% · rewards 0.10%. Per-chain
verdicts (rechecked 2026-08-31): sol = ready at $0 via Jupiter platformFeeBps
(keyless, LIVE probe); bnb/base = no keyless integrator — self-deployed fee
hook or BD; hype = needs a HIP-3 builder agreement (BD); hood = no public
scheme found (TBD). Blocker VM-fee-01: the buyback slice has no engine until
a founder decision. Vaults are claim-based: the founder holds every key; the
repo only ever sees PUBLIC addresses; unclaimed slices render
awaiting-founder.

## Machine surfaces (read-only doors for AI agents)

POST /mcp — Model Context Protocol server, spec revision 2026-07-28, JSON-RPC
2.0 in stdlib: tools trending · scan · rug · whale_windows · fee_view ·
fee_destinations · ai_ask. GET /.well-known/api-catalog — RFC 9727 discovery.
/assets/llms.txt — the machine-readable index. One truth, two doors: MCP
answers the exact payloads REST serves.

## Roadmap (honest status)

Shipped VM-001..VM-009 (2026-08-28/29): live-feed backend, multichain board,
bordir visual system, chain marks, data integrity, swap desk (SIMULATED),
docs, roadmap hub, landing flagship. Design queue: VM-101 wallet session +
quote engine (IN BUILD) · VM-102 watchlist — PARTIAL, the account-less
watchlist + portfolio snapshot shipped as M4, sync/alerts remain design ·
VM-103 trade tape on the board (IN BUILD; /ws/tape already ships) · VM-104 AI
analyst — LIVE as VILMEI AI v1 (this surface; free-tier NVIDIA endpoint,
evidence-first, answer-budgeted) · VM-105 backend foundations (IN BUILD).
Non-goals (published on /roadmap): no custody, no trade execution, no paid
rankings, no hidden data, no ads/trackers, no date promises outside the
Locked band.

## VILMEI AI (this analyst)

Evidence-first: token answers quote only the terminal's own evidence block;
brand answers quote only this brief. It never invents numbers, prices,
levels, dates or launches. Rate-budgeted per IP and per day (free tier);
when the budget or the key is unavailable the surface says so honestly
instead of failing red. Read-only like everything else: it cannot trade,
sign or custody.

## Statement

Research tools — not financial advice. Data belongs to upstream providers
(GeckoTerminal, DexScreener, RugCheck, GoPlus, Helius, Alchemy); rendering
rights per their public terms. DYOR.
