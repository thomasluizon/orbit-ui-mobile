'use client'

import { useQueryClient } from '@tanstack/react-query'
import { invalidateBulkMoveParentQueries } from '@orbit/shared/query'
import type { BulkMoveHabitParentRequest } from '@orbit/shared/types/habit'
import { bulkMoveHabitParent as bulkMoveHabitParentAction } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'

export function useBulkMoveHabitParent() {
  const queryClient = useQueryClient()
  return useAccountScopedMutation({
    mutationFn: (input: BulkMoveHabitParentRequest, intendedAccountId) =>
      bulkMoveHabitParentAction(input, intendedAccountId),
    onSuccess: () => invalidateBulkMoveParentQueries(queryClient),
  })
}
