'use client'

interface GoalStatusBadgeProps {
  text: string
  color: string
}

/** Specialized status/deadline chip: semantic status-token text color and compact
 *  card padding prevent direct use of neutral Badge; typography and radius match it. */
export function GoalStatusBadge({ text, color }: Readonly<GoalStatusBadgeProps>) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-[8px] uppercase"
      style={{
        fontFamily: 'var(--font-mono)',
        // react-doctor-disable-next-line no-tiny-text -- goal status chips share the canonical Badge's 10.5px exception from DESIGN.md:672; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: '0.06em',
        padding: '2px 9px',
        boxShadow: 'inset 0 0 0 1px var(--hairline-strong)',
        color,
        textBox: 'trim-both cap alphabetic',
      }}
    >
      {text}
    </span>
  )
}
