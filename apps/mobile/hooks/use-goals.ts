import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { goalKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import type {
  Goal,
  PaginatedGoalResponse,
  GoalMetrics,
  CreateGoalRequest,
  UpdateGoalProgressRequest,
} from '@orbit/shared/types/goal'
import { apiClient } from '@/lib/api-client'

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchGoals(
  status?: string,
): Promise<PaginatedGoalResponse> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  const qs = params.toString()
  return apiClient<PaginatedGoalResponse>(`/api/goals${qs ? `?${qs}` : ''}`)
}

async function fetchGoalMetrics(goalId: string): Promise<GoalMetrics> {
  return apiClient<GoalMetrics>(`/api/goals/${goalId}/metrics`)
}

// ---------------------------------------------------------------------------
// useGoals -- goal list
// ---------------------------------------------------------------------------

export function useGoals(status?: string) {
  const filters = { status: status ?? 'Active' }
  const query = useQuery({
    queryKey: goalKeys.list(filters as Record<string, unknown>),
    queryFn: () => fetchGoals(filters.status),
    staleTime: QUERY_STALE_TIMES.goals,
  })

  return {
    goals: query.data?.items ?? [],
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

// ---------------------------------------------------------------------------
// useGoalMetrics
// ---------------------------------------------------------------------------

export function useGoalMetrics(goalId: string, enabled = true) {
  return useQuery({
    queryKey: goalKeys.metrics(goalId),
    queryFn: () => fetchGoalMetrics(goalId),
    staleTime: QUERY_STALE_TIMES.goals,
    enabled,
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateGoal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateGoalRequest) =>
      apiClient<Goal>('/api/goals', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}

export function useUpdateGoalProgress() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      goalId,
      ...data
    }: UpdateGoalProgressRequest & { goalId: string }) =>
      apiClient<void>(`/api/goals/${goalId}/progress`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}

export function useUpdateGoalStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ goalId, status }: { goalId: string; status: string }) =>
      apiClient<void>(`/api/goals/${goalId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}
