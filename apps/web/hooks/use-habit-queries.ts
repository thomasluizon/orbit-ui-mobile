'use client'

import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { habitKeys, QUERY_STALE_TIMES, HABITS_REFETCH_INTERVAL } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import {
  buildHabitQueryString,
  buildUrlWithQuery,
  fetchAllPaginatedItems,
  normalizeHabitQueryData,
  sortNormalizedHabits,
} from '@orbit/shared/utils'
import type {
  HabitDetail,
  HabitFullDetail,
  HabitMetrics,
  HabitsFilter,
  HabitScheduleItem,
  NormalizedHabit,
  PaginatedResponse,
} from '@orbit/shared/types/habit'
import type { HabitLog } from '@orbit/shared/types/calendar'
import { fetchJson } from '@/lib/api-fetch'

export interface NormalizedHabitsData {
  habitsById: Map<string, NormalizedHabit>
  childrenByParent: Map<string, string[]>
  topLevelHabits: NormalizedHabit[]
  totalCount: number
  totalPages: number
  currentPage: number
}

const selectNormalizedHabits = (items: HabitScheduleItem[]): NormalizedHabitsData =>
  normalizeHabitQueryData(items)

export const EMPTY_HABITS_BY_ID: Map<string, NormalizedHabit> = new Map()
export const EMPTY_CHILDREN_BY_PARENT: Map<string, string[]> = new Map()
export const EMPTY_NORMALIZED_HABITS: NormalizedHabit[] = []

function withDefaultPageSize(filters: HabitsFilter): HabitsFilter {
  if (filters.dateFrom || filters.pageSize) return filters
  return { ...filters, pageSize: 200 }
}

export function useHabits(filters: HabitsFilter) {
  const query = useQuery({
    queryKey: habitKeys.list(filters as Record<string, unknown>),
    queryFn: async (): Promise<HabitScheduleItem[]> => {
      const requestFilters = withDefaultPageSize(filters)
      const firstQuery = buildUrlWithQuery(API.habits.list, buildHabitQueryString(requestFilters))
      const firstPage = await fetchJson<PaginatedResponse<HabitScheduleItem>>(firstQuery)

      if (requestFilters.dateFrom || firstPage.totalPages <= 1) {
        return firstPage.items
      }

      return fetchAllPaginatedItems<HabitScheduleItem, PaginatedResponse<HabitScheduleItem>>(
        async (page) => {
          if (page === 1) return firstPage

          const pageFilters = { ...requestFilters, page }
          const pageUrl = buildUrlWithQuery(API.habits.list, buildHabitQueryString(pageFilters))
          return fetchJson<PaginatedResponse<HabitScheduleItem>>(pageUrl)
        },
      )
    },
    staleTime: QUERY_STALE_TIMES.habits,
    select: selectNormalizedHabits,
    refetchInterval: () => {
      const isSingleDay = !!filters.dateFrom && filters.dateFrom === filters.dateTo
      if (!isSingleDay) return false
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
      return HABITS_REFETCH_INTERVAL
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: 'always',
  })

  const getChildren = useCallback(
    (parentId: string): NormalizedHabit[] => {
      const data = query.data
      if (!data) return []
      const ids = data.childrenByParent.get(parentId) ?? []
      return ids
        .map((id) => data.habitsById.get(id))
        .filter((habit): habit is NormalizedHabit => habit !== undefined)
        .sort(sortNormalizedHabits)
    },
    [query.data],
  )

  return {
    ...query,
    getChildren,
  }
}

export function useHabitDetail(id: string | null) {
  return useQuery({
    queryKey: habitKeys.detail(id ?? ''),
    queryFn: () => fetchJson<HabitDetail>(API.habits.get(id ?? '')),
    enabled: !!id,
    staleTime: QUERY_STALE_TIMES.habits,
  })
}

export function useHabitMetrics(id: string | null) {
  const query = useQuery({
    queryKey: habitKeys.metrics(id ?? ''),
    queryFn: () => fetchJson<HabitMetrics>(API.habits.metrics(id ?? '')),
    enabled: !!id,
    staleTime: QUERY_STALE_TIMES.habits,
  })

  return {
    ...query,
    weeklyPercentage: query.data?.weeklyCompletionRate ?? 0,
    monthlyPercentage: query.data?.monthlyCompletionRate ?? 0,
  }
}

export function useHabitLogs(id: string | null) {
  return useQuery({
    queryKey: habitKeys.logs(id ?? ''),
    queryFn: () => fetchJson<HabitLog[]>(`${API.habits.get(id ?? '')}/logs`),
    enabled: !!id,
    staleTime: QUERY_STALE_TIMES.habits,
  })
}

export function useHabitFullDetail(id: string | null) {
  return useQuery({
    queryKey: habitKeys.fullDetail(id ?? ''),
    queryFn: () => fetchJson<HabitFullDetail>(API.habits.detail(id ?? '')),
    enabled: !!id,
    staleTime: QUERY_STALE_TIMES.habits,
  })
}

export function useTotalHabitCount(): number {
  const query = useQuery({
    queryKey: habitKeys.count(),
    queryFn: async () => {
      const data = await fetchJson<{ count: number }>(API.habits.count)
      return data.count
    },
    staleTime: QUERY_STALE_TIMES.habits,
  })

  return query.data ?? 0
}

export {
  normalizeHabits,
  sortNormalizedHabits as sortByPosition,
} from '@orbit/shared/utils'
