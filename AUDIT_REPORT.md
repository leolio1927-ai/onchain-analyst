# AUDIT REPORT — Terminal Alpha (onchain-analyst)

Date: 2026-08-27 · Auditor: independent (read-only) · Scope: the entire repo @ commit `723c4f2` (main)
Method: direct reading of every code file + git metadata + an exhaustive grep. No code was changed, no app was run.

---

## 1. EXECUTIVE SUMMARY

All six §2 CATATAN_KERJA principles are **COMPLIANT** at the code level — no transaction execution, no custody, no accuracy claims, and a multi-signal verdict with an honest "INSUFFICIENT DATA" path. The §10 assumption leakage is **CLEAN**: not a single forbidden number/claim appears in the code, UI, or snapshots. The biggest problem is not compliance but **stale documentation and repo hygiene**: §6 claims features (top-holder, clustering) that do not exist, §7/§9 claim the grounding log is "not yet" built when it already runs (`ai_analyst.py:122`), and the README publicly claims "holder distribution + wallet clustering". There is a real crash bug: a price with `priceChange == -100` divides by zero in the chart estimator. `.env.example` is swallowed by the `.env.*` pattern in `.gitignore` and is therefore **not tracked by git** — a fresh clone loses the very file the app's own error messages point to. Totals: **P0 = 0, P1 = 6, P2 = 7**.

---

## 2. §2 COMPLIANCE MATRIX

| # | Principle | Status | Evidence |
|---|---------|--------|-------|
| 1 | No transaction execution | ✅ COMPLIANT | The only network call is a read-only GET in `providers/dexscreener.py:13-15` (`api.dexscreener.com/latest/dex/tokens/...` via `urllib.request`). Grep for `private key\|sign\|send\|execute\|swap\|place order` across all `*.py`: nothing. The deps (`pyproject.toml:5-15`) include no wallet/web3 library. |
| 2 | No custody / private keys | ✅ COMPLIANT | `.env.example` contains only AI provider API keys (lines 5-15). The UI only accepts the commands `/load /verify /explain /help` (`ui/dashboard.py:140-158`) — no key/balance input. |
| 3 | Free must not be less accurate; the tier controls DEPTH | ✅ COMPLIANT (with a note) | `ai_analyst.py:145`: `max_tokens=400 if tier == "free" else 1000` — only the LENGTH differs; evidence and prompt are identical. Note: the UI hardcodes `"free"` (`ui/dashboard.py:195`), the "deep" path is unreachable (no token gate yet) → there is not yet any mechanism that would sabotage the free tier. |
| 4 | AI is evidence-first, adds no facts | ✅ COMPLIANT (by design) | `_evidence()` restricts the model to a subset of fields (`ai_analyst.py:62-85`); the SYSTEM_PROMPT forbids facts outside `<evidence>` (`ai_analyst.py:22`); it is invoked from the single `explain()` path (`ai_analyst.py:140-147`); locked in by tests `tests/test_ai_analyst.py:22-27` (`"url" not in ev`, `"chainId" not in ev`). The model's actual compliance at runtime: NEEDS VERIFICATION. |
| 5 | No accuracy/profit-guarantee claims | ✅ COMPLIANT in the UI; ⚠️ README overclaims features (see Finding #1) | UI disclaimer: `ui/dashboard.py:107-108` ("BUKAN saran finansial … DYOR" — Indonesian at audit time, EN: "NOT financial advice … DYOR"; since translated to English) + the verify footer `:183`. The prompt explicitly FORBIDS certainty words — "pasti"/"dijamin"/"akurasi tinggi" (EN: "certain"/"guaranteed"/"high accuracy"; the shipped prompt lists their English equivalents) (`ai_analyst.py:23`). The README does not yet carry the §12 disclaimer (P2 #12). |
| 6 | The verdict combines signals, never binary from one signal; insufficient data → be honest | ✅ COMPLIANT | 5 weighted signals in `WEIGHTS` (`heuristics/rug_check.py:13`), `MIN_SIGNALS = 3`; below that → `level="nodata"`, `score=None` (`rug_check.py:14,112-117`); the KOL/airdrop false-positive note is stated as-is (`rug_check.py:121`). |

---

## 3. DOCUMENT vs CODE RECONCILIATION

| Section | Document claim | Code reality | Action |
|--------|---------------|--------------|------|
| §6 | "top holder concentration" already running | **DOES NOT EXIST** — `rug_check.py` has 5 signals: liquidity, fdv_liq, vol_liq, buy_ratio, age (`rug_check.py:104-111`); no holder signal | update-document |
| §6 | "basic clustering (burst timing + amount uniformity)" already running | **DOES NOT EXIST** — no clustering module in the repo (structure: `providers/`, `heuristics/rug_check.py` only) | update-document |
| §6 | "sample <8 wallets → not scored" | No wallet concept at all; the closest analogue is `MIN_SIGNALS=3` for SIGNALS (`rug_check.py:14`) | update-document |
| §6 | "Not yet: funding traceback / sniper DB / circular" | ✅ correct, consistent — none of it exists | — |
| §7 | "Not yet: grounding log" | **STALE — IT EXISTS**: `_ground_log()` writes `logs/grounding/YYYY-MM-DD.jsonl` (`ai_analyst.py:122-134`), called on every `explain()` (`ai_analyst.py:147`), the UI informs the user (`ui/dashboard.py:204`); commit `723c4f2` "grounding log per-provider" | update-document |
| §7 | "free/deep tier" | The parameter exists (`explain(..., tier=...)`, `ai_analyst.py:137,145`) but the UI always sends `"free"` (`ui/dashboard.py:195`); no token gate → "deep" is unreachable | update-document (+ later add-code: token gate) |
| §7 | "multi-provider" | ✅ (not stated explicitly in §7; §9 only says "requires ANTHROPIC_API_KEY") — reality: a claude/glm/kimi registry (`ai_analyst.py:48-55`) | update-document |
| §7 | "structured JSON output" not yet | ✅ correct — the output is plain text (`ai_analyst.py:115,148`) | — |
| §9 | `data_sources.py` | Does not exist → now `providers/dexscreener.py` | update-document |
| §9 | `trade_feed.py` (skeleton) | No file and no replacement (GeckoTerminal not yet onboarded) | update-document |
| §9 | `clustering.py` (skeleton) | Does not exist | update-document |
| §9 | `rug_check.py` | Exists but moved: `heuristics/rug_check.py` | update-document |
| §9 | `whale_tracker.py` (skeleton) | Does not exist (no Helius yet) | update-document |
| §9 | `token_gate.py` (skeleton) | Does not exist at all | update-document |
| §9 | `ai_analyst.py` "requires ANTHROPIC_API_KEY; grounding log not yet" | File exists ✅ but **two stale claims**: it is now multi-provider (ANTHROPIC/GLM/KIMI, `ai_analyst.py:48-55`) AND the grounding log already runs | update-document |
| §9 | `ui/app.py` (MVP running; /load, /verify, chat) | Wrong name/path: the entry point is now `app.py` at the root + the screen `ui/dashboard.py`; the commands are `/load /verify /explain /help` (`ui/dashboard.py:141`) — no free-form "chat" | update-document |
| §9 (two-way) | Features in code NOT recorded in the document: `webserve.py` (web mode textual-serve, `webserve.py:5`), `ui/theme.py`, `ui/icons.py` (+ the `--ascii` mode, `app.py:32-36`), `ui/widgets/stat_card.py`, `ui/widgets/risk_badge.py`, `ui/styles.tcss`, `tests/` (3 test files + a snapshot SVG) | — | update-document |
| §11 | Item 4 "Grounding log + JSON output" | Grounding log **done**; JSON output not yet | update-document (reorder roadmap) |
| §11 | Item 1 "/load, /verify real data" | The `/load` `/verify` code exists (`ui/dashboard.py:151,142`) but real-data validation = runtime | NEEDS VERIFICATION |
| README.md | "including holder distribution, liquidity checks, and early wallet clustering" | Holder distribution & clustering **do not exist**; only liquidity/volume/fdv heuristic checks (`rug_check.py`) | update-document (Finding #1) |
| §12 | Disclaimer "mandatory in UI/marketing" | UI ✅ (`ui/dashboard.py:107-108`); README (marketing-facing) ❌ no disclaimer | update-document (P2 #12) |

---

## 4. FINDINGS (ordered by severity)

**[P1] README.md:2 — a public claim of features that do not exist.**
`"including holder distribution, liquidity checks, and early wallet clustering"` — grep proves there is no holder signal and no clustering anywhere in the code (see §3). The README is the most public file → the most dangerous overclaim in this repo. → Fix: change the description to `"...liquidity and volume heuristic risk checks with AI-assisted evidence-first summaries (early stage; holder & clustering analysis planned)"` + add the one-sentence §12 disclaimer.

**[P1] .gitignore:15 — `.env.example` is swallowed by the pattern and is NOT tracked by git.**
`git check-ignore -v .env.example` → `.gitignore:15:.env.*  .env.example`; `git ls-files` does not list it. Yet the app's own error message tells the user to look at that file (`ui/dashboard.py:197`, `ai_analyst.py:91`), and `.env.example:1-3` claimed "File .env TIDAK masuk git (sudah di .gitignore)" — Indonesian at audit time, EN: "The .env file does not enter git (already gitignored)" — half true: `.env.example` instead vanishes from clones entirely. → Fix: add the line `!.env.example` AFTER `.env.*` (order matters), then `git add -f .env.example`.

**[P1] ui/dashboard.py:121 — a ZeroDivisionError crash when `priceChange == -100`.**
`pts = [price / (1 + float(pc.get(k) or 0) / 100) for k in ("h24","h6","h1","m5")]` — a token that rugs -100% (a real occurrence with memecoins) makes the denominator `1 + (-100/100) = 0`. `_apply_pair` is called OUTSIDE the try/except around `_load` (`ui/dashboard.py:225`), so the exception escapes the worker and takes the app down. → Fix: guard with `d = 1 + pc/100; pts.append(price/d if d > 0 else 0.0)`, and wrap `self._apply_pair(pair)` in a try with a friendly error message.

**[P1] ui/dashboard.py:273 — `DataTable.sort("Likuiditas")` (column key at audit time; since renamed to "Liquidity") sorts the formatted STRING, not the number.**
The rows hold `_usd()` strings (`"$900K"`, `"$1.2M"`, `ui/dashboard.py:261`) → lexicographic sort: `"$900K" > "$1.2M"`, so a token with $900K liquidity shows ABOVE $1.2M. Users are led to misread the ranking — ranking misinformation. → Fix: keep the numeric value (e.g. a `row_key → liq_usd` map) and stop using `t.sort`; sort manually with `table.order` from a numerically pre-sorted list of keys, or add a hidden column holding the number as the sort key.

**[P1] CATATAN_KERJA.md §6 — "already running" claims for features that do not exist.**
"top holder concentration; basic clustering (burst timing + amount uniformity)" — absent from the code (evidence in §3). This internal document is the team's source of truth; phantom claims can leak into pitching/marketing. → Fix: use the §6 PATCH below.

**[P1] CATATAN_KERJA.md §7 + §9 — the grounding log is claimed as "not yet" when it already runs; the §9 module list does not match the repo structure.**
Grounding log evidence: `ai_analyst.py:122-134,147` + `ui/dashboard.py:204` + commit `723c4f2`. §9 lists 8 files of which 6 are wrongly named/wrongly located/nonexistent (evidence in §3) — the repo was restructured into `providers/` + `heuristics/` (commits `285d12f`…`723c4f2`) but the document was not. → Fix: use the §7/§9 PATCH below.

**[P2] ui/dashboard.py:197 — the NoKeyError error message always names `ANTHROPIC_API_KEY`.**
The handler is shared with glm/kimi, yet a user who forgot `GLM_API_KEY` is told to set the Anthropic env var — misleading. → Fix (shipped, in English): `ai.write(f"[#e67e22]{ai_analyst.PROVIDERS[prov].env_key} not set (see .env.example)[/]")`.

**[P2] ui/dashboard.py:112-115 — `_chart_empty` is dead code.**
Defined but never called (grep: only the definition). An empty chart shows the default plotext title. → Fix: call it in `on_mount` (line 99) so the chart panel carries a "no data yet" title from the start, or remove it.

**[P2] ui/dashboard.py:210 — `address[:12]` is not `escape()`d before entering the RichLog (`markup=True`).**
An address containing `[` can inject rich markup (fake colors/links) into the UI log. Everywhere else escape is used consistently (`:148,154,158,170,177`); this is the only leak. Impact: cosmetic spoofing of messages by the user's own input — low, but cheap to fix. → Fix: `escape(address[:12])`; bonus: validate the address charset in `/load` (reject anything non-alphanumeric or of unreasonable length).

**[P2] ui/dashboard.py:144,151 — command parsing uses `startswith` → `/explainfoo` / `/loadfoo` are accepted.**
`text.startswith("/explain")` also matches `/explainGLM` (taken as `/explain` with the default claude). → Fix: `cmd, *args = text.split()`, then match `cmd` exactly.

**[P2] ui/dashboard.py:202 — the AI output header does not name the token symbol; a small race between worker groups.**
`/explain` (group "explain") and `/load` (group "load") run in parallel; `_last_pair` is set atomically (`:237`) so the evidence stays consistent, but if a fresh `/load` finishes first, the AI output for the OLD token appears unlabeled in the middle of the NEW token's context — users can misattribute it. → Fix: capture `symbol` before the `await` and put it in the header: `AI ANALYST · {prov} · {symbol} · tier free`.

**[P2] pyproject.toml:8,10 + dev `pytest-asyncio` — unused dependencies.**
`humanize`, `pyfiglet`: zero usage (grep finds nothing). `pytest-asyncio`: there are no async tests. → Fix: drop all three (the lockfile shrinks too), or act on the original intent.

**[P2] README.md — no §12 disclaimer even though the document says "mandatory in UI/marketing".**
The UI already complies (`ui/dashboard.py:107-108`); the README (the only marketing-facing file) does not. → Fix: one disclaimer sentence at the end of the README (bundle with Finding #1).

**[P2] logs/grounding/*.jsonl — no size cap/rotation.**
`_ground_log` appends per day without pruning (`ai_analyst.py:126-133`). Its contents are public market data + AI output — not secrets — and `logs/` is already gitignored (`.gitignore:26`). → Fix (later): monthly rotation or a size cap; for now it is safe to leave as is.

Notes that are NOT findings (checked, genuinely fine): `webserve.py:5` binds `127.0.0.1` only — safe as long as it is not forwarded; the broad `except Exception` handlers in `_load`/`_explain` (`ui/dashboard.py:199,218`) surface the error to the user instead of swallowing it — as their `noqa` comments state; `update_cell` is guarded by `key in self._keys` (`:265`); `_buy_ratio` cannot divide by zero because `tot < 10` returns first (`rug_check.py:74-77`).

---

## 5. §10 GREP RESULTS (forbidden assumptions)

| String | Location | Verdict |
|--------|--------|-------|
| `AUC` | — | **CLEAN** (nothing in code/UI/snapshot; only CATATAN_KERJA.md itself) |
| `0.9098` | — | **CLEAN** |
| `3.81` | — | **CLEAN** |
| `0.003` | — | **CLEAN** (the test fixture uses `0.001`, `tests/test_ai_analyst.py:12` — not an assumption figure) |
| `akurasi tinggi` (EN: "high accuracy") | `ai_analyst.py:23` | **SAFE** — it appears in the SYSTEM_PROMPT precisely as part of the list of words FORBIDDEN to the AI |
| `jaminan` / `dijamin` / `pasti` (EN: "guarantee" / "guaranteed" / "certain") | `ai_analyst.py:23` | **SAFE** — identical context: the prompt ban list |
| `hype` | `providers/dexscreener.py:9` | **SAFE** — an internal comment explains the hype chain is deliberately held back until verification (consistent with §3) |
| `HyperEVM` | — | **CLEAN** in code (only in CATATAN_KERJA.md) |
| `Robinhood` | — | **CLEAN** |
| `$HOOD` | — | **CLEAN** |
| (bonus) UI snapshot | `tests/__snapshots__/test_ui_snapshot/test_dashboard.svg` | **SAFE** — the only sensitive string present: "DYOR" (part of the disclaimer) |

---

## 6. §11 ROADMAP GAPS (value order + dependencies)

1. **Document sync + repo hygiene (free, 30 minutes).** Apply the §7 PATCH; `!.env.example` + track it; fix the README (drop the clustering claim, add the disclaimer). Dependencies: none. This removes the entire document-P1 category before anything else is rewritten.
2. **Fix three small, user-felt P1/P2 bugs.** The `-100%` crash (`dashboard.py:121`), the numeric sort (`:273`), the per-provider NoKeyError message (`:197`). Dependencies: none — small patches, easy tests.
3. **Runtime validation of old roadmap item 1.** NEEDS VERIFICATION: `/load`/`/verify` against the real DexScreener API (rate limits, actual fields), and the GLM (`glm-5.3`) & Kimi (`kimi-k3`) model IDs — already flagged as guesses in `ai_analyst.py:46-47`. Dependencies: API keys + connectivity.
4. **Structured JSON output (remainder of old item 4).** The grounding log is ALREADY done → what remains is forcing the AI to emit structured JSON (schema + parse + text fallback). Dependencies: none.
5. **Onboarding per-wallet data sources** (GeckoTerminal first, Birdeye next) — the prerequisite for the §6 claims to be honest: without it, top-holder/clustering/funding-traceback (items 2-3 of the old roadmap) cannot start. Dependencies: verification of the `tx_from_address` etc. fields (still §10 assumptions).

---

## 7. DOCUMENT PATCH (ready to copy-paste)

### §6 — full replacement:
```markdown
## 6. Rug-Check & Clustering — Honest Status
Already running (heuristics/rug_check.py — 5 weighted, deterministic signals): liquidity score,
FDV/liquidity ratio, volume/liquidity ratio, 24-hour buy/sell ratio, pair age.
Fewer than 3 signals computed → level "INSUFFICIENT DATA", score left empty (no guessing).
Not yet present (do not claim these to users): top holder concentration, per-wallet clustering
(burst timing / amount uniformity), funding-source traceback, sniper-bot database,
circular transfer detection — all of it waiting on a per-wallet data source
(GeckoTerminal/Birdeye) that has not been onboarded.
False-positive principle: fair-launch/airdrop/KOL calls can mirror the "bad" pattern.
Heuristics = decision support, not a verdict.
```

### §7 — full replacement:
```markdown
## 7. AI Analyst
Pattern: provider → heuristic → AI reasoning. Already present (ai_analyst.py):
- the system prompt forbids price predictions, buy/sell advice, profit promises, certainty claims;
- multi-provider claude/glm/kimi via registry + .env (OpenAI-compatible endpoint for glm/kimi);
- grounding log per call → logs/grounding/YYYY-MM-DD.jsonl (evidence + output + token usage)
  — comparable across models & replayable;
- free/deep tier in the signature: it only sets the LENGTH of the output (max_tokens 400 vs 1000),
  not data correctness — but the UI only ever calls the "free" tier; the "deep" path awaits a token gate.
Not yet present: structured JSON output; runtime validation of the model's evidence-first compliance.
```

### §9 — full replacement:
```markdown
## 9. Code Module Status
providers/dexscreener.py (running; chains sol/bnb/base/avax; "hype" held back until the chainId
is verified), heuristics/rug_check.py (running; 5 weighted signals, combined verdict),
ai_analyst.py (running; multi-provider claude/glm/kimi; grounding log running; tier param exists,
deep unreachable), app.py (entry point; --ascii without Nerd Font),
ui/dashboard.py + ui/theme.py + ui/icons.py + ui/styles.tcss + ui/widgets/{stat_card,risk_badge}.py
(MVP running; /load, /verify, /explain [claude|glm|kimi], /help), webserve.py (web mode via
textual-serve on localhost:8000), tests/ (rug_check deterministic; ai evidence-subset +
no-key for every provider; UI snapshot).
Files not yet present: trade_feed.py (GeckoTerminal), clustering.py, whale_tracker.py (Helius),
token_gate.py (soulbound) — the old module list from the previous document version no longer applies.
```

### §11 — full replacement:
```markdown
## 11. Priority Roadmap
1. Document sync + repo hygiene (honest README, .env.example into git, patch CATATAN_KERJA).
2. Fix user-facing bugs: the chart crash at priceChange -100, numeric table sort, per-provider NoKeyError message.
3. Basic technical validation (/load, /verify against real data; verify the glm/kimi model IDs). — NEEDS VERIFICATION at runtime.
4. Structured JSON output (grounding log: ALREADY DONE).
5. Onboard per-wallet data sources (GeckoTerminal → Birdeye) — the prerequisite for all wallet analysis.
6. Funding traceback (sampling 10-15 wallets). 7. Sniper-bot DB. 8. Token gate + deep tier (soulbound/time-bound).
```

---

*End of report. No other file was changed in this audit.*
