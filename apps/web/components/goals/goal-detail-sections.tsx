'use client'

import { useState, useMemo, type ReactNode } from 'react'
import { ListRow } from '@/components/ui/list-row'
import type { Goal, GoalMetrics } from '@orbit/shared/types/goal'

interface GoalProgressHistoryEntry {
  createdAtUtc: string
  previousValue: number
  value: number
  note?: string | null
}

interface GoalProgressHistorySectionProps {
  title: string
  entries: GoalProgressHistoryEntry[]
  formatDate: (dateStr: string) => string
  renderEntryLabel: (entry: GoalProgressHistoryEntry) => string
  showAllLabel: string
  showLessLabel: string
}

const HISTORY_PREVIEW_COUNT = 3

/** Flush list of progress history entries: mono date right-aligned, change label
 *  in mono, optional note. */
export function GoalProgressHistorySection({
  title,
  entries,
  formatDate,
  renderEntryLabel,
  showAllLabel,
  showLessLabel,
}: Readonly<GoalProgressHistorySectionProps>) {
  const [showAllHistory, setShowAllHistory] = useState(false)

  const visibleEntries = useMemo(
    () =>
      showAllHistory ? entries : entries.slice(0, HISTORY_PREVIEW_COUNT),
    [entries, showAllHistory],
  )

  if (entries.length === 0) {
    return null
  }

  return (
    <div>
      <h3 className="text-[14px] font-medium text-[var(--fg-2)]">{title}</h3>
      {visibleEntries.map((entry) => (
        <div
          key={`${entry.createdAtUtc}-${entry.value}`}
          className="flex flex-col"
          style={{
            padding: '8px 0',
                        gap: 4,
          }}
        >
          <div className="flex items-center justify-between">
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--fg-3)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatDate(entry.createdAtUtc)}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--fg-1)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {renderEntryLabel(entry)}
            </span>
          </div>
          {entry.note && (
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                color: 'var(--fg-2)',
              }}
            >
              {entry.note}
            </div>
          )}
        </div>
      ))}
      {entries.length > HISTORY_PREVIEW_COUNT && (
        <div style={{ padding: '4px 0' }}>
          <button
            type="button"
            className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center text-[var(--fg-1)] transition-[color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:text-[var(--fg-2)]"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              fontWeight: 500,
              minHeight: 44,
              padding: 0,
            }}
            aria-expanded={showAllHistory}
            onClick={() => setShowAllHistory((prev) => !prev)}
          >
            {showAllHistory ? showLessLabel : showAllLabel}
          </button>
        </div>
      )}
    </div>
  )
}

interface GoalLinkedHabitsSectionProps {
  title: string
  emptyLabel: string
  linkedHabits: NonNullable<Goal['linkedHabits']>
  habitAdherence: GoalMetrics['habitAdherence']
  formatValue: (currentStreak: number) => string
  notice?: ReactNode
}

export function GoalLinkedHabitsSection({
  title,
  emptyLabel,
  linkedHabits,
  habitAdherence,
  formatValue,
  notice,
}: Readonly<GoalLinkedHabitsSectionProps>) {
  const adherenceByHabitId = useMemo(
    () => new Map(habitAdherence.map((metrics) => [metrics.habitId, metrics])),
    [habitAdherence],
  )

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[20px] font-medium text-[var(--fg-1)]">{title}</h3>
      {notice}
      {linkedHabits.length === 0 ? (
        <p className="text-[14px] text-[var(--fg-3)]">{emptyLabel}</p>
      ) : <ul className="-mx-4 list-none" style={{ marginBlock: 0, padding: 0 }}>
        {linkedHabits.map((habit) => {
          const adherence = adherenceByHabitId.get(habit.id)
          const value = adherence ? formatValue(adherence.currentStreak) : undefined
          return (
            <li key={habit.id}>
              <ListRow
                title={habit.title}
                value={value}
                accessibilityLabel={value ? `${habit.title}, ${value}` : habit.title}
                href={`/habits/${habit.id}`}
              />
            </li>
          )
        })}
      </ul>}
    </div>
  )
}
