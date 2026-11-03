'use client'

import { useQueryClient } from '@tanstack/react-query'
import type { MoveHabitParentRequest } from '@orbit/shared/types/habit'
import { moveHabitParent as moveHabitParentAction } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { invalidateHabitStructureQueries } from './use-habit-mutation-shared'

export function useMoveHabitParent() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: ({
      habitId,
      data,
    }: {
      habitId: string
      data: MoveHabitParentRequest
    }, intendedAccountId) => moveHabitParentAction(habitId, data, intendedAccountId),

    onSettled: () => {
      invalidateHabitStructureQueries(queryClient)
    },
  })
}
