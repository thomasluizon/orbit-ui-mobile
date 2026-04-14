import type { NormalizedHabit } from '../types/habit'
import { formatAPIDate } from './dates'
import { hasHabitScheduleOnDate } from './habits'

export type HabitCardStatus = 'completed' | 'pending' | 'overdue' | 'due-today'

export type HabitCardTranslationAdapter = (
  key: string,
  params?: Record<string, string | number | Date>,
) => string

export interface HabitCardStatusBadge {
  text: string
  color: string
  bg: string
}

export interface HabitCardMatchBadge {
  label: string
}

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

function truncate(value: string, max = 20): string {
  return value.length > max ? `${value.slice(0, max)}...` : value
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
  if (habit.isOverdue && !habit.frequencyUnit) return 'overdue'
  const selectedDateStr = formatAPIDate(selectedDate ?? new Date())
  const hasTodaySchedule = hasHabitScheduleOnDate(habit, selectedDateStr)
  if (hasTodaySchedule) return 'due-today'
  return 'pending'
}

export function computeHabitStatusBadge(
  status: HabitCardStatus,
  t: HabitCardTranslationAdapter,
): HabitCardStatusBadge | null {
  if (status !== 'overdue') return null
  return {
    text: t('habits.overdue'),
    color: 'text-red-500',
    bg: 'bg-red-500/10',
  }
}

export function computeHabitFrequencyLabel(
  habit: Pick<
    NormalizedHabit,
    | 'isGeneral'
    | 'frequencyUnit'
    | 'frequencyQuantity'
    | 'days'
    | 'isFlexible'
  >,
  t: HabitCardTranslationAdapter,
): string {
  if (habit.isGeneral) return t('habits.generalHabit')
  const { frequencyUnit, frequencyQuantity, days, isFlexible } = habit
  if (!frequencyUnit) return t('habits.oneTimeTask')
  if (isFlexible) {
    return t('habits.frequency.flexibleLabel', {
      n: frequencyQuantity ?? 1,
      unit: t(`habits.form.unit${frequencyUnit}`),
    })
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

export function computeHabitFlexibleProgressLabel(
  habit: Pick<
    NormalizedHabit,
    'isFlexible' | 'flexibleTarget' | 'frequencyQuantity' | 'flexibleCompleted' | 'frequencyUnit'
  >,
  t: HabitCardTranslationAdapter,
): string | null {
  if (!habit.isFlexible) return null
  const target = habit.flexibleTarget ?? habit.frequencyQuantity ?? 1
  const done = habit.flexibleCompleted ?? 0
  const unit = habit.frequencyUnit ? t(`habits.form.unit${habit.frequencyUnit}`) : ''
  return t('habits.frequency.flexibleProgress', { done, target, unit })
}

export function computeHabitMatchBadges(
  searchQuery: string,
  habit: Pick<NormalizedHabit, 'searchMatches'>,
  t: HabitCardTranslationAdapter,
): HabitCardMatchBadge[] {
  if (!searchQuery || !habit.searchMatches) return []
  return habit.searchMatches
    .filter((match) => match.field !== 'title')
    .map((match) => {
      if (match.field === 'tag') {
        return { label: t('habits.search.matchTag', { value: truncate(match.value ?? '') }) }
      }
      if (match.field === 'child') {
        return { label: t('habits.search.matchChild', { value: truncate(match.value ?? '') }) }
      }
      return { label: t('habits.search.matchDescription') }
    })
}
