import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { habitKeys, QUERY_STALE_TIMES, HABITS_REFETCH_INTERVAL } from '@orbit/shared/query'
import { isAppActive, isOnline } from '@/lib/query-client'
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
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'

export interface NormalizedHabitsData {
  habitsById: Map<string, NormalizedHabit>
  childrenByParent: Map<string, string[]>
  topLevelHabits: NormalizedHabit[]
  totalCount: number
  totalPages: number
  currentPage: number
}

// Module-level stable reference so TanStack Query's select doesn't produce a fresh
// data object every render. Without this, every consumer of useHabits re-renders on
// every state change, defeating React.memo on HabitCard.
const selectNormalizedHabits = (items: HabitScheduleItem[]): NormalizedHabitsData =>
  normalizeHabitQueryData(items)

// Stable empty fallbacks for components that destructure useHabits data before it
// loads. Using `?? new Map()` inline creates a fresh reference each render which
// also defeats React.memo downstream. Types match the non-readonly NormalizedHabitsData
// shape so consumers don't need to fight the type system -- treat these as read-only
// by convention.
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
      const firstPage = await apiClient<PaginatedResponse<HabitScheduleItem>>(firstQuery)

      if (requestFilters.dateFrom || firstPage.totalPages <= 1) {
        return firstPage.items
      }

      return fetchAllPaginatedItems<HabitScheduleItem, PaginatedResponse<HabitScheduleItem>>(
        async (page) => {
          if (page === 1) return firstPage

          const pageFilters = { ...requestFilters, page }
          const pageUrl = buildUrlWithQuery(API.habits.list, buildHabitQueryString(pageFilters))
          return apiClient<PaginatedResponse<HabitScheduleItem>>(pageUrl)
        },
      )
    },
    staleTime: QUERY_STALE_TIMES.habits,
    select: selectNormalizedHabits,
    // Auto-refresh Today-style single-day queries every ~5 minutes so the list stays
    // fresh across midnight rollovers and other-device logs. Calendar/month
    // range queries stay event-driven only. Polling pauses when the app is
    // backgrounded or offline.
    refetchInterval: () => {
      const isSingleDay = !!filters.dateFrom && filters.dateFrom === filters.dateTo
      if (!isSingleDay) return false
      if (!isAppActive()) return false
      if (!isOnline()) return false
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
    queryFn: () => apiClient<HabitDetail>(API.habits.get(id ?? '')),
    enabled: !!id,
    staleTime: QUERY_STALE_TIMES.habits,
  })
}

export function useHabitMetrics(id: string | null) {
  const query = useQuery({
    queryKey: habitKeys.metrics(id ?? ''),
    queryFn: () => apiClient<HabitMetrics>(API.habits.metrics(id ?? '')),
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
    queryFn: () => apiClient<HabitLog[]>(`${API.habits.get(id ?? '')}/logs`),
    enabled: !!id,
    staleTime: QUERY_STALE_TIMES.habits,
  })
}

export function useHabitFullDetail(id: string | null) {
  return useQuery({
    queryKey: habitKeys.fullDetail(id ?? ''),
    queryFn: () => apiClient<HabitFullDetail>(API.habits.detail(id ?? '')),
    enabled: !!id,
    staleTime: QUERY_STALE_TIMES.habits,
  })
}

// useCalendarData lives in ./use-calendar-data for parity with apps/web/hooks.
// useSummary lives in ./use-summary for parity with apps/web/hooks.

function useHabitCountQuery() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: habitKeys.count(),
    queryFn: async () => {
      const data = await apiClient<{ count: number }>(API.habits.count)
      return data.count
    },
    enabled: isAuthenticated,
    staleTime: QUERY_STALE_TIMES.habits,
  })
}

export function useTotalHabitCount(): number {
  return useHabitCountQuery().data ?? 0
}

/** Total habit count plus whether the count query has settled, for gating first-run decisions. */
export function useHabitCountLoaded(): { count: number; isLoaded: boolean } {
  const query = useHabitCountQuery()
  return { count: query.data ?? 0, isLoaded: query.isSuccess }
}

export {
  normalizeHabits,
  sortNormalizedHabits as sortByPosition,
} from '@orbit/shared/utils'
