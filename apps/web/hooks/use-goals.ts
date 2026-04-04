'use client'

import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { goalKeys, habitKeys } from '@orbit/shared/query'
import { QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type {
  Goal,
  GoalStatus,
  GoalMetrics,
  GoalDetailWithMetrics,
  PaginatedGoalResponse,
  CreateGoalRequest,
  UpdateGoalRequest,
  UpdateGoalProgressRequest,
  UpdateGoalStatusRequest,
  GoalPositionItem,
} from '@orbit/shared/types/goal'
import {
  createGoal as createGoalAction,
  updateGoal as updateGoalAction,
  deleteGoal as deleteGoalAction,
  updateGoalProgress as updateGoalProgressAction,
  updateGoalStatus as updateGoalStatusAction,
  reorderGoals as reorderGoalsAction,
  linkHabitsToGoal as linkHabitsToGoalAction,
} from '@/app/actions/goals'
import { useUIStore } from '@/stores/ui-store'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? body?.message ?? `Request failed with status ${res.status}`)
  }
  return res.json() as Promise<T>
}

function sortByPosition(a: Goal, b: Goal): number {
  if (a.position !== b.position) return a.position - b.position
  return a.createdAtUtc.localeCompare(b.createdAtUtc)
}

// ---------------------------------------------------------------------------
// Normalized data returned from select
// ---------------------------------------------------------------------------

export interface NormalizedGoalsData {
  goalsById: Map<string, Goal>
  allGoals: Goal[]
  totalCount: number
  totalPages: number
  currentPage: number
}

// ---------------------------------------------------------------------------
// Goals list query
// ---------------------------------------------------------------------------

export function useGoals(status?: GoalStatus | null) {
  const filters: Record<string, unknown> = {}
  if (status) filters.status = status

  return useQuery({
    queryKey: goalKeys.list(filters),
    queryFn: async (): Promise<Goal[]> => {
      const params: Record<string, string> = { pageSize: '100' }
      if (status) params.status = status

      const qs = new URLSearchParams(params).toString()
      const url = qs ? `${API.goals.list}?${qs}` : API.goals.list
      const data = await fetchJson<PaginatedGoalResponse>(url)

      const allItems = [...data.items]

      // Fetch remaining pages in parallel if needed
      if (data.totalPages > 1) {
        const pagePromises: Promise<PaginatedGoalResponse>[] = []
        for (let p = 2; p <= data.totalPages; p++) {
          const pageParams = { ...params, page: String(p) }
          const pageQs = new URLSearchParams(pageParams).toString()
          pagePromises.push(fetchJson<PaginatedGoalResponse>(`${API.goals.list}?${pageQs}`))
        }
        const pages = await Promise.all(pagePromises)
        for (const pageData of pages) {
          allItems.push(...pageData.items)
        }
      }

      return allItems
    },
    staleTime: QUERY_STALE_TIMES.goals,
    select: (items): NormalizedGoalsData => {
      const goalsById = new Map<string, Goal>()
      for (const goal of items) {
        goalsById.set(goal.id, goal)
      }
      const allGoals = Array.from(goalsById.values()).sort(sortByPosition)

      return {
        goalsById,
        allGoals,
        totalCount: items.length,
        totalPages: 1,
        currentPage: 1,
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Single goal detail with metrics
// ---------------------------------------------------------------------------

export function useGoalDetail(id: string | null) {
  return useQuery({
    queryKey: goalKeys.detail(id ?? ''),
    queryFn: () => fetchJson<GoalDetailWithMetrics>(API.goals.detail(id!)),
    enabled: !!id,
    staleTime: QUERY_STALE_TIMES.goals,
  })
}

// ---------------------------------------------------------------------------
// Standalone goal metrics
// ---------------------------------------------------------------------------

export function useGoalMetrics(id: string | null) {
  return useQuery({
    queryKey: goalKeys.metrics(id ?? ''),
    queryFn: () => fetchJson<GoalMetrics>(API.goals.metrics(id!)),
    enabled: !!id,
    staleTime: QUERY_STALE_TIMES.goals,
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateGoal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateGoalRequest) => createGoalAction(data),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}

export function useUpdateGoal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ goalId, data }: { goalId: string; data: UpdateGoalRequest }) =>
      updateGoalAction(goalId, data),

    onSettled: (_data, _err, { goalId }) => {
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      queryClient.invalidateQueries({ queryKey: goalKeys.detail(goalId) })
    },
  })
}

export function useDeleteGoal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (goalId: string) => deleteGoalAction(goalId),

    onMutate: async (goalId) => {
      await queryClient.cancelQueries({ queryKey: goalKeys.lists() })

      const previousLists = queryClient.getQueriesData<Goal[]>({
        queryKey: goalKeys.lists(),
      })

      // Optimistic: remove goal from cache
      queryClient.setQueriesData<Goal[]>(
        { queryKey: goalKeys.lists() },
        (old) => {
          if (!old) return old
          return old.filter((g) => g.id !== goalId)
        },
      )

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          if (data) queryClient.setQueryData(key, data)
        }
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}

export function useUpdateGoalProgress() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      goalId,
      data,
    }: {
      goalId: string
      data: UpdateGoalProgressRequest
    }) => updateGoalProgressAction(goalId, data),

    onSettled: (_data, _err, { goalId }) => {
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      queryClient.invalidateQueries({ queryKey: goalKeys.detail(goalId) })
      queryClient.invalidateQueries({ queryKey: goalKeys.metrics(goalId) })
    },
  })
}

export function useUpdateGoalStatus() {
  const queryClient = useQueryClient()
  const { setGoalCompletedCelebration } = useUIStore.getState()

  return useMutation({
    mutationFn: ({
      goalId,
      data,
      goalName,
    }: {
      goalId: string
      data: UpdateGoalStatusRequest
      goalName?: string
    }) => updateGoalStatusAction(goalId, data),

    onSuccess: (_data, { data, goalName }) => {
      if (data.status === 'Completed' && goalName) {
        setGoalCompletedCelebration({ name: goalName })
      }
    },

    onSettled: (_data, _err, { goalId }) => {
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      queryClient.invalidateQueries({ queryKey: goalKeys.detail(goalId) })
      queryClient.invalidateQueries({ queryKey: goalKeys.metrics(goalId) })
    },
  })
}

export function useReorderGoals() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (positions: GoalPositionItem[]) => reorderGoalsAction(positions),

    onMutate: async (positions) => {
      await queryClient.cancelQueries({ queryKey: goalKeys.lists() })

      const previousLists = queryClient.getQueriesData<Goal[]>({
        queryKey: goalKeys.lists(),
      })

      // Optimistic: update positions in cache
      queryClient.setQueriesData<Goal[]>(
        { queryKey: goalKeys.lists() },
        (old) => {
          if (!old) return old
          const positionMap = new Map(positions.map((p) => [p.id, p.position]))
          return old.map((g) => {
            const newPos = positionMap.get(g.id)
            return newPos !== undefined ? { ...g, position: newPos } : g
          })
        },
      )

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          if (data) queryClient.setQueryData(key, data)
        }
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}

export function useLinkHabitsToGoal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      goalId,
      habitIds,
    }: {
      goalId: string
      habitIds: string[]
    }) => linkHabitsToGoalAction(goalId, habitIds),

    onSettled: (_data, _err, { goalId }) => {
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      queryClient.invalidateQueries({ queryKey: goalKeys.detail(goalId) })
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
    },
  })
}
