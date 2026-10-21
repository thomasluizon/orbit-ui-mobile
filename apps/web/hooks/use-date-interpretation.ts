'use client'

import { onlineManager, useQueryClient } from '@tanstack/react-query'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'
import { dateInterpretationSchema, type DateInterpretation, type DateInterpretationRequest } from '@orbit/shared/types/habit'
import { interpretHabitDate } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'

export function useDateInterpretation() {
  const queryClient = useQueryClient()
  return useAccountScopedMutation<DateInterpretation, Error, DateInterpretationRequest & { signal?: AbortSignal }>({
    retry: false,
    networkMode: 'always',
    mutationFn: async (input, intendedAccountId) => {
      if (input.signal?.aborted) throw new Error('Date consultation cancelled')
      if (!onlineManager.isOnline()) throw new TypeError('Network request failed')
      return dateInterpretationSchema.parse(await interpretHabitDate({ phrase: input.phrase, language: input.language }, intendedAccountId))
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: profileKeys.detail() })
      void queryClient.invalidateQueries({ queryKey: subscriptionKeys.status() })
    },
  })
}
