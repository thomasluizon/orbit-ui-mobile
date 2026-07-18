import type { CSSProperties } from 'react'

interface StatTileProps {
  emoji: string
  value: string | number
  label: string
  /** Render the value as a compact phrase (dates, states) instead of a display numeral. */
  phraseValue?: boolean
  className?: string
}

const singleLineValueStyle: CSSProperties = {
  display: 'block',
  maxWidth: '100%',
  minWidth: 0,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  textAlign: 'center',
  color: 'var(--fg-1)',
}

const numeralValueStyle: CSSProperties = {
  ...singleLineValueStyle,
  fontFamily: 'var(--font-display)',
  fontSize: 24,
  fontWeight: 700,
  lineHeight: '29px',
  letterSpacing: '-0.01em',
  fontVariantNumeric: 'tabular-nums',
}

const phraseValueStyle: CSSProperties = {
  ...singleLineValueStyle,
  fontFamily: 'var(--font-sans)',
  fontSize: 15,
  fontWeight: 600,
  lineHeight: '29px',
}

const labelStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 15,
  lineHeight: '20px',
  color: 'var(--fg-2)',
  textAlign: 'center',
  textWrap: 'balance',
  overflowWrap: 'anywhere',
  width: '100%',
  minWidth: 0,
  minHeight: 40,
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
}

/**
 * Kit stat tile: emoji over a single-line Inter numeral (or compact phrase) and a muted Rubik
 * label clamped to two lines inside a fixed 40px reservation, so side-by-side tiles keep a
 * shared baseline when a longer pt-BR label wraps.
 */
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
        'flex min-w-0 flex-1 flex-col items-center gap-2 rounded-[18px] bg-[var(--bg-card)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ padding: '20px 12px 16px', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
    >
      <span style={{ fontSize: 28, lineHeight: 1 }} aria-hidden="true">
        {emoji}
      </span>
      <span style={phraseValue ? phraseValueStyle : numeralValueStyle} title={String(value)}>
        {value}
      </span>
      <span style={labelStyle} title={label}>
        {label}
      </span>
    </div>
  )
}
