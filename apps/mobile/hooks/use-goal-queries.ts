import { useQuery } from '@tanstack/react-query'
import { goalKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { fetchAllPaginatedItems, normalizeGoalQueryData } from '@orbit/shared/utils'
import type {
  Goal,
  GoalDetailWithMetrics,
  GoalMetrics,
  GoalStatus,
  PaginatedGoalResponse,
} from '@orbit/shared/types/goal'
import { apiClient } from '@/lib/api-client'

export { type NormalizedGoalsData } from '@orbit/shared/utils'

export function useGoals(status?: GoalStatus | null) {
  const filters: Record<string, unknown> = {}
  if (status) filters.status = status

  return useQuery({
    queryKey: goalKeys.list(filters),
    queryFn: async (): Promise<Goal[]> => {
      const params: Record<string, string> = { pageSize: '100' }
      if (status) params.status = status

      return fetchAllPaginatedItems<Goal, PaginatedGoalResponse>(async (page) => {
        const pageParams = page === 1 ? params : { ...params, page: String(page) }
        const qs = new URLSearchParams(pageParams).toString()
        const url = qs ? `${API.goals.list}?${qs}` : API.goals.list
        return apiClient<PaginatedGoalResponse>(url)
      })
    },
    staleTime: QUERY_STALE_TIMES.goals,
    select: normalizeGoalQueryData,
  })
}

export function useGoalDetail(id: string | null) {
  return useQuery({
    queryKey: goalKeys.detail(id ?? ''),
    queryFn: () => apiClient<GoalDetailWithMetrics>(API.goals.detail(id ?? '')),
    enabled: !!id,
    staleTime: QUERY_STALE_TIMES.goals,
  })
}

export function useGoalMetrics(id: string | null) {
  return useQuery({
    queryKey: goalKeys.metrics(id ?? ''),
    queryFn: () => apiClient<GoalMetrics>(API.goals.metrics(id ?? '')),
    enabled: !!id,
    staleTime: QUERY_STALE_TIMES.goals,
  })
}
