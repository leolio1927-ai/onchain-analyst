# VILMEI — TECH-DECISIONS (MANDATE 0 frontier scan, 2026-08-31)

Method: every row was checked LIVE against the authoritative source on 2026-08-31 —
npm registry (`npm view <pkg> version time.modified`) for JS, PyPI JSON for Python,
official spec sites for protocols. No blog/memory/prompt answers. Verdicts:
TETAP · UPGRADE · FRONTIER-ADOPT · PARKIR-SADAR-DIRI · TOLAK-DENGAN-ALASAN.
Raw probe transcripts live in the PROMPT-V2 report; probe dates inline below.

| # | Modul | Paket/Spek | Terpasang | Terbaru (tgl) | Keputusan | Alasan + link |
|---|---|---|---|---|---|---|
| 1 | semua FE | react | 19.2.8 | 19.2.8 (2026-08-28) | TETAP | already latest; npmjs.com/package/react |
| 2 | semua FE | react-dom | 19.2.8 | 19.2.8 (2026-08-28) | TETAP | latest; npmjs.com/package/react-dom |
| 3 | build | vite | 8.2.2 | 8.2.2 (2026-08-20) | TETAP | latest major line; npmjs.com/package/vite |
| 4 | test | vitest | 4.1.11 | 4.1.11 (2026-08-28) | TETAP | latest; adopted in the L session; npmjs.com/package/vitest |
| 5 | typecheck | typescript | 7.0.2 | 7.0.2 (2026-08-30) | TETAP | latest; npmjs.com/package/typescript |
| 6 | lint | oxlint | 1.79.0 | 1.80.0 (2026-08-24) | **UPGRADE** | patch-level, zero-risk; upgraded this session; npmjs.com/package/oxlint |
| 7 | test env | jsdom | 30.0.1 | 30.0.1 (2026-07-29) | TETAP | latest; npmjs.com/package/jsdom |
| 8 | P5 charting/DIAL | three | (none) | 0.185.1 (2026-07-01) | **FRONTIER-ADOPT** | measured this session: tree-shaken core (Scene/Camera/Renderer/Torus/InstancedMesh) = 609.45 kB min / **137.75 kB gzip ≤ 150 kB budget** → lazy-loaded chunk; npmjs.com/package/three |
| 9 | BE API | fastapi | 0.141.1 | 0.141.1 (2026-07-29) | TETAP | already latest; pypi.org/project/fastapi |
| 10 | BE models | pydantic | 2.13.4 | 2.13.5 (2026-08-28) | PARKIR-SADAR-DIRI | patch behind; upgrade touches the wire contract the founder's server currently serves — next restart window; pypi.org/project/pydantic |
| 11 | BE server | uvicorn | 0.52.4 | 0.52.4 (2026-08-19) | TETAP | latest; pypi.org/project/uvicorn |
| 12 | P6 agent surface | MCP spec | — | rev **2026-07-28** (schema.ts) | **FRONTIER-ADOPT** | /mcp implements initialize/tools per this revision, JSON-RPC 2.0; modelcontextprotocol.io/specification/latest |
| 13 | P6 discovery | RFC 9727 | — | Standards Track (June 2025) | **FRONTIER-ADOPT** | /.well-known/api-catalog published as Linkset (application/linkset+json, profile rfc-editor.org/info/rfc9727); rfc-editor.org/rfc/rfc9727.html |
| 14 | P3 rug EVM | GoPlus token_security | wired (providers/goplus.py) | api.gopluslabs.io/api/v1 (re-probed live 2026-08-31) | **ADOPT** | CAKE bnb: code 1, holders 1909528, is_honeypot 0; AERO base: 751137 holders — docs.gopluslabs.com/reference/response-details |
| 15 | P3 rug sol | RugCheck API | (new) | /v1/tokens/{mint}/report/summary (probed 200 @1.02s, 2026-08-31) | **ADOPT** | BONK: score_normalised 7, lpLockedPct 23.9, risks[] {name,level,score}; api.rugcheck.xyz |
| 16 | P5 motion | View Transitions API | — | stable cross-fade (Chrome 111+/Safari 18) | **FRONTIER-ADOPT** | progressive `document.startViewTransition` page cross-fade, guarded at runtime; developer.mozilla.org/docs/Web/API/View_Transitions_API |
| 17 | P5 color/typography | CSS oklch + container queries + text-wrap:balance | — | Baseline 2023–2024, universal 2026 | **FRONTIER-ADOPT** | --sev-* risk tokens shared DIAL/TAPE/BADGE; container-query rail type; web.dev/baseline |
| 18 | wallet | wagmi / viem / ethers / @rainbowkit / @solana/wallet-adapter | (none) | n/a | **TOLAK-DENGAN-ALASAN** | read-only build law (V1 Fase 2.3): extension adapters throw READ_ONLY_BUILD; zero wallet libs until execution ships — maturity signal, not a loss |
| 19 | P3 empty-state | SSR-snapshot computed-style guard | — | n/a | **TOLAK-DENGAN-ALASAN** | jsdom applies no stylesheet cascade; alpha-gate implemented as CSS-source parse test (same guarantee, real evidence) |
| 20 | feeds sunset audit | GeckoTerminal /api/v2 + DS latest/dex + GoPlus v1 + RugCheck v1 + Helius | in use | verified 2026-08-30/31 | TETAP | no sunset endpoint wired; GT /api/v2/search confirmed nonexistent (404 probed) and never adopted — detect uses DS search instead |

Frontier adoption per utility module (the founder's core question — "mana teknologinya baru?"):

- **SWAP**: View Transitions cross-fade (P5), container-query rail typography (P5), oklch severity tokens (P5)
- **DASHBOARD**: oklch --sev-* verdict language via `<RiskDisplay>` (P5), spring counter (P5)
- **TOKEN SCANNER**: MCP `scan` tool + api-catalog discovery (P6) — machine-readable scanner
- **RUG CHECK**: GoPlus 2026 token_security live on bnb/base + RugCheck summary API on sol (P3); chain matrix in docs
- **WHALE TRACKER**: per-chain threshold heuristics from live native prices + tape-window aggregation + CSV export (P4)
- **State**: atomic identity store with generation-guarded async (P1) — no new state lib (zustand/immer TOLAK: 115-line store already does it, zero dep)
- **Charting**: three 0.185.1 DIAL (P5, lazy, budget-proven) + zero-dep canvas fallback
- **i18n-safe formatting**: `Intl.NumberFormat` compact everywhere (already; TETAP)
- **Motion**: compositor-only rule + frame telemetry (P5)

## Frontier rows per utility module (PROMPT-V2B P8, all checked 2026-08-31)

**SWAP**
| teknologi | sumber (URL) | tanggal | status |
|---|---|---|---|
| View Transitions API — page cross-fade, API-guarded | developer.mozilla.org/docs/Web/API/View_Transitions_API | 2026-08-31 | FRONTIER-ADOPT (Shell) |
| CSS container queries — rail types itself by inline-size | web.dev/docs/css-container-queries (Baseline 2023+) | 2026-08-31 | FRONTIER-ADOPT (.sw-rail) |
| three 0.185.1 DIAL lazy chunk — 130.10 kB gzip ≤ 150 kB budget | npmjs.com/package/three (build evidence this repo) | 2026-08-31 | FRONTIER-ADOPT |
| useSyncExternalStore atomic store + generation guard — zero state lib | react.dev/reference/react/useSyncExternalStore | 2026-08-31 | TETAP (dep-free) |

**DASHBOARD**
| teknologi | sumber (URL) | tanggal | status |
|---|---|---|---|
| oklch --sev-* severity tokens (CSS Color 4, Baseline 2024) | web.dev/articles/hd-gamut (oklch) | 2026-08-31 | FRONTIER-ADOPT |
| Spring counter — dep-free rAF integrator, reduced-motion jump | react.dev/reference/react/useEffect + own lib/spring.ts | 2026-08-31 | FRONTIER-ADOPT |
| One RiskDisplay verdict language across modules (parity-tested) | this repo: components/RiskDisplay.tsx + risk-display.test.tsx | 2026-08-31 | ADOPT |

**TOKEN SCANNER**
| teknologi | sumber (URL) | tanggal | status |
|---|---|---|---|
| Model Context Protocol rev 2026-07-28 — /mcp JSON-RPC 2.0 | modelcontextprotocol.io/specification/latest | 2026-07-28 (rev) / 2026-08-31 (check) | FRONTIER-ADOPT |
| RFC 9727 — /.well-known/api-catalog linkset discovery | rfc-editor.org/rfc/rfc9727.html | 2025-06 (RFC) / 2026-08-31 (check) | FRONTIER-ADOPT |
| DexScreener keyless detect/search across the five chains | docs.dexscreener.com | 2026-08-31 (probed) | TETAP |

**RUG CHECK**
| teknologi | sumber (URL) | tanggal | status |
|---|---|---|---|
| RugCheck report/summary API (sol) — probed 200 @1.03s BONK | api.rugcheck.xyz/v1 | 2026-08-31 (probed) | ADOPT |
| GoPlus token_security (bnb/base) — probed 200 @0.50s CAKE | docs.gopluslabs.com/reference/response-details | 2026-08-31 (probed) | ADOPT |
| Provider × chain coverage matrix, dated + raw probes | docs/rug-coverage-matrix.md (this repo) | 2026-08-31 | ADOPT |

**WHALE TRACKER**
| teknologi | sumber (URL) | tanggal | status |
|---|---|---|---|
| Helius enhanced-transactions tape (sol, key-gated feed) | docs.helius.dev | 2026-08-31 (wiring re-verified) | TETAP |
| USD sizing via DexScreener pair price — null when absent, never fabricated | api.dexscreener.com (keyless) | 2026-08-31 (probed) | TETAP |
| Tape-window aggregation 1h/6h/24h/7d + CSV blob export | developer.mozilla.org/docs/Web/API/URL/createObjectURL | 2026-08-31 | ADOPT |

## MANDATE 0-V3 frontier scan (PROMPT-V3, all rows live-checked 2026-08-31)

Raw probe transcripts: `logs/v3-probe-*.json` + `logs/v3-probe-*.sh` (gitignored).
Method: raw keyless curl first (docs beat memory; when a docs host was unreachable
from the probe environment, that is stated in the row — no blog answers).

**(a) RugCheck (sol)**
| temuan | sumber (URL) | tanggal | status |
|---|---|---|---|
| `/v1/tokens/{mint}/report/summary` hidup, keyless — BONK 200 @0.94s (score_normalised 7, lpLockedPct 23.98, risks[Mutable metadata]) | api.rugcheck.xyz/v1/tokens/{mint}/report/summary | 2026-08-31 (probed) | TETAP — path aktif |
| `/v1/tokens/{mint}/report` hidup juga — BONK 200 @2.83s, rich keys (mintAuthority, freezeAuthority, insiderNetworks, lockers, markets, launchpad) | api.rugcheck.xyz/v1/tokens/{mint}/report | 2026-08-31 (probed) | ADOPT di R1 (field-level mapping, null-safe) |
| Tidak ada path v2 / deprecation header terdeteksi pada probe; swagger UI ada di api.rugcheck.xyz/swagger (spec JSON tidak terekspos: 404 untuk swagger/v1/swagger.json, openapi.json) | api.rugcheck.xyz/swagger/index.html | 2026-08-31 (probed) | TETAP |

**(b) GoPlus token_security (EVM coverage)**
| temuan | sumber (URL) | tanggal | status |
|---|---|---|---|
| Endpoint resmi daftar chain: `/api/v1/supported_chains` → **45 chain**: 1 ETH, **56 BSC**, **8453 Base**, solana, 130 Unichain, 143 Monad, 146 Sonic, 1868 Soneium, **4663 Robinhood**, dll | api.gopluslabs.io/api/v1/supported_chains | 2026-08-31 (probed) | **FRONTIER-ADOPT — Robinhood coverage BARU** |
| `token_security/4663` melayani Robinhood chain (code 1 OK) — konfirmasi live, bukan cuma terdaftar | api.gopluslabs.io/api/v1/token_security/4663 | 2026-08-31 (probed) | ADOPT di R1 (hood = GoPlus) |
| HyperEVM TIDAK dicover: probe chain 999 → `code 2022 "The main chain is not supported"`; 999 absen dari supported_chains | api.gopluslabs.io/api/v1/token_security/999 | 2026-08-31 (probed) | hype tetap honest PARTIAL |
| Free-tier rate limit: tidak terverifikasi (docs.gopluslabs.io SPA, halaman reference 404/block dari env probe) — cache TTL 300s + single-flight tetap jadi pelindung | docs.gopluslabs.io | 2026-08-31 (probed) | TETAP (defensive caching) |

**(c) Birdeye**
| temuan | sumber (URL) | tanggal | status |
|---|---|---|---|
| Keyless probe `public-api.birdeye.so/defi/tokenlist` → **HTTP 401 {"success":false,"message":"Unauthorized"}** — semua endpoint butuh API key; tier gratis pun key-gated | public-api.birdeye.so | 2026-08-31 (probed) | **TOLAK-DENGAN-ALASAN**: zero-key law; whale tape pindah ke GeckoTerminal pool trades (d) |

**(d) GeckoTerminal POOL TRADES — whale feed baru ($0, keyless)**
| temuan | sumber (URL) | tanggal | status |
|---|---|---|---|
| `GET /api/v2/networks/{network}/pools/{pool}/trades` hidup keyless — BONK/SOL Orca pool 200 @1.5s, **300 trades/page**, atribut lengkap: `kind` (buy/sell), `volume_in_usd`, `block_timestamp`, `tx_from_address`, `tx_hash`, `price_to_in_usd` | api.geckoterminal.com/api/v2/networks/solana/pools/{addr}/trades | 2026-08-31 (probed) | **FRONTIER-ADOPT (R2 whale feed)** |
| Pagination `?page=N` terbukti: page=2 → 300 trades lagi, ts lebih baru (tape hidup) | sama + `?page=2` | 2026-08-31 (probed) | ADOPT (backfill window 1h/6h/24h) |
| `GET /api/v1/search/pools?query=` keyless (resolusi CA/nama → pool address per network) | api.geckoterminal.com/api/v1/search/pools | 2026-08-31 (probed) | ADOPT (AUTO mode) |
| `GET /api/v2/networks/{network}/trending_pools` keyless — 20 pools + volume_usd.h24 | api.geckoterminal.com/api/v2/networks/solana/trending_pools | 2026-08-31 (probed) | ADOPT (AUTO top-N) |
| Rate limit: docs apiguide.geckoterminal.com hanya menyebut "Beta, subject to changes" tanpa angka; mitigasi = backoff + cache + N kecil | apiguide.geckoterminal.com | 2026-08-31 (probed) | GUARD di R2 |

**(e) Helius (sol whale tape)**
| temuan | sumber (URL) | tanggal | status |
|---|---|---|---|
| Keyless probe `mainnet.helius-rpc.com` → **HTTP 401 Unauthorized** — selalu key-gated | mainnet.helius-rpc.com | 2026-08-31 (probed) | TETAP (key dari founder .env, hanya sol) |
| Enhanced Transactions API (parse tx + by-address) ada dan aktif di docs; enhanced vs standard: enhanced = parsed instructions (human-readable), standard = raw getSignaturesForAddress | docs.helius.dev/solana-apis/enhanced-transactions-api | 2026-08-31 (doc fetch 200) | TETAP di sol; chain lain = GT tape |

**(f) MONETIZATION STACK — finding: ada/tidaknya fee integrator $0 tanpa perjanjian bisnis**
| provider | mekanisme | sumber (URL) | tanggal | verdict |
|---|---|---|---|---|
| **Jupiter (SOL)** | `platformFeeBps` di /quote (+/swap), dibayar ke fee token account; **probe keyless live**: lite-api.jup.ag/swap/v1/quote menerima feeBps 100/101/5000 dan echo `platformFee:{amount,feeBps}` — tanpa key, tanpa agreement | lite-api.jup.ag/swap/v1/quote (probed) + developers.jup.ag "Add Integrator Fees" | 2026-08-31 (probed) | **SIAP-$0-DI-SINI** (target 50bps ≪ ambang mana pun; docs historis menyebut cap 100bps — angka di atas itu pun diterima quote saat probe, dicatat sebagai temuan live) |
| **Uniswap v4 (base/bnb)** | hook fee (dynamic LP fee via hook `beforeSwap`) + protocol fee via `ProtocolFeeController` milik pool; tidak ada param fee integrator di API publik | developers.uniswap.org/docs/protocols/v4/concepts/dynamic-fees (redirect 303 saat fetch; konsep terkonfirmasi via search index) | 2026-08-31 (checked) | **PERLU-DEPLOY-HOOK** (bukan $0-instant; deploy+audit hook sendiri) |
| **PancakeSwap Infinity (bnb/base)** | hooks + official `dynamic-fee-hook` + admin fee per pool | docs.pancakeswap.finance/trade/pancakeswap-infinity/hooks/dynamic-fee-hook (URL dari search index; host SPA tak bisa di-scrape dari env probe) | 2026-08-31 (checked) | **PERLU-DEPLOY-HOOK** |
| **Aerodrome (base)** | docs host tak terjangkau dari env probe (000); tidak ada API fee integrator keyless yang ditemukan; model veAERO/gauge | aerodrome.finance/docs (unreachable dari env probe) | 2026-08-31 (checked) | **TIDAK-ADA / TBD** (BD) |
| **Hyperliquid / HyperEVM (hype)** | HIP-3 builder-deployed perps (builder fee share) + builder codes; HyperEVM = gas saja, tidak ada skema fee integrator spot | hyperliquid.gitbook.io/hyperliquid-docs (root+builder-tools 200; HIP-3 via search index) | 2026-08-31 (checked) | **PERLU-AGREEMENT-BISNIS** (builder application) |
| **Robinhood Chain (hood, chain id 4663)** | docs.robinhood.com tak terjangkau dari env probe; GoPlus membuktikan chain hidup + id 4663; tidak ada skema fee integrator publik yang ditemukan | docs.robinhood.com/chain (unreachable) + GoPlus supported_chains (probed) | 2026-08-31 (checked) | **TBD** (chain baru; BD) |

**Kesimpulan mandate 0-V3**: satu-satunya skema fee integrator $0 yang terverifikasi
hidup tanpa key dan tanpa perjanjian bisnis hari ini = **Jupiter platformFeeBps (SOL)**.
Chain lain = deploy hook sendiri (Uni v4 / Pancake Infinity) atau BD (Aerodrome, Hyperliquid,
Robinhood). Implikasi R4: estimator 0.30/0.10/0.10 dihitung read-only; status chip per chain
diambil dari matriks ini (LIVE-READY=SOL, BD/DEPLOY=sisanya).

## MANDATE 0-V4 frontier scan (PROMPT-V4, semua baris live-checked 2026-08-31)

**(a) WALLET STANDARD — teknologi connect 2026 (bukan window.solana 2021)**
| temuan | sumber (URL) | tanggal | status |
|---|---|---|---|
| EIP-6963 (Multi Injected Provider Discovery) = **Final**, Standards Track: Interface. Mekanik: dapp mendengar `eip6963:announceProvider` + dispatch `eip6963:requestProvider`; wallet announce `EIP6963ProviderDetail` = `EIP6963ProviderInfo` {uuid,name,icon,rdns} + provider EIP-1193; rdns = reverse-DNS milik provider; objek dibekukan (frozen) | eips.ethereum.org/EIPS/eip-6963 | 2026-08-31 (doc fetch) | **FRONTIER-ADOPT (M2)** — discovery murni event API, zero dep |
| Solana **Wallet Standard** = satu set interface+konvensi lintas chain; struktur paket `packages/core/base · /wallet · /app`; app-side `getWallets`, wallet-side `registerWallet`, global window events; repo aktif (75 releases, created 2022-07-25, topic "solana") | github.com/wallet-standard/wallet-standard | 2026-08-31 (doc fetch) | **FRONTIER-ADOPT (M2)** |
| `@wallet-standard/base` **1.1.1** — dependencies `{}` (zero dep), published **2026-06-03**; `@wallet-standard/app` **1.1.1** — satu dep saja (`@wallet-standard/base ^1.1.1`), published 2026-06-03. Verifikasi via registry JSON resmi, bukan npmjs web | registry.npmjs.org/@wallet-standard%2fbase + %2fapp (probed) | 2026-08-31 (probed) | **ADOPT-opsi**: M2 tetap coba zero-dep hand-rolled dulu; dua paket ini = fallback resmi bila perlu (bukan lock-in) |
| Phantom docs: mendukung Wallet Standard; legacy `window.solana` injection digantikan standar event — rekomendasi "latest release" adapter | docs.phantom.com/developer-powertools/wallet-standard | 2026-08-31 (doc fetch) | KONFIRMASI — window.solana = teknologi lama, jangan hardcode |

**(b) AGENT-NATIVE**
| temuan | sumber (URL) | tanggal | status |
|---|---|---|---|
| MCP rev **2026-07-28 = CURRENT** ("current protocol version is 2026-07-28"). Isi revisi: stateless protocol core (tanpa session setup, tiap request mandiri), Multi Round-Trip Requests (MRTR), Roots/Sampling/Logging **deprecated** (didukung ≥12 bulan), OAuth diperkuat (issuer check, DCR dipensiunkan), list results cacheable | modelcontextprotocol.io/docs/2026-07-28/learn/versioning + blog.modelcontextprotocol.io/posts/2026-07-28 | 2026-08-31 (doc fetch) | **TETAP + kompatibel**: /mcp kita sudah stateless single-POST JSON-RPC 2.0 — pas dengan arah spec baru |
| **x402** (HTTP-402 agentic payments): production-ready, open-source, audited, zero protocol fee, "x402 Foundation"; metrik 30-hari per 2026-08-25: **75.41M transaksi · $24.24M volume · 94.06K buyers · 22K sellers**; blockchain-agnostic (EVM + Solana), stablecoin settlement | x402.org | 2026-08-31 (doc fetch) | **PARKIR-SEBAGAI-DESIGN-NOTE**: applicable utk API-tier berbayar NANTI; tidak diimplementasi sekarang (read-only v1 + zero-payment law) |
| **llms.txt v2**: proposal Jeremy Howard (2024-09-03), revisi v2 modified **2026-08-10**; H1 wajib satu-satunya seksi wajib; ribuan situs publish, AI labs publik file serupa | llmstxt.org | 2026-08-31 (doc fetch) | **TETAP**: llms.txt kita (P6/V3) sudah sesuai bentuk v2; rawat terus |
| RFC 9727 `.well-known/api-catalog` — sudah shipped P6 | (internal P6) | 2026-08-31 | TETAP |

**(c) MONETIZATION — recheck 2026 (jangan ingat, cek ulang)**
| temuan | sumber (URL) | tanggal | status |
|---|---|---|---|
| **Token-2022 TransferFee** (Solana): `TransferFeeConfig` di mint → fee dipotong saat transfer, withheld di akun tujuan, bisa di-withdraw per akun atau di-harvest ke mint lalu dipindah `withdraw_withheld_authority` ke fee receiver; `TransferCheckedWithFee` memverifikasi fee | solana.com/docs/tokens/extensions/transfer-fees (doc fetch 200) | 2026-08-31 (doc fetch) | **PARKIR-UNTUK-V3**: ini fee atas transfer token sendiri — VILMEI tidak mint token hari ini (VM-token-00 hold); relevan NANTI bila VM token lahir (juga: Jupiter feeAccount mendukung terima fee dalam token T22) |
| **Jupiter platformFeeBps — RECHECK** (docs pindah ke developers.jup.ag/docs/swap/v1/add-fees-to-swap): `platformFeeBps` di /quote (contoh docs 20 bps = 0.2% input/output), `feeAccount` = "any valid token account for the swap pair mint" (harus initialized); ExactIn = input/output mint, ExactOut = input mint only; **TIDAK ada cap yang ditulis di halaman terkini**; sejak Jan 2025 Referral Program tidak wajib utk Metis Swap API; **baru: support Token2022 fee collection via `instructionVersion=V2` (changelog Oct 2025)** | developers.jup.ag/docs/swap/v1/add-fees-to-swap | 2026-08-31 (doc fetch) | **SIAP-$0 KOKOH** — tidak ada revisi cap yang merugikan; verdict R4 bertahan |
| **Uniswap v4 hooks — direktori publik v4hooks.com** (updated **2026-08-27**): 51 listing = 43 patterns + **8 products production**: **Flaunch** (afterSwap distributes creator fees), **Clanker** (dynamic-fee launch + protocol delta), **Zora Coin Hook** (launch fee decay + fee swap + reward distribution), Doppler, DualPool, EulerSwap, Permissioned Pools, Super DCA. Pattern **FeeRouter**: "afterSwap skims protocolBps of output to an immutable treasury address" (MIT, experimental). Disclaimer situs: "Listing is not an audit" | v4hooks.com (probed, HTML 200) | 2026-08-31 (probed) | **UPGRADE TERUKUR**: TIDAK-ADA → **PERLU-DEPLOY-HOOK (pattern tersedia MIT + preseden production)** = FRONTIER-ADOPT candidate utk VM-fee-03. Tetap jujur: tidak ada API fee-integrator keyless instan; pool harus lahir dengan hook-nya |

**(d) DATA $0 UNTUK HOLDINGS — probe langsung (key founder dari .env; nilai key tidak pernah dicetak)**
| temuan | sumber (URL) | tanggal | status |
|---|---|---|---|
| **Helius free tier (key founder) LIVE**: standard RPC `getBalance` BONK mint → 200 (value 1089583620238 lamports, slot 443116536, apiVersion 4.3.0-alpha.2) + DAS `getAsset` → 200 (interface FungibleToken, Metaplex schema, json_uri arweave) | mainnet.helius-rpc.com (probed via .env key) | 2026-08-31 (probed) | **ADOPT (M5-SOL)**: getBalance + getAssetsByOwner (DAS) + price join GT |
| **Alchemy free tier (key founder) LIVE di 2 chain**: `eth_getBalance` BASE (WETH contract) → 200 + BNB (CAKE contract) → 200 + `alchemy_getTokenBalances` BASE → 200 (tokenBalances[]). Pricing free resmi: **30M CU/bulan · 500 CU/s · "All mainnets & testnets"** termasuk Base + BNB Smart Chain + Solana | base-mainnet/bnb-mainnet.g.alchemy.com (probed) + alchemy.com/pricing | 2026-08-31 (probed + doc fetch) | **ADOPT (M5-EVM base+bnb)** — satu key, dua chain, token balances built-in |
| **Blockscout public (keyless)**: `base.blockscout.com/api/v2` LIVE 200 (indexing-status; slow ~12s dari env ini → wajib cache); **BSC tidak punya instance keyless**: `bsc.blockscout.com` → 404 "default backend", `explorer.bnbchain.org/api/v2` → 404 (backend Spring, bukan Blockscout) | base.blockscout.com + bsc.blockscout.com + explorer.bnbchain.org (probed) | 2026-08-31 (probed) | base = **ADOPT-sekunder** (cross-check keyless); bnb = TOLAK via Blockscout → Alchemy |
| **Etherscan V2 multichain (key founder)**: `api.etherscan.io/v2/api?chainid=56&8453` → 200 tapi `status 0 NOTOK: "Free API access is not supported for this chain"` — free plan = ETH mainnet saja; multichain = paid plan | api.etherscan.io/v2 (probed) | 2026-08-31 (probed) | **TOLAK-DENGAN-ALASAN** utk non-ETH (bayar); key founder tetap berharga utk ETH bila dibutuhkan nanti |
| **.env baris 2 rusak** (`=` kosong tanpa nama) → `source .env` gagal load key apapun; parser M3 wajib skip baris rusak | .env (inspected, nilai masked) | 2026-08-31 | **M3 FIX**: parser tolerant + scripts/dev-server.sh |

**(e) RWA / "WEB4" — feed $0 resmi**
| temuan | sumber (URL) | tanggal | status |
|---|---|---|---|
| **Token Terminal**: Free $0 = core data via UI + 3 dashboards + Sheets/Excel plugin + **akses MCP** + CSV export; **REST API hanya di tier "API" custom pricing** (berbayar) | tokenterminal.com/pricing (probed HTML 200) | 2026-08-31 (probed) | **PARKIR-DENGAN-ALASAN**: tidak ada REST $0 utk proxy server; MCP pihak-ketiga = policy issue; data bukan token-level memecoin |
| **RWA.xyz**: app.rwa.xyz/pricing → **403 dari env probe** (Cloudflare) — tidak bisa diverifikasi ada/tidaknya tier $0 | app.rwa.xyz/pricing (unreachable, 403) | 2026-08-31 (probed) | **PARKIR-DENGAN-ALASAN**: unverifiable dari environment; jargon tanpa data = dihindari |
| **Dune API**: credit-based; **Queries endpoint hanya Plus/Enterprise**; free tier = export credits kecil (20 MB) + storage 100 MB | docs.dune.com/api-reference/overview/billing | 2026-08-31 (doc fetch) | **PARKIR-DENGAN-ALASAN**: API = paid; bukan $0 hari ini |

**Ringkasan keputusan → M2 / M3 / M5:**
- **M2 (wallet connect)**: EIP-6963 (Final) + Solana Wallet Standard via **hand-rolled zero-dep**
  (event API murni); paket `@wallet-standard/*` 1.1.1 (zero/transitive-dep, 2026-06-03)
  dicatat sebagai fallback resmi bila hand-rolled terbukti rapuh di test — keputusan tambah
  dep = STOP + lapor founder dulu. Tidak ada signing/execution; address-only.
- **M3 (vault)**: venue intake per chain mengikuti matriks V3 yang diperkuat hari ini —
  sol = Jupiter `feeAccount` SIAP-$0 (T22-ready via V2); EVM = perlu deploy hook
  (FeeRouter MIT pattern + 8 product production = bukti frontier, bukan lagi "blank");
  hype/hood = TBD. Split 3 alamat (ops/buyback/rewards) = ledger off-chain + manual/claim.
- **M5 (holdings)**: sol = Helius (key founder, RPC+DAS probed live); base+bnb = Alchemy
  (key founder, probed live) + Blockscout base keyless sebagai sekunder; hype/hood =
  PARTIAL dengan kalimat alasan verbatim (tidak ada sumber $0 publik terverifikasi);
  Etherscan free = ETH-only. Semua angka probe di atas berasal dari data, bukan ingatan.
