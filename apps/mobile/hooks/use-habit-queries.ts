import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { endOfMonth, startOfMonth } from 'date-fns'
import { habitKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import {
  buildCalendarDayMap,
  buildHabitQueryString,
  buildUrlWithQuery,
  fetchAllPaginatedItems,
  formatAPIDate,
  normalizeHabitQueryData,
  sortNormalizedHabits,
} from '@orbit/shared/utils'
import type {
  CalendarMonthResponse,
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

export interface NormalizedHabitsData {
  habitsById: Map<string, NormalizedHabit>
  childrenByParent: Map<string, string[]>
  topLevelHabits: NormalizedHabit[]
  totalCount: number
  totalPages: number
  currentPage: number
}

interface SummaryResponse {
  summary: string
  fromCache: boolean
}

interface UseSummaryOptions {
  date: string
  locale: string
  hasProAccess: boolean
  aiSummaryEnabled: boolean
}

export function useHabits(filters: HabitsFilter) {
  const query = useQuery({
    queryKey: habitKeys.list(filters as Record<string, unknown>),
    queryFn: async (): Promise<HabitScheduleItem[]> => {
      const firstQuery = buildUrlWithQuery(API.habits.list, buildHabitQueryString(filters))
      const firstPage = await apiClient<PaginatedResponse<HabitScheduleItem>>(firstQuery)

      if (filters.dateFrom || firstPage.totalPages <= 1) {
        return firstPage.items
      }

      return fetchAllPaginatedItems<HabitScheduleItem, PaginatedResponse<HabitScheduleItem>>(
        async (page) => {
          if (page === 1) return firstPage

          const pageFilters = { ...filters, page }
          const pageUrl = buildUrlWithQuery(API.habits.list, buildHabitQueryString(pageFilters))
          return apiClient<PaginatedResponse<HabitScheduleItem>>(pageUrl)
        },
      )
    },
    staleTime: QUERY_STALE_TIMES.habits,
    select: (items): NormalizedHabitsData => normalizeHabitQueryData(items),
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
    queryKey: habitKeys.detail(id ?? ''),
    queryFn: () => apiClient<HabitFullDetail>(API.habits.detail(id ?? '')),
    enabled: !!id,
    staleTime: QUERY_STALE_TIMES.habits,
  })
}

export function useCalendarData(currentMonth: Date) {
  const monthStart = formatAPIDate(startOfMonth(currentMonth))
  const monthEnd = formatAPIDate(endOfMonth(currentMonth))

  const query = useQuery({
    queryKey: habitKeys.calendar(monthStart, monthEnd),
    queryFn: () =>
      apiClient<CalendarMonthResponse>(
        `${API.habits.calendarMonth}?dateFrom=${monthStart}&dateTo=${monthEnd}`,
      ),
    staleTime: QUERY_STALE_TIMES.habits,
  })

  const dayMap = useMemo(() => {
    if (!query.data) return new Map()
    return buildCalendarDayMap(query.data)
  }, [query.data])

  return {
    dayMap,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message ?? null,
    refresh: () => query.refetch(),
  }
}

export function useSummary({
  date,
  locale,
  hasProAccess,
  aiSummaryEnabled,
}: UseSummaryOptions) {
  const enabled = hasProAccess && aiSummaryEnabled && !!date

  const query = useQuery({
    queryKey: habitKeys.summary(date, date),
    queryFn: async (): Promise<string> => {
      const params = new URLSearchParams({
        dateFrom: date,
        dateTo: date,
        includeOverdue: 'true',
        language: locale,
      })

      const data = await apiClient<SummaryResponse>(
        `${API.habits.summary}?${params.toString()}`,
      )
      return data.summary
    },
    enabled,
    staleTime: QUERY_STALE_TIMES.habits,
    refetchOnWindowFocus: false,
  })

  return {
    summary: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useTotalHabitCount(): number {
  const query = useQuery({
    queryKey: habitKeys.count(),
    queryFn: async () => {
      const url = buildUrlWithQuery(API.habits.list, 'pageSize=1')
      const data = await apiClient<PaginatedResponse<HabitScheduleItem>>(url)
      return data.totalCount
    },
    staleTime: QUERY_STALE_TIMES.habits,
  })

  return query.data ?? 0
}

export {
  normalizeHabits,
  sortNormalizedHabits as sortByPosition,
} from '@orbit/shared/utils'
