import type { HabitFrequencyFilter } from "@orbit/shared/stores";
import type { HabitsFilter } from "@orbit/shared/types/habit";

export interface TodayFiltersInput {
  view: string;
  dateStr: string;
  isTodayDate: boolean;
  searchQuery: string;
  selectedFrequency: HabitFrequencyFilter | null;
  selectedTagIds: string[];
  showGeneralOnToday: boolean;
}

/**
 * Builds the {@link HabitsFilter} for the Today screen from the active view and
 * the current filter selections. Pure — mirrors the web TodayPage builder.
 */
export function buildTodayFilters(input: TodayFiltersInput): HabitsFilter {
  const {
    view,
    dateStr,
    isTodayDate,
    searchQuery,
    selectedFrequency,
    selectedTagIds,
    showGeneralOnToday,
  } = input;
  const trimmedSearch = searchQuery.trim();

  if (view === "general") {
    const filter: HabitsFilter = { isGeneral: true };
    if (trimmedSearch) filter.search = trimmedSearch;
    if (selectedTagIds.length > 0) filter.tagIds = selectedTagIds;
    return filter;
  }

  if (view === "today") {
    const filter: HabitsFilter = {
      dateFrom: dateStr,
      dateTo: dateStr,
      includeOverdue: isTodayDate,
      includeGeneral: showGeneralOnToday || undefined,
    };
    if (trimmedSearch) filter.search = trimmedSearch;
    if (selectedFrequency) filter.frequencyUnit = selectedFrequency;
    if (selectedTagIds.length > 0) filter.tagIds = selectedTagIds;
    return filter;
  }

  const filter: HabitsFilter = {};
  if (trimmedSearch) filter.search = trimmedSearch;
  if (selectedFrequency) filter.frequencyUnit = selectedFrequency;
  if (selectedTagIds.length > 0) filter.tagIds = selectedTagIds;
  return filter;
}
