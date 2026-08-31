# V2B-PROGRESS — resume ledger (PROMPT-V2B)

One line per phase. Source of truth for resume: `phase | status | commit sha | gate evidence`.

| phase | status | commit | gate evidence |
|---|---|---|---|
| P0 audit | DONE | (this file) | node v24.20.0 · tsc ✗ 9 errors · vitest 32/32 ✓ · build ✗ (tsc-blocked) · pytest 216✓/1✗ (openapi snapshot drift from P3 routes) |
| mandate-0 | DONE | 2ce2b86 | docs/TECH-DECISIONS.md — 20 rows live-checked 2026-08-31 (npm/PyPI/spec sites) |
| deps | DONE | 3296ea8 | three 0.185.1 + @types/node + @types/three, oxlint 1.80, tsconfig types+=node |
| P1 identity | DONE | ff0dfec | tsc 0 · vitest: identity-race (two rapid switches → ONE identity, zero mixed-CA) + shorten law + race 32/32 |
| P2 overlay | DONE | 12dcadd | gate: overlay-gate.test.ts (alpha ≥.97 on .ta-search-drop/.ta-wallet-menu/.ta-modal-veil, z-tokens, border+shadow) · magic z-index = 0 left in app.css |
| P3 rug BE | DONE | a8e032f | pytest tests/test_rug_surface.py 6/6 · probes 2026-08-31: RugCheck BONK 200@1.03s, GoPlus CAKE 200@0.50s (raw in logs/) · docs/rug-coverage-matrix.md dated |
| P3/P4 FE | DONE | 09be7b8 | tsc 0 · vitest 32/32 · rug chips AUTO·SOL·BNB·BASE·HYPE·HOOD + honest hype/hood panel (never red) · whale AUTO 5-chain merged tape + chain chips + CSV + seeding |
| P5 signal | DONE | bd4a292 | vitest 37/37 (reduced-motion still-renders+number, --sev-* parity CSS-hue===SEV_RAMP, mode persists vilmei.risk-mode, compositor law, bins monotonic) · BUILD: dial3d lazy chunk 519.91 kB min / **130.10 kB gzip ≤ 150 kB** · ViewTransitions + spring counter + container-query rail + text-wrap:balance |
| P6 machine | DONE | b166cf5 | pytest tests/test_mcp.py 10/10 · curl live (tmp port 8123): POST /mcp tools/list 200 + initialize protocolVersion 2026-07-28 200 · GET /.well-known/api-catalog 200 application/linkset+json (RFC 9727) · llms.txt §For AI agents + DocsPage §16 VILMEI FOR AGENTS |
| P7 brand | DONE | 78bcfb7 | vitest 42/42 · grep 'Terminal Alpha' frontend/src+*.html = 0 (kecuali DocsPage §12 changelog rename line) · grep vilmei.com = 0 · ledger VM-xx display + #ta-xx anchor + #vm-xx alias (RoadmapPage.test) · migration-once alpha.*→vilmei.* preserve+remove (prefs.test 4/4) · OpenAPI info.title VILMEI |
| openapi snapshot | DONE | 98ec3e5 | pytest test_contracts snapshot gate green — snapshot regenerated after P3+P6 routes + P7 title; llms.txt §Live API gains rug routes in the same change |
| P8 gates | DONE | pending | node v24.20.0 · tsc 0 · vitest 12 files/42 tests ✓ · build ✓ (dial3d 130.10 kB gzip ≤ 150 kB) · oxlint 19 warnings/0 errors (per-line triage in report; 7 new-code justified, 12 pre-existing patterns newly flagged by oxlint 1.80 react-compiler rules) · ruff All checks passed · pytest 227/227 + 1 snapshot · identity-race ✓ · overlay alpha ✓ · curl /mcp+.well-known ✓ · brand-sweep grep ✓ · ledger updated per phase |
