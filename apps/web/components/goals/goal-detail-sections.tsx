'use client'

import { useState, useMemo } from 'react'
import { Repeat, type LucideIcon } from '@/components/ui/icons'
import type { Goal } from '@orbit/shared/types/goal'
import { FieldInput } from '@/components/ui/field-input'
import { PillButton } from '@/components/ui/pill-button'
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
      showAllHistory ? entries : entries.slice(-HISTORY_PREVIEW_COUNT),
    [entries, showAllHistory],
  )

  if (entries.length === 0) {
    return null
  }

  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      {visibleEntries.map((entry, index) => (
        <div
          key={`${entry.createdAtUtc}-${entry.value}`}
          className="flex flex-col"
          style={{
            padding: '10px 20px',
            borderBottom:
              index === visibleEntries.length - 1
                ? undefined
                : '1px solid var(--hairline)',
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
        <div style={{ padding: '2px 20px' }}>
          <button
            type="button"
            className="appearance-none border-0 bg-transparent cursor-pointer inline-flex items-center text-[var(--fg-1)] transition-[color] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:text-[var(--primary)]"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              fontWeight: 500,
              minHeight: 44,
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
 *  Kit field wells with a pill footer. */
export function GoalProgressForm({
  progressValue,
  progressNote,
  isUpdating,
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
        padding: '12px 20px 16px',
        borderBottom: '1px solid var(--hairline)',
        gap: 14,
      }}
    >
      <FieldInput
        label={labelValue}
        type="number"
        inputMode="decimal"
        mono
        value={progressValue === null ? '' : String(progressValue)}
        onChange={(raw) =>
          onProgressValueChange(raw === '' ? null : Number(raw))
        }
      />
      {progressExceedsTarget && (
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            color: 'var(--status-overdue-text)',
          }}
        >
          {labelExceedsTarget}
        </p>
      )}
      <FieldInput
        label={labelNote}
        value={progressNote}
        onChange={onProgressNoteChange}
        placeholder={labelNote}
        maxLength={500}
      />
      <div className="flex items-center" style={{ gap: 12, marginTop: 2 }}>
        <PillButton variant="ghost" className="flex-1" onClick={onCancel}>
          {labelCancel}
        </PillButton>
        <PillButton
          className="flex-1"
          disabled={progressValue === null || isUpdating}
          busy={isUpdating}
          onClick={onSubmit}
        >
          {labelSave}
        </PillButton>
      </div>
    </div>
  )
}

interface GoalLinkedHabitsSectionProps {
  title: string
  linkedHabits: NonNullable<Goal['linkedHabits']>
}

/** Linked-habits list: ListRow language, icon well, Rubik 16 title, hairline dividers. */
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
      <ul className="list-none" style={{ margin: 0, padding: 0 }}>
        {linkedHabits.map((habit, index) => (
          <li
            key={habit.id}
            className="flex items-center"
            style={{
              padding: '10px 20px',
              borderBottom:
                index === linkedHabits.length - 1
                  ? undefined
                  : '1px solid var(--hairline)',
              gap: 14,
            }}
          >
            <span
              className="inline-flex shrink-0 items-center justify-center rounded-[12px] bg-[var(--bg-field)]"
              style={{ width: 36, height: 36, boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
              aria-hidden="true"
            >
              <Repeat size={18} strokeWidth={1.8} color="var(--fg-2)" />
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
      </ul>
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
      className="appearance-none w-full bg-transparent cursor-pointer text-left flex items-center transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev-pressed)] active:scale-[0.99] disabled:opacity-50 disabled:cursor-default disabled:hover:bg-transparent"
      style={{
        padding: '12px 20px',
        gap: 12,
        border: 0,
      }}
    >
      <Icon
        size={18}
        strokeWidth={1.8}
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
