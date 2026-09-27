import type { HabitFrequencyFilter } from '@orbit/shared/stores'
import type { HabitsFilter } from '@orbit/shared/types/habit'

export interface TodayFiltersInput {
  dateStr: string
  isTodayDate: boolean
  searchQuery: string
  selectedFrequency: HabitFrequencyFilter | null
  selectedTagIds: string[]
  showGeneralOnToday: boolean
}

/**
 * Builds the {@link HabitsFilter} for the Today screen from the current filter
 * selections. Mirrors the mobile TodayScreen builder.
 */
export function buildTodayFilters(input: TodayFiltersInput): HabitsFilter {
  const {
    dateStr,
    isTodayDate,
    searchQuery,
    selectedFrequency,
    selectedTagIds,
    showGeneralOnToday,
  } = input
  const trimmedSearch = searchQuery.trim()

  const filter: HabitsFilter = {
    dateFrom: dateStr,
    dateTo: dateStr,
    includeOverdue: isTodayDate,
    includeGeneral: showGeneralOnToday || undefined,
  }
  if (trimmedSearch) filter.search = trimmedSearch
  if (selectedFrequency) filter.frequencyUnit = selectedFrequency
  if (selectedTagIds.length > 0) filter.tagIds = selectedTagIds
  return filter
}
