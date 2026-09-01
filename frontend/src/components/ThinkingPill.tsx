/* PROMPT-W B1 — the THINKING pill: a tiny brain (outline, stroked with the
   6-chain band gradient) blinks at 1 Hz beside "THINKING" + working dots.
   Rendered while the first upstream token is pending; the caller removes it
   the moment the first delta lands. Pure DNA: colors derive from tokens.css
   (--emb-*), no vendor vocabulary, no sound. */

export function ThinkingPill({ label = 'THINKING' }: { label?: string }) {
  return (
    <span className="think-pill" role="status" aria-live="polite" data-testid="thinking-pill">
      <svg className="think-brain" viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id="think-band" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#14F195" />
            <stop offset="20%" stopColor="#F0B90B" />
            <stop offset="40%" stopColor="#4D8DFF" />
            <stop offset="60%" stopColor="#2DD4BF" />
            <stop offset="80%" stopColor="#00C805" />
            <stop offset="100%" stopColor="#E84142" />
          </linearGradient>
        </defs>
        {/* brain outline — two hemispheres + folds, single 1.6 stroke */}
        <g fill="none" stroke="url(#think-band)" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.5 3.5a2.8 2.8 0 0 0-2.8 2.8c-1.6.4-2.7 1.8-2.7 3.4 0 .8.3 1.6.8 2.2A3.6 3.6 0 0 0 4 14.6c0 1.7 1.2 3.1 2.8 3.5a2.9 2.9 0 0 0 5.7-.6V6.3a2.8 2.8 0 0 0-3-2.8z" />
          <path d="M14.5 3.5a2.8 2.8 0 0 1 2.8 2.8c1.6.4 2.7 1.8 2.7 3.4 0 .8-.3 1.6-.8 2.2a3.6 3.6 0 0 1 .8 2.7c0 1.7-1.2 3.1-2.8 3.5a2.9 2.9 0 0 1-5.7-.6V6.3a2.8 2.8 0 0 1 3-2.8z" />
          <path d="M9.2 7.2c.9.3 1.5 1 1.5 2M9.2 11.6c.9.3 1.5 1 1.5 2M14.8 7.2c-.9.3-1.5 1-1.5 2M14.8 11.6c-.9.3-1.5 1-1.5 2" opacity=".85" />
        </g>
      </svg>
      <b>{label}</b>
      <span className="think-dots" aria-hidden="true"><i /><i /><i /></span>
    </span>
  )
}
