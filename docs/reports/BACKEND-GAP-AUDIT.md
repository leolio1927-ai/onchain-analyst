# TASK BE-A-01 — BACKEND GAP AUDIT — what a $100B read-only terminal needs that we don't have yet

Date 2026-08-29 · read-only pass · zero code changes · branch `main` @ 200 commits (HEAD `057e07f`).
Benchmark frame: Dune / Nansen / Birdeye / DexScreener class of DATA PRODUCTS. Every claim cites file:line; absent from code = ABSENT.

## 0. METHOD — commands run (audit trail)

`find` (file map) · `ls -la` + `ls docs/` · `git log --oneline | head -20` · `git status --short` (clean) · `git remote -v` (github.com/leolio1927-ai/onchain-analyst) · `git branch --show-current` + `git log --oneline | wc -l` (main, 200) · full reads: `webapp/server.py`, `providers/{dexscreener,geckoterminal,live,helius,discovery,llm}.py`, `heuristics/{rug_check,clustering}.py`, `ai_analyst.py`, `access/token_gate.py`, `app.py`, `webserve.py`, `.env.example`, `.gitignore`, `pyproject.toml`, `README.md`, `CATATAN_KERJA.md`, `AUDIT_PROMPT.md`, `AUDIT_REPORT.md` (prior, 2026-08-27), `frontend/public/assets/llms.txt`, `frontend/src/pages/RoadmapPage.tsx` · greps: banned register, persistence (`sqlite|postgres|migration|alembic`), retry (`backoff|retry|429|Retry-After`), CI (`.github` absent), monitoring (`prometheus|sentry|alert|pager`), `reddit`, `mcp|developer key`, `taxonomy`, `honeypot|eth_call|contract source`, pagination (`offset|cursor`), `exception_handler`, `X-API-Key` · `uv run pytest --collect-only -q` → **121 tests, 19 files** · `diff` public/ vs dist/ llms.txt → identical · localhost curl (2 endpoints + 1 HEAD only): `/api/health`, `/api/version`, `/openapi.json` (200). No external provider API was called. Server was already running on 127.0.0.1:8000 (uptime 16,234s).

## 1. API SURFACE

All routes live in `webapp/server.py` (FastAPI app at :117-126, APP_VERSION "0.1.0" :95).

| method · path | handler | response shape | auth | cache |
|---|---|---|---|---|
| GET /api/health | server.py:246 | {status, chains[5], tier, ai_providers[]} | none | none |
| GET /api/version | server.py:258 | {name, version, python, fastapi, uptime_s} | none | none |
| GET /api/metrics | server.py:266 | {scans, uptime_s, ws_clients, scan_cache_entries, gt_trade_cache_entries, throttled_ips} | none | none |
| POST /api/scan | server.py:275 | {pair, assessment, clustering, sources[], launch_venue, ts} | none | 30s TTL, cap 512 (:36-37, :203-213) |
| POST /api/explain | server.py:285 | {summary, key_signals[], limitations, parse_ok, tier, provider} | per-IP 5/h · 30/d (:54-56, :231-243); `local` tier exempt (:294-300) | rides scan cache |
| POST /api/whale | server.py:314 | {address, sol, tokens[≤10]} | none (needs HELIUS_API_KEY server-side, providers/helius.py:22-24) | none |
| GET /api/v1/discovery | server.py:325 | {chain, mode, count, items[]} | none | none (fresh GT call per hit) |
| GET /api/v1/live/{chain} | server.py:347 | {chain, network_id, live, generated_at, cached, stale, items[]} | none | ≥120s policy, 180s default, cap 32 (providers/live.py:67-70, :86) |
| WS /ws/snap | server.py:496 | full snapshot every 15s | WS_AUTH_TOKEN ?token (:464-474); MAX_WS_CLIENTS 64 (:457-461); close 4401/4429 | reads scan cache |
| WS /ws/tape | server.py:561 | delta frames every 5s (env floor 0.2s :528-533), identity-dedup cap 512 (:546-558) | same as snap; 4400 bad pin | GT trade cache 90s (geckoterminal.py:24-25) |
| Pages | server.py:395-440 | /, /terminal, /live, /live/{chain}, /docs, /roadmap, /assets/{path}; dev route /swap-preview → redirect (:417-421) | none | FileResponse |

- **Error normalization**: FastAPI default `{"detail": str}`; no custom exception handler (grep `exception_handler` = 0). Human-readable strings with upstream codes embedded, e.g. 503 `"DexScreener HTTP 429 — provider unavailable"` (server.py:152-153), 502 `"GeckoTerminal HTTP <code> — live feed upstream failed"` (:374). Status semantics: 400 validation (:130-134, :317-318, :361-363), 404 unknown chain/no pair (:211, :359), 429 AI budget (:304), 502 live/discovery upstream (:340-343, :373-376), 503 scan/whale upstream (:152-155, :321-322).
- **Pagination**: ABSENT — no offset/cursor/next_page anywhere (grep = 0); only `limit` clamps (live 1..50 server.py:362-363, live.py:42; discovery 1..50 discovery.py:18, :24-27).
- **Versioning**: hybrid, informal — `/api/v1/` prefixes only discovery+live; scan/explain/whale/health/version/metrics are unversioned (:246-322 vs :325, :347). Stability is a stated policy, not an enforced scheme (llms.txt:26-27 "response schemas … never mutated").
- **OpenAPI**: published — docs_url `/api/docs`, redoc `/api/redoc` (server.py:124-125); `/openapi.json` live-verified HTTP 200. Landing machine layer points agents at it (frontend/src/landing.tsx:1074-1078).
- **AI rate limit is the ONLY per-visitor budget on the box** — /api/scan, /api/v1/live, /api/v1/discovery are unauthenticated and unthrottled (§9 risk).

## 2. PROVIDER MATRIX

Keys/envs: DexScreener + GeckoTerminal keyless; Helius `HELIUS_API_KEY` (header :29); LLM `ANTHROPIC_API_KEY`/`GLM_API_KEY`/`KIMI_API_KEY` + generic `LLM_*` (.env.example:5-25; ai_analyst.py:50-57; providers/llm.py:23-31, MiniMax default :31). No key pool, no rotation, no per-key budget — one env each.

| provider × capability | price | liquidity | volume | txns | per-wallet trades | holders | socials | contract source |
|---|---|---|---|---|---|---|---|---|
| DexScreener (chains: solana, bsc, base, avalanche, robinhood — dexscreener.py:8; hype held back :9) | YES | YES | YES | YES | NO (verified, :2) | NO | YES (via live.py:297-355, batch ≤30, 1h cache; hype not listed, live.py:301-303) | NO |
| GeckoTerminal feed (6 networks incl. hyperevm+robinhood — live.py:31-38) | YES | YES | YES | YES | NO | NO | NO | NO |
| GeckoTerminal trades (NETWORKS = solana, bsc, base, avax ONLY — geckoterminal.py:20) | — | — | — | — | YES (4 chains) | NO | — | NO |
| Helius (Solana only; runtime shape UNVERIFIED, helius.py:4-5) | balances | — | — | — | NO | NO | NO | NO |

**DEAD cells, precisely:**
- `hood` scans (DexScreener robinhood) can NEVER get clustering: `gt._net` raises for hood (geckoterminal.py:50-56) → server catches → `severity: None` "clustering data unavailable" (server.py:178-183). **The rug_check denominator silently differs per chain: 6 signals on sol/bnb/base/avax, 5 on hood** (rug_check.py:119-122 + :129 weights re-normalize over computed signals only). It renders honestly but is undocumented on the scan surface; DocsPage.tsx:341 admits it for hype/hood only in docs.
- `hype` is served by /api/v1/live (GT hyperevm, live.py:35) but ABSENT from /api/scan (CHAIN_IDS dexscreener.py:8-9) — a live-feed token on hype cannot be scanned; socials also absent there (live.py:301-303).
- Holders/contract-source: no provider ships either, anywhere (grep = 0).
- **Rate-limit handling**: caches only. No backoff, no Retry-After parsing, no key pool, no circuit breaker (grep `backoff|retry|Retry-After` in providers/ = 0). Upstream 429 → HTTPError → verbatim into public cards: scan 503 (server.py:152-153), clustering degrade string (server.py:179-180), live 502 or stale:true fallback (live.py:377-384). GT 429s are real and observed (live.py:14). Steady-state claim ~6 rpm vs ~10/min tier (live.py:67-69); per-visitor amplification unbounded (§9).

## 3. DATA LAYER

- **Persistence: NONE.** No DB, no ORM, no migrations (grep `sqlite|postgres|mysql|redis|alembic|sqlalchemy|migration` = 0 hits in code). All state is in-process TTL caches: scan 30s/512 (server.py:36-37), GT trades 90s/64 (geckoterminal.py:24-25), feed 180s/32 (live.py:67-86), socials 1h/128 (live.py:99-101), per-IP throttle dict (server.py:51). Restart = total amnesia of market state.
- **On-disk data**: `logs/grounding/*.jsonl` — AI calls only (evidence + output + usage, ai_analyst.py:140-154); no market data, no rotation. Gitignored (.gitignore:27 `logs/`).
- **Ingestion loops / backfill / retention**: ABSENT. Every response is request-time passthrough. The WS tape polls per connection (server.py:593) — N clients on one pool share one 90s trade cache, but nothing persists.
- **"If DexScreener dies for 24h, what do we permanently lose?" — Nothing, because nothing was ever stored; and that IS the gap.** During the outage we serve zero market data (30s scan cache expires instantly; no fallback provider; only GT feed surfaces survive). Worse, in NORMAL operation we retain no history at all — no price/volume/trade series older than 180s exists anywhere. Dune/Nansen ARE the historical record; we are a stateless lens. The $100B gap is not a missing endpoint — it is the absence of a data asset that compounds daily. Every day without ingestion is data never recoverable from free-tier upstreams (GT/DS serve latest-window only: trades endpoint returns the recent page, geckoterminal.py:94).

## 4. ENGINE — signal inventory

- **SHIPPED (deterministic, public thresholds):** rug_check 6 weighted signals — liquidity, fdv/liq, vol/liq, buy_ratio, age + optional clustering; <3 computed → `INSUFFICIENT DATA`, score None (rug_check.py:13-14, :101-134). Clustering v0 burst-timing + amount-CV, <8 wallets not scored (clustering.py:13-16, :56-102). α re-rank of volume feed, zero extra calls (live.py:65, :224-243). Launch venue via earliest pairCreatedAt (dexscreener.py:48-56). Keyless deterministic narrative `local_explain` (ai_analyst.py:173-215).
- **HALF:** whale = framework, key-gated, response shape unverified at runtime (helius.py:4-5; CATATAN_KERJA.md:40). AI tier = shipped, runtime evidence-compliance unvalidated (CATATAN_KERJA.md §7 line 34). /ws/tape ships backend-side; the board still polls REST (TA-103 IN BUILD, RoadmapPage.tsx:146-149).
- **ABSENT (grep evidence = 0 code hits):** contract source verification (`honeypot|eth_call|contract source` greps land only in docstrings/comments, not code); honeypot simulation (read-only eth_call would be in-posture — no RPC client exists; no web3 dep in pyproject.toml:6-17); holder distribution / supply concentration (no holder provider; CATATAN_KERJA.md:29 lists it "not yet"); labeled wallet name DB (the Nansen moat — nothing); deployer/reuse lineage (nothing); sniper-bot DB + funding traceback (CATATAN_KERJA.md:29 "not yet"); token taxonomy (only a TA-105 phrase, RoadmapPage.tsx:157); social manipulation layer (socials today = URL chips only, frontend/src/pages/liveParts.tsx:95-104; the Reddit MVP decision referenced in task context exists NOWHERE in this repo — grep `reddit` = 0).

## 5. REALTIME / PUSH

- SHIPPED: /ws/snap (15s full honest snapshot) and /ws/tape (5s additive deltas) with token auth + client cap (server.py:496-604). Empty WS_AUTH_TOKEN = dev-open with a one-time warning (server.py:467-474) — must be set before deploy v1.
- ABSENT: alert engine (no evaluation loop, no threshold rules); watchlist backend (TA-102 is DESIGN, RoadmapPage.tsx:141-144; frontend watchlist is localStorage-only per CATATAN_KERJA.md:42); webhook/email/push delivery (grep = 0).
- **Who gets paged when a provider dies? NOBODY.** No monitoring, no error tracking, no alert sink (grep `prometheus|sentry|opentelemetry|alert|pager` = 0). /api/health never probes upstreams (server.py:246-255); /api/metrics has no per-provider counters (:266-272). Provider death is discovered by users seeing 502/503 cards.

## 6. MACHINE SURFACE (the AI-prestige thesis)

- llms.txt: SHIPPED at `/assets/llms.txt`, both surfaces (public/ tracked + dist/ built; `diff` = identical), linked from landing (:1070, :1074-1078), roadmap (:302, :309), docs. Honest and unusually good: file:line evidence discipline, status vocabulary, TA ledger (llms.txt:156-177).
- Versioned public APIs: HALF — OpenAPI at /api/docs + /openapi.json (200 verified), but only 2 of 8 data routes carry /v1 (§1); schema stability is a promise, not a versioning scheme.
- Developer keys / quotas: ABSENT — every REST route is unauthenticated; the landing FAQ says **"Can I build on this data? Yes — that is the point"** (landing.tsx:1150-1154) while no key, no quota, no terms-of-use route exists. Third-party buildability is currently an invitation to share one founder-funded free-tier budget.
- MCP server: ABSENT (grep = 0). Birdeye's MCP is noted as a FUTURE upstream (CATATAN_KERJA.md:25), not our own surface.
- Stable JSON schemas: HALF — OpenAPI auto-schema only; no published schema-version field in responses; llms.txt:26-27 policy line has no enforcement beyond tests.
- **TERMS / REDISTRIBUTION — legal risk, flagged explicitly:** llms.txt:179-183 says "Data belongs to upstream providers (GeckoTerminal, DexScreener); rendering rights as per their public terms", while the product (a) re-serves their data via a public API and (b) invites builders to build on it (landing.tsx:1150). Free-tier ToS for both upstreams typically restrict commercial redistribution and API-on-API re-serving; ❓ UNVERIFIED here — no ToS text exists in-repo and this audit did not fetch external terms. This is a launch-blocking legal question (§11 Q1), not a code gap.

## 7. OPS

- Logging: a single logger `terminal-alpha.ws` used once for the dev-open warning (server.py:453, :468-471). No request/access logs, no structured logging, no rotation, no level config. uvicorn defaults only.
- Metrics: /api/metrics = process counters (scans, cache sizes, ws clients, throttled IPs — server.py:266-272). No per-provider call/error/429 counters → **cost visibility (calls/day per provider vs plan) is ABSENT**; the ~6rpm claim (live.py:67-69) is arithmetic, not measurement.
- Health checks: liveness only; no upstream probing, no readiness distinction (server.py:246-255).
- CI/CD: ABSENT — no `.github/`, no hooks config in-repo (verified by ls). The llms.txt:30-32 quality-gate claim ("full build verified per commit, pipefail discipline") is manual discipline over 200 commits, not machine-enforced; a contributor skipping it breaks nothing.
- Secrets: .env gitignored with `!.env.example` escape (.gitignore:13-17 — prior audit P1 fixed; file tracked). Keys travel in headers, never URLs (helius.py:26-29; llm.py:5-6). Sound for a single-operator box; no vault/KMS (acceptable at this scale).
- Backup/restore: nothing persisted to back up (§3); deploy depends on an untracked build artifact (`frontend/dist/` gitignored, .gitignore:34) — a fresh clone serves the "Frontend not built yet" page (server.py:381-385) until `npm run build` runs. Deploy runbook is README-only (README.md:39-48).
- Drift note: llms.txt:30 and DocsPage.tsx:576 both state "120 automated tests"; `pytest --collect-only` today returns **121** — the doc counter lags the suite by one.

## 8. GAP MATRIX (the deliverable — sorted by priority)

| # | capability | our status (evidence) | role | effort | pri | dependencies |
|---|---|---|---|---|---|---|
| 1 | Time-series persistence + ingestion loop | ABSENT (§3; grep = 0) | CORE | L | **P0** | none; enables 8, 14, 17, 19, 25 |
| 2 | Upstream resilience: backoff, Retry-After, key pool, fallback | HALF — caches only; 429 → verbatim 502/503 (server.py:152-155; live.py:377-384) | CORE | M | **P0** | Q2 budget |
| 3 | Per-visitor budget on public REST | ABSENT — only /api/explain throttled (server.py:231-243) | CORE | S | **P0** | none |
| 4 | Per-provider counters + cost visibility | ABSENT (server.py:266-272) | CORE | S | **P0** | none |
| 5 | Provider-health probe + paging | ABSENT (§5; grep = 0) | CORE | S | **P0** | #4 |
| 6 | API versioning scheme for core routes | HALF — 2/8 routes v1 (§1) | CORE | S | P1 | none |
| 7 | Historical endpoints (per pool/token) | ABSENT | CORE | M | P1 | #1 |
| 8 | Scan-chain parity (hype in DS; clustering hype/hood in GT) | HALF — hood scans lack clustering signal; hype unscannable (§2) | CORE | S | P1 | Q6; GT trades for hype/hood |
| 9 | Developer keys + quotas + API terms | ABSENT (§6; landing.tsx:1150 invites) | CORE | M | P1 | Q1 legal answer |
| 10 | Contract source verification | ABSENT (§4) | CORE | M | P1 | explorer provider + key (Q2/Q3) |
| 11 | Honeypot sim (read-only eth_call) | ABSENT (§4; no RPC dep) | CORE | M/L | P1 | #10; RPC endpoint |
| 12 | Holder distribution / supply concentration | ABSENT (§4; CATATAN_KERJA.md:29) | CORE | L | P1 | holder provider (Q3) |
| 13 | CI/CD (test+lint+build gates) | ABSENT — no .github (§7) | CORE | S | P1 | none |
| 14 | Structured logging + rotation | ABSENT — one WS logger (server.py:453) | CORE | S | P1 | none |
| 15 | WS auth default-on at deploy | HALF — env exists, empty = open (server.py:467-474) | CORE | S | P1 | deploy policy |
| 16 | Watchlist + threshold alerts (TA-102) | ABSENT backend; DESIGN (RoadmapPage.tsx:141) | EDGE | S/M | P1 | #1 for server-side alerts |
| 17 | MCP server over our API | ABSENT (§6) | EDGE | S/M | P1 | #6 stable schemas |
| 18 | TA-101 wallet session + quote engine (read-only) | ABSENT backend; IN BUILD chip (llms.txt:168) | EDGE | M | P1 | router quote source |
| 19 | TA-103 board consumes /ws/tape | HALF — route ships, board polls REST (RoadmapPage.tsx:146-149) | EDGE | S | P1 | none |
| 20 | Alert delivery (webhook/email/push) | ABSENT (§5) | EDGE | M | P2 | #5 |
| 21 | Labeled wallet name DB (the Nansen moat) | ABSENT (§4) | CORE | L | P2 | #1; per-wallet provider |
| 22 | Deployer/reuse lineage | ABSENT (§4) | EDGE | M | P2 | indexer/RPC provider |
| 23 | Token taxonomy | ABSENT — phrase only (RoadmapPage.tsx:157) | EDGE | S | P2 | #1 |
| 24 | Social manipulation layer (Reddit decision) | ABSENT — socials are URL chips (liveParts.tsx:95-104); decision not in repo (Q4) | EDGE | M | P2 | Q4 decision |
| 25 | Backup/restore + retention policy | ABSENT — nothing persisted yet (§7) | CORE | S | P2 (P0 once #1 lands) | #1 |

**CORE-P0 count: 5** (rows 1-5). CORE total: 15 rows; SHIPPED-with-gap HALF: 7; fully SHIPPED core capabilities: the scan/heuristic/live engine itself (§4) — the gaps are around it, not in it.

## 9. TOP-5 RISKS

1. **Provider single point of failure — both of them.** Two keyless free-tier upstreams are the entire data plane (CATATAN_KERJA.md:25); no fallback, no backoff, no key pool (§2). GT 429s already observed (live.py:14). A provider outage or tier change degrades the public product within 30 seconds.
2. **Rate-limit economics.** /api/scan + /api/v1/live + /api/v1/discovery are unauthenticated and unthrottled (§1); every visitor draws from ONE shared ~10 calls/min GT budget; the landing scan box (landing.tsx:474+) makes traffic growth certain. One script can starve all users; 429s then render verbatim into public cards (server.py:152-153).
3. **Redistribution legality.** The landing invites third parties to build on re-served GT/DS data (landing.tsx:1150-1154) while llms.txt:179-183 defers to "their public terms" — unverified (§6). If free-tier terms forbid API-on-API re-serving, the machine-surface thesis needs licensing or re-architecting before launch.
4. **Scraping/abuse of the public API before launch.** No keys, no per-visitor budget, no egress tracking (§1, #4) — cost attribution is impossible today; abuse would be invisible until the tier is exhausted.
5. **Silent provider death.** No monitoring, no paging, no per-provider counters (§5, §7) — the founder learns of an outage from users. Also: deploy v1 (LOCKED ±5 Sep, RoadmapPage.tsx:105) ships with WS dev-open default unless WS_AUTH_TOKEN is set (server.py:467-474).

## 10. RECOMMENDED BUILD ORDER (12 weeks, one additive public release per week)

Constraints honored throughout: nothing requiring a signature or custody (quotes are reads; eth_call simulation is a read); the Honesty Law stays intact — absent stays absent, every denominator auditable, chips truthful, no new certainty language.

- **W1 — Ops floor (gaps 4,5,13):** per-provider call/error/429 counters into /api/metrics; /api/health gains upstream probes (additive fields); CI workflow: pytest + ruff + oxlint + build. Release: measurable box.
- **W2 — Rate resilience (gaps 2,3):** Retry-After-aware backoff + single-flight dedupe on hot cache keys; per-visitor REST budget with honest 429 + headers. Release: budget semantics documented on /docs.
- **W3 — Persistence I (gap 1):** SQLite (deploy-box scale) ingestion loop snapshotting live+scan data per TTL; retention env; additive `GET /api/v1/history/{chain}/{pool}`. Honesty: gaps in the series render absent, never interpolated.
- **W4 — Chain parity + versioning (gaps 6,8):** verify DexScreener hype chainId (Q6) → 6/6 scannable; GT trades for hype/hood or a per-chain denominator note on every scan card (auditable). Freeze v1 semantics; publish versioning + deprecation policy. Release: 6-chain parity.
- **W5 — Contract layer (gap 10):** source-verification signal for base/bnb/avax via a read-only explorer API (key = founder call); severity None where unverifiable.
- **W6 — Honeypot simulation (gap 11):** read-only eth_call buy/sell simulation on EVM chains; new signal, honestly None off-chain or on failure. In-posture: no signing exists in the codebase.
- **W7 — Holder concentration (gap 12):** onboard a holder-data provider (Q3); top-N supply-share signal; NOT SCORED when the provider lacks the chain — denominator stays per-chain truthful.
- **W8 — Watchlist + alerts v0 (gap 16):** TA-102 account-less (localStorage) + server aggregation route; threshold alerts evaluated over W3 history; delivery = one webhook (email later).
- **W9 — TA-101 + TA-103 (gaps 18,19):** wallet session + quote engine (read-only session, router quote, never custody — replaces the SIMULATED chip with LIVE) + board consuming /ws/tape.
- **W10 — Machine surface (gaps 9,17):** MCP server over the existing API; developer keys + quota reusing the throttle infra; llms.txt v2 with versioned endpoints. Gated on Q1 legal answer.
- **W11 — Backfill + SPOF mitigation (gaps 2,7):** historical backfill where upstreams paginate; second price provider behind the existing provider interface; calls/day vs plan dashboard from W1 counters.
- **W12 — Launch hardening (gaps 15,25 + risk 3):** legal pass on redistribution; API terms-of-use page; WS_AUTH_TOKEN default-on; backup/restore for the W3 DB; deploy runbook incl. the frontend build step.

## 11. OPEN QUESTIONS to founder (8)

1. May GT/DS free-tier data be legally re-served through a public builder API (landing.tsx:1150 invites it)? Do we need a legal read or provider licensing before deploy v1?
2. Budget ceiling (USD/mo) for paid tiers / key pools — GT Pro, a DexScreener plan, explorer + RPC keys? This sets the ceiling of W2/W5/W6/W11.
3. Holder/contract-data provider choice: Birdeye (CATATAN_KERJA.md:25 notes its MCP server), Bitquery (opaque pricing, same line), or another?
4. The Reddit MVP decision referenced in planning is recorded nowhere in this repo (grep = 0). Where does it live, and what was decided?
5. Deploy v1 (±5 Sep, RoadmapPage.tsx:105): is SQLite-on-box acceptable, or managed Postgres from day one?
6. DexScreener chainId for HYPE — is a verified value available (GT "hyperevm" is already verified, live.py:35)?
7. Developer keys for third-party builders — launch-blocker or post-launch (pairs with Q1)?
8. Paging destination for provider-down alerts (webhook/Telegram/email) and who is on call?

— End of audit. One file written; no code touched.
