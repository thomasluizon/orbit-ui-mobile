import { useCallback } from 'react'
import { getAccountGeneration } from '@/lib/session-epoch'
import { CancelledError, useQuery, useQueryClient } from '@tanstack/react-query'
import { deduplicateHabitList, isCachedHabitDeleted, habitKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import {
  buildHabitQueryString,
  buildUrlWithQuery,
  fetchAllPaginatedItems,
  habitListQueryFilters,
  normalizeHabitQueryData,
  loadHabitListSchedule,
  shouldFetchAllHabitPages,
  sortNormalizedHabits,
} from '@orbit/shared/utils'
import type {
  HabitsFilter,
  HabitScheduleItem,
  NormalizedHabit,
  PaginatedResponse,
} from '@orbit/shared/types/habit'
import {
  createPaginatedSchema,
  habitDetailSchema,
  habitFullDetailSchema,
  habitMetricsSchema,
  habitScheduleItemSchema,
} from '@orbit/shared/types/habit'
import { habitLogSchema } from '@orbit/shared/types/calendar'
import { apiClient } from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth-store'
import { prepareListLayoutMotion } from '@/lib/list-motion'

export interface NormalizedHabitsData {
  habitsById: Map<string, NormalizedHabit>
  childrenByParent: Map<string, string[]>
  topLevelHabits: NormalizedHabit[]
  totalCount: number
  totalPages: number
  currentPage: number
}

const habitPageSchema = createPaginatedSchema(habitScheduleItemSchema)

const selectNormalizedHabits = (items: HabitScheduleItem[]): NormalizedHabitsData =>
  normalizeHabitQueryData(items)

export const EMPTY_HABITS_BY_ID: Map<string, NormalizedHabit> = new Map()
export const EMPTY_CHILDREN_BY_PARENT: Map<string, string[]> = new Map()
export const EMPTY_NORMALIZED_HABITS: NormalizedHabit[] = []

function withDefaultPageSize(filters: HabitsFilter): HabitsFilter {
  if (filters.dateFrom || filters.pageSize) return filters
  return { ...filters, pageSize: 200 }
}

export function useHabits(filters: HabitsFilter, options: { completeDay?: boolean; scheduleDate?: string; enabled?: boolean } = {}) {
  const completeDay = options.completeDay ?? false
  const queryClient = useQueryClient()
  const scheduleDate = filters.dateFrom || filters.isGeneral ? undefined : options.scheduleDate
  const query = useQuery({
    queryKey: habitKeys.list(habitListQueryFilters(filters, completeDay, scheduleDate)),
    enabled: options.enabled,
    queryFn: async (): Promise<HabitScheduleItem[]> => {
      const accountGeneration = getAccountGeneration()
      const readPage = async (pageFilters: HabitsFilter) => {
        const page = habitPageSchema.parse(await apiClient<unknown>(
          buildUrlWithQuery(API.habits.list, buildHabitQueryString(pageFilters)),
        ))
        if (getAccountGeneration() !== accountGeneration) throw new CancelledError({ silent: true })
        return page
      }
      const enrichSchedule = (items: HabitScheduleItem[]) => loadHabitListSchedule(items, scheduleDate, readPage)
      const requestFilters = withDefaultPageSize(filters)
      const firstPage = await readPage(requestFilters)

      if (!shouldFetchAllHabitPages(requestFilters, completeDay, firstPage.totalPages)) {
        queryClient.setQueryData(habitKeys.listTotalCount(filters), firstPage.totalCount)
        const scheduled = await enrichSchedule(firstPage.items)
        prepareListLayoutMotion('habits')
        return scheduled
      }

      const items = await fetchAllPaginatedItems<HabitScheduleItem, PaginatedResponse<HabitScheduleItem>>(
        async (page) => {
          if (page === 1) return firstPage

          const pageFilters = { ...requestFilters, page }
          return readPage(pageFilters)
        },
      )
      queryClient.setQueryData(habitKeys.listTotalCount(filters), firstPage.totalCount)
      const scheduled = await enrichSchedule(deduplicateHabitList(items))
      prepareListLayoutMotion('habits')
      return scheduled
    },
    staleTime: QUERY_STALE_TIMES.habits,
    select: selectNormalizedHabits,
    refetchOnReconnect: true,
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
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: habitKeys.detail(id ?? ''),
    queryFn: async ({ signal }) => {
      if (id && isCachedHabitDeleted(queryClient, id)) throw new CancelledError({ silent: true })
      return habitDetailSchema.parse(await apiClient<unknown>(API.habits.get(id ?? ''), { signal }))
    },
    enabled: !!id && !isCachedHabitDeleted(queryClient, id),
    staleTime: QUERY_STALE_TIMES.habits,
  })
}

export function useHabitMetrics(id: string | null) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: habitKeys.metrics(id ?? ''),
    queryFn: async ({ signal }) => {
      if (id && isCachedHabitDeleted(queryClient, id)) throw new CancelledError({ silent: true })
      return habitMetricsSchema.parse(await apiClient<unknown>(API.habits.metrics(id ?? ''), { signal }))
    },
    enabled: !!id && !isCachedHabitDeleted(queryClient, id),
    staleTime: QUERY_STALE_TIMES.habits,
  })

  return {
    ...query,
    weeklyPercentage: query.data?.weeklyCompletionRate ?? 0,
    monthlyPercentage: query.data?.monthlyCompletionRate ?? 0,
  }
}

export function useHabitLogs(id: string | null) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: habitKeys.logs(id ?? ''),
    queryFn: async ({ signal }) => {
      if (id && isCachedHabitDeleted(queryClient, id)) throw new CancelledError({ silent: true })
      return habitLogSchema.array().parse(await apiClient<unknown>(`${API.habits.get(id ?? '')}/logs`, { signal }))
    },
    enabled: !!id && !isCachedHabitDeleted(queryClient, id),
    staleTime: QUERY_STALE_TIMES.habits,
  })
}

export function useHabitFullDetail(id: string | null) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: habitKeys.fullDetail(id ?? ''),
    queryFn: async ({ signal }) => {
      if (id && isCachedHabitDeleted(queryClient, id)) throw new CancelledError({ silent: true })
      return habitFullDetailSchema.parse(await apiClient<unknown>(API.habits.detail(id ?? ''), { signal }))
    },
    enabled: !!id && !isCachedHabitDeleted(queryClient, id),
    staleTime: QUERY_STALE_TIMES.habits,
  })
}

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

export function useSearchHabits(filters: HabitsFilter) {
  return useQuery({
    queryKey: habitKeys.search(filters as Record<string, unknown>),
    queryFn: () => apiClient<PaginatedResponse<HabitScheduleItem>>(
      buildUrlWithQuery(API.habits.list, buildHabitQueryString(filters)),
    ),
    select: (response): NormalizedHabitsData => normalizeHabitQueryData(response.items, response),
    staleTime: QUERY_STALE_TIMES.habits,
  })
}
