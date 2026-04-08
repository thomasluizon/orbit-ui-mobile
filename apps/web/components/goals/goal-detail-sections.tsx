'use client'

import type { ReactNode } from 'react'
import type { Goal } from '@orbit/shared/types/goal'

interface GoalProgressHistoryEntry {
  createdAtUtc: string
  previousValue: number
  value: number
  note?: string | null
}

interface GoalProgressHistorySectionProps {
  title: string
  entries: GoalProgressHistoryEntry[]
  unit: string
  formatDate: (dateStr: string) => string
  renderEntryLabel: (entry: GoalProgressHistoryEntry) => string
}

export function GoalProgressHistorySection({
  title,
  entries,
  unit: _unit,
  formatDate,
  renderEntryLabel,
}: Readonly<GoalProgressHistorySectionProps>) {
  if (entries.length === 0) {
    return null
  }

  return (
    <div>
      <h4 className="form-label mb-2">{title}</h4>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {entries.map((entry) => (
          <div
            key={`${entry.createdAtUtc}-${entry.value}`}
            className="flex items-center justify-between text-xs bg-surface-elevated rounded-xl px-3 py-2"
          >
            <div>
              <span className="text-text-primary font-medium">
                {renderEntryLabel(entry)}
              </span>
              {entry.note && (
                <span className="text-text-muted ml-2">{entry.note}</span>
              )}
            </div>
            <span className="text-text-muted shrink-0 ml-2">
              {formatDate(entry.createdAtUtc)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface GoalLinkedHabitsSectionProps {
  title: string
  linkedHabits: NonNullable<Goal['linkedHabits']>
}

export function GoalLinkedHabitsSection({
  title,
  linkedHabits,
}: Readonly<GoalLinkedHabitsSectionProps>) {
  if (linkedHabits.length === 0) {
    return null
  }

  return (
    <div className="mt-4">
      <h4 className="form-label mb-2">{title}</h4>
      <div className="flex flex-wrap gap-2">
        {linkedHabits.map((habit) => (
          <span
            key={habit.id}
            className="px-2.5 py-1 rounded-xl text-xs font-medium bg-surface border border-border text-text-secondary"
          >
            {habit.title}
          </span>
        ))}
      </div>
    </div>
  )
}

interface GoalActionButtonProps {
  icon: ReactNode
  label: string
  onClick: () => void
  className: string
  disabled?: boolean
}

export function GoalActionButton({
  icon,
  label,
  onClick,
  className,
  disabled = false,
}: Readonly<GoalActionButtonProps>) {
  return (
    <button
      className={className}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {label}
    </button>
  )
}
