import type { ReactNode } from 'react'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

export interface HabitListDateGroup {
  key: string
  label: string
  isOverdue: boolean
  habits: NormalizedHabit[]
}

interface HabitListDateGroupSectionProps {
  group: HabitListDateGroup
  overdueLabel: string
  children: ReactNode
}

/** v8 date-group header: 13px/600 muted label (overdue uses --status-overdue). */
export function HabitListDateGroupSection({
  group,
  overdueLabel,
  children,
}: Readonly<HabitListDateGroupSectionProps>) {
  return (
    <div key={group.key}>
      <div
        className="flex items-center"
        style={{
          padding: '16px 20px 8px',
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 600,
            color: group.isOverdue ? 'var(--status-overdue-text)' : 'var(--fg-3)',
            whiteSpace: 'nowrap',
          }}
        >
          {group.isOverdue ? overdueLabel : group.label}
        </span>
        <div
          className="flex-1"
          style={{
            height: 1,
            background: group.isOverdue
              ? 'var(--status-overdue)'
              : 'var(--hairline)',
            opacity: group.isOverdue ? 0.32 : 1,
          }}
        />
      </div>
      <div>{children}</div>
    </div>
  )
}
