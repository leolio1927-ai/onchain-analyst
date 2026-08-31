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
