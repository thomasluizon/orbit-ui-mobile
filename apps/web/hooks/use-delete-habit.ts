'use client'

import { useRestoreHabit } from './use-restore-habit'

import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { habitKeys,isCachedHabitDeleted,cachedHabitDeletionIds,removeDeletedHabitQueries } from '@orbit/shared/query'
import { optimisticRemoveHabits,removeHabitDetailChild } from '@orbit/shared/utils'
import { snapshotHabitLists,updateHabitLists,restoreHabitLists } from '@/lib/habit-mutation-helpers'
import type { HabitDetail } from '@orbit/shared/types/habit'
import { deleteHabit as deleteHabitAction } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { captureAccountIntent } from '@/lib/client-action'
import { useUndoToast } from '@/hooks/use-undo-toast'
import { invalidateHabitDeleteQueries } from './use-habit-mutation-shared'



export function useDeleteHabit() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const restoreHabit = useRestoreHabit()
  const showUndoToast = useUndoToast()

  return useAccountScopedMutation({
    mutationFn: (habitId: string, intendedAccountId) =>
      isCachedHabitDeleted(queryClient, habitId) ? Promise.resolve() : deleteHabitAction(habitId, intendedAccountId),

    onMutate: async (habitId) => {
      const account = captureAccountIntent()
      await queryClient.cancelQueries({ queryKey: habitKeys.all })
      if (!account.stillCurrent()) throw new Error('Account changed')
      const deletedIds = cachedHabitDeletionIds(queryClient, [habitId])
      const previousLists = snapshotHabitLists(queryClient)
      const previousDetails = queryClient.getQueriesData<HabitDetail>({
        queryKey: habitKeys.details(),
      })
      updateHabitLists(queryClient, (items) => optimisticRemoveHabits(items, [habitId]))
      queryClient.setQueriesData<HabitDetail>(
        { queryKey: habitKeys.details() },
        (detail) => detail ? removeHabitDetailChild(detail, habitId) : detail,
      )
      return { previousLists, previousDetails, deletedIds }
    },

    onError: (_error, _habitId, context) => {
      if (context?.previousLists) restoreHabitLists(queryClient, context.previousLists)
      for (const [queryKey, detail] of context?.previousDetails ?? []) {
        if (detail) queryClient.setQueryData(queryKey, detail)
      }
    },

    onSuccess: async (_data, habitId, context) => {
      const account = captureAccountIntent()
      await removeDeletedHabitQueries(queryClient, habitId, context.deletedIds, account.stillCurrent)
      if (!account.stillCurrent()) return
      showUndoToast(t('undo.habitDeleted'), () => {
        if (account.stillCurrent()) restoreHabit.mutate(habitId)
      })
    },

    onSettled: (_response, error) => {
      if (error) return
      invalidateHabitDeleteQueries(queryClient)
    },
  })
}
