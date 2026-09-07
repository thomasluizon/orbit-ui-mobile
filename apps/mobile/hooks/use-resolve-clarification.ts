import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { API, MAX_CLARIFICATION_VALUE_LENGTH } from '@orbit/shared/api'
import { habitKeys } from '@orbit/shared/query'
import type { AgentExecuteOperationResponse } from '@orbit/shared/types'

export function useResolveClarification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ operationId, value }: { operationId: string; value: string }) => {
      if (!value.trim() || value.length > MAX_CLARIFICATION_VALUE_LENGTH) {
        throw Object.assign(new Error('Invalid value'), { status: 400 })
      }

      return await apiClient<AgentExecuteOperationResponse>(
        API.ai.clarificationResolve(operationId),
        {
          method: 'POST',
          body: JSON.stringify({ value }),
        },
      )
    },

    onSuccess: (response) => {
      if (response.operation.status !== 'Succeeded') return

      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}
