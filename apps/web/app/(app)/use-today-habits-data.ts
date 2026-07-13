'use client'

import { useCallback, useMemo } from 'react'
import { isToday } from 'date-fns'
import { useTranslations } from 'next-intl'
import { computeDayProgress, parseShowGeneralOnTodayPreference } from '@orbit/shared/utils'
import type { HabitFrequencyFilter } from '@orbit/shared/stores'
import type { HabitsFilter, NormalizedHabit } from '@orbit/shared/types/habit'
import { useUIStore } from '@/stores/ui-store'
import {
  EMPTY_CHILDREN_BY_PARENT,
  EMPTY_HABITS_BY_ID,
  useHabits,
} from '@/hooks/use-habits'
import { buildTodayFilters } from './today-model'

interface TodayHabitsDataParams {
  currentActiveView: string
  dateStr: string
  selectedDate: Date
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
  dayProgress: ReturnType<typeof computeDayProgress>
  showDayProgress: boolean
  frequencyOptions: Array<{ key: HabitFrequencyFilter; label: string }>
  selectedFrequency: HabitFrequencyFilter | null
  setSelectedFrequency: (frequency: HabitFrequencyFilter | null) => void
  selectedTagIds: string[]
  toggleTagFilter: (tagId: string) => void
}

/**
 * Owns Today's habit query and its filter inputs: builds the {@link HabitsFilter}
 * from the active view and filter selections, runs the habits query, and derives
 * the load/refetch flags and day-progress summary. Pure extraction of TodayPage.
 */
export function useTodayHabitsData({
  currentActiveView,
  dateStr,
  selectedDate,
}: TodayHabitsDataParams): TodayHabitsData {
  const t = useTranslations()
  const searchQueryStore = useUIStore((s) => s.searchQuery)
  const selectedFrequency = useUIStore((s) => s.selectedFrequency)
  const setSelectedFrequency = useUIStore((s) => s.setSelectedFrequency)
  const selectedTagIds = useUIStore((s) => s.selectedTagIds)
  const setSelectedTagIds = useUIStore((s) => s.setSelectedTagIds)

  const showGeneralOnToday = useMemo(() => {
    if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') return false
    return parseShowGeneralOnTodayPreference(localStorage.getItem('orbit_show_general_on_today'))
  }, [])

  const frequencyOptions = useMemo<Array<{ key: HabitFrequencyFilter; label: string }>>(
    () => [
      { key: 'Day', label: t('habits.filter.daily') },
      { key: 'Week', label: t('habits.filter.weekly') },
      { key: 'Month', label: t('habits.filter.monthly') },
      { key: 'Year', label: t('habits.filter.yearly') },
      { key: 'none', label: t('habits.filter.oneTime') },
    ],
    [t],
  )

  const filters = useMemo<HabitsFilter>(
    () =>
      buildTodayFilters({
        view: currentActiveView,
        dateStr,
        isTodayDate: isToday(selectedDate),
        searchQuery: searchQueryStore,
        selectedFrequency,
        selectedTagIds,
        showGeneralOnToday,
      }),
    [currentActiveView, dateStr, selectedDate, searchQueryStore, selectedFrequency, selectedTagIds, showGeneralOnToday],
  )

  const habitsQuery = useHabits(filters)
  const habitsById = habitsQuery.data?.habitsById ?? EMPTY_HABITS_BY_ID
  const childrenByParent = habitsQuery.data?.childrenByParent ?? EMPTY_CHILDREN_BY_PARENT
  const habitsCount = habitsById.size
  const hasFetched = habitsQuery.dataUpdatedAt > 0
  const isRefetching = habitsQuery.isFetching && hasFetched
  const showLoadError = habitsQuery.isError && !hasFetched

  const dayProgress = useMemo(
    () => computeDayProgress(habitsById, dateStr),
    [habitsById, dateStr],
  )
  const showDayProgress = currentActiveView === 'today' && dayProgress.total > 0

  const toggleTagFilter = useCallback(
    (tagId: string) => {
      const idx = selectedTagIds.indexOf(tagId)
      if (idx >= 0) {
        setSelectedTagIds(selectedTagIds.filter((id) => id !== tagId))
        return
      }

      setSelectedTagIds([...selectedTagIds, tagId])
    },
    [selectedTagIds, setSelectedTagIds],
  )

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
    dayProgress,
    showDayProgress,
    frequencyOptions,
    selectedFrequency,
    setSelectedFrequency,
    selectedTagIds,
    toggleTagFilter,
  }
}
