'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { resolveClarification } from '@/app/actions/chat'
import { habitKeys } from '@orbit/shared/query'
import { applyServerActionFailure } from '@/lib/client-action'

export function useResolveClarification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ operationId, value }: { operationId: string; value: string }) => {
      const result = await resolveClarification(operationId, value)
      applyServerActionFailure(result)
      return result
    },

    onSuccess: (result) => {
      if (!result.ok) return
      if (result.data.operation.status !== 'Succeeded') return

      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}
