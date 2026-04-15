'use client'

import { Flame, ClipboardCheck, Clock, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitCardStatus } from '@orbit/shared/utils'

type MetaTone = 'neutral' | 'primary' | 'destructive' | 'amber' | 'tag'

export interface HabitMetaChip {
  key: string
  tone: MetaTone
  label?: string
  icon?: LucideIcon
  /** Inline color override for tag chips. */
  color?: string
}

interface HabitMetaRowProps {
  habit: NormalizedHabit
  isChild: boolean
  isCompleted: boolean
  frequencyLabel: string
  flexibleProgressLabel: string | null
  statusBadge: { text: string } | null
  /** Full status context (so the row can render Today / Overdue / Completed). */
  status?: HabitCardStatus
  checkedCount: number
  matchBadges: ReadonlyArray<{ label: string }>
  displayTime: (time: string) => string
  /** Total chips (excluding leading frequency label) before showing +N overflow. Defaults to 4. */
  maxVisibleChips?: number
  /** Tag tour anchor target for first-render UI tour. */
  tagsAnchorRef?: React.RefObject<HTMLSpanElement | null>
}

const TONE_CLASS: Record<MetaTone, string> = {
  neutral: 'bg-surface-elevated/70 text-text-secondary',
  primary: 'bg-primary/10 text-primary',
  destructive: 'bg-[rgb(var(--color-destructive-rgb)/0.12)] text-destructive',
  amber: 'bg-amber-400/10 text-amber-400',
  tag: 'text-white/95',
}

/**
 * Compact, single-line meta row. Frequency type chip leads (small-caps,
 * tight tracking), followed by a colored status label (Today / Overdue /
 * Completed) with a 6px dot, then chips for time, tags, streak, checklist.
 * Overflow collapses to a `+N` chip so a 15-card Today view stays calm.
 */
export function HabitMetaRow({
  habit,
  isChild,
  isCompleted,
  frequencyLabel,
  flexibleProgressLabel,
  statusBadge,
  status,
  checkedCount,
  matchBadges,
  displayTime,
  maxVisibleChips = 4,
  tagsAnchorRef,
}: HabitMetaRowProps) {
  const t = useTranslations()
  const chips = buildChips({
    habit,
    flexibleProgressLabel,
    // statusBadge only becomes a chip when we don't have a richer status.
    // When `status` is provided we render the dot+label variant instead.
    statusBadge: status ? null : statusBadge,
    checkedCount,
    matchBadges,
    displayTime,
    badHabitLabel: t('habits.badHabit'),
  })

  const visible = chips.slice(0, maxVisibleChips)
  const overflowCount = chips.length - visible.length
  const fontScale = isChild ? 'text-[10px]' : 'text-[11px]'
  const dimClass = isCompleted ? 'opacity-80' : ''

  const statusLabel = resolveStatusLabel(status, t, isCompleted)

  return (
    <div
      className={`flex items-center gap-1.5 ${fontScale} text-text-secondary min-w-0 ${dimClass}`}
    >
      <span className="habit-type-chip">{frequencyLabel}</span>
      {statusLabel ? (
        <span
          className={`habit-status-label habit-status-label--${statusLabel.kind}`}
          aria-label={statusLabel.text}
        >
          <span className="habit-status-dot" aria-hidden="true" />
          {statusLabel.text}
        </span>
      ) : null}
      <span
        ref={tagsAnchorRef}
        data-tour="tour-habit-tags"
        className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden"
      >
        {visible.map((chip) => (
          <Chip key={chip.key} chip={chip} />
        ))}
        {overflowCount > 0 ? (
          <span className="habit-meta-overflow shrink-0">+{overflowCount}</span>
        ) : null}
      </span>
    </div>
  )
}

interface StatusLabel {
  kind: 'overdue' | 'completed'
  text: string
}

function resolveStatusLabel(
  status: HabitCardStatus | undefined,
  t: ReturnType<typeof useTranslations>,
  isCompleted: boolean,
): StatusLabel | null {
  if (status === 'completed' || isCompleted) {
    return { kind: 'completed', text: t('habits.instance.completed') }
  }
  if (status === 'overdue') {
    return { kind: 'overdue', text: t('habits.overdue') }
  }
  return null
}

function Chip({ chip }: Readonly<{ chip: HabitMetaChip }>) {
  const Icon = chip.icon
  const baseClass = 'shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap max-w-[12rem] truncate'
  if (chip.tone === 'tag') {
    return (
      <span
        className={`${baseClass} ${TONE_CLASS.tag}`}
        style={{ backgroundColor: chip.color ?? 'var(--color-primary)' }}
      >
        {Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
        {chip.label}
      </span>
    )
  }
  return (
    <span className={`${baseClass} ${TONE_CLASS[chip.tone]}`}>
      {Icon ? <Icon className="size-3" aria-hidden="true" /> : null}
      {chip.label}
    </span>
  )
}

interface BuildChipsArgs {
  habit: NormalizedHabit
  flexibleProgressLabel: string | null
  statusBadge: { text: string } | null
  checkedCount: number
  matchBadges: ReadonlyArray<{ label: string }>
  displayTime: (time: string) => string
  badHabitLabel: string
}

function buildChips({
  habit,
  flexibleProgressLabel,
  statusBadge,
  checkedCount,
  matchBadges,
  displayTime,
  badHabitLabel,
}: BuildChipsArgs): HabitMetaChip[] {
  const chips: HabitMetaChip[] = []

  if (habit.dueTime) {
    const timeLabel = habit.dueEndTime
      ? `${displayTime(habit.dueTime)} - ${displayTime(habit.dueEndTime)}`
      : displayTime(habit.dueTime)
    chips.push({ key: 'time', tone: 'neutral', label: timeLabel, icon: Clock })
  }

  if (statusBadge) {
    chips.push({ key: 'status', tone: 'destructive', label: statusBadge.text })
  }

  if (flexibleProgressLabel) {
    chips.push({ key: 'flexible', tone: 'primary', label: flexibleProgressLabel })
  }

  if (habit.isBadHabit) {
    chips.push({ key: 'bad', tone: 'destructive', label: badHabitLabel })
  }

  if (habit.checklistItems && habit.checklistItems.length > 0) {
    chips.push({
      key: 'checklist',
      tone: 'neutral',
      label: `${checkedCount}/${habit.checklistItems.length}`,
      icon: ClipboardCheck,
    })
  }

  if (habit.currentStreak != null && habit.currentStreak >= 2) {
    chips.push({
      key: 'streak',
      tone: 'amber',
      label: String(habit.currentStreak),
      icon: Flame,
    })
  }

  for (const tag of habit.tags ?? []) {
    chips.push({
      key: `tag-${tag.id}`,
      tone: 'tag',
      label: tag.name,
      color: tag.color,
    })
  }

  for (const goal of habit.linkedGoals ?? []) {
    chips.push({ key: `goal-${goal.id}`, tone: 'primary', label: goal.title })
  }

  for (const match of matchBadges) {
    chips.push({ key: `match-${match.label}`, tone: 'primary', label: match.label })
  }

  return chips
}
