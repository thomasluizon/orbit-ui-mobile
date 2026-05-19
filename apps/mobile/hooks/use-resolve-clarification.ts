import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { API } from '@orbit/shared/api'
import { habitKeys } from '@orbit/shared/query'
import type { AgentExecuteOperationResponse } from '@orbit/shared/types/ai'

export function useResolveClarification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ operationId, value }: { operationId: string; value: string }) => {
      return await apiClient<AgentExecuteOperationResponse>(
        API.ai.clarificationResolve(operationId),
        {
          method: 'POST',
          body: JSON.stringify({ value }),
        },
      )
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}
