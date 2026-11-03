import { useRestoreHabit } from './use-restore-habit'
import { type HabitAccount } from './use-habit-mutation-shared'
import type { HabitListSnapshots,HabitDetailSnapshots } from '@orbit/shared/query'
import { useQueryClient } from '@tanstack/react-query'
import { useHabitMutation } from './use-habit-mutation'
import { habitKeys,isCachedHabitDeleted,cachedHabitDeletionIds,removeDeletedHabitQueries } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { removeHabitDetailChild } from '@orbit/shared/utils'
import type { HabitDetail } from '@orbit/shared/types/habit'
import { type QueuedMarker,isQueuedResult,cancelQueuedDeleteForUndo } from '@/lib/offline-mutations'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { optimisticRemoveHabits } from '@/lib/habit-optimistic-helpers'
import { finalizeHabitMutation,snapshotHabitLists,updateHabitLists,restoreHabitLists } from '@/lib/habit-mutation-helpers'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'
import { useTranslation } from 'react-i18next'
import { useUndoToast } from '@/hooks/use-undo-toast'



export function useDeleteHabit({ requiresConnection = false }: { requiresConnection?: boolean } = {}) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const restoreHabit = useRestoreHabit()
  const showUndoToast = useUndoToast()

  return useHabitMutation<
    void | QueuedMarker,
    Error,
    string,
    { previousLists: HabitListSnapshots; previousDetails: HabitDetailSnapshots; deletedIds: string[]; account: HabitAccount }
  >({
    mutationFn: (habitId) =>
      isCachedHabitDeleted(queryClient, habitId) ? Promise.resolve() : performQueuedApiMutation<void>({
        type: requiresConnection ? 'bulkCascadeDeleteHabits' : 'deleteHabit',
        scope: 'habits',
        endpoint: API.habits.delete(habitId),
        method: 'DELETE',
        payload: null,
        entityType: 'habit',
        targetEntityId: habitId,
      }),

    onMutate: async (habitId, _context, account) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.all })
      account.assertCurrent()

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

      return { previousLists, previousDetails, deletedIds, account }
    },

    onError: (_err, _vars, context) => {
      if (!context) return
      restoreHabitLists(queryClient, context.previousLists)
      for (const [queryKey, detail] of context.previousDetails) {
        if (detail) queryClient.setQueryData(queryKey, detail)
      }
    },

    onSuccess: async (data, habitId, context) => {
      if (!isQueuedResult(data)) await removeDeletedHabitQueries(queryClient, habitId, context.deletedIds, context.account.stillCurrent)
      if (!context.account.stillCurrent()) return
      showUndoToast(t('undo.habitDeleted'), () => {
        if (!context.account.stillCurrent()) return
        if (isQueuedResult(data)) {
          void cancelQueuedDeleteForUndo(data.queuedMutationId).then((outcome) => {
            if (!context.account.stillCurrent()) return
            if (outcome !== 'replayed') {
              restoreHabitLists(queryClient, context.previousLists)
              void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
              void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
            }
            if (outcome === 'dropped') {
              useOfflineSyncStore.getState().dismissDrop(data.queuedMutationId)
              restoreHabit.mutate({ habitId, reconcileNotFound: true })
            }
            else if (outcome === 'replayed' || outcome === 'uncertain') restoreHabit.mutate(habitId)
          })
          return
        }
        restoreHabit.mutate(habitId)
      }, isQueuedResult(data) ? data.queuedMutationId : undefined)
    },

    onSettled: (data, error) => {
      if (error) return
      finalizeHabitMutation(queryClient, data, error, {
        includeGoals: true,
        includeCount: true,
        includeProfile: true,
      })
    },
  })
}
