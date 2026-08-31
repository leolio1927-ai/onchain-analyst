# V4B FINAL REPORT — 2026-08-31 (PROMPT-V4B RESUME: M5 HOLDINGS + CLOSE)

Resume context: agent-4 died at step 16/19 with M5 half-done. V4B = N0 state audit +
rescue → N1 M5 finalize (GT price join, wallet-connect flow, privacy law) → N2 close.
Commit chain this session: `ab189f1` (wip(M5) rescue of agent-4's scaffolding) →
`280ec5d` (feat(M5) holdings goes live) → N2 closeout (this file + ledger).
No push — the founder publishes.

## 1. N0 audit table (state found before any code)

| item | state found | action |
|---|---|---|
| git tree | dirty — M5 work uncommitted, ledger row claimed DONE | rescued as `wip(M5)` commit ab189f1, ledger row corrected to WIP |
| M0 frontier scan | DONE @ 05b1c05 | verified (docs/TECH-DECISIONS.md §MANDATE 0-V4, 19 rows) |
| M1 whale 429 governance | DONE @ 1c93dbb | verified |
| M2 wallet live connect | DONE @ d9cd39a | verified |
| M3 vault architecture | DONE @ 410e487 | verified |
| M4 portfolio watch | DONE @ 4a82e9c | verified |
| M5 holdings | claimed DONE, uncommitted | rescued, finalized in N1 |
| baseline gates | tsc 0 · build ✓ dial3d 130.10 kB gzip · vitest 99 ✓ (3 flaky 5s-timeouts under concurrent build load, green isolated) · pytest 291 + snapshot ✓ · oxlint 15 pre-existing/0 err · ruff ✓ | truth-run recorded in ledger RESCUE NOTE |

## 2. Phase → commit → gate table (V4B session)

| phase | commit | gate evidence |
|---|---|---|
| N0 audit + rescue | ab189f1 | full baseline truth-run (table above); rescue compiles clean, 930 ins/68 del across 15 files |
| N1 M5 BE price join | 280ec5d (part 1/3 of the change set) | pytest tests/test_holdings.py + test_helius.py 18/18: side-aware join (base → USD+Δ24h, quote → USD only — GT exposes no quote-side Δ, probe 2026-08-31), WSOL/WETH wrapped-twin natives, WBNB via v2 search (GT 404s the bsc token page), PRICE_CAP 8, ONE aggregate sentence per miss class, key-in-header (never URL), access-log redaction formatter |
| N1 M5 FE + privacy | 280ec5d (part 2/3) | tsc 0 · vitest 21 files/**105 tests** ✓ (11 holdings-page: verbatim render, USD + sev-colored Δ24h, pricing chip, breakdown bar, CSV blob + chain-only filename, M2 picker empty state, session prefill auto-check, DEMO hint, console+localStorage privacy sweep, vilmei.holdings-chain pref) · oxlint 15 pre-existing warn/0 err (0 new in changed files) · build ✓ dial3d 130.10 kB gzip ≤ 150 kB |
| N1 contract + docs | 280ec5d (part 3/3) | openapi snapshot regenerated — 29 paths, ONE change set (+68/−2: holdings schema price fields + description) · llms.txt §Live API holdings bullet rewritten same commit · api-catalog (RFC 9727) is dynamic, links /openapi.json — no change needed · pytest **298/298 + 1 snapshot** · ruff All checks passed |
| N2 truth-run | (this closeout) | live evidence below, §5 |

diff --stat per phase:
- ab189f1 (rescue): 15 files, +930/−68 — holdings.py/alchmey/blockscout/helius providers, schemas, route, FE scaffolding, tests, snapshot 28→29, .env.example ALCHEMY block.
- 280ec5d (M5 final): 12 files, +940/−119 — geckoterminal.py +pool_token_side/+search_pools_v2, holdings.py price join (+233/−…), helius key→header, server.py redacting formatter, schemas price fields, Pages2.tsx full page upgrade, prefs holdings-chain, tests +198 holdings/+5 helius, snapshot +70, llms.txt +21.

## 3. M0 frontier rows (docs/TECH-DECISIONS.md §MANDATE 0-V4 — all live-checked 2026-08-31; 19 rows total, 15 cited)

| temuan | sumber (URL) | tanggal |
|---|---|---|
| EIP-6963 Multi Injected Provider Discovery = **Final** (announce/requestProvider events, frozen ProviderInfo) → M2 zero-dep discovery | eips.ethereum.org/EIPS/eip-6963 | 2026-08-31 |
| Solana **Wallet Standard** (registerWallet/getWallets, window events, 75 releases) → M2 | github.com/wallet-standard/wallet-standard | 2026-08-31 |
| `@wallet-standard/base` **1.1.1** zero-dep, published 2026-06-03 (registry JSON, bukan web) | registry.npmjs.org/@wallet-standard%2fbase | 2026-08-31 |
| Phantom: Wallet Standard menggantikan legacy `window.solana` injection | docs.phantom.com/developer-powertools/wallet-standard | 2026-08-31 |
| MCP rev **2026-07-28 = CURRENT** — stateless core cocok dengan /mcp kita; Roots/Sampling/Logging deprecated ≥12 bulan | modelcontextprotocol.io/docs/2026-07-28/learn/versioning | 2026-08-31 |
| **x402** production-ready: 75.41M tx/30d · $24.24M volume (2026-08-25) → PARKIR design note utk API-tier berbayar | x402.org | 2026-08-31 |
| **llms.txt v2** revised 2026-08-10 — bentuk file kita tetap sesuai | llmstxt.org | 2026-08-31 |
| Token-2022 TransferFee (withheld→harvest→withdraw authority) → PARKIR-UNTUK-V3 | solana.com/docs/tokens/extensions/transfer-fees | 2026-08-31 |
| Jupiter `platformFeeBps` RECHECK: no cap documented + T22 fee via `instructionVersion=V2` (Oct 2025) → SIAP-$0 kokoh | developers.jup.ag/docs/swap/v1/add-fees-to-swap | 2026-08-31 |
| v4hooks.com (updated 2026-08-27): 51 listings, **8 products production** (Flaunch/Clanker/Zora), FeeRouter MIT → EVM verdict naik ke PERLU-DEPLOY-HOOK | v4hooks.com | 2026-08-31 |
| **Helius free tier LIVE** (key founder): getBalance + DAS getAsset 200 | mainnet.helius-rpc.com | 2026-08-31 |
| **Alchemy free LIVE base+bnb**: eth_getBalance + getTokenBalances 200; 30M CU/bln | base-mainnet/bnb-mainnet.g.alchemy.com + alchemy.com/pricing | 2026-08-31 |
| **Blockscout base keyless LIVE**; bsc = no keyless instance (404) | base.blockscout.com + bsc.blockscout.com | 2026-08-31 |
| Etherscan V2 free = **ETH-only** (chainid 56/8453 → NOTOK free-tier sentence) | api.etherscan.io/v2 | 2026-08-31 |
| Token Terminal free = UI/MCP/CSV only (REST paid) · RWA.xyz 403 · Dune queries paid → PARKIR semua | tokenterminal.com/pricing · app.rwa.xyz/pricing · docs.dune.com | 2026-08-31 |

N1 added its own probe trail (raw in logs/n1-probe-*.txt, 2026-08-31): Helius header-auth 200
(X-API-Key) vs query-auth — header chosen so the key never appears in a URL error message;
GT relationship ids `{network}_{address}` lowercased (probe n1-probe-gt-wsol-rel); GT exposes
**no** quote-side 24h attribute (n1-probe-gt-attrs); WBNB bsc token page 404 but
`/search/pools?query=WBNB&network=bsc` 200 (n1-probe-gt-wbnb-search); Blockscout transient-500
hot spells real (4×500 then 200 @30.5s).

## 4. Deviations from spec — the honest list

1. **bnb rides Alchemy, not Blockscout** (spec suggested Blockscout probe-first for bnb+base):
   probe proved there is NO keyless Blockscout instance for bsc (bsc.blockscout.com 404
   "default backend", explorer.bnbchain.org is Spring, not Blockscout) — recorded in M0 row.
   base keeps the keyless Blockscout fallback by design.
2. **Single-chain check per request** (no cross-chain aggregation in v1): a 5-chain sweep would
   burst the GT free tier (~10 calls/min) past the price join budget; the page checks the
   chain the user picks (or their wallet's family). Aggregation parked with reason.
3. **Quote-side holdings ship no Δ24h** — GT exposes no quote-side change attribute
   (probe-verified absence); the UI shows a dash and the pricing sentence says so. Absence
   stays absence.
4. **Token-2022 SPL holdings are not enumerated** by the sol path (classic Tokenkeg program
   only) — stated in providers/helius.py docstring, never faked.
5. **Helius REST /v0 balances endpoint is dead** (probe: 404 "Method not found") — sol path
   rewritten on standard RPC getBalance + getTokenAccountsByOwner.
6. **vitest flakiness under load**: 3 tests (RugCheckPage live, TokenPage bonding dash,
   WhalePage AUTO) hit 5s timeouts only when the full suite ran concurrently with a build;
   all pass isolated and in clean runs — recorded, not papered over.
7. **base keyless truth-run hit a Blockscout hot spell** during the N2 run — the response was
   the honest `upstream_error` sentence (never red). Retry evidence in §5.
8. **agent-4's ledger row claimed DONE pre-commit** — corrected to WIP at rescue, restored to
   DONE with this closeout and both shas.

## 5. Live truth-run (N2, 2026-08-31; scratch ports — founder's :8000 untouched)

Keyed server :8131 (env from tolerant parser), keyless :8132/:8133 (keys explicitly unset).
Raw: logs/n2-truth-keyed.txt · logs/n2-truth-keyless.txt · logs/n2-truth-813*.log.

| check | result (verbatim facts) |
|---|---|
| sol keyed (Helius + GT join) | coverage **ok** — 1,695,346.51 SOL @ $102.0068 (**−4.93%**); 4 tokens priced (e.g. 2.90e-6/+0.0%), 4 honest `rate_limited` notes, 2 `capped` — the free-tier guard caught live |
| bnb keyed (Alchemy + WBNB search join) | coverage **ok** — 25,344.13 BNB @ **$686.04 (−1.863%)**; priced tokens verbatim + ONE `pricing_capped — first 8 of 10` sentence + `pricing_rate_limited` sentence |
| base keyless (Blockscout) | Blockscout was in a **sustained hot spell** for the whole window (first pass + 3-attempt retry over ~4 min): every answer the honest `upstream_error — blockscout:http_500` sentence, never red — the transient-500 contract live-exercised. The keyless **ok** path itself was proven in the M5 session (200 @30.5s after 4×500; base ok 0.0098 ETH on scratch :8126) |
| base keyed (Alchemy + GT join — founder posture) | coverage **ok** — 0.0098 ETH @ **$2,442.47 (−1.4%)** via the WETH wrapped twin; token rows priced verbatim or honest `no_pool`/`rate_limited` notes |
| hype / hood | PARTIAL sentences naming the exact absence (Etherscan V2 free = ETH-only, no public blockscout, no Helius/Alchemy coverage) |
| malformed sol address | HTTP 400 "not a valid sol address — check the format and retry" |
| unknown chain (avax) | HTTP 404 allowed-list sentence |
| sol keyless | `no_key` declared-null sentence naming HELIUS_API_KEY + "the address itself was never sent anywhere" |
| **privacy law** | 9 `holdings/*/REDACTED` access-log lines across the four scratch servers (8131/8132/8133/8134); grep for all real addresses in every server log = **NO PLAINTEXT ADDRESSES IN SERVER LOGS** |

Grep gates (N2): signing/execution register (`signTransaction|signMessage|sendTransaction|
signAndSendTransaction|requestSignature`) in frontend/src = **0 hits**; extension globals
(`window.solana|phantom|ethereum|tronWeb`) = **0 hits**; repo key sweep = only the M3 test
fixture in tests/test_vaults.py (a fake value for the parser test); `.env` untracked, only
`.env.example` in the index.

## 6. Ten visual points for the founder (run `bash scripts/dev-server.sh`, then browse)

Base URL `http://localhost:8000` (hash-routed terminal). Sample CAs to paste:
sol BONK `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` · bnb CAKE
`0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82` · base USDC
`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` · sol whale wallet
`5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9`.

1. **/terminal#/holdings** — paste the sol whale wallet on SOL: chain-logo chip + LIVE badge,
   native row with USD value + red Δ24h, severity-colored token table, chain-breakdown bar,
   cyan "heuristic pricing — dex-reserve derived" chip, EXPORT CSV.
2. **/terminal#/holdings** (empty) — premium empty state: M2 wallet picker inline (DEMO
   identity connects and auto-checks; a DEMO hint labels the preview address).
3. **/terminal#/holdings** — switch to HYPE and check any EVM address: muted PARTIAL chip +
   mono sentence, never a red wall.
4. **/terminal#/portfolio** — add BONK (sol) + CAKE (bnb) with amounts: verbatim GT facts,
   client-side value, ONE aggregate rate-limit banner when GT 429s.
5. **/terminal#/whale** — paste BONK: AUTO cross-chain tape, NET-WHALE-FLOW sparkline,
   threshold chips with the labelled-heuristic note, CSV export.
6. **/terminal#/rugcheck** — BONK on sol (RugCheck live) vs hype CA (honest limited panel,
   dial still renders "SIGNAL SET LIMITED").
7. **/terminal#/scanner** — scan the three sample CAs: skeleton shimmer → SevSpark rows from
   the ONE severity color source.
8. **/terminal#/swap** — connect DEMO wallet: swap rail stays SIMULATED, fee ADVANCED strip
   shows the planned 0.50% split + vault chips (AWAITING CLAIM until the founder fills the 15
   VILMEI_VAULT_* addresses in .env).
9. **/live** and **/live/sol** — five chain boards with founder-locked SVG marks, staggered
   fetch, honest 502 sentence if GT is down.
10. **/terminal#/docs** + **/roadmap** — honesty law, engineering changelog with commit
    hashes, VM-fee-01/02/03 blockers; /assets/llms.txt is the machine index of all of it.

## 7. Founder restart block

```bash
cd /home/floxi/onchain-analyst
# find + stop the old server (the [w] trick keeps grep out of its own match)
ps aux | grep "[w]ebapp"            # or: ss -ltnp | grep :8000
kill <pid>
# CANONICAL: load keys with the tolerant parser + start on :8000 in one step
bash scripts/dev-server.sh          # exports .env + uv run python -m webapp.server --port 8000
# health check
curl -s http://localhost:8000/api/health
```

Manual variant — **do NOT** `set -a && source .env`: the founder's `.env` line 2 is a bare
`=` and aborts a naive source before any key loads (probe 2026-08-31; that is exactly why M3
shipped the tolerant parser). Equivalent by hand:

```bash
while IFS= read -r line; do case "$line" in export\ *) eval "$line" ;; esac; \
  done < <(uv run python -m webapp.envfile .env)
uv run python -m webapp.server --host 0.0.0.0 --port 8000
```

Keys live only in `.env` (untracked). **Note:** the 15 `VILMEI_VAULT_*_ADDRESS` vars in
`.env.example` are placeholders — the founder fills them from the private wallets; the repo
only ever sees PUBLIC addresses (claim-based vault law, docs/FEE-VAULTS.md). HELIUS_API_KEY /
ALCHEMY_API_KEY are the founder's free-tier keys; holdings answers `no_key` sentences until
they are set.

## 8. Regression guard — counts across V4

| phase | FE (files/tests) | BE (pytest) | OpenAPI paths | dial3d gzip |
|---|---|---|---|---|
| P0-V4 baseline | 16 / 68 | 255 + snapshot | 26 | 130.10 kB |
| M1 whale 429 | 16 / 72 | 264 + snapshot | 26 | 130.10 kB |
| M2 wallet connect | 18 / 81 | 264 + snapshot | — | 130.10 kB |
| M3 vaults | 18 / 81 | 273 + snapshot | 27 | 130.10 kB |
| M4 portfolio | 20 / 94 | 282 + snapshot | 28 | 130.10 kB |
| M5 rescue (ab189f1) | 21 / 99 | 291 + snapshot | 29 | 130.10 kB |
| M5 final (280ec5d) | 21 / **105** | **298 + snapshot** | 29 (ONE change set) | **130.10 kB** |

Named regressions re-verified in the final gate set: identity-race ✓ (P1 suite), overlay-alpha
✓ (overlay-gate), sev-parity ✓ (CSS-hue === SEV_RAMP), dial3d ≤ 150 kB gzip with the number
printed on every build ✓, never-red fixtures ✓ (rug/whale/holdings coverage suites),
whale-top-tape ✓ (M1 seeding + top-below-threshold tests).
