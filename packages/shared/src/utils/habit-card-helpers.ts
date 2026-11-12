import type { NormalizedHabit } from '../types/habit'
import { differenceInCalendarDays } from 'date-fns'
import { formatAPIDate, formatAPIDateInTimeZone, parseAPIDate, resolveHabitDetailRouteDate } from './dates'
import { hasHabitScheduleOnDate, isWithinOverdueWindow } from './habits'
import { isCompletedOneTimeHabit, isHabitDoneForRange } from './habit-visibility'
import { getDayOffset } from './today-date'
import { MAX_INSTANCE_HORIZON_DAYS } from '../api/constants'
import { formatLocaleDate } from './locale-format'
import { formatHabitMonthDaySchedule } from './month-days'

export type HabitCardStatus = 'completed' | 'pending' | 'overdue' | 'due-today' | 'future'

export type HabitCardTranslationAdapter = (
  key: string,
  params?: Record<string, string | number | Date>,
) => string

export type HabitCardMatchBadge = NonNullable<NormalizedHabit['searchMatches']>[number]

function plural(text: string, count: number): string {
  if (!text.includes(' | ')) return text
  const forms = text.split(' | ').map((part) => part.trim())
  if (forms.length === 2) {
    return count === 1 ? (forms[0] ?? text) : (forms[1] ?? text)
  }
  if (forms.length === 3) {
    if (count === 0) return forms[0] ?? text
    if (count === 1) return forms[1] ?? text
    return forms[2] ?? text
  }
  return text
}

export function computeHabitCardStatus(
  habit: Pick<
    NormalizedHabit,
    | 'isCompleted'
    | 'isLoggedInRange'
    | 'isGeneral'
    | 'isOverdue'
    | 'frequencyUnit'
    | 'instances'
    | 'scheduledDates'
    | 'dueDate'
  >,
  selectedDate?: Date,
): HabitCardStatus {
  if (habit.isCompleted || habit.isLoggedInRange) return 'completed'
  if (habit.isGeneral) {
    return selectedDate ? 'due-today' : 'pending'
  }
  if (habit.isOverdue) return 'overdue'
  const selectedDateStr = formatAPIDate(selectedDate ?? new Date())
  const hasTodaySchedule = hasHabitScheduleOnDate(habit, selectedDateStr)
  if (hasTodaySchedule) return 'due-today'
  return 'pending'
}

export function computeHabitFrequencyLabel(
  habit: Pick<
    NormalizedHabit,
    | 'isGeneral'
    | 'frequencyUnit'
    | 'frequencyQuantity'
    | 'days'
    | 'isFlexible'
  > & Partial<Pick<NormalizedHabit, 'monthDays'>>,
  t: HabitCardTranslationAdapter,
): string | null {
  if (habit.isGeneral) return null
  const { frequencyUnit, frequencyQuantity, days, isFlexible } = habit
  if (!frequencyUnit) return null
  if (frequencyUnit === 'Month' && !isFlexible && habit.monthDays?.length) {
    return formatHabitMonthDaySchedule(habit.monthDays, frequencyQuantity ?? 1, t)
  }
  if (isFlexible) {
    return t('habits.frequency.flexibleLabel', {
      n: frequencyQuantity ?? 1,
      unit: t(`habits.form.unit${frequencyUnit}`),
    })
  }
  if (frequencyUnit === 'Day' && frequencyQuantity === 1 &&
    (days.length === 0 || (days.length === 7 && new Set(days).size === 7))) {
    return t('habits.frequency.everyDay')
  }
  if (frequencyQuantity === 1 && days.length > 0) {
    return days
      .map((day) => t(`dates.daysShort.${day.toLowerCase()}`))
      .join(', ')
  }
  if (frequencyQuantity === 1) {
    return t(`habits.frequency.every${frequencyUnit}`)
  }
  return plural(
    t(`habits.frequency.everyN${frequencyUnit}s`, {
      n: frequencyQuantity ?? 1,
    }),
    frequencyQuantity ?? 1,
  )
}

/**
 * One-time tasks (no `frequencyUnit`) stay loggable within the overdue window, including
 * future dates; recurring and flexible habits cannot log a future date; recurring
 * non-flexible habits must be scheduled on the date (or overdue today).
 */
export function canLogHabitOnDate(
  habit: Pick<
    NormalizedHabit,
    'frequencyUnit' | 'isFlexible' | 'isOverdue' | 'scheduledDates' | 'instances' | 'dueDate' | 'isSkippedOnDate'
  >,
  date: string,
  today: string,
): boolean {
  if (habit.isSkippedOnDate) return false
  const isRecurringOrFlexible = habit.frequencyUnit != null
  if (date > today && isRecurringOrFlexible) return false
  if (!isWithinOverdueWindow(date, today)) return false
  if (isRecurringOrFlexible && !habit.isFlexible && !hasHabitScheduleOnDate(habit, date)) {
    const isOverdueToday = date === today && habit.isOverdue
    if (!isOverdueToday) return false
  }
  return true
}

export function getHabitLogDateDecision(
  habit: (Parameters<typeof canLogHabitOnDate>[0] & Pick<NormalizedHabit, 'createdAtUtc' | 'createdAtUtcIsInherited' | 'parentId'>) | null | undefined,
  date: string,
  today: string,
  timeZone: string | null | undefined,
  confirmed = false,
  intent: 'log' | 'unlog' = 'log',
): 'write' | 'confirm' | 'confirm-permanent-unlog' | 'block' {
  if (!habit || resolveHabitDetailRouteDate(date) !== date || !isWithinOverdueWindow(date, today) || (date > today && habit.frequencyUnit !== null)) return 'block'
  const createdDate = formatAPIDateInTimeZone(new Date(habit.createdAtUtc), timeZone)
  if (habit.parentId !== null && habit.createdAtUtcIsInherited === false && date < createdDate) {
    if (intent === 'log') return 'block'
    return confirmed ? 'write' : 'confirm-permanent-unlog'
  }
  return (habit.parentId !== null && habit.createdAtUtcIsInherited !== false && date < today) || (habit.parentId === null && date < createdDate) || getDayOffset(date, today) > MAX_INSTANCE_HORIZON_DAYS
    ? confirmed ? 'write' : 'confirm'
    : 'write'
}

export function getHabitLogDateConfirmationKeys(intent?: 'log' | 'unlog', permanent = false): {
  message: 'habits.detail.logDateConfirmUnlogMessage' | 'habits.detail.logDateConfirmPermanentUnlogMessage' | 'habits.detail.logDateConfirmMessage'
  action: 'habits.detail.logDateConfirmUnlog' | 'habits.detail.logDateConfirmLog'
} {
  if (intent === 'unlog' && permanent) return { message: 'habits.detail.logDateConfirmPermanentUnlogMessage', action: 'habits.detail.logDateConfirmUnlog' }
  return intent === 'unlog'
    ? { message: 'habits.detail.logDateConfirmUnlogMessage', action: 'habits.detail.logDateConfirmUnlog' } as const
    : { message: 'habits.detail.logDateConfirmMessage', action: 'habits.detail.logDateConfirmLog' } as const
}

/**
 * The words for how far away a future due date is: the next day, relative when due within a week (`in 6d`),
 * otherwise the absolute scheduled date (`scheduled 13 Jun`). The next day reads `due tomorrow`, true
 * for a row that has not happened yet; `loggedParent` gives a parent that comes back its own words.
 * Returns null when the habit's `dueDate` is today or in the past.
 */
function formatNextDueDistance(
  habit: Pick<NormalizedHabit, 'dueDate'>,
  today: string,
  t: HabitCardTranslationAdapter,
  locale: string | null | undefined,
  loggedParent: boolean,
): string | null {
  if (!habit.dueDate || habit.dueDate <= today) return null
  const days = differenceInCalendarDays(parseAPIDate(habit.dueDate), parseAPIDate(today))
  if (days <= 0) return null
  if (days === 1) return loggedParent ? t('habits.schedule.nextDueTomorrow') : t('habits.schedule.dueTomorrow')
  if (days <= 7) return t('habits.schedule.dueInDays', { count: days })
  return t('habits.schedule.scheduledOn', {
    date: formatLocaleDate(habit.dueDate, locale, { month: 'short', day: 'numeric' }),
  })
}

/** The row inputs that web and mobile both have: the selected and current dates, and the sub-habits the view renders. */
interface HabitRowDueContext {
  selectedDate: string
  today: string
  hasChildren: boolean
}

/**
 * The next due label of a habit row: only on today, and never for a finished habit (a completed one-time
 * task, or a recurring habit whose next due date passes its end date). The API marks both `isCompleted`;
 * this reads the end date instead, because a detail child row scopes `isCompleted` to the selected date.
 */
export function computeHabitRowNextDueHint(
  habit: Pick<NormalizedHabit, 'dueDate' | 'endDate' | 'isCompleted' | 'isLoggedInRange' | 'frequencyUnit' | 'hasSubHabits'>,
  { selectedDate, today, hasChildren }: HabitRowDueContext,
  t: HabitCardTranslationAdapter,
  locale?: string | null,
): string | null {
  if (selectedDate !== today || isCompletedOneTimeHabit(habit)) return null
  if (habit.endDate && habit.dueDate && habit.dueDate > habit.endDate) return null
  return formatNextDueDistance(habit, today, t, locale, isLoggedParentHabitRow(habit, hasChildren))
}

/**
 * A parent logged for the selected date: it has sub-habits, in its data or in the current view, and its
 * own log is done for the date. It dims its title and shows its next due label as visible metadata;
 * every other row keeps the label for screen readers only. Done comes from the habit on both platforms.
 */
export function isLoggedParentHabitRow(
  habit: Pick<NormalizedHabit, 'hasSubHabits' | 'isCompleted' | 'isLoggedInRange'>,
  hasChildren: boolean,
): boolean {
  return (habit.hasSubHabits || hasChildren) && isHabitDoneForRange(habit)
}

export function computeHabitMatchBadges(
  searchQuery: string,
  habit: Pick<NormalizedHabit, 'searchMatches'>,
): HabitCardMatchBadge[] {
  if (!searchQuery || !habit.searchMatches) return []
  return habit.searchMatches.map(({ field, value }) => ({ field, value }))
}

export function getHabitTypeLabelKey(habit: Pick<NormalizedHabit, 'isGeneral' | 'isFlexible' | 'frequencyUnit'>): 'habits.form.typeTask' | 'habits.form.typeHabit' {
  return !habit.isGeneral && !habit.isFlexible && !habit.frequencyUnit ? 'habits.form.typeTask' : 'habits.form.typeHabit'
}

export function getHabitRowTypeLabelKey(habit: Pick<NormalizedHabit, 'isGeneral' | 'isFlexible' | 'frequencyUnit'>): 'habits.rowTypeTask' | 'habits.form.typeHabit' {
  return getHabitTypeLabelKey(habit) === 'habits.form.typeTask' ? 'habits.rowTypeTask' : 'habits.form.typeHabit'
}
