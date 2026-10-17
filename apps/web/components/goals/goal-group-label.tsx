'use client'

import { SPACING } from '@orbit/shared/theme'

interface GoalGroupLabelProps {
  children: React.ReactNode
  top?: number
}

/** Goal-form group label using the shared form typography. */
export function GoalGroupLabel({ children, top = SPACING.s4 }: Readonly<GoalGroupLabelProps>) {
  return (
    <div
      style={{
        padding: `${top}px var(--orbit-space-0) var(--orbit-space-8)`,
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
