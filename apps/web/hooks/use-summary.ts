'use client'

import { useQuery } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import {
  getDailySummaryTimeBucket,
  getMsUntilNextDailySummaryTimeBucket,
} from '@orbit/shared/utils'

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

/**
 * Fetches AI-generated daily summary from GET /api/habits/summary.
 * Only fetches when the user has Pro access and AI summary enabled.
 */
export function useSummary({
  date,
  locale,
  hasProAccess,
  aiSummaryEnabled,
}: UseSummaryOptions) {
  const enabled = hasProAccess && aiSummaryEnabled && !!date
  const summaryTimeBucket = getDailySummaryTimeBucket()

  const query = useQuery({
    queryKey: habitKeys.summary(date, date, locale, summaryTimeBucket),
    queryFn: async (): Promise<string> => {
      const params = new URLSearchParams({
        dateFrom: date,
        dateTo: date,
        language: locale,
      })

      const res = await fetch(`${API.habits.summary}?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Failed to fetch summary')
      }
      const data = (await res.json()) as SummaryResponse
      return data.summary
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchInterval: () => getMsUntilNextDailySummaryTimeBucket(),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  })

  return {
    summary: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
