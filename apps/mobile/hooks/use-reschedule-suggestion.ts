import { useQuery } from '@tanstack/react-query'
import { habitKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type {
  RescheduleSuggestion,
  RescheduleSuggestionResponse,
} from '@orbit/shared/types/habit'
import { apiClient } from '@/lib/api-client'

interface UseRescheduleSuggestionOptions {
  habitId: string
  locale: string
  enabled: boolean
}

/**
 * AI reschedule suggestion for an overdue habit. Mirrors apps/web/hooks/use-reschedule-suggestion.ts
 * via apiClient; only fetches when enabled (sheet open, habit overdue, user has Pro access).
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
      const data = await apiClient<RescheduleSuggestionResponse>(
        `${API.habits.rescheduleSuggestion(habitId)}?${params.toString()}`,
      )
      return data.suggestion
    },
    enabled: enabled && !!habitId,
    staleTime: 5 * 60 * 1000,
  })

  return {
    suggestion: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
