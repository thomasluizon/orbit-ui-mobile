'use client'

import { useId, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ListRow } from '@/components/ui/list-row'
import type { Goal, GoalMetrics } from '@orbit/shared/types/goal'
import { formatGoalHistoryDelta, formatGoalHistoryNumber } from '@orbit/shared/utils'

interface GoalProgressHistoryEntry {
  createdAtUtc: string
  previousValue: number
  value: number
  note?: string | null
}

interface GoalProgressHistorySectionProps {
  title: string
  entries: GoalProgressHistoryEntry[]
  target: number
  unit: string
  formatDate: (dateStr: string) => string
  showAllLabel: string
  showLessLabel: string
}

const HISTORY_PREVIEW_COUNT = 3

export function GoalProgressHistorySection({
  title,
  entries,
  target,
  unit,
  formatDate,
  showAllLabel,
  showLessLabel,
}: Readonly<GoalProgressHistorySectionProps>) {
  const locale = useLocale()
  const t = useTranslations()
  const historyId = useId()
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
      <ul id={historyId} className="list-none" style={{ margin: 0, padding: 0 }}>
        {visibleEntries.map((entry) => {
          const date = formatDate(entry.createdAtUtc)
          const delta = formatGoalHistoryDelta(entry.previousValue, entry.value, locale)
          const current = formatGoalHistoryNumber(entry.value, locale)
          const formattedTarget = formatGoalHistoryNumber(target, locale)

          return (
            <li
              key={`${entry.createdAtUtc}-${entry.value}`}
              className="flex flex-col"
              style={{ padding: '8px 0', gap: 4 }}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(32px,auto)_minmax(56px,auto)] items-center gap-3">
                <span data-history-date style={{ minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums' }}>
                  <span className="sr-only">{t('goals.detail.historyDate', { date })}</span>
                  <span aria-hidden="true">{date}</span>
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, color: 'var(--fg-2)', fontVariantNumeric: 'tabular-nums', textAlign: 'end' }}>
                  <span className="sr-only">{t('goals.detail.historyDelta', { delta, unit })}</span>
                  <span aria-hidden="true">{delta}</span>
                </span>
                <span style={{ minWidth: 56, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums', textAlign: 'end' }}>
                  <span className="sr-only">{t('goals.detail.historyProgress', { current, target: formattedTarget, unit })}</span>
                  <span aria-hidden="true">{current} / {formattedTarget}</span>
                </span>
              </div>
              {entry.note && (
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-2)', overflowWrap: 'anywhere' }}>
                  {entry.note}
                </div>
              )}
            </li>
          )
        })}
      </ul>
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
            aria-controls={historyId}
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
  onLinkedHabitNavigate?: (habitId: string, event: MouseEvent<HTMLElement>) => void
  notice?: ReactNode
}

export function GoalLinkedHabitsSection({
  title,
  emptyLabel,
  linkedHabits,
  habitAdherence,
  formatValue,
  onLinkedHabitNavigate,
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
                onClick={onLinkedHabitNavigate ? (event) => onLinkedHabitNavigate(habit.id, event) : undefined}
              />
            </li>
          )
        })}
      </ul>}
    </div>
  )
}
