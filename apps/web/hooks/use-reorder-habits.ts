'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { habitKeys } from '@orbit/shared/query'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { snapshotHabitLists,updateHabitLists,applyReorderPositions,restoreHabitLists } from '@/lib/habit-mutation-helpers'
import type { ReorderHabitsRequest } from '@orbit/shared/types/habit'
import { reorderHabits as reorderHabitsAction } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { captureAccountIntent } from '@/lib/client-action'
import { useAppToast } from '@/hooks/use-app-toast'
import { invalidateHabitListQueries } from './use-habit-mutation-shared'

export function useReorderHabits() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const { showError } = useAppToast()

  return useAccountScopedMutation({
    mutationFn: (data: ReorderHabitsRequest, intendedAccountId) =>
      reorderHabitsAction(data, intendedAccountId),

    onMutate: async (data) => {
      const account = captureAccountIntent()
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })
      if (!account.stillCurrent()) throw new Error('Account changed')

      const previousLists = snapshotHabitLists(queryClient)
      updateHabitLists(queryClient, (items) =>
        applyReorderPositions(items, data.positions),
      )

      return { previousLists }
    },

    onError: (error, _vars, context) => {
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
      showError(getFriendlyErrorMessage(error, t, 'habits.reorderFailed'))
    },

    onSettled: () => {
      invalidateHabitListQueries(queryClient)
    },
  })
}
