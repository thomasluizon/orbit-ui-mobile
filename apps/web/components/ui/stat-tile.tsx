interface StatTileProps {
  emoji: string
  value: string | number
  label: string
  className?: string
}

/** Kit stat tile: emoji over an Inter numeral and a muted Rubik label. */
export function StatTile({ emoji, value, label, className }: Readonly<StatTileProps>) {
  return (
    <div
      className={[
        'flex flex-1 flex-col items-center gap-[6px] rounded-[18px] bg-[var(--bg-field)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ padding: '18px 12px 16px', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
    >
      <span style={{ fontSize: 28, lineHeight: 1 }} aria-hidden="true">
        {emoji}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 24,
          fontWeight: 700,
          color: 'var(--fg-1)',
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </span>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--fg-2)' }}>
        {label}
      </span>
    </div>
  )
}
