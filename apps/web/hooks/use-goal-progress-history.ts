'use client'

import { useQuery } from '@tanstack/react-query'
import { goalKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { GoalProgressHistoryResponse } from '@orbit/shared/types/goal-progress-history'
import { fetchJson } from '@/lib/api-fetch'

/**
 * Fetches a goal's progress-history series for the given date range.
 * Disabled until a goalId is provided.
 */
export function useGoalProgressHistory(goalId: string, range: { from: string; to: string }) {
  return useQuery({
    queryKey: [...goalKeys.progressHistory(goalId), range.from, range.to],
    queryFn: () =>
      fetchJson<GoalProgressHistoryResponse>(
        `${API.goals.progressHistory(goalId)}?dateFrom=${range.from}&dateTo=${range.to}`,
      ),
    staleTime: QUERY_STALE_TIMES.goals,
    enabled: !!goalId,
  })
}
