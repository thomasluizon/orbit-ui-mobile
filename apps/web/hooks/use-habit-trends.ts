'use client'

import { useQuery } from '@tanstack/react-query'
import { habitKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { HabitsCompletionTrendsResponse } from '@orbit/shared/types/habit-trends'
import { fetchJson } from '@/lib/api-fetch'

/**
 * Fetches habit completion-trend points across all habits for the given date range.
 */
export function useHabitTrends(range: { from: string; to: string }) {
  return useQuery({
    queryKey: habitKeys.trends(`${range.from}_${range.to}`),
    queryFn: () =>
      fetchJson<HabitsCompletionTrendsResponse>(
        `${API.habits.trends}?dateFrom=${range.from}&dateTo=${range.to}`,
      ),
    staleTime: QUERY_STALE_TIMES.habits,
  })
}
