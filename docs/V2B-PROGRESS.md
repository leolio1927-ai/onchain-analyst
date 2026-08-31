# V2B-PROGRESS — resume ledger (PROMPT-V2B)

One line per phase. Source of truth for resume: `phase | status | commit sha | gate evidence`.

| phase | status | commit | gate evidence |
|---|---|---|---|
| P0 audit | DONE | (this file) | node v24.20.0 · tsc ✗ 9 errors · vitest 32/32 ✓ · build ✗ (tsc-blocked) · pytest 216✓/1✗ (openapi snapshot drift from P3 routes) |
| mandate-0 | DONE | 2ce2b86 | docs/TECH-DECISIONS.md — 20 rows live-checked 2026-08-31 (npm/PyPI/spec sites) |
| deps | DONE | 3296ea8 | three 0.185.1 + @types/node + @types/three, oxlint 1.80, tsconfig types+=node |
| P1 identity | DONE | ff0dfec | tsc 0 · vitest: identity-race (two rapid switches → ONE identity, zero mixed-CA) + shorten law + race 32/32 |
| P2 overlay | DONE | pending | gate: overlay-gate.test.ts (alpha ≥.97 on .ta-search-drop/.ta-wallet-menu/.ta-modal-veil, z-tokens, border+shadow) |
