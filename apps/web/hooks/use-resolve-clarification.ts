'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { resolveClarification } from '@/app/actions/chat'
import { habitKeys } from '@orbit/shared/query'

export function useResolveClarification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ operationId, value }: { operationId: string; value: string }) =>
      resolveClarification(operationId, value),

    onSuccess: (result) => {
      if (!result.ok) return
      if (result.data.operation.status !== 'Succeeded') return

      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}
