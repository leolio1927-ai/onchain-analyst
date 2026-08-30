/* Hand-crafted inline SVG chain marks (W.1) — no hotlinks, no deps, no
   remote assets. Simplified marks only, honestly labeled "(simplified
   mark)". Tile colors are the founder-mandated accents; SOL carries the
   #9945FF→#14F195 brand-gradient exception inside its own tile. */
import { useId } from 'react'
import type { LiveChain } from '../lib/liveApi'

interface MarkProps {
  size: number
}

function SolMark({ size }: MarkProps) {
  const gid = useId()
  return (
    <svg className="lx-chainlogo" width={size} height={size} viewBox="0 0 64 64" role="img"
      aria-label="Solana (simplified mark)">
      <defs>
        <linearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#9945FF" />
          <stop offset="1" stopColor="#14F195" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="14" fill={`url(#${gid})`} />
      <g fill="#071410" opacity=".82" transform="skewX(-14)">
        <rect x="23.5" y="18" width="26" height="7.5" rx="2.5" />
        <rect x="26.1" y="28.5" width="26" height="7.5" rx="2.5" />
        <rect x="28.7" y="39" width="26" height="7.5" rx="2.5" />
      </g>
    </svg>
  )
}

function BnbMark({ size }: MarkProps) {
  return (
    <svg className="lx-chainlogo" width={size} height={size} viewBox="0 0 64 64" role="img"
      aria-label="BNB Chain (simplified mark)">
      <rect x="1" y="1" width="62" height="62" rx="14" fill="#F0B90B" />
      <g fill="#fff">
        <rect x="26.5" y="26.5" width="11" height="11" rx="1.5" transform="rotate(45 32 32)" />
        <rect x="28.4" y="15.4" width="7.2" height="7.2" rx="1.2" transform="rotate(45 32 19)" />
        <rect x="28.4" y="41.4" width="7.2" height="7.2" rx="1.2" transform="rotate(45 32 45)" />
        <rect x="15.4" y="28.4" width="7.2" height="7.2" rx="1.2" transform="rotate(45 19 32)" />
        <rect x="41.4" y="28.4" width="7.2" height="7.2" rx="1.2" transform="rotate(45 45 32)" />
      </g>
    </svg>
  )
}

function BaseMark({ size }: MarkProps) {
  return (
    <svg className="lx-chainlogo" width={size} height={size} viewBox="0 0 64 64" role="img"
      aria-label="Base (simplified mark)">
      <rect x="1" y="1" width="62" height="62" rx="14" fill="#0052FF" />
      <circle cx="31" cy="32" r="15.5" fill="#fff" />
      <rect x="31" y="29.2" width="22" height="5.6" fill="#0052FF" />
    </svg>
  )
}

function HypeMark({ size }: MarkProps) {
  return (
    <svg className="lx-chainlogo" width={size} height={size} viewBox="0 0 64 64" role="img"
      aria-label="HyperEVM (simplified mark)">
      <rect x="1" y="1" width="62" height="62" rx="14" fill="#2DD4BF" />
      <circle cx="32" cy="32" r="13.5" fill="none" stroke="#fff" strokeWidth="5.5" />
      <circle cx="32" cy="32" r="4.6" fill="#fff" />
    </svg>
  )
}

function HoodMark({ size }: MarkProps) {
  return (
    <svg className="lx-chainlogo" width={size} height={size} viewBox="0 0 64 64" role="img"
      aria-label="Robinhood Chain (simplified mark)">
      <rect x="1" y="1" width="62" height="62" rx="14" fill="#00C805" />
      <path d="M45 13 C30 15.5 20.5 27 19.5 44 L25 44 C26.5 31 33.5 20.5 45 13 Z" fill="#fff" />
      <path d="M22 42 C27.5 30.5 35 22 44 15.5" fill="none" stroke="#fff" strokeWidth="2.4"
        strokeLinecap="round" />
      <rect x="21.4" y="44" width="2.8" height="8" rx="1.4" fill="#fff" />
    </svg>
  )
}

/* avax mark parked 2026-08-30 (founder: 5-chain lineup) — removed from the
   active surface with the parking; git history (86be5e4) keeps the SVG
   verbatim for a re-enable. */
const MARKS: Record<LiveChain, (p: MarkProps) => ReturnType<typeof SolMark>> = {
  sol: SolMark,
  bnb: BnbMark,
  base: BaseMark,
  hype: HypeMark,
  hood: HoodMark,
}

/* Chain logo mark, sized per context: board cards ≈56px, chain header ≈64px. */
export function ChainLogo({ chain, size }: { chain: LiveChain; size: number }) {
  const Mark = MARKS[chain]
  return <Mark size={size} />
}
