import { onlineManager, useMutation, useQueryClient } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { profileKeys, subscriptionKeys } from '@orbit/shared/query'
import { dateInterpretationSchema, type DateInterpretationRequest } from '@orbit/shared/types/habit'
import { apiClient } from '@/lib/api-client'
import { getAccountGeneration } from '@/lib/session-epoch'

export function useDateInterpretation() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async ({ input, generation }: { input: DateInterpretationRequest & { signal?: AbortSignal }; generation: number }) => {
      if (generation !== getAccountGeneration()) throw new Error('Account changed')
      if (input.signal?.aborted) throw new Error('Date consultation cancelled')
      try {
        if (!onlineManager.isOnline()) throw new TypeError('Network request failed')
        return await apiClient(API.habits.interpretDate, {
          method: 'POST', body: JSON.stringify({ phrase: input.phrase, language: input.language }), signal: input.signal,
          isCurrent: () => generation === getAccountGeneration(),
        }, dateInterpretationSchema)
      } finally {
        if (generation === getAccountGeneration()) {
          void queryClient.invalidateQueries({ queryKey: profileKeys.detail() })
          void queryClient.invalidateQueries({ queryKey: subscriptionKeys.status() })
        }
      }
    },
  })
  return {
    ...mutation,
    mutateAsync: (input: DateInterpretationRequest & { signal?: AbortSignal }) => mutation.mutateAsync({ input, generation: getAccountGeneration() }),
  }
}
