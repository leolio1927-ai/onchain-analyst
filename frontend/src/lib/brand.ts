/* BRAND — single source of truth for every brand string on the site.
   Rename = edit this one file + re-probe; no scatter across pages or meta.
   (Adoption note: landing consumes it today; docs/roadmap/meta follow.) */

export const BRAND_NAME = 'TERMINAL ALPHA'
export const BRAND_SHORT = 'Terminal Alpha'

/* the posture line — one sentence, everywhere the same */
export const BRAND_POSTURE =
  'READ-ONLY RESEARCH INFRASTRUCTURE · NO TRADING · NO CUSTODY · EVIDENCE FIRST'

/* footer fine print — ONE sentence, posture said once (L2 FIX 1) */
export const BRAND_LEGAL =
  '© 2026 TERMINAL ALPHA — READ-ONLY RESEARCH INFRASTRUCTURE · NO TRADING · NO CUSTODY · EVIDENCE FIRST · DATA: GECKOTERMINAL + DEXSCREENER'

/* data attribution — the only two upstreams wired to the live plane */
export const BRAND_DATA = 'DATA: GECKOTERMINAL + DEXSCREENER'

/* the founder-locked five chains — mirrors lib/liveApi.ts LIVE_CHAINS order (avax parked 2026-08-30) */
export const BRAND_CHAINS = ['SOL', 'BNB', 'BASE', 'HYPE', 'HOOD'] as const
