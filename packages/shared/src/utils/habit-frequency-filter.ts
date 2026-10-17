import type { HabitFrequencyFilter } from '../stores/ui-store'

export const HABIT_FREQUENCY_FILTER_OPTIONS = [
  { id: 'all', value: undefined, labelKey: 'common.all' },
  { id: 'Day', value: 'Day', labelKey: 'habits.filter.daily' },
  { id: 'Week', value: 'Week', labelKey: 'habits.filter.weekly' },
  { id: 'Month', value: 'Month', labelKey: 'habits.filter.monthly' },
  { id: 'Year', value: 'Year', labelKey: 'habits.filter.yearly' },
  { id: 'none', value: 'none', labelKey: 'habits.filter.oneTime' },
] as const

export function toggleHabitFrequencyFilter(
  current: HabitFrequencyFilter | undefined,
  selectedId: string,
): HabitFrequencyFilter | undefined {
  const option = HABIT_FREQUENCY_FILTER_OPTIONS.find(({ id }) => id === selectedId)
  if (!option) return current
  return option.value === current ? undefined : option.value
}
