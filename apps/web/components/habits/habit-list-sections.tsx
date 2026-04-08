'use client'

import type { ReactNode } from 'react'
import { ClipboardList, CheckCircle2 } from 'lucide-react'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

export interface HabitListDateGroup {
  key: string
  label: string
  isOverdue: boolean
  habits: NormalizedHabit[]
}

interface HabitListEmptyStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  variant?: 'primary' | 'secondary'
}

export function HabitListEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  variant = 'primary',
}: Readonly<HabitListEmptyStateProps>) {
  const allDoneToday = title === 'habits.allDoneToday'

  return (
    <div className="text-center py-16">
      <div className="bg-surface-ground rounded-full size-20 flex items-center justify-center mx-auto mb-4 border border-border-muted">
        {allDoneToday ? (
          <CheckCircle2 className="size-10 text-success" />
        ) : (
          <ClipboardList className="size-10 text-text-muted" />
        )}
      </div>
      {allDoneToday ? (
        <p className="text-text-primary font-bold text-lg mb-1">{title}</p>
      ) : null}
      <p className={allDoneToday ? 'text-text-secondary text-sm mb-6' : 'text-text-secondary mb-6'}>
        {description}
      </p>
      {actionLabel ? (
        <button
          className={
            variant === 'secondary'
              ? 'px-6 py-3 rounded-xl bg-primary/10 border border-primary/20 text-primary font-bold text-sm hover:bg-primary/15 transition-all active:scale-95'
              : 'px-6 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-[var(--shadow-glow)] active:scale-95 transition-transform'
          }
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

interface HabitListDateGroupSectionProps {
  group: HabitListDateGroup
  overdueLabel: string
  children: ReactNode
}

export function HabitListDateGroupSection({
  group,
  overdueLabel,
  children,
}: Readonly<HabitListDateGroupSectionProps>) {
  return (
    <div key={group.key} className="mb-4">
      <div className="flex items-center gap-3 mb-2 mt-2">
        <span
          className={`text-xs font-bold uppercase tracking-wider whitespace-nowrap ${
            group.isOverdue ? 'text-red-400' : 'text-text-muted'
          }`}
        >
          {group.isOverdue ? overdueLabel : group.label}
        </span>
        <div
          className={`flex-1 h-px ${group.isOverdue ? 'bg-red-500/20' : 'bg-border'}`}
        />
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}
