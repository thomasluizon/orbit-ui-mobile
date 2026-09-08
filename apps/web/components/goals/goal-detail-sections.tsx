'use client'

import { useState, useMemo } from 'react'
import { Repeat, type Icon } from '@/components/ui/icons'
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
}

/** Linked-habits list: ListRow language, icon well, Rubik 16 title, hairline dividers. */
export function GoalLinkedHabitsSection({
  title,
  emptyLabel,
  linkedHabits,
}: Readonly<GoalLinkedHabitsSectionProps>) {
  return (
    <div data-tour="tour-goal-link" className="flex flex-col gap-3">
      <h3 className="text-[20px] font-medium text-[var(--fg-1)]">{title}</h3>
      {linkedHabits.length === 0 ? (
        <p className="text-[14px] text-[var(--fg-3)]">{emptyLabel}</p>
      ) : <ul className="list-none" style={{ margin: 0, padding: 0 }}>
        {linkedHabits.map((habit) => (
          <li
            key={habit.id}
            className="flex items-center"
            style={{
              padding: '8px 0',
                            gap: 12,
            }}
          >
            <span
              className="inline-flex shrink-0 items-center justify-center rounded-[12px] bg-[var(--bg-field)]"
              style={{ width: 36, height: 36, boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
              aria-hidden="true"
            >
              <Repeat size={24} strokeWidth={1.5} color="var(--fg-2)" />
            </span>
            <span
              className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 16,
                color: 'var(--fg-1)',
              }}
            >
              {habit.title}
            </span>
          </li>
        ))}
      </ul>}
    </div>
  )
}

interface GoalActionRowProps {
  label: string
  icon: Icon
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}

/** Menu-item action row: leading icon + label, pressed-token hover,
 *  status-bad label + icon when destructive. No dividers, spacing groups the cluster. */
export function GoalActionRow({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  destructive = false,
}: Readonly<GoalActionRowProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="appearance-none w-full bg-transparent cursor-pointer text-left flex items-center transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:scale-[0.99] disabled:opacity-50 disabled:cursor-default disabled:hover:bg-transparent"
      style={{
        padding: '12px 0',
        gap: 12,
        border: 0,
      }}
    >
      <Icon
        size={24}
        strokeWidth={1.5}
        color={destructive ? 'var(--status-bad)' : 'var(--fg-3)'}
        aria-hidden="true"
        className="shrink-0"
      />
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          fontWeight: 400,
          color: destructive ? 'var(--status-bad)' : 'var(--fg-1)',
        }}
      >
        {label}
      </span>
    </button>
  )
}
