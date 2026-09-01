# VILMEI TERMINAL — DEEP DUE-DILIGENCE AUDIT (CTO × Auditor × AI Researcher × Security)
**Date:** 2026-09-01 · **Mode:** read-only audit, no code changed · **Scope:** Terminal (14 routes) + backend + providers + persistence + tests + docs
**Runtime verified on localhost:8000** (health 200, ledger $RAY live, top-100 index walker completed 132,000 accounts, landing chat glm-5.3-flash live).
**Founder directive recorded (binding for the AI phase):** the terminal **AI Analyst moves to the B.AI key** — models `qwen-3.8-flash` and/or `deepseek-v4-flash` (both allowed) — **NVIDIA NIM is dropped for this surface** (latency). The landing §06 chat keeps `glm-5.3-flash` on B.AI. See §9-AI and P1-A.

Anti-hallucination rule applied throughout: anything not verifiable in this repository/runtime is written **"Not verified in the current repository/runtime."**

---

## 1. Executive Summary

VILMEI today is a **real, evidence-first research core** wearing a terminal that still contains five cosmetic-but-fake rooms. The core is genuinely strong: 47 FastAPI routes (webapp/server.py), a provider abstraction of ~20 keyless/keyed upstreams, a risk engine with public weights (heuristics/rug_check.py), a token ledger that is provable per-row (providers/ledger_solana.py, schema 1.2, top-100 walker live), SSE AI streaming with server-side evidence grounding (webapp/ai_ask.py), MCP surface (webapp/mcp.py), and test discipline (pytest 356 green, vitest 144 green).

The single biggest risk to the product is **not missing backend** — it is **UI/backend mismatch on secondary pages**: a fake "Premium Deep" entitlement (frontend/src/pages/Pages2.tsx:936-939 vs access/token_gate.py:12-14 which always returns `free`), a "Feedback received" lie (Pages2.tsx:1077), fabricated system status, hardcoded alert counts, and a cluster page running on mock data while the real `clustering` field from `/api/scan` is ignored. Each of these contradicts the product's own Integrity Law and is one screenshot away from destroying the credibility the ledger builds.

**Verdict:** Foundation: real and above-average. Product honesty debt: critical, fixable in days. Path to "agent-ready, evidence-first terminal" is rational and mostly additive — no rewrite required.

---

## 2. What VILMEI Actually Is Today

- **Public plane (v1 community deploy):** landing, /live, /ledger, /roadmap, /docs — all live, DNA-unified, proven by headless sweeps (logs/shots/final-*.png).
- **Terminal plane:** hash-routed SPA (frontend/src/layout/Shell.tsx:49) with 14 routes (frontend/src/layout/navModel.ts:15-30). Core analytics live; 6 routes are soon/mock/static (see §7 matrix).
- **What VILMEI is NOT (verified):** no order routing, no private-key handling, no custody, no user accounts, no billing. access/token_gate.py:12-14 `resolve_tier() -> "free"` always.
- **AI surface reality:** landing chat = B.AI `glm-5.3-flash` (providers/bai.py:18) live-verified; terminal analyst = NVIDIA NIM catalog with `deepseek-ai/deepseek-v4-flash-0731` (free) / `moonshotai/kimi-k3` (deep) / `deepseek-ai/deepseek-v4-pro-0813` (fallback) (providers/nvidia.py:44-46) — the NVIDIA free tier stalls for minutes at a time (documented in webapp/server.py V6-3 comment); founder directive now replaces this surface with B.AI.

---

## 3. Terminal Route Matrix

| # | Route | Component | Pill claim | Verified status | Evidence |
|---|---|---|---|---|---|
| 1 | #/dashboard | Dashboard.tsx | — | **LIVE** (scan, health, whale sol-only, AI) | calls /api/scan, /api/health, /api/v1/whales/{chain}/{token} |
| 2 | #/swap | TokenPage.tsx | NEW | **QUOTE-ONLY** (execution absent) | frontend/src/pages/TokenPage.tsx:51-55,314 |
| 3 | #/scanner | AnalysisPages.tsx | — | **LIVE** (manual scan; trending client-side) | POST /api/scan; DexScreener from browser |
| 4 | #/rugcheck | RugWhaleMulti.tsx | LIVE | **LIVE-PARTIAL** (sol=RugCheck/Helius, bnb/base=GoPlus, hype/hood=market-signal) | GET /api/v1/rug/* |
| 5 | #/whale | RugWhaleMulti.tsx | LIVE | **LIVE-PARTIAL** (heuristic tape whale, not entity intelligence) | /api/v1/whale/windows, /auto |
| 6 | #/cluster | AnalysisPages.tsx | soon | **MOCK/SIMULATED** | buildClusters + MEMEATCHI (frontend/src/mock/data.ts); backend field `clustering` unused by this page |
| 7 | #/ai | Pages2.tsx | LIVE | **LIVE** (SSE, evidence-grounded; history session-local) | POST /api/v1/ai/ask |
| 8 | #/portfolio | Pages2.tsx | LIVE | **LOCAL** (account-less, localStorage) | /api/v1/portfolio/snapshot |
| 9 | #/alerts | Pages2.tsx:563-565 | soon | **MOCK/SIMULATED** | ALERTS fixture filter; badge "3 UNREAD" hardcoded |
| 10 | #/holdings | Pages2.tsx | LIVE | **LIVE-PARTIAL** (sol=Helius, bnb/base=Alchemy/Blockscout, hype/hood=partial) | /api/v1/holdings/{chain}/{address} |
| 11 | #/gate | Pages2.tsx:930 | soon | **STATIC** (claims Premium Deep; backend free-only) | Pages2.tsx:936-939 vs access/token_gate.py:12-14 |
| 12 | #/settings | Pages2.tsx:977 | soon | **STATIC/LOCAL** (useState prefs; not persisted; lib/prefs.ts unused here) | Pages2.tsx:977-985 |
| 13 | #/docs | Pages2.tsx:1046 | soon | **STATIC + STALE** ("API (WHEN WIRED)" while endpoints exist); rich DocsPage.tsx not routed | Pages2.tsx:1046 |
| 14 | #/feedback | Pages2.tsx:1061 | soon | **MOCK** (`setSent(true)` only; no network call) | Pages2.tsx:1077 |

Shell.test.tsx pins pill claims against wired routes — the "SOON" pills are honest; the dishonesty is inside page content, not the nav.

---

## 4. Backend Coverage Matrix

47 `@app` routes in webapp/server.py (grep count). Grouped:

| Group | Routes (method path) | Provider | Cache | Persistence | Frontend consumer | Tests |
|---|---|---|---|---|---|---|
| System | GET /api/health, /api/version, /api/metrics | self | — | — | Dashboard, landing | ✓ test_webapp_api |
| Scan | POST /api/v1/scan, POST /api/scan (deprecated alias) | DexScreener+GeckoTerminal+heuristics | TTL | SQLite iff ALPHA_DB_PATH (webapp/db.py:151-153) | Landing scan, Dashboard, Scanner | ✓ |
| Explain | POST /api/v1/explain, /api/explain (deprecated) | heuristics | — | — | TUI | ✓ |
| AI | POST /api/v1/ai/ask (SSE), POST /api/v1/landing/chat (SSE) | nvidia.py (NIM) / bai.py (B.AI) | answer cache 240s + circuit breaker (webapp/ai_ask.py:236-262) | none (history client-only) | landing §06, AiPage | ✓ test_ai_ask, test_landing_chat |
| Ledger | GET /api/ledger, GET /api/ledger/history, GET /ledger.jsonl | Solana RPC + Helius DAS walker | 60s payload + top-100 index file | data/ledger/*.json snapshots + top100 index | ledger page, agents | ✓ 18 tests |
| Discovery | GET /api/v1/discovery | GeckoTerminal | TTL | — | — (UI consumer not verified in current runtime) | ✓ test_discovery |
| Market | GET /api/v1/market/ohlcv, /api/v1/socials, /api/v1/detect, /api/v1/tokens/{chain}/{ident} | DexScreener/GeckoTerminal | TTL | — | Swap | ✓ |
| Rug | GET /api/v1/rug/sol/{mint}, /api/v1/rug/evm/{chain}/{token} | RugCheck, GoPlus, Helius | provider TTL | — | RugCheck page | ✓ |
| Whale | GET /api/v1/whales/{chain}/{token}, /api/v1/whale/windows, /api/v1/whale/auto; POST /api/whale (legacy) | GeckoTerminal tape, Helius | window cache | — | Whale page, Dashboard | ✓ test_whales, test_whale_windows |
| History | GET /api/v1/history/prices|trades/{chain}/{ident} | providers | — | — | — (not verified consumed by UI) | ✓ test_history |
| Wallet labels | GET /api/v1/wallets/{address} | labels engine | — | ledgers/labels.solana.json | — | ✓ |
| Chains | GET /api/v1/chains | chains_map.py | — | — | Dashboard | ✓ |
| Fees | GET /api/v1/fees/estimate, /api/v1/fees/destinations | Jupiter fee probe | — | — | Swap | ✓ test_fee_models |
| Portfolio | GET /api/v1/portfolio/snapshot | market join | — | — | Portfolio page | ✓ test_portfolio |
| Holdings | GET /api/v1/holdings/{chain}/{address} | Helius/Alchemy/Blockscout | — | — | Holdings page | ✓ test_holdings |
| MCP | POST /mcp | reuse core tools | — | — | external agents | ✓ test_mcp |
| WS | /ws/snap, /ws/tape | internal | — | — | live/tape | ✓ test_ws_* |

**Route-level findings:**
- Legacy deprecated aliases (/api/scan, /api/explain, /api/whale) still mounted — documented as aliases; low risk, keep with deprecation headers (verified deprecated=True in OpenAPI snapshot).
- GET /api/v1/history/* and /api/v1/discovery: **frontend consumer not verified in the current runtime** — candidates for the terminal Scanner "history" feature later.
- Missing backend (no route exists): cluster analysis, alerts, feedback, settings persistence, token-gate entitlement, subscription/billing, swap execution, notifications, user accounts, AI history persistence, portfolio history. **UI surfaces exist for several of these — that is the §8 honesty problem.**

---

## 5. Data Source Matrix

| Data | Source (file) | Keyless? | Verified live today |
|---|---|---|---|
| Pools/trades/trending | GeckoTerminal (providers/geckoterminal.py) | yes | yes |
| Pair quotes/socials | DexScreener (providers/dexscreener.py) | yes | yes |
| Solana supply/holders/authority | Solana public RPC + Helius DAS (providers/ledger_solana.py) | public yes; Helius keyed (.env) | yes (RAY, 132k walked) |
| EVM security | GoPlus (providers/goplus.py) | yes | yes (bnb/base) |
| Solana rug data | RugCheck API + Helius | partial | yes (sol) |
| EVM holdings | Alchemy (providers/alchemy.py) / Blockscout | keyed/keyless | partial |
| Swap quotes | DexScreener client-side | yes | yes |
| AI free/deep | NVIDIA NIM (providers/nvidia.py) | keyed | intermittent (stalls documented) |
| AI chat | B.AI (providers/bai.py) `glm-5.3-flash` | keyed (.env, silent read bai.py:40-52) | yes |
| Price fallbacks | NATIVE_USD_HINT static map (TokenPage.tsx:51-55) | — | **static — must not render as live** |

---

## 6. Persistence and State Matrix

| State | Where | Survives restart | Survives device |
|---|---|---|---|
| Ledger snapshots + top-100 index | data/ledger/*.json | yes | no (server-local) |
| Scan records | SQLite iff ALPHA_DB_PATH set (webapp/db.py) | env-dependent | no |
| AI answer cache | in-memory OrderedDict (webapp/ai_ask.py:266) | no | no |
| AI grounding log / history | React state, max 8 rows | no | no |
| Watchlist / portfolio amounts | localStorage `vilmei.watchlist` | browser-yes | no |
| Live-board watchlist stars | localStorage `vilmei-watch-v1` | browser-yes | no |
| Settings prefs | useState only (Pages2.tsx:977-985); lib/prefs.ts EXISTS but unused by Settings | no | no |
| Alerts | mock/data.ts fixture | — | — |
| Feedback | nothing (setSent(true) only) | — | — |
| Budget counters | data/ai-budget.json | yes | no |

---

## 7. Live/Partial/Static/Mock Findings (per-surface verdicts)

See §3 matrix for status per route. Summary counts: **LIVE 6 · LIVE-PARTIAL 3 · QUOTE-ONLY 1 · LOCAL 1 · STATIC 2 · MOCK/SIMULATED 3** (of 14).

## 8. Critical Honesty and Security Findings

| # | Finding | Evidence | Severity | Fix |
|---|---|---|---|---|
| H1 | "Premium Deep / VALID UNTIL 2026-12-31 / 89%" — backend always `free` | Pages2.tsx:936-939 vs access/token_gate.py:12-14 | **CRITICAL (integrity)** | Render `resolve_tier()` result; if free → "FREE · all surfaces, no limits"; gate page shows PLANNED pricing only |
| H2 | "Feedback received" with zero network call | Pages2.tsx:1077 | **CRITICAL (trust)** | Label "LOCAL DRAFT — transport not wired" until POST /api/feedback exists (append to data/feedback.jsonl minimum) |
| H3 | System status fabricated (region/ping/AI online/Alerts active) | mock SYSTEM_STATUS in Feedback page | HIGH | Probe /api/health + /api/version live; absent fields render "–" |
| H4 | Alerts "3 UNREAD" hardcoded; no engine | Pages2.tsx:563-565 | HIGH | Label SIMULATED + computed count from local state, or build P1 alert store |
| H5 | Cluster page renders mock risk score; real `clustering` field from /api/scan unused | AnalysisPages.tsx + mock/data.ts | HIGH | Feed page from scan.clustering; label SIMULATED when absent |
| H6 | NATIVE_USD_HINT static prices can render like live values in a financial UI | TokenPage.tsx:51-55,314 | HIGH | Label "ESTIMATE (static hint)" or render "–" |
| H7 | Terminal docs panel stale: "API (WHEN WIRED)" while endpoints live; rich DocsPage.tsx unrouted | Pages2.tsx:1046 | MEDIUM | Sync panel; consider routing DocsPage content into terminal |
| S1 | AI provider latency (NVIDIA stalls) degrades the LIVE AI surface | server.py V6-3 comment; G0 incident | HIGH (ops) | **Founder directive: move terminal AI to B.AI (qwen-3.8-flash / deepseek-v4-flash)** — see §9 |
| S2 | No evidence hash / signed provenance on AI verdicts | ai_ask.py (no hash persisted) | MEDIUM | sha256(evidence+answer) into provenance event; ledger-ready |
| S3 | MCP tool descriptions are code-trusted; no mcp-scan in CI | webapp/mcp.py | MEDIUM | Keep MCP read-only; add scan step before any write-tool exists |
| S4 | Wallet connect = address read-only (verified); no private-key paths found | wallet/* | OK — boundary holds | keep |

---

## 9. Technology Research 2026 (primary sources; verified 2026-09-01)

| Tech | Category | Maturity | Use for VILMEI | Verdict |
|---|---|---|---|---|
| Envio HyperSync/HyperIndex | indexing | **production** (70+ chains, claims up to 2000× RPC; Solana+EVM) | backfill trades/history, wallet clustering corpus, holder history | **Adopt P2** (data platform phase) — [docs](https://docs.envio.dev/docs/HyperIndex/overview), [HyperSync](https://docs.envio.dev/docs/HyperIndex/hypersync) |
| ClickHouse | OLAP | production (DeFi case: 150M rows/h) | trade tape, whale events, candles, dashboard aggregations | **Adopt P2** when SQLite caps — [use case](https://clickhouse.com/use-cases/real-time-analytics), [StockHouse ref](https://github.com/ClickHouse/stockhouse) |
| TimescaleDB + pgvector | time-series+similarity | production | mid-scale events + "similar token/wallet incidents" search for AI evidence | P2 alternative to ClickHouse (ops-lighter) |
| DuckDB | embedded analytics | production | local research/Parquet exports (TUI power users) | watchlist |
| Yellowstone gRPC (Geyser) / Helius LaserStream | Solana realtime | production (vendor) | sub-second swap/wallet events → alert engine latency | **P1.5 with Alerts backend** (requires paid stream; cost-gate) |
| EVM realtime (Substreams/Alchemy webhooks) | EVM realtime | production | same for EVM chains | P1.5, choose one vendor per chain |
| viem fallbackTransport / provider health scoring | RPC resilience | production | multi-endpoint failover for EVM reads; pattern reusable in providers/ | **Adopt P1.5** (pattern, not dependency) |
| Slither/Echidna/Foundry/Halmos/Certora | contract security | production/proven | audit the FUTURE VLM token contract + any escrow | **Adopt at F2/F3** (token launch), not before |
| Tenderly Simulation | tx simulation | production | pre-sign simulation gate for future swap execution | **Adopt P3 before any signing** |
| OpenZeppelin Monitor | runtime monitoring | production | post-launch runtime guards | P3 |
| EAS (Ethereum Attestation Service) | provenance | production (EVM; also L2s) | attest "scan X produced verdict Y with evidence-hash Z" → agent-verifiable provenance | **P2/P3** — note: EAS proves who-said-what, not truth; attester reputation still needed — [docs](https://docs.attest.org/), [how it works](https://docs.attest.org/docs/core--concepts/how-eas-works) |
| ERC-3643 / ONCHAINID | RWA compliance | production (RWA permissioned tokens) | classify RWA tokens, compliance registry checks | **P3 (RWA phase F6)** — [erc3643.org](https://www.erc3643.org/) |
| Chainlink Proof of Reserve | oracle data | production | reserve evidence row for stables/RWA verdict cards | P3 watchlist |
| MCP | agent protocol | **production — spec 2026-07-28** (JSON-RPC, resources/prompts/tools; Tasks extension for long-running async ops) | VILMEI already exposes /mcp; Tasks maps to deep-scan jobs; security principles align with read-only law | **Adopt now (read-only), add mcp-scan to CI** — [spec](https://modelcontextprotocol.io/specification/latest) |
| x402 (HTTP 402 payments, Linux Foundation) | agent payments | early-production (adoption growing; 1B+ payments claimed by tracker) | sell evidence blocks/deep analyses to external agents per-request | **P3 monetization** — [x402.org](https://x402.org/) |
| ERC-8004 (agent identity/reputation) | agent identity | **draft/early** | watchlist only; not a hard dependency | watchlist |
| EIP-7702 (Pectra, live 2025-05-07) + ERC-4337 | wallet/AA | production (mainnet) | future policy-controlled execution; batching, sponsorship | **P3, behind policy gate** — [EF blog](https://blog.ethereum.org/2025/04/23/pectra-mainnet) |
| Turnkey / Privy | key infra | production | only if/when signing is a product; TEE + spending policy + human approval | P3, not before |
| OpenTelemetry | observability | production | traces for RPC/provider/AI/WS/MCP latency | **P2** (start with a single OTel collector) |
| Langfuse | AI observability | production, self-hostable | per-run AI traces: prompt version, evidence digest, cost, eval scores | **P1.5-P2** — pairs with S2 evidence-hash — [self-hosting](https://langfuse.com/self-hosting), [observability docs](https://langfuse.com/docs/observability/overview) |
| **B.AI (chat models) — founder directive** | LLM provider | live-verified in this repo (bai.py, glm-5.3-flash streaming) | **Terminal AI Analyst moves to B.AI key: `qwen-3.8-flash` and/or `deepseek-v4-flash`; NVIDIA dropped for this surface (latency). Landing chat stays `glm-5.3-flash`.** bai.open_stream(model_id=…) already supports per-call override (providers/bai.py:61,69) | **P1-A (implement next)** — exact B.AI model-ID strings not enumerable: `/v1/models` returns 403 on this plan → verify IDs with one probe call during implementation ("Not verified in the current repository/runtime") |

---

## 10. Recommended Target Architecture (12 layers, additive)

1. **Presentation** — public 5-surface (v1) + terminal SPA (phased).
2. **API/BFF** — FastAPI (existing server.py) + SSE contracts; keep deprecated aliases marked.
3. **Evidence assembly** — already exists (webapp/ai_ask.py truncate/digest); add evidence_hash to every verdict (S2).
4. **Risk/heuristic engine** — heuristics/rug_check.py public weights (keep deterministic; never hidden models).
5. **AI orchestration** — provider abstraction: bai.py becomes the primary chat+analyst plane (founder directive), nvidia.py demoted to optional fallback; per-surface model routing via env (`VILMEI_CHAT_MODEL`, `VILMEI_ANALYST_MODEL_FAST/DEEP`); circuit breaker + answer cache unchanged.
6. **Tool/MCP layer** — read-only now; Tasks extension later for long scans; mcp-scan in CI before any write tool.
7. **Realtime ingestion** — WS today; Yellowstone/LaserStream when alerts demand sub-second.
8. **Historical layer** — SQLite (ALPHA_DB_PATH) now → Timescale/ClickHouse at P2; ledger snapshots pattern is the template.
9. **Provenance/attestation** — evidence-hash first (S2), EAS on-chain attestation later (P2/P3).
10. **Security & policy** — read-only law enforced by architecture; future execution = policy engine → simulation (Tenderly) → human approval → sign (7702/4337 + Turnkey/Privy) → record.
11. **Observability** — OTel collector + Langfuse for AI runs (P2).
12. **Optional execution** — none today; guarded by layer 10; the workflow stays: DISCOVER → FETCH EVIDENCE → VALIDATE → SCORE → EXPLAIN → PROPOSE → SIMULATE → POLICY → APPROVE → SIGN → RECORD.

---

## 11. Prioritized CTO Roadmap

**P0 — product honesty (days, before any terminal news):**
1. Gate page renders `resolve_tier()` → "FREE" (H1). 2. Feedback = "LOCAL DRAFT" + append-only data/feedback.jsonl (H2). 3. System status from /api/health live (H3). 4. Alerts labeled SIMULATED, unread count computed (H4). 5. Cluster page feeds from scan.clustering + SIMULATED label (H5). 6. NATIVE_USD_HINT renders as "ESTIMATE" or "–" (H6). 7. Terminal docs panel synced to live API (H7).

**P1 — terminal value (1-2 weeks):**
- **P1-A (founder directive): AI Analyst on B.AI** — wire bai.py into /api/v1/ai/ask with model routing (qwen-3.8-flash fast / deepseek-v4-flash deep, or both with fallback), keep SSE + evidence grounding + provenance identical; demote nvidia.py to fallback; verify exact model IDs via one probe (catalog 403). Landing chat unchanged (glm-5.3-flash).
- Alert engine MVP: rule store (watchlist + thresholds) → evaluator loop → in-app alerts table (persisted JSONL/SQLite) → unread counts real.
- AI history + evidence-hash persistence (feeds Langfuse later).
- Cluster endpoint from scan.clustering; scanner scan-history list.
- Settings → lib/prefs.ts + runtime effect (reduce-motion hook exists) + working CLEAR LOCAL DATA.

**P2 — platform:** RPC fallback/health scoring; OTel; Langfuse; historical store beyond SQLite; HyperSync backfill; EAS evidence attestation.
**P3 — agent/execution/RWA:** MCP Tasks + policy engine + Tenderly simulation + approval gate + (Turnkey/Privy) + x402 metered agent API; RWA classification (ERC-3643, PoR) at F6.

---

## 12. Product Readiness Score (0-5, evidence-based)

| # | Dimension | Score | Reason / evidence / limitation / lever |
|---|---|---|---|
| 1 | Backend completeness | 3.5 | 47 routes cover core; cluster/alerts/feedback/gate/settings absent (§4) → close via P0/P1 |
| 2 | Data freshness | 3.5 | TTL caches + WS tape live; no sub-second stream; staleness flags honest → Yellowstone later |
| 3 | Evidence quality | 4.5 | server-assembled evidence + provenance + byte-proof + ledger; missing evidence-hash persistence (S2) |
| 4 | Multi-chain coverage | 3 | 5 chains fed, security coverage uneven (hype/hood partial) — labeled honestly → more providers |
| 5 | AI grounding | 4 | evidence-only analyst + prompt versioning + cache + circuit breaker; no eval harness/history persistence → Langfuse + P1-A |
| 6 | Security posture | 4 | read-only by architecture, no keys, MCP read-only; no CI mcp-scan, no attestation → cheap adds |
| 7 | Privacy posture | 4.5 | no accounts, amounts stay local, address redaction in logs → keep |
| 8 | Reliability | 3 | circuit breaker + fallbacks exist; NVIDIA stalls; single-instance file persistence → B.AI move (P1-A) + P2 platform |
| 9 | Observability | 2.5 | logs + tests only; no tracing/metrics export → OTel+Langfuse |
| 10 | Persistence | 2.5 | ledger snapshots + opt-in SQLite + JSONLs; AI/scan/alerts ephemeral → P1 stores |
| 11 | Product honesty | 3 | nav pills + chips + GAPS are exemplary; H1-H7 internal mismatches drag it down → P0 raises to 4.5 fast |
| 12 | Scalability | 2.5 | single-process, file/SQLite; provider abstraction makes P2 swap clean → ClickHouse/indexer |
| 13 | RWA readiness | 1.5 | evidence/provenance foundations only; no compliance classification → F6 |
| 14 | Autonomous-agent readiness | 3.5 | MCP + evidence + provenance + read-only safety = right skeleton; no Tasks/policy/eval yet |
| 15 | Commercial readiness | 1.5 | no billing/entitlement/metering (gate is static); x402 option later |

**Overall: 3.1 / 5 — a real foundation with a specific, cheap honesty-debt payoff.** After P0: ≈3.6. After P1: ≈4.1.

---

## 13. Narratives

**A. Technical (CTO/security):** VILMEI runs a provider-abst­racted FastAPI core (47 routes) with deterministic, publicly auditable risk weights, server-assembled AI evidence (prompt-versioned, cached, circuit-broken), a per-row provable on-chain ledger (supply/mint/freeze/top-100 walker, JSONL machine dump), read-only MCP, and 356+144 green tests. The target stack adds: B.AI model routing for the analyst plane, evidence-hash provenance, an alert store, OTel+Langfuse, an indexer (HyperSync) + OLAP (ClickHouse/Timescale) when data volume demands, EAS attestation for verdicts, and a policy-gated, simulation-first execution layer (7702/4337) only after F2/F3 — autonomous agents never get unmediated broadcast.

**B. Strategic (investor/builders):** The thesis is verifiable-by-design: crypto data is fragmenting across chains while AI agents need structured, provenance-carrying evidence — not opinions. VILMEI already proves the hard part: an evidence layer humans and agents can audit without trusting the vendor (byte-proof, GAPS, machine surfaces). The roadmap is boring on purpose: honesty fixes, an alert engine, persistent AI provenance, then attestation and metered agent access (x402) as the agent economy's payment rails mature. Not guaranteed returns, not fully autonomous, not zero-risk — an evidence foundation with stated boundaries.

---

## 14. Risks That Must Not Be Hidden

1. H1-H7 UI/backend mismatches (§8) — must ship P0 before any terminal publicity.
2. NVIDIA latency incidents — mitigated by founder-directed B.AI move (P1-A); NVIDIA optional fallback.
3. Solana public-RPC rate limits degrade holders freshness — Helius keyed + index refresh mitigates; still third-party dependent.
4. Coverage is partial and chain-specific (rug/holdings on hype/hood) — labeled, not hidden.
5. AI answers are heuristic-adjacent context, never advice; no price/level/date invention (prompt-enforced, tested).
6. Single-node file persistence — acceptable now; lossy on host loss; P2 store addresses it.
7. B.AI dependency for ALL AI surfaces after P1-A — single-vendor concentration; mitigated by keeping nvidia.py as optional fallback + env-routed model IDs.

---

## 15. Final Verdict

**Build-on-it, do not rewrite.** The evidence core is real, tested, and differentiated (honest ledger + provable AI grounding + machine surfaces). The terminal's fake-looking pages are a bounded, days-long fix (P0) and the founder-directed B.AI model routing is a small, high-leverage change (P1-A) that removes the worst operational pain (NVIDIA stalls). The 2026 stack additions are additive layers with clean seams — no architectural debt blocks any of them.

## 16. Appendix — Sources

**Repo evidence:** all path:line references in §3-§8 (grep-verified this session); tests: pytest 356 passed, vitest 144 passed (this session); runtime: localhost:8000 health/ledger/landing-chat probed 2026-09-01; ledger top-100 index file walked 132,000 accounts (done=true).
**Primary web sources (verified 2026-09-01):** [Envio HyperIndex](https://docs.envio.dev/docs/HyperIndex/overview) · [HyperSync](https://docs.envio.dev/docs/HyperIndex/hypersync) · [ClickHouse realtime](https://clickhouse.com/use-cases/real-time-analytics) · [StockHouse](https://github.com/ClickHouse/stockhouse) · [EAS docs](https://docs.attest.org/) · [EAS how-it-works](https://docs.attest.org/docs/core--concepts/how-eas-works) · [x402.org](https://x402.org/) · [MCP spec latest (2026-07-28)](https://modelcontextprotocol.io/specification/latest) · [Langfuse self-hosting](https://langfuse.com/self-hosting) · [Langfuse observability](https://langfuse.com/docs/observability/overview) · [Pectra mainnet (EF)](https://blog.ethereum.org/2025/04/23/pectra-mainnet) · [erc3643.org](https://www.erc3643.org/)
**Repo-internal official references (from docs/FEE-MODELS-2026.md, docs/TECH-DECISIONS.md):** Yellowstone gRPC (Chainstack docs mirror), Turnkey/Privy docs, invariant mcp-scan, OpenTelemetry — re-verify at integration time.
