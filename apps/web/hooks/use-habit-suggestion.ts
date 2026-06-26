'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'
import {
  habitSetupSuggestionSchema,
  type HabitSetupSuggestion,
  type HabitSetupSuggestionRequest,
} from '@orbit/shared/types/habit'
import { suggestHabitSetup } from '@/app/actions/habits'

/**
 * Requests an AI setup suggestion (emoji, schedule, sub-habit breakdown) for a habit title and
 * parses the response. A successful suggestion consumes one AI message, so the subscription status
 * and profile (remaining-message counts) are invalidated to refresh the allowance UI.
 */
export function useHabitSuggestion() {
  const queryClient = useQueryClient()

  return useMutation<HabitSetupSuggestion, Error, HabitSetupSuggestionRequest>({
    mutationFn: async (data) =>
      habitSetupSuggestionSchema.parse(await suggestHabitSetup(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.status() })
      queryClient.invalidateQueries({ queryKey: profileKeys.detail() })
    },
  })
}
