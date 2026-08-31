# PREMIUM-BAR — the $100B visual contract (PROMPT-V3 R3, codified 2026-08-31)

Founder standard: **yang jualan, bukan yang asal rapi** — every screen must read
like a product someone pays for, not a form. The rules below were EXTRACTED
from the swap page V2 (`pages/TokenPage.tsx` + `styles/swap.css`, the surface
that already passes) and are now the bar for every other page. The swap page
itself is frozen — this pass applies to **Token Scanner, Dashboard, Rug Check,
Whale Tracker** only.

## The ten rules

**PB-1 · Content fills the column.** Grids use `minmax(0,1fr)` tracks with gaps
≤ 16px; cards stretch; no orphan whitespace block > ~120px. If a column has
room, a card, a matrix or an example grid occupies it — empty pixels are a bug.

**PB-2 · Empty state = styled content.** An empty surface is never a gaping
blank: it renders a card with copy + a 3-grid of REAL example CAs the founder
can click (probed live addresses, labeled). Pattern: rug page `.v2-empty` +
`EXAMPLES`; scanner/dashboard inherit the same pattern.

**PB-3 · The 3D medallion is the hero of result pages.** Every resolved
verdict renders through `RiskDisplay` — the dial (three.js torus, lazy
130 kB-gzip chunk; canvas-2D fallback under reduced-motion / no-WebGL) is the
visual anchor of the result card, number always visible on top.

**PB-4 · Skeleton shimmer per block while loading.** Loading = `.ta-skel`
shimmer blocks shaped like the coming content (already in `components/ui.tsx`
`<Skeleton/>`). A bare "…" or "loading" text as the only loading state is a
violation. Chips may still carry LOADING/SEEDING labels as status language.

**PB-5 · Hover = 200 ms border chain-accent + glow.** Interactive cards and
rows transition `border-color`/`box-shadow` in ~0.2s into the chain accent
(`--chain-accent` from `accentStyle(chain)`, founder hexes in
`pages/liveParts.tsx`), never an unrelated color. `.ta-card` tilt (rotateX/
rotateY + glow) is the reference implementation.

**PB-6 · All numbers are tabular-nums.** Every numeric surface sits on the
mono stack with `font-variant-numeric: tabular-nums` so columns of figures
never jitter (scanner table, whale windows, metrics).

**PB-7 · Motion = transform/opacity only, view-transition between pages.**
Compositor-only animation (P5 law). Page cross-fade via the View Transitions
API in `layout/Shell.tsx` (API-guarded; unsupported browsers get the instant
swap). `risk-display.css` ships ZERO `@keyframes` (gated by test).

**PB-8 · prefers-reduced-motion keeps every fact.** Under reduced motion:
shimmer and dial animation stop, but every number, chip and verdict still
renders (2D fallback dial). Accessibility never costs the verdict — gated by
`components/risk-display.test.tsx` and `pages/PremiumBar.test.tsx`.

**PB-9 · One severity color source.** `--sev-low/medium/high/nodata` (oklch,
declared exactly once in `risk-display.css`) are THE color language for every
risk artifact: verdict, badge, 8-bin tape, scanner sev-sparkline and the
3D mini-badge. Any new severity visual must consume the SAME `data-bin` /
`data-level` selectors — parity is tested, never a second ramp.

**PB-10 · Honesty is a visual style.** Dashed border = declared/absent,
SEEDING/PARTIAL/NO COVERAGE chips = status not error, empty ≠ red, a dash is
the honest value. The premium bar sells trust; a fabricated number is the only
unrecoverable visual bug.

## Scanner row contract (founder's "variasi")

Every scanner result row renders, in one line:
1. **sev 8-bin sparkline** — the RiskDisplay tape quantizer (`sevBin`) as a
   micro histogram of the engine's signal severities; bars ARE `.rd-bin`
   elements so color parity with the tape is by construction. Rows the engine
   has not run render 8 dashed outline bins ("no engine run yet") — never a
   fabricated profile.
2. **chain chip** — mono uppercase chip, border/glow from the founder chain
   accent hex (PB-5 map), replacing the bare colored dot.
3. **3D mini-badge** — CSS-3D tilted coin (`perspective + rotateX`, static —
   one WebGL context per row would blow the budget; the medallion keeps three
   for the result hero), colored by `--sev-*` per level low/medium/high/nodata.
   The numeric risk badge stays beside it (parity: same threshold mapping).

## Gates

- `frontend/src/pages/PremiumBar.test.tsx` — sparkline parity (`.rd-bin`
  source), mini-badge level selectors, skeleton-while-loading, styled empty
  state, reduced-motion contract.
- Existing parity tests must stay green: `risk-display.test.tsx` (single
  `--sev-*` source, zero keyframes, reduced-motion dial), `RugCheckPage` R1
  gate, `WhalePage` R2 gate.
- Budget: dial3d chunk ≤ 150 kB gzip (mini-badge is pure CSS — zero JS 3D
  cost in table rows).
