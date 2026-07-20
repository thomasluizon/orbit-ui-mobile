import { computeHabitFutureHint, type HabitCardTranslationAdapter } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import type { StatusDotState } from '@/components/ui/status-dot'
import type { HabitRowMetaPart } from './habit-row-content'
import type { HabitRowActions } from './habit-row'

/** Maps the row's derived flags to its status-dot state. */
export function resolveHabitRowDotState(
  isDoneForRange: boolean,
  isBadHabit: boolean,
  isOverdue: boolean,
): StatusDotState {
  if (isDoneForRange) return 'done'
  if (isBadHabit) return 'bad'
  if (isOverdue) return 'overdue'
  return 'empty'
}

interface BuildHabitRowMetaPartsParams {
  habit: NormalizedHabit
  frequencyLabel: string
  isOverdue: boolean
  selectedDateStr: string
  todayStr: string
  displayTime: (time: string) => string
  t: HabitCardTranslationAdapter
  locale?: string | null
}

/** Builds the inline meta tokens (frequency, due-time, checklist progress, overdue,
 *  future hint) rendered between a habit row's title and trailing status. */
export function buildHabitRowMetaParts({
  habit,
  frequencyLabel,
  isOverdue,
  selectedDateStr,
  todayStr,
  displayTime,
  t,
  locale,
}: BuildHabitRowMetaPartsParams): HabitRowMetaPart[] {
  const metaParts: HabitRowMetaPart[] = []
  if (!habit.isGeneral && frequencyLabel) metaParts.push(frequencyLabel)
  if (habit.dueTime) {
    const due = displayTime(habit.dueTime)
    metaParts.push(habit.dueEndTime ? `${due} - ${displayTime(habit.dueEndTime)}` : due)
  }
  if (habit.checklistItems.length > 0) {
    const checked = habit.checklistItems.filter((item) => item.isChecked).length
    metaParts.push(`${checked}/${habit.checklistItems.length}`)
  }
  if (isOverdue) metaParts.push({ kind: 'overdue' })
  if (!habit.isCompleted && selectedDateStr === todayStr) {
    const futureHint = computeHabitFutureHint(habit, todayStr, t, locale)
    if (futureHint) metaParts.push({ kind: 'future', label: futureHint })
  }
  return metaParts
}

interface BuildHabitRowAccessibilityLabelParams {
  title: string
  dotState: StatusDotState
  linkedGoal: boolean
  showStreak: boolean
  streak: number
  t: HabitCardTranslationAdapter
}

/** Assembles the row's screen-reader label (title, status, linked-goal, streak). */
export function buildHabitRowAccessibilityLabel({
  title,
  dotState,
  linkedGoal,
  showStreak,
  streak,
  t,
}: BuildHabitRowAccessibilityLabelParams): string {
  const parts = [title, t(`habits.statusDot.${dotState}` as const)]
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
