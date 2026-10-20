'use client'

import { useQueryClient } from '@tanstack/react-query'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'
import {
  habitSetupSuggestionSchema,
  type HabitSetupSuggestion,
  type HabitSetupSuggestionRequest,
} from '@orbit/shared/types/habit'
import { suggestHabitSetup } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'

/**
 * Requests an AI setup suggestion (emoji, schedule, sub-habit breakdown) for a habit title and
 * parses the response. A successful suggestion consumes one AI message, so the subscription status
 * and profile (remaining-message counts) are invalidated to refresh the allowance UI.
 */
export function useHabitSuggestion() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation<HabitSetupSuggestion, Error, HabitSetupSuggestionRequest>({
    mutationFn: async (data, intendedAccountId) =>
      habitSetupSuggestionSchema.parse(await suggestHabitSetup(data, intendedAccountId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: subscriptionKeys.status() })
      void queryClient.invalidateQueries({ queryKey: profileKeys.detail() })
    },
  })
}
