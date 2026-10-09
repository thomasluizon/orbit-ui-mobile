'use client'

import { fetchWithThrottle } from '@/lib/throttle-fetch'
import { useQuery } from '@tanstack/react-query'
import { habitKeys, shouldRetryQuery } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { createApiClientError, extractBackendStatus } from '@orbit/shared/utils'
import type {
  RescheduleSuggestion,
  RescheduleSuggestionResponse,
} from '@orbit/shared/types/habit'

interface UseRescheduleSuggestionOptions {
  habitId: string
  locale: string
  enabled: boolean
}

/**
 * Fetches the AI reschedule suggestion for an overdue habit from
 * GET /api/habits/{id}/reschedule-suggestion. Only fetches when enabled,
 * when the habit is overdue and the user has Pro access.
 */
export function useRescheduleSuggestion({
  habitId,
  locale,
  enabled,
}: UseRescheduleSuggestionOptions) {
  const query = useQuery({
    queryKey: habitKeys.rescheduleSuggestion(habitId),
    queryFn: async (): Promise<RescheduleSuggestion> => {
      const params = new URLSearchParams({ language: locale })
      const res = await fetchWithThrottle(
        `${API.habits.rescheduleSuggestion(habitId)}?${params.toString()}`,
      )
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        throw createApiClientError(res.status, body, 'Failed to fetch reschedule suggestion')
      }
      const data = (await res.json()) as RescheduleSuggestionResponse
      return data.suggestion
    },
    enabled: enabled && !!habitId,
    retry: (failureCount, error) => {
      const status = extractBackendStatus(error)
      return status === 429 ? shouldRetryQuery(failureCount, error) : failureCount < 3 && (status === undefined || status < 400 || status >= 500)
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  return {
    suggestion: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
