import { useCallback, useEffect, useMemo, useState } from 'react'
import { createUseDelayedLoading } from '@orbit/shared/hooks'
import { getAccountGeneration } from '@/lib/session-epoch'
import { CancelledError, hashKey, useQuery, useQueryClient } from '@tanstack/react-query'
import { habitListQueryOptions, adjacentHabitDayFilters, isCachedHabitDeleted, habitKeys, QUERY_STALE_TIMES, type HabitListOptions } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import {
  buildHabitQueryString,
  buildUrlWithQuery,
  normalizeHabitQueryData,
  createHabitQueryNormalizer,
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

export interface NormalizedHabitsData {
  habitsById: Map<string, NormalizedHabit>
  childrenByParent: Map<string, string[]>
  topLevelHabits: NormalizedHabit[]
  totalCount: number
  totalPages: number
  currentPage: number
}

const habitPageSchema = createPaginatedSchema(habitScheduleItemSchema)

export const EMPTY_HABITS_BY_ID: Map<string, NormalizedHabit> = new Map()
export const EMPTY_CHILDREN_BY_PARENT: Map<string, string[]> = new Map()
export const EMPTY_NORMALIZED_HABITS: NormalizedHabit[] = []

const useDelayedLoading = createUseDelayedLoading({ useState, useEffect })
const habitListAdapters = {
  getAccountGeneration,
  readPage: async (filters: HabitsFilter) => habitPageSchema.parse(await apiClient<unknown>(
    buildUrlWithQuery(API.habits.list, buildHabitQueryString(filters)),
  )),
}

export function useHabits(filters: HabitsFilter, options: HabitListOptions = {}) {
  const selectNormalizedHabits = useMemo<(items: HabitScheduleItem[]) => NormalizedHabitsData>(() => createHabitQueryNormalizer(), [])
  const queryClient = useQueryClient()
  const scheduleDate = filters.dateFrom || filters.isGeneral ? undefined : options.scheduleDate
  const queryOptions = { ...options, scheduleDate }
  const query = useQuery({
    ...habitListQueryOptions(filters, queryOptions, queryClient, habitListAdapters),
    enabled: options.enabled,
    select: selectNormalizedHabits,
    refetchOnReconnect: true,
  })
  const showLoading = useDelayedLoading(query.isLoading, hashKey(habitKeys.list(filters)))
  const { completeDay, prefetchAroundToday, enabled } = options
  useEffect(() => {
    if (!prefetchAroundToday || enabled === false || !query.isSuccess || query.isFetching) return
    for (const neighbour of adjacentHabitDayFilters(filters, prefetchAroundToday)) {
      void queryClient.prefetchQuery(habitListQueryOptions(neighbour, { completeDay }, queryClient, habitListAdapters))
    }
  }, [completeDay, enabled, filters, prefetchAroundToday, query.isFetching, query.isSuccess, query.dataUpdatedAt, queryClient])

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
    showLoading,
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
    select: (response): NormalizedHabitsData => normalizeHabitQueryData(response.items, response, 'response'),
    staleTime: QUERY_STALE_TIMES.habits,
  })
}
