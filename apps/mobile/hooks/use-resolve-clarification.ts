import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { API, MAX_CLARIFICATION_VALUE_LENGTH } from '@orbit/shared/api'
import { habitKeys } from '@orbit/shared/query'
import type { AgentExecuteOperationResponse } from '@orbit/shared/types/ai'

export function useResolveClarification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ operationId, value }: { operationId: string; value: string }) => {
      // Cheap client-side guard mirroring the web server action — avoids a wasted
      // round-trip if the caller hand-builds an oversized payload. Backend is
      // authoritative via AppConstants.MaxClarificationValueLength.
      if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_CLARIFICATION_VALUE_LENGTH) {
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
      // Only invalidate when the tool actually ran successfully — Failed/Denied/PendingConfirmation
      // leave the habit list unchanged.
      if (response.operation.status !== 'Succeeded') return

      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}
