'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { isToday } from 'date-fns'
import { parseShowGeneralOnTodayPreference } from '@orbit/shared/utils'
import type { HabitsFilter, NormalizedHabit } from '@orbit/shared/types/habit'
import {
  EMPTY_CHILDREN_BY_PARENT,
  EMPTY_HABITS_BY_ID,
  useHabits,
} from '@/hooks/use-habits'
import { buildTodayFilters } from './today-model'
import type { TodayInitialHabits } from './today-initial-data'

const SHOW_GENERAL_STORAGE_KEY = 'orbit_show_general_on_today'

function subscribeToShowGeneral() {
  return () => {}
}

function getShowGeneralClientSnapshot() {
  return parseShowGeneralOnTodayPreference(localStorage.getItem(SHOW_GENERAL_STORAGE_KEY))
}

function getShowGeneralServerSnapshot() {
  return false
}

interface TodayHabitsDataParams {
  dateStr: string
  selectedDate: Date
  initialHabits: TodayInitialHabits | null
}

export interface TodayHabitsData {
  filters: HabitsFilter
  habitsById: Map<string, NormalizedHabit>
  childrenByParent: Map<string, string[]>
  habitsCount: number
  hasFetched: boolean
  isFetching: boolean
  isRefetching: boolean
  showLoadError: boolean
  refetch: () => void
}

/**
 * Owns Today's habit query and its filter inputs: builds the {@link HabitsFilter}
 * from the active view and filter selections, runs the habits query, and derives
 * the load/refetch flags and day-progress summary. Pure extraction of TodayPage.
 */
export function useTodayHabitsData({
  dateStr,
  selectedDate,
  initialHabits,
}: TodayHabitsDataParams): TodayHabitsData {
  const showGeneralOnToday = useSyncExternalStore(
    subscribeToShowGeneral,
    getShowGeneralClientSnapshot,
    getShowGeneralServerSnapshot,
  )

  const filters = useMemo<HabitsFilter>(
    () =>
      buildTodayFilters({
        view: 'today',
        dateStr,
        isTodayDate: isToday(selectedDate),
        searchQuery: '',
        selectedFrequency: null,
        selectedTagIds: [],
        showGeneralOnToday,
      }),
    [dateStr, selectedDate, showGeneralOnToday],
  )

  const initialItems =
    initialHabits?.dateStr === dateStr && !showGeneralOnToday
      ? initialHabits.items
      : undefined
  const habitsQuery = useHabits(filters, initialItems)
  const habitsById = habitsQuery.data?.habitsById ?? EMPTY_HABITS_BY_ID
  const childrenByParent = habitsQuery.data?.childrenByParent ?? EMPTY_CHILDREN_BY_PARENT
  const habitsCount = habitsById.size
  const hasFetched = habitsQuery.dataUpdatedAt > 0
  const isRefetching = habitsQuery.isFetching && hasFetched
  const showLoadError = habitsQuery.isError && !hasFetched

  return {
    filters,
    habitsById,
    childrenByParent,
    habitsCount,
    hasFetched,
    isFetching: habitsQuery.isFetching,
    isRefetching,
    showLoadError,
    refetch: () => void habitsQuery.refetch(),
  }
}
