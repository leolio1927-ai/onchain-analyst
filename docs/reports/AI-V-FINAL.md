# AI-V FINAL REPORT — 2026-08-31 (PROMPT-AI-V: VILMEI AI ANALYST LIVE)

Phase: probe the NVIDIA free tier → ship the AI backend (SSE proxy + guards) →
personas with anti-fabrication law → every frontend surface live → MCP tool +
docs → closing gates + truth-run. Commit chain this session: `feed32c`
(AI-0 ledger + AI-2 backend + AI-3 personas/trap tests) → `ec09462`
(AI-4 all FE surfaces) → `9b1132e` (AI-1/AI-3 closeout: final probe verdict) →
`16c0701` (AI-5 MCP ai_ask + TECH-DECISIONS + .env.example) → AI-6 closeout
(this file + ledger). NO PUSH — the founder publishes.

Founder law honored end-to-end: budget, not credits (40 RPM account limit →
8 RPM/IP + daily pool); key already set in .env by founder — never printed,
never logged, header-only Bearer; founder's :8000 untouched (truth-run used
scratch :8137); every degraded state is an honest sentence, never a red wall.

## 1. Phase → commit → gate table

| phase | commit | gate evidence |
|---|---|---|
| AI-0 audit | feed32c (row) | clean tree @ ff1a3a4 · baseline gates green (tsc 0 · vitest 21/105 · pytest 298 + snapshot · ruff ✓ · oxlint 15 warn/0 err) · canned AI located (AiPanel + fake GROUNDING LOG) · P7 rebrand leak found (TERMINAL ALPHA logo, split by nbsp+span) |
| AI-1 NVIDIA probe | 9b1132e | logs/ai1-* raw (gitignored): /v1/models 200 @0.68 s (83 models, no tier labels) · kimi-k3 STREAM 200 SSE (reasoning first, ~4.5 KB/280 s) · deepseek-v4 ids 0 bytes/300 s · small models 404 not-hosted · reasoning_effort stalls even kimi-k3 → verdict in providers/nvidia.py docstring |
| AI-2 backend | feed32c | providers/nvidia.py (stdlib, header-only key, 1 retry w/ capped backoff) · webapp/ai_ask.py engine (personas, LOUD truncation, per-IP RPM + daily pool + landing pool, cache TTL 240s) · POST /api/v1/ai/ask SSE proxy (provenance first → delta* → usage → [DONE]) · tests/test_ai_ask.py 23/23 · pytest 321/321 + snapshot · ruff ✓ |
| AI-3 personas + traps | feed32c | ANALYST prime law (evidence-only numbers; support/resistance/targets FORBIDDEN; exact sentence "not in the evidence the terminal has for this token") + GUIDE (brief-only, LIVE/PLANNED/BD) · trap tests via mock model green |
| AI-4 frontend | ec09462 | AiPage canned→live streaming · atomic token context (P1 generation guard, tested) · GROUNDING LOG real-provenance-only · dashboard micro-feed · sidebar LIVE · landing LIVE demo w/ SIMULATED fallback · PB applied · tsc 0 · vitest 25 files/125 ✓ · build ✓ dial3d 130.10 kB gzip (unchanged) · oxlint 15/0 (baseline parity) · grep gates ✓ |
| AI-5 MCP + docs | 16c0701 | MCP tool ai_ask = #7 (one JSON answer, same guards; contextvar client-IP budget) · tools/list N+1 + no-key + collect&cache + chain gate tests → pytest 324/324 + snapshot ✓ · snapshot regen same change set (only /mcp description) · TECH-DECISIONS rows 21-23 + dated AI-V section · .env.example AI block · ruff ✓ |
| AI-6 close | (this commit) | gates re-run on final tree (§6) + truth-run record (§4) |

## 2. Shortlist + tier reasoning (probe-verified, never doc-trusted)

| tier | model | why |
|---|---|---|
| FREE | moonshotai/kimi-k3 | the ONLY id that streamed for this account (HTTP 200 SSE; reasoning_content deltas first — long reasoning phase, ~4.5 KB over 280 s) |
| DEEP | deepseek-ai/deepseek-v4-pro-0813 | kept behind `VILMEI_AI_MODEL_DEEP` env override; 0 bytes through the full 300 s probe → route answers an honest 504 if it still stalls |
| backup | moonshotai/kimi-k2.6 | present in /v1/models; unprobed-stream → not defaulted |
| rejected | mistral-7b / coder-6.7b | 404 "Function … Not found for account" — not hosted on this free account |
| rejected | reasoning_effort param | adding it stalled EVEN kimi-k3 (0 bytes/240 s) → default sends no extra params; strictly opt-in via env |

Endpoint shape: OpenAI-compatible POST /v1/chat/completions, `stream:true`
speaks SSE `data:` lines + `data: [DONE]`. stdlib urllib only — no SDK
(TOLAK-DENGAN-ALASAN, docs/TECH-DECISIONS.md rows 21-23).

## 3. Budget semantics (the founder's 40 RPM, made safe for visitors)

Account limit ~40 req/min (free tier, budget not credits). Server guards stay
far under it: 8 RPM per IP sliding window + one global daily pool
(`VILMEI_AI_DAILY_MAX_QUESTIONS`, default 240, file-persisted
data/ai-budget.json) + a smaller separate landing pool (max(16, daily/4)).
Over budget = honest 429 copy. Identical (question|mode|model|persona|evidence
digest) answers cached 240 s — free-tier credits never burned twice on the
same question. A question that REACHES upstream counts against the pool even
if upstream stalls (that is the free-tier reality); a 400/503 never charges.

## 4. Truth-run record (scratch :8137, founder's :8000 untouched)

Raw: logs/ai6-truth-live.txt (gitignored). Keys never printed — values enter
the shell via webapp.envfile and leave only as Bearer headers.

| probe | result | evidence |
|---|---|---|
| A. key-off (no NVIDIA_API_KEY in env) | **LIVE-VERIFIED** | HTTP 503 in 0.02-3 s: `{"detail":"VILMEI AI offline — NVIDIA_API_KEY not set (founder config)"}` — rest of the terminal unaffected |
| B-parallel first attempt (3 concurrent) | degraded honestly | 2× 504 @~60 s (open timeout then) + 1× 429 `VILMEI AI upstream is rate-limiting the free tier — try again in a minute` @5 s — the free tier enforces concurrency; lesson recorded: serial asks |
| B serial, 180 s open budget | degraded honestly | 3× 504 @182.9/182.9/181.9 s — headers held by the plane |
| B serial, 300 s open budget | degraded honestly | 504 @301.1 s — plane still stalling in the 16:34–16:52 UTC window |

Interpretation (honest): diag1 at 15:30 UTC streamed fine; after the parallel
burst the account/plane stayed jammed for the rest of the window — every
subsequent ask degraded with the exact honest copy the spec demands (503/429/
504 sentences, never a red wall). The product behaved correctly under a
stalled upstream; a live captured answer could not be produced in-window.

## 5. Deviations + how each is covered

| deviation | mitigation |
|---|---|
| Live guide/analyst answers not captured (upstream stall, §4) | every wire path is mock-tested: SSE framing, provenance-first, cache, budgets, mid-stream failure (tests/test_ai_ask.py 23 + tests/test_mcp.py 13). Founder retry commands below — one curl each |
| Live trap run ("support level?" must refuse) not captured | offline trap tests green (mock model): prompt FORBIDS levels, carries evidence verbatim, refuses via the exact no-evidence sentence. Founder retry command below |
| STREAM_OPEN_TIMEOUT_S raised 60 → 180 → **300 s** | probe-driven: diag1 full stream ~280 s; 180 s still 504'd. Documented on the constant (providers/nvidia.py) |
| MCP ai_ask collects one JSON instead of streaming | deliberate: the MCP door is a single tool result; SAME engine/guards/cache as the REST door (one truth, two doors) |

Founder retry commands (on the founder's own restarted server; no key needed
here — the server holds it):

```bash
# 1) guide brand question
curl -N -X POST http://127.0.0.1:8000/api/v1/ai/ask -H "content-type: application/json" \
  -d '{"question":"What is VILMEI, and what is live today versus planned?","mode":"free","surface":"terminal"}'

# 2) analyst on live BONK CA
curl -N -X POST http://127.0.0.1:8000/api/v1/ai/ask -H "content-type: application/json" \
  -d '{"question":"In three short sentences, what does the evidence say about this token liquidity and concentration right now?","mode":"free","surface":"terminal","persona":"analyst","chain":"sol","token":"DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"}'

# 3) TRAP — expected to START with: not in the evidence the terminal has for this token
curl -N -X POST http://127.0.0.1:8000/api/v1/ai/ask -H "content-type: application/json" \
  -d '{"question":"What is the support level and the price target for this token?","mode":"free","surface":"terminal","persona":"analyst","chain":"sol","token":"DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"}'
```

## 6. Final gates (re-run on the closing tree)

| gate | result |
|---|---|
| node | v24.20.0 (nvm) |
| build (tsc -b + vite) | ✓ 0 errors |
| dial3d budget | 130.10 kB gzip — unchanged, ≤ 150 kB |
| vitest | 25 files / 125 tests ✓ (20 new AI tests) |
| oxlint | 15 warn / 0 err — baseline parity |
| pytest | 324 passed + 1 snapshot ✓ (26 new AI tests: 23 ai_ask + 13 mcp incl. ai_ask, minus overlap with catalog) |
| ruff | All checks passed |
| grep: integrate.api in frontend/src | 0 |
| grep: TERMINAL ALPHA | 0 active — only the documented rename-history line (DocsPage.tsx:664) |
| grep: literal keys (nvapi-…) | 0 in repo |
| grep: zero-signing (sendTransaction/signTransaction/…) | 0 usage — the only hit is the read-only guard test asserting those verbs throw |

## 7. Ten visual points (what the founder sees)

1. AI page streams token-by-token with an opacity-only caret (reduced-motion: no blink).
2. Provenance-first: the model chip appears BEFORE the first word — real model id from the wire, never hardcoded.
3. LABEL LAW everywhere: LIVE only with real provenance; any failure → honest panel (429/503/502/504 copy verbatim from the server).
4. ACTIVE CONTEXT card is atomic to the token store — switch token mid-answer and the stale stream is aborted and dropped (tested).
5. GROUNDING LOG rows come only from real runs: model · mode · persona · tokens · cached · latency. Fake claude/glm rows deleted, AiPanel.tsx gone.
6. Dashboard micro-feed: lazy one-shot "ASK WHY" with session cache, LIVE badge, click-through to /#/ai — zero effects, derived state.
7. Sidebar AI Analyst pill: SOON → LIVE (matrix-gated by test).
8. Landing §06: four preset questions run the REAL endpoint; label state machine idle/connecting/live/simulated; offline → scripted trace labeled SIMULATED (live AI offline) — honesty preserved with no key.
9. PREMIUM-BAR discipline on all new surfaces: skeletons, pb-acc hover, tabular-nums, one severity source.
10. Settings: fake CLAUDE/GLM/KIMI picker replaced by the honest AUTO · PER MODE card (no provider choice, nothing to pay).

## 8. Founder restart block (what to do once)

The code changed since the running server started. To switch AI ON:

1. Paste the key into `.env` **via a text editor** — `NVIDIA_API_KEY=nvapi-...`
   (caraFounderNgasihTauKey: NEVER paste the key into chat, issues, or logs —
   editor only; the repo only ever sends it as an Authorization header).
   Note: the key is ALREADY present in the founder's .env (verified by the
   truth-run's envfile parse) — so nothing to add, only restart.
2. Restart the server as usual (`scripts/dev-server.sh` serves :8000 — still
   the founder's port). No migration: data/ai-budget.json creates itself.
3. Optional model overrides live in `.env.example` (VILMEI_AI_MODEL_FREE /
   VILMEI_AI_MODEL_DEEP / VILMEI_AI_DAILY_MAX_QUESTIONS) — all tolerant of
   broken lines, unset = safe defaults.

Without restart, the old server simply keeps serving the old surfaces; the new
routes answer the moment the new code runs. No-key state stays honest (503
sentence), so a restart is never a red wall.

## 9. Machine surfaces

MCP now ships seven read-only tools — trending, scan, rug, whale_windows,
fee_view, fee_destinations, **ai_ask** (one JSON answer through the same
personas/evidence/budget/cache guards; tool errors are content, isError:true).
llms.txt §For AI agents + §Live API updated in the same change set as the code
(16c0701); openapi snapshot regenerated in the same commit (only /mcp
description changed: six → seven tools).

Research tools — not financial advice. Risk scores are heuristics, not audits.
DYOR.
