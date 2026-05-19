'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { resolveClarification } from '@/app/actions/chat'
import { habitKeys } from '@orbit/shared/query'

export function useResolveClarification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ operationId, value }: { operationId: string; value: string }) =>
      resolveClarification(operationId, value),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}
