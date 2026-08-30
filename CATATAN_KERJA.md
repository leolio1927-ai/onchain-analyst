# WORKING NOTES — Terminal Alpha (AI Memecoin Scanner Terminal)

## 1. What This Is and Why It Was Built
Terminal Alpha is a terminal (CLI/TUI) for memecoin traders: hunting, scanning, risk analysis, AI reasoning — across chains (Solana, BSC, Base, HyperEVM/Hyperliquid, Avalanche).
It is NOT: a trading bot (NO transaction execution), not a replacement for execution platforms (Axiom/GMGN/BullX), not a buy/sell signal provider. Differentiation: AI that explains WHY with transparent reasoning, without custody.

## 2. Principles That Must Never Be Violated
1. No transaction execution. The terminal is purely for research/analysis.
2. No custody of user funds. Never ask for or store private keys; balance checks only via public address.
3. The free version must not be deliberately made less accurate. The utility token controls DEPTH (free/deep tier), not the CORRECTNESS of the data.
4. The AI must not invent facts. All conclusions are grounded in provider data (evidence-first).
5. No "high accuracy / guaranteed profit" claims. Framing: reducing noise, adding context.
6. The risk verdict is never binary from a single signal. Combined heuristics; insufficient data → honestly "INSUFFICIENT DATA".

## 3. Chain Coverage
Targets: Solana (sol), BNB (bnb), Base, HyperEVM/Hyperliquid (hype), Avalanche (avax).
Robinhood Chain ($HOOD) is not yet verified on any provider — do not display it as supported until it is verified.

## 4. Architecture
CLI/TUI input → Data Layer (DexScreener aggregate; GeckoTerminal per-wallet trades; Helius wallet balance; later Birdeye/Bitquery) → deterministic Heuristic Layer (rug_check, clustering) → AI Analyst (receives heuristic results + data as context; must not add facts; output per tier) → Terminal UI (Textual).
Principle: the AI never talks directly to raw APIs — always through the heuristic layer.
Web (2026-08-27): frontend/ (React+Vite+TS, MPA: index=landing, terminal=web terminal) + webapp/ (FastAPI serving dist + /api/scan|explain|whale|health). Same engine as the TUI; /api/explain re-fetches and re-assesses SERVER-SIDE (the client cannot forge evidence); AI endpoints rate-limited per-IP; without a dist → an honest "run npm run build" page. All user-facing strings are English (web + TUI + evidence + AI output); all documents and code comments are English too (translated 2026-08-29).

## 5. Data Source Strategy
MVP: DexScreener (free, no key, NO per-wallet data). In parallel: GeckoTerminal (individual trades, free, basic clustering). Later: Birdeye (production, official MCP server), Bitquery (deep queries, opaque pricing).

## 6. Rug-Check & Clustering — Honest Status
Already running: 6 weighted deterministic signals (heuristics/rug_check.py) — liquidity, FDV/liquidity, volume/liquidity, 24h buy/sell ratio, pair age, PLUS wallet coordination from heuristics/clustering.py v0 (burst timing + amount uniformity; GeckoTerminal per-wallet trade data; samples of <8 wallets → not scored, shown honestly). /load computes clustering automatically; if the provider fails → honest degradation to 5 signals + a note.
Not yet present (do not claim these to users): top holder concentration; funding-source traceback; sniper-bot database; circular transfer detection.
False-positive principle: fair-launch/airdrop/KOL calls can mirror the "bad" pattern. Heuristics = decision support, not a verdict.

## 7. AI Analyst
Pattern: provider → heuristic → AI reasoning. Already present (ai_analyst.py): a system prompt forbidding certainty claims/solicitation; multi-provider claude/glm/kimi via registry + .env; grounding log per call → logs/grounding/YYYY-MM-DD.jsonl (evidence + raw output + structured output + parse_ok + token usage); structured JSON output {"summary","key_signals","limitations"} (keys "ringkasan"/"sinyal_kunci"/"keterbatasan" at audit time, since renamed) with an honest fallback to raw text if the model ignores the format; the tier in the signature only controls LENGTH (max_tokens 400/1000 — not correctness), access via access/token_gate.py v0 which is always "free" (deep postponed until soulbound exists).
Not yet present: runtime validation of the real model's evidence-first compliance (requires the founder's keys).

## 8. Token Utility
The token does NOT control custody/execution and is NOT sold with a profit narrative. It purely controls access to AI feature depth. Safe analogy: a software license/API key. Recommended (not yet implemented): non-transferable/soulbound, time-bound, an alternative USDC payment path, governance kept fully separate.

## 9. Code Module Status
providers/dexscreener.py (running; sol/bnb/base/avax; hype held back), providers/geckoterminal.py (running; per-wallet trades; fields & network ids VERIFIED live 2026-08-27), providers/helius.py (skeleton; wallet balance needs HELIUS_API_KEY — the founder's to handle; response not yet verified at runtime), heuristics/rug_check.py (running; 6 weighted signals, optional clustering), heuristics/clustering.py (running; burst + uniformity; <8 wallets not scored), ai_analyst.py (running; multi-provider; grounding log; structured JSON output), access/token_gate.py (v0 skeleton, free-only; soulbound/time-bound hook), app.py + ui/ (MVP running; /load, /verify, /cluster, /explain [claude|glm|kimi], /whale, /help), webserve.py (running; textual-serve localhost:8000), tests/ (26 green tests: rug_check, clustering, geckoterminal, ai JSON/grounding/tier, token_gate, chart helper, UI snapshot).
The old document version's module list (data_sources.py, trade_feed.py, whale_tracker.py, token_gate.py flat in the root) NO LONGER applies — everything was restructured into the providers/ + heuristics/ + access/ packages.
Web additions: webapp/server.py (FastAPI; scan/explain/whale/health; 30s TTL cache; per-IP AI rate limit via ALPHA_AI_RATELIMIT_HOURLY/DAILY), frontend/ (Vite 8 + React 19 + TS 7, 2-entry MPA, no UI framework; watchlist in localStorage; command bar identical to the TUI).

## 10. Verified vs Still Assumed
Verified: GeckoTerminal has a free per-wallet trade endpoint; DexScreener does not expose per-wallet data; Birdeye has an MCP server; the wash-trading paper (arXiv 2603.13830) exists. ADDITIONAL VERIFICATION 2026-08-27 (checked live): GeckoTerminal response fields (tx_from_address, kind, block_timestamp, volume_in_usd, from/to_token_address); GeckoTerminal network ids solana/bsc/base/avax.
Still assumptions (DO NOT quote to users/marketing): the figures "AUC 0.9098", "lead time 3.81 hours", "$0.003/request"; the GLM "glm-5.3" & Kimi "kimi-k3" model IDs and their base URLs (waiting on the founder's keys); the Helius response shape (needs a key); the HyperEVM chain ID.

## 11. Priority Roadmap
1. Runtime validation together with the founder (glm/kimi model IDs, Helius response, the real model's JSON compliance). 2. Funding traceback (sampling 10-15 wallets). 3. Sniper-bot DB. 4. Top holder concentration (needs a holder-data provider). 5. Migrate to Birdeye once there is traction. 6. Soulbound/time-bound token gate + activate the deep tier.
(Done & crossed off the old roadmap: grounding log, structured JSON output, clustering v0.)

## 12. Product Disclaimer (mandatory in UI/marketing)
Tool for analysis & education. AI output is NOT financial advice. The risk score is an automated heuristic, not an official audit. DYOR. Trading memecoins is very risky.


## 13. ALL-LIVE $0 status — 2026-08-30 (founder mandate executed)
Lineup: 5 chains (sol/bnb/base/hood/hype). avax DISABLED everywhere (parked, never deleted):
providers CHAIN_IDS/NETWORKS/CHAINS, catalog DISABLED_CHAINS, FE cards/pills/counts.
Live modules: scanner (5-chain, verdict + provenance-stamped context), rug flags (sol helius
DAS authorities; bnb/base goplus security — verbatim values), whale tracker (sol transfers +
netflow; bnb/base = probe reason), dashboard (real scan/whales/health; never-wired panels are
declared-SOON empty states). Swap stays the SIMULATED surface (TA-006). Cluster / AI analyst /
Alerts / Portfolio / Token Gate: SOON — untouched per mandate.
Deployer truth: base = Blockscout primary, law-3 on-chain verified (to=null && from=claim;
AERO matched); bnb = GoPlus keyless (creator claim flagged unverified-tx — provider ships no
creation tx). Dead at $0 (probed, never wired): Routescan (chain not supported), Etherscan V2
free (founder-proven), alchemy transfers (category 'contract' rejected), Birdeye trades/token_
security (404/401 on free tier — only token_overview is free, 300 req/min paced).
Gates: pytest 198P (+ snapshot), ruff 0, tsc 0, build OK. Probe reports:
docs/reports/capability-probe-2026-08-30.md + phase1-probe-2026-08-30.md +
ALL-LIVE-STATUS-2026-08-30.md.
