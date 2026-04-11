'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { habitKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SummaryResponse {
  summary: string
  fromCache: boolean
}

interface UseSummaryOptions {
  date: string // YYYY-MM-DD
  locale: string
  hasProAccess: boolean
  aiSummaryEnabled: boolean
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

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

  const query = useQuery({
    queryKey: habitKeys.summary(date, date, locale),
    queryFn: async (): Promise<string> => {
      const params = new URLSearchParams({
        dateFrom: date,
        dateTo: date,
        includeOverdue: 'true',
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
    staleTime: 5 * 60 * 1000, // 5 minutes -- summary is expensive, no need for frequent refresh
    // Summary is heavy/expensive -- don't refetch on window focus
    refetchOnWindowFocus: false,
  })

  return {
    summary: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

// ---------------------------------------------------------------------------
// Invalidation helper (call after mutations that change habit data)
// ---------------------------------------------------------------------------

/**
 * Invalidates all summary queries. Call this from mutation onSettled
 * callbacks when habit data has been mutated.
 */
export function useInvalidateSummary() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({
      queryKey: [...habitKeys.all, 'summary'],
    })
  }
}
