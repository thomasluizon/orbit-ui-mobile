'use client'

import { useState, useMemo } from 'react'
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
  showAllLabel: string
  showLessLabel: string
}

const HISTORY_PREVIEW_COUNT = 3

export function GoalProgressHistorySection({
  title,
  entries,
  unit: _unit,
  formatDate,
  renderEntryLabel,
  showAllLabel,
  showLessLabel,
}: Readonly<GoalProgressHistorySectionProps>) {
  const [showAllHistory, setShowAllHistory] = useState(false)

  const visibleEntries = useMemo(
    () =>
      showAllHistory ? entries : entries.slice(-HISTORY_PREVIEW_COUNT),
    [entries, showAllHistory],
  )

  if (entries.length === 0) {
    return null
  }

  return (
    <div>
      <h4 className="form-label mb-2">{title}</h4>
      <div className="space-y-2">
        {visibleEntries.map((entry) => (
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
      {entries.length > HISTORY_PREVIEW_COUNT && (
        <button
          className="mt-2 text-xs text-primary font-semibold hover:text-primary/80 transition-colors"
          onClick={() => setShowAllHistory((prev) => !prev)}
        >
          {showAllHistory
            ? showLessLabel
            : `${showAllLabel} (${entries.length})`}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// GoalProgressForm
// ---------------------------------------------------------------------------

interface GoalProgressFormProps {
  progressValue: number | null
  progressNote: string
  isUpdating: boolean
  isStreak: boolean
  progressExceedsTarget: boolean
  onProgressValueChange: (value: number | null) => void
  onProgressNoteChange: (note: string) => void
  onSubmit: () => void
  onCancel: () => void
  labelValue: string
  labelNote: string
  labelSave: string
  labelCancel: string
  labelExceedsTarget: string
}

export function GoalProgressForm({
  progressValue,
  progressNote,
  isUpdating,
  isStreak: _isStreak,
  progressExceedsTarget,
  onProgressValueChange,
  onProgressNoteChange,
  onSubmit,
  onCancel,
  labelValue,
  labelNote,
  labelSave,
  labelCancel,
  labelExceedsTarget,
}: Readonly<GoalProgressFormProps>) {
  return (
    <div className="space-y-3 bg-surface-elevated rounded-[var(--radius-lg)] p-4 border border-border-muted shadow-[var(--shadow-sm)]">
      <div>
        <label htmlFor="goal-progress-value" className="form-label">
          {labelValue}
        </label>
        <input
          id="goal-progress-value"
          type="number"
          value={progressValue ?? ''}
          onChange={(e) =>
            onProgressValueChange(
              e.target.value === '' ? null : Number(e.target.value),
            )
          }
          className="form-input"
          min={0}
          step="any"
        />
        {progressExceedsTarget && (
          <p className="text-xs text-amber-400 font-medium mt-1">
            {labelExceedsTarget}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="goal-progress-note" className="form-label">
          {labelNote}
        </label>
        <input
          id="goal-progress-note"
          type="text"
          value={progressNote}
          onChange={(e) => onProgressNoteChange(e.target.value)}
          className="form-input"
          placeholder={labelNote}
        />
      </div>
      <div className="flex gap-2">
        <button
          disabled={progressValue === null || isUpdating}
          className="flex-1 py-2.5 rounded-[var(--radius-lg)] bg-primary text-white font-bold text-sm text-center hover:bg-primary/90 transition-all duration-150 disabled:opacity-50"
          onClick={onSubmit}
        >
          {isUpdating ? '...' : labelSave}
        </button>
        <button
          className="py-2.5 px-4 rounded-[var(--radius-lg)] bg-surface text-text-secondary font-medium text-sm hover:bg-surface-elevated/80 transition-all duration-150"
          onClick={onCancel}
        >
          {labelCancel}
        </button>
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
    <div className="mt-4" data-tour="tour-goal-link">
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
