'use client'

import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'

import { useQueryClient } from '@tanstack/react-query'
import { resolveClarification } from '@/app/actions/chat'
import { habitKeys } from '@orbit/shared/query'
import { accountIntentWithOrigin, runServerActionResult } from '@/lib/client-action'

export function useResolveClarification() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: async ({ operationId, value }: { operationId: string; value: string }, intendedAccountId) => {
      return runServerActionResult(resolveClarification(operationId, value, accountIntentWithOrigin(intendedAccountId)))
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
