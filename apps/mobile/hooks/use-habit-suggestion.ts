import { useMutation, useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'
import {
  habitSetupSuggestionSchema,
  type HabitSetupSuggestion,
  type HabitSetupSuggestionRequest,
} from '@orbit/shared/types/habit'
import { apiClient } from '@/lib/api-client'

/**
 * Requests an AI setup suggestion (emoji, schedule, sub-habit breakdown) for a habit title and
 * parses the response. Called directly (never through the offline queue — a suggestion has no offline
 * value), and consumes one AI message, so the subscription status and profile are invalidated to
 * refresh the remaining-allowance UI.
 */
export function useHabitSuggestion() {
  const queryClient = useQueryClient()

  return useMutation<HabitSetupSuggestion, Error, HabitSetupSuggestionRequest>({
    mutationFn: (data) =>
      apiClient<HabitSetupSuggestion>(
        API.habits.suggestSetup,
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
        habitSetupSuggestionSchema,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.status() })
      queryClient.invalidateQueries({ queryKey: profileKeys.detail() })
    },
  })
}
