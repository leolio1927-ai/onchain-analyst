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
