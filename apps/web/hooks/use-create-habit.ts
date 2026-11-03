'use client'

import { useQueryClient } from '@tanstack/react-query'
import type { CreateHabitRequest } from '@orbit/shared/types/habit'
import { createHabit as createHabitAction } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { useUIStore } from '@/stores/ui-store'
import { invalidateHabitInventoryQueries } from './use-habit-mutation-shared'

export function useCreateHabit() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: (data: CreateHabitRequest, intendedAccountId) =>
      createHabitAction(data, intendedAccountId),

    onSuccess: (result) => {
      useUIStore.getState().setLastCreatedHabitId(result.id)
    },

    onSettled: () => {
      invalidateHabitInventoryQueries(queryClient)
    },
  })
}
