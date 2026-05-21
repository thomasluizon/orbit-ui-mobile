'use client'

import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { Goal } from '@orbit/shared/types/goal'
import { SectionLabel } from '@/components/ui/section-label'

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

/** Flush list of progress history entries: mono date right-aligned, change label
 *  in mono, optional italic note. Matches v8 GoalDetail history rows. */
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
      <SectionLabel>{title}</SectionLabel>
      {visibleEntries.map((entry) => (
        <div
          key={`${entry.createdAtUtc}-${entry.value}`}
          className="flex flex-col"
          style={{
            padding: '10px 20px',
            borderBottom: '1px solid var(--hairline)',
            gap: 3,
          }}
        >
          <div className="flex items-center justify-between">
            <span
              style={{
                fontFamily: 'var(--font-family-mono)',
                fontSize: 11,
                color: 'var(--fg-3)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatDate(entry.createdAtUtc)}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-family-mono)',
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
                fontFamily: 'var(--font-family-sans)',
                fontSize: 13,
                fontStyle: 'italic',
                color: 'var(--fg-2)',
              }}
            >
              {entry.note}
            </div>
          )}
        </div>
      ))}
      {entries.length > HISTORY_PREVIEW_COUNT && (
        <div style={{ padding: '10px 20px' }}>
          <button
            type="button"
            className="appearance-none border-0 bg-transparent cursor-pointer"
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--fg-1)',
              padding: 0,
            }}
            onClick={() => setShowAllHistory((prev) => !prev)}
          >
            {showAllHistory
              ? showLessLabel
              : `${showAllLabel} (${entries.length})`}
          </button>
        </div>
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

/** Inline progress-update form rendered in-place inside the GoalDetailDrawer.
 *  Underlined inputs with mono numerals match v8 update flow. */
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
    <div
      className="flex flex-col"
      style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--hairline)',
        gap: 10,
      }}
    >
      <UnderlinedInputField
        label={labelValue}
        type="number"
        mono
        value={progressValue ?? ''}
        onChange={(raw) =>
          onProgressValueChange(raw === '' ? null : Number(raw))
        }
      />
      {progressExceedsTarget && (
        <p
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 13,
            fontStyle: 'italic',
            color: 'var(--status-overdue)',
          }}
        >
          {labelExceedsTarget}
        </p>
      )}
      <UnderlinedInputField
        label={labelNote}
        type="text"
        value={progressNote}
        onChange={onProgressNoteChange}
        placeholder={labelNote}
        maxLength={500}
      />
      <div className="flex items-center justify-end" style={{ gap: 14 }}>
        <button
          type="button"
          className="appearance-none border-0 bg-transparent cursor-pointer"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--fg-3)',
            padding: 6,
          }}
          onClick={onCancel}
        >
          {labelCancel}
        </button>
        <button
          type="button"
          disabled={progressValue === null || isUpdating}
          className="appearance-none border-0 bg-transparent cursor-pointer disabled:opacity-50"
          style={{
            fontFamily: 'var(--font-family-sans)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--fg-1)',
            padding: 6,
          }}
          onClick={onSubmit}
        >
          {isUpdating ? '...' : labelSave}
        </button>
      </div>
    </div>
  )
}

interface UnderlinedInputFieldProps {
  label: string
  value: string | number
  type?: 'text' | 'number'
  placeholder?: string
  maxLength?: number
  mono?: boolean
  onChange: (next: string) => void
}

/** v8 UnderlinedInput: tiny label, bare input with hairline underline. */
function UnderlinedInputField({
  label,
  value,
  type = 'text',
  placeholder,
  maxLength,
  mono = false,
  onChange,
}: Readonly<UnderlinedInputFieldProps>) {
  return (
    <label className="flex flex-col" style={{ gap: 4 }}>
      <span
        style={{
          fontFamily: 'var(--font-family-sans)',
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--fg-3)',
        }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: 'none',
          border: 0,
          background: 'transparent',
          outline: 'none',
          fontFamily: mono ? 'var(--font-family-mono)' : 'var(--font-family-sans)',
          fontSize: 14,
          color: 'var(--fg-1)',
          padding: '4px 0',
          borderBottom: '1px solid var(--hairline-strong)',
          fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
        }}
      />
    </label>
  )
}

interface GoalLinkedHabitsSectionProps {
  title: string
  linkedHabits: NonNullable<Goal['linkedHabits']>
}

/** v8 linked-habits list: each habit is a single row with progress bar and percent. */
export function GoalLinkedHabitsSection({
  title,
  linkedHabits,
}: Readonly<GoalLinkedHabitsSectionProps>) {
  if (linkedHabits.length === 0) {
    return null
  }

  return (
    <div data-tour="tour-goal-link">
      <SectionLabel>{title}</SectionLabel>
      {linkedHabits.map((habit) => (
        <div
          key={habit.id}
          className="flex items-center"
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--hairline)',
            gap: 12,
          }}
        >
          <span
            className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis"
            style={{
              fontFamily: 'var(--font-family-sans)',
              fontSize: 14,
              color: 'var(--fg-1)',
            }}
          >
            {habit.title}
          </span>
        </div>
      ))}
    </div>
  )
}

interface GoalActionButtonProps {
  icon?: ReactNode
  label: string
  onClick: () => void
  className?: string
  disabled?: boolean
  destructive?: boolean
}

/** v8 quiet-link footer action: italic when destructive, otherwise fg-1. */
export function GoalActionButton({
  label,
  onClick,
  disabled = false,
  destructive = false,
}: Readonly<GoalActionButtonProps>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="appearance-none border-0 bg-transparent cursor-pointer disabled:opacity-50"
      style={{
        fontFamily: 'var(--font-family-sans)',
        fontSize: 13,
        fontWeight: 500,
        color: destructive ? 'var(--fg-3)' : 'var(--fg-1)',
        fontStyle: destructive ? 'italic' : 'normal',
        padding: 6,
      }}
    >
      {label}
    </button>
  )
}
