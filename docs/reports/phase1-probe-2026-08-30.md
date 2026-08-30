# FASE 1 PROBE REPORT — $0 deployer sources (base/bnb) + Birdeye coverage
Date 2026-08-30 · throwaway scripts per law 2 · findings below are the raw truth; live calls were founder-authorized, kept minimal.

## a) EVM deployer — creator lookup

| provider × chain | verdict | raw evidence |
|---|---|---|
| Routescan `getcontractcreation` base(8453) | **DEAD** | HTTP 200 `{"status":"0","message":"chain not supported"}` (WETH + DEGEN) |
| Routescan `getcontractcreation` bnb(56) | **DEAD** | same "chain not supported" (CAKE) |
| Blockscout base `/api/v2/addresses/{addr}` | **LIVE (primary)** | AERO → `creator=0xe83f922C…818`, `creation_transaction_hash=0x5727b7b3…` — **on-chain verified**: `eth_getTransactionByHash` (mainnet.base.org, UA required — no-UA = Cloudflare 403) returned `to=null` AND `from==claim` ✔ law-3 satisfied. DEGEN/VIRTUALS returned no creation row → per-token coverage is partial → those become null + reason (transient 500/retry still applies). |
| GoPlus keyless base | **LIVE (fallback + cross-check)** | AERO `creator_address=0xe83f922C…818` — **identical to Blockscout AND to the on-chain `from`** (three-way match). No creation tx hash → cannot satisfy law-3 alone → fallback/cross-check role. |
| GoPlus keyless bnb | **LIVE (primary for bnb)** | CAKE `creator_address=0x0f9399fc81dac77908a2dde54bb87ee2d17a3373`, `is_honeypot=0`, `holder_count=1909384`. No creation tx hash → law-3 full verification impossible → the claim ships flagged unverified-tx in `data_sources`. |
| Etherscan V2 (founder key) | **DEAD (founder-proven)** | free tier explicitly rejected for base & bnb — not used per mandate. |
| alchemy_getAssetTransfers | **DEAD (F5a-R probe)** | category 'contract' rejected on bnb/base/avax (verbatim error captured 2026-08-30). |

## b) Birdeye free-tier coverage (founder key in .env, masked `45637900…`)

| endpoint | solana | base | bsc |
|---|---|---|---|
| `/defi/token_overview` | **200 OK** (251 keys; BONK price+liquidity) | **200 OK** (248 keys; WETH price 2457.75 ✔) | **200 OK** paced (CAKE price 1.751 ✔) — burst of 4 calls → 429, paced 1-call → 200. Rate headers: `X-RateLimit-Limit: 300` / min. |
| `/defi/token_security` | **401 — NOT free** (needs paid plan) | not probed (401 on sol) | — |
| `/defi/token_creator` | 404 Not found | — | — |
| old `/v1/token/overview` paths | return an HTML page (wrong path family) | — | — |

Key learnings: correct host `public-api.birdeye.so`, correct path family `/defi/*`, headers `X-API-KEY` + `x-chain`; pacing mandatory (burst 429s), header-documented quota 300/min.

## c) On-chain verification gate (law 3)

- `eth_getTransactionByHash` via public RPC — `mainnet.base.org` and `bsc-dataseed.binance.org` LIVE. **UA header required there too** (no-UA → Cloudflare 403 even on RPC).
- Verification rule applied in FASE 2: a creator claim ships only when `to == null && from == claim` on the provider-supplied creation tx. GoPlus claims (no tx hash) are shipped as cross-checked-or-unverified, never silently trusted.

## Verdict matrix feeding FASE 2 (deployer) and FASE 4 (rug flags)

| capability | sol | bnb | base | hood | hype |
|---|---|---|---|---|---|
| deployer | helius (LIVE, proven F5a-R) | goplus keyless (LIVE; unverified-tx flag) | blockscout primary (LIVE, law-3 verified) + goplus cross-check | null — no $0 source | null — no $0 source |
| holders | helius (LIVE) | null — no $0 enumeration | null — no $0 enumeration | null | null |
| sell_test | jupiter (LIVE) | null — 1inch needs key | null — 1inch needs key | null — no route concept | null — no route concept |
| rug flags | helius DAS authorities (FASE 4 probe) | goplus (LIVE) | goplus (LIVE) | null | null |
