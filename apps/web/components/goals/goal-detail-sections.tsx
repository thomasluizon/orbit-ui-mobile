'use client'

import { useState, useMemo } from 'react'
import type { LucideIcon } from 'lucide-react'
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
 *  in mono, optional italic note. */
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
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
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
              fontFamily: 'var(--font-sans)',
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
 *  Underlined inputs with mono numerals. */
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
            fontFamily: 'var(--font-sans)',
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
            fontFamily: 'var(--font-sans)',
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
            fontFamily: 'var(--font-sans)',
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

/** UnderlinedInput: tiny label, bare input with hairline underline. */
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
          fontFamily: 'var(--font-sans)',
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
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
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

/** Linked-habits list: each habit is a single row with progress bar and percent. */
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
              fontFamily: 'var(--font-sans)',
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

interface GoalActionRowProps {
  label: string
  icon: LucideIcon
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}

/** Menu-item action row: leading icon + label, pressed-token hover,
 *  italic fg-3 label when destructive. No dividers — spacing groups the cluster. */
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
      className="appearance-none w-full bg-transparent cursor-pointer text-left flex items-center transition-colors duration-150 ease-out hover:bg-[var(--bg-elev-pressed)] disabled:opacity-50 disabled:cursor-default disabled:hover:bg-transparent"
      style={{
        padding: '12px 20px',
        gap: 12,
        border: 0,
      }}
    >
      <Icon
        size={16}
        strokeWidth={1.7}
        color="var(--fg-3)"
        aria-hidden="true"
        className="shrink-0"
      />
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          fontWeight: 400,
          color: destructive ? 'var(--fg-3)' : 'var(--fg-1)',
          fontStyle: destructive ? 'italic' : 'normal',
        }}
      >
        {label}
      </span>
    </button>
  )
}
