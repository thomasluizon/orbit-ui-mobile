import type { CSSProperties } from 'react'

interface StatTileProps {
  emoji: string
  value: string | number
  label: string
  /** Render the value as a compact phrase (dates, states) instead of a display numeral. */
  phraseValue?: boolean
  className?: string
}

const numeralValueStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 24,
  fontWeight: 700,
  color: 'var(--fg-1)',
  letterSpacing: '-0.01em',
  fontVariantNumeric: 'tabular-nums',
}

const phraseValueStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 15,
  fontWeight: 600,
  lineHeight: '20px',
  color: 'var(--fg-1)',
  textAlign: 'center',
  minHeight: 29,
  display: 'inline-flex',
  alignItems: 'center',
}

/** Kit stat tile: emoji over an Inter numeral (or compact phrase) and a muted Rubik label. */
export function StatTile({
  emoji,
  value,
  label,
  phraseValue = false,
  className,
}: Readonly<StatTileProps>) {
  return (
    <div
      className={[
        'flex flex-1 flex-col items-center gap-2 rounded-[18px] bg-[var(--bg-card)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ padding: '20px 12px 16px', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
    >
      <span style={{ fontSize: 28, lineHeight: 1 }} aria-hidden="true">
        {emoji}
      </span>
      <span style={phraseValue ? phraseValueStyle : numeralValueStyle}>{value}</span>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--fg-2)' }}>
        {label}
      </span>
    </div>
  )
}
