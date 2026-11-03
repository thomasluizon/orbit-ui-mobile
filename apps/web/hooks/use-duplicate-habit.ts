'use client'

import { useQueryClient } from '@tanstack/react-query'
import { duplicateHabit as duplicateHabitAction } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { invalidateHabitStructureQueries } from './use-habit-mutation-shared'

export function useDuplicateHabit() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: (habitId: string, intendedAccountId) =>
      duplicateHabitAction(habitId, intendedAccountId),

    onSettled: () => {
      invalidateHabitStructureQueries(queryClient)
    },
  })
}
