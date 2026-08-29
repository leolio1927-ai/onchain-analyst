/* Formatting for live-feed values. Everything renders returned data only —
   absent → "–" (never 0, never invented). Compact USD, significant-digit
   prices, short ages, all tuned for tabular-nums density. */

const DASH = '–'

function num(v: string | number | null): number | null {
  if (v === null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/* $43.9K · $1.24M · $1.2B · $312.4 */
export function fmtUsdCompact(v: string | number | null): string {
  const n = num(v)
  if (n === null) return DASH
  const a = Math.abs(n)
  const s = n < 0 ? '-' : ''
  if (a >= 1e9) return `${s}$${(a / 1e9).toPrecision(3)}B`
  if (a >= 1e6) return `${s}$${(a / 1e6).toPrecision(3)}M`
  if (a >= 1e3) return `${s}$${(a / 1e3).toPrecision(3)}K`
  return `${s}$${a.toPrecision(3)}`
}

/* Significant digits: $1,043.20 · $0.0312 · $0.000002906 */
export function fmtPrice(v: string | null): string {
  const n = num(v)
  if (n === null) return DASH
  if (n === 0) return '$0'
  if (n >= 1) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (n >= 0.01) return `$${n.toFixed(4).replace(/0+$/, '')}`
  return `$${n.toPrecision(4).replace(/0+$/, '').replace(/\.$/, '')}`
}

/* +12.4% · −3.1% · +0.0% — always signed (real minus glyph U+2212); zero
   reads positive so an actual change value is never rendered neutral.
   Absent → "–". */
export function fmtPct(v: string | number | null): string {
  const n = num(v)
  if (n === null) return DASH
  return `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(1)}%`
}

/* "2m" · "5h" · "3d" — floor of elapsed time since created_at. */
export function fmtAge(iso: string | null, now: Date = new Date()): string {
  if (!iso) return DASH
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return DASH
  const s = Math.max(0, Math.floor((now.getTime() - t) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

/* "12.4K" · "3.2M" — plain counts (txns). */
export function fmtCount(v: number | string | null): string {
  const n = num(v)
  if (n === null) return DASH
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toPrecision(3)}M`
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toPrecision(3)}K`
  return `${Math.round(n)}`
}

/* 0x12…789a · 3dcw…Mnpj — first 4 + last 4. */
export function truncAddr(a: string | null): string {
  if (!a) return DASH
  return a.length <= 10 ? a : `${a.slice(0, 4)}…${a.slice(-4)}`
}

/* "12:03:44 UTC" from an ISO timestamp. */
export function fmtUtcClock(iso: string | null): string {
  if (!iso) return DASH
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return DASH
  return `${d.toISOString().slice(11, 19)} UTC`
}
