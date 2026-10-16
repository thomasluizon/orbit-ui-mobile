import type { ActiveView, HabitFrequencyFilter } from '../stores/ui-store'
import type { HabitsFilter } from '../types/habit'

export interface HabitViewFiltersInput {
  view?: ActiveView
  dateStr: string
  isTodayDate: boolean
  searchQuery: string
  selectedFrequency: HabitFrequencyFilter | null
  selectedTagIds: string[]
  showGeneralOnToday: boolean
}

export function buildHabitViewFilters({
  view = 'today',
  dateStr,
  isTodayDate,
  searchQuery,
  selectedFrequency,
  selectedTagIds,
  showGeneralOnToday,
}: HabitViewFiltersInput): HabitsFilter {
  const filter: HabitsFilter = {}
  if (view === 'today') {
    filter.dateFrom = dateStr
    filter.dateTo = dateStr
    filter.includeOverdue = isTodayDate
    filter.includeGeneral = showGeneralOnToday || undefined
  }
  if (view === 'general') filter.isGeneral = true
  if (searchQuery.trim()) filter.search = searchQuery.trim()
  if (selectedFrequency && view !== 'general') filter.frequencyUnit = selectedFrequency
  if (selectedTagIds.length) filter.tagIds = selectedTagIds
  return filter
}
