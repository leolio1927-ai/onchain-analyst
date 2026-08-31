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
| P3/P4 FE | DONE | pending | tsc 0 · vitest 32/32 · rug chips AUTO·SOL·BNB·BASE·HYPE·HOOD + honest hype/hood panel (never red) · whale AUTO 5-chain merged tape + chain chips + CSV + seeding |
