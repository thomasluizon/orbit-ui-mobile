import { computeHabitFutureHint, type HabitCardTranslationAdapter } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { HabitStatus } from '@orbit/shared/contracts/lists'
import type { HabitRowMetaPart } from './habit-row-content'
import type { HabitRowActions } from './habit-row'

/** Maps the row's derived flags to its status-dot state. */
export function resolveHabitRowDotState(
  isDoneForRange: boolean,
  isBadHabit: boolean,
  isOverdue: boolean,
): HabitStatus {
  if (isBadHabit) return 'bad'
  if (isDoneForRange) return 'done'
  if (isOverdue) return 'overdue'
  return 'empty'
}

interface BuildHabitRowMetaPartsParams {
  habit: NormalizedHabit
  childProgress?: { done: number; total: number }
  isOverdue: boolean
  selectedDateStr: string
  todayStr: string
  displayTime: (time: string) => string
  t: HabitCardTranslationAdapter
  locale?: string | null
}

/** Parent completion or single-row timing and status metadata. */
export function buildHabitRowMetaParts({
  habit,
  childProgress,
  isOverdue,
  selectedDateStr,
  todayStr,
  displayTime,
  t,
  locale,
}: BuildHabitRowMetaPartsParams): HabitRowMetaPart[] {
  const metaParts: HabitRowMetaPart[] = []
  if (childProgress && childProgress.total > 0) {
    metaParts.push(t('habits.rowProgress', childProgress))
  } else if (habit.dueTime) {
    const due = displayTime(habit.dueTime)
    metaParts.push(habit.dueEndTime ? `${due} - ${displayTime(habit.dueEndTime)}` : due)
  }
  if (isOverdue && !habit.isCompleted) metaParts.push({ kind: 'overdue' })
  if (habit.isBadHabit && (habit.isCompleted || habit.isLoggedInRange)) {
    metaParts.push({ kind: 'bad' })
  }
  if (!habit.isCompleted && selectedDateStr === todayStr) {
    const futureHint = computeHabitFutureHint(habit, todayStr, t, locale)
    if (futureHint) metaParts.push({ kind: 'future', label: futureHint })
  }
  return metaParts
}

interface BuildHabitRowAccessibilityLabelParams {
  title: string
  dotState: HabitStatus
  metaParts?: HabitRowMetaPart[]
  linkedGoal: boolean
  showStreak: boolean
  streak: number
  t: HabitCardTranslationAdapter
}

/** Assembles the row's screen-reader label with distinct visible metadata. */
export function buildHabitRowAccessibilityLabel({
  title,
  dotState,
  metaParts = [],
  linkedGoal,
  showStreak,
  streak,
  t,
}: BuildHabitRowAccessibilityLabelParams): string {
  const parts = [title, t(`habits.statusDot.${dotState}` as const)]
  for (const part of metaParts) {
    if (typeof part === 'string') parts.push(part)
    else if (part.kind === 'overdue' && dotState !== 'overdue') parts.push(t('habits.overdue'))
    else if (part.kind === 'bad' && dotState !== 'bad') parts.push(t('habits.statusDot.bad'))
  }
  if (linkedGoal) parts.push(t('habits.detail.linkedGoal'))
  if (showStreak) parts.push(`🔥 ${streak}`)
  return parts.join(', ')
}

/** Whether the row has any overflow-menu action available. */
export function hasHabitRowMenuActions(
  actions: HabitRowActions,
  isSelectMode: boolean,
): boolean {
  return (
    !!actions.onEdit ||
    !!actions.onDuplicate ||
    !!actions.onMoveParent ||
    !!actions.onAddSubHabit ||
    !!actions.onSkip ||
    !!actions.onReschedule ||
    !!actions.onDelete ||
    (!isSelectMode && !!actions.onEnterSelectMode) ||
    !!actions.onDrillInto
  )
}
