'use client'

import { useQuery } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
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
 * GET /api/habits/{id}/reschedule-suggestion. Only fetches when enabled — the sheet is open,
 * the habit is overdue, and the user has Pro access — so it never runs in the background.
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
      const res = await fetch(
        `${API.habits.rescheduleSuggestion(habitId)}?${params.toString()}`,
      )
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Failed to fetch reschedule suggestion')
      }
      const data = (await res.json()) as RescheduleSuggestionResponse
      return data.suggestion
    },
    enabled: enabled && !!habitId,
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
