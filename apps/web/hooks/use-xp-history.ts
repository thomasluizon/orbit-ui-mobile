'use client'

import { useQuery } from '@tanstack/react-query'
import { gamificationKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { XpHistoryResponse } from '@orbit/shared/types/xp-history'
import { fetchJson } from '@/lib/api-fetch'

/**
 * Fetches the XP-history series (daily and cumulative) for the given date range.
 */
export function useXpHistory(range: { from: string; to: string }) {
  return useQuery({
    queryKey: gamificationKeys.xpHistory(`${range.from}_${range.to}`),
    queryFn: () =>
      fetchJson<XpHistoryResponse>(
        `${API.gamification.xpHistory}?dateFrom=${range.from}&dateTo=${range.to}`,
      ),
    staleTime: QUERY_STALE_TIMES.gamification,
  })
}
