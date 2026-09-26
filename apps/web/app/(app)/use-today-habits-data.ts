'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import { hashKey } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import { readShowGeneralOnToday } from '@/lib/show-general-on-today-storage'
import type { HabitsFilter, NormalizedHabit } from '@orbit/shared/types/habit'
import {
  EMPTY_CHILDREN_BY_PARENT,
  EMPTY_HABITS_BY_ID,
  useHabits,
} from '@/hooks/use-habits'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import { buildTodayFilters } from './today-model'
import type { TodayInitialHabits } from './today-initial-data'

function subscribeToShowGeneral() {
  return () => {}
}

function getShowGeneralClientSnapshot() {
  return readShowGeneralOnToday()
}

function getShowGeneralServerSnapshot() {
  return false
}

interface TodayHabitsDataParams {
  dateStr: string
  isTodayDate: boolean
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
  isTodayDate,
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
        isTodayDate,
        searchQuery: '',
        selectedFrequency: null,
        selectedTagIds: [],
        showGeneralOnToday,
      }),
    [dateStr, isTodayDate, showGeneralOnToday],
  )

  const queryKey = habitKeys.list(filters)
  /**
   * `initialHabits` is an RSC prop, fetched under whichever account was signed in when the
   * server rendered this page. That serves the previous account's habit titles to the next
   * one, so the payload stops counting the moment the account does.
   */
  const accountGeneration = useAccountGeneration()
  const [renderedAccountGeneration] = useState(accountGeneration)
  const accountHeldInitialHabits =
    accountGeneration === renderedAccountGeneration ? initialHabits : null
  const initialItems =
    accountHeldInitialHabits && hashKey(accountHeldInitialHabits.queryKey) === hashKey(queryKey)
      ? accountHeldInitialHabits.items
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
