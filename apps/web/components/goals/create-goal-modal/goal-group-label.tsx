'use client'

interface GoalGroupLabelProps {
  children: React.ReactNode
  top?: number
}

/** meta-criar group label: Rubik 14/500 fg-2 over the field group. */
export function GoalGroupLabel({ children, top = 4 }: Readonly<GoalGroupLabelProps>) {
  return (
    <div
      style={{
        padding: `${top}px 0 8px`,
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        fontWeight: 500,
        color: 'var(--fg-2)',
      }}
    >
      {children}
    </div>
  )
}
