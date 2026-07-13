'use client'

interface GoalStatusBadgeProps {
  text: string
  color: string
}

/** Uppercase pill chip for goal status and deadline hints: 12/600 +0.06em
 *  inside an inset hairline ring, colored per status text token. */
export function GoalStatusBadge({ text, color }: Readonly<GoalStatusBadgeProps>) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full uppercase"
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.06em',
        padding: '3px 9px',
        boxShadow: 'inset 0 0 0 1px var(--hairline-strong)',
        color,
      }}
    >
      {text}
    </span>
  )
}
