'use client'

import { useQuery } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { apiClient } from '@/lib/api-client'

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
 * AI-generated daily habit summary. Mirrors apps/web/hooks/use-summary.ts so the two
 * platforms share the same organization, query key, and stale-time policy.
 */
export function useSummary({ date, locale, hasProAccess, aiSummaryEnabled }: UseSummaryOptions) {
  const enabled = hasProAccess && aiSummaryEnabled && !!date

  const query = useQuery({
    queryKey: habitKeys.summary(date, date, locale),
    queryFn: async (): Promise<string> => {
      const params = new URLSearchParams({
        dateFrom: date,
        dateTo: date,
        includeOverdue: 'true',
        language: locale,
      })

      const data = await apiClient<SummaryResponse>(
        `${API.habits.summary}?${params.toString()}`,
      )
      return data.summary
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes -- summary is expensive, no need for frequent refresh
    refetchOnWindowFocus: false,
  })

  return {
    summary: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
