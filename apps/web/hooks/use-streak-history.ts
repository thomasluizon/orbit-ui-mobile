'use client'

import { useQuery } from '@tanstack/react-query'
import { gamificationKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { StreakHistoryResponse } from '@orbit/shared/types/streak-history'
import { fetchJson } from '@/lib/api-fetch'

/**
 * Fetches the streak-history series for the given date range.
 */
export function useStreakHistory(range: { from: string; to: string }) {
  return useQuery({
    queryKey: [...gamificationKeys.streakHistory(), range.from, range.to],
    queryFn: () =>
      fetchJson<StreakHistoryResponse>(
        `${API.gamification.streakHistory}?dateFrom=${range.from}&dateTo=${range.to}`,
      ),
    staleTime: QUERY_STALE_TIMES.gamification,
  })
}
