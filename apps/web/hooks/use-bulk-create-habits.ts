'use client'

import { useQueryClient } from '@tanstack/react-query'
import type { BulkCreateRequest } from '@orbit/shared/types/habit'
import { bulkCreateHabits as bulkCreateHabitsAction } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { invalidateHabitInventoryQueries } from './use-habit-mutation-shared'

export function useBulkCreateHabits() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: (data: BulkCreateRequest, intendedAccountId) =>
      bulkCreateHabitsAction(data, intendedAccountId),

    onSettled: () => {
      invalidateHabitInventoryQueries(queryClient)
    },
  })
}
