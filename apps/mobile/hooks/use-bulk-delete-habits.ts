
import { selectedDescendantsInSnapshots } from '@orbit/shared/hooks'
import { type HabitAccount,withAccountGuard } from './use-habit-mutation-shared'
import type { UseMutationOptions } from '@tanstack/react-query'
import type { HabitListSnapshots } from '@orbit/shared/query'
import { useQueryClient } from '@tanstack/react-query'
import { useHabitMutation } from './use-habit-mutation'
import { isCachedHabitDeleted,removeDeletedHabitQueries,habitKeys,cachedHabitDeletionIds } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { findHabitInList,plural } from '@orbit/shared/utils'
import type { BulkDeleteResponse,HabitScheduleItem } from '@orbit/shared/types/habit'
import { isQueuedResult,OfflineMutationPreflightError,createQueuedAck,cancelQueuedDeleteForUndo } from '@/lib/offline-mutations'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { optimisticRemoveHabits,restoreDeletedHabits } from '@/lib/habit-optimistic-helpers'
import { snapshotHabitLists,updateHabitLists,restoreHabitLists,finalizeHabitMutation } from '@/lib/habit-mutation-helpers'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'
import { useTranslation } from 'react-i18next'
import { useUndoToast } from '@/hooks/use-undo-toast'
import { apiClient } from '@/lib/api-client'
import { useRestoreHabit } from './use-restore-habit'

const bulkDeleteConnectionRequirements = new WeakMap<string[], boolean>()

type OfflineBulkMutationOutcome<TResponse> = TResponse & {
  ambiguousIds: string[]
  offlineFailureIds: string[]
}

type BulkDeleteMutationOutcome = OfflineBulkMutationOutcome<BulkDeleteResponse> & {
  queuedDeletes: { habitId: string; mutationId: string }[]
}

function recordBulkFailure(
  error: unknown,
  habitIds: string[],
  failures: { ambiguousIds: string[]; offlineFailureIds: string[] },
): void {
  const rejectedIds = error instanceof OfflineMutationPreflightError ? failures.offlineFailureIds : failures.ambiguousIds
  rejectedIds.push(...habitIds)
}



function selectionRequiresCascadeDelete(snapshots: HabitListSnapshots, habitIds: string[]): boolean {
  return habitIds.some((habitId) => {
    const matches = snapshots.flatMap(([, habits]) => {
      const habit = habits && findHabitInList(habits, habitId)
      return habit ? [habit] : []
    })
    return matches.length === 0 || matches.some((habit) => habit.hasSubHabits || habit.children.length > 0)
  })
}

export function useBulkDeleteHabits() {
  const context = useBulkDeleteHabitsContext()
  const { queryClient } = context
  return useHabitMutation<
    BulkDeleteMutationOutcome,
    Error,
    string[],
    { previousLists: HabitListSnapshots; account: HabitAccount }
  >({
    mutationFn: createBulkDeleteHabitsMutationFn(context),

    onMutate: async (habitIds, _context, account) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.all })
      account.assertCurrent()

      const previousLists = snapshotHabitLists(queryClient)
      bulkDeleteConnectionRequirements.set(habitIds, selectionRequiresCascadeDelete(previousLists, habitIds))
      updateHabitLists(queryClient, (items) => optimisticRemoveHabits(items, habitIds))

      return { previousLists, account }
    },

    onError: (_err, _vars, context) => {
      if (!context) return
      restoreHabitLists(queryClient, context.previousLists)
    },

    onSuccess: createBulkDeleteHabitsOnSuccess(context),

    onSettled: (data, error) =>
      finalizeHabitMutation(queryClient, data, error, {
        includeGoals: true,
        includeCount: true,
        includeProfile: true,
      }),
  })
}

function useBulkDeleteHabitsContext() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const restoreHabit = useRestoreHabit()
  const showUndoToast = useUndoToast()
  return { queryClient, t, restoreHabit, showUndoToast }
}

type BulkDeleteOptions = UseMutationOptions<BulkDeleteMutationOutcome, Error, string[], { previousLists: HabitListSnapshots; account: HabitAccount }>

function createBulkDeleteHabitsMutationFn(context: ReturnType<typeof useBulkDeleteHabitsContext>) {
  const { queryClient } = context
  const callback: NonNullable<BulkDeleteOptions['mutationFn']> = async (habitIds) => {
    return withAccountGuard(async (guardedAccount) => {
      const account = guardedAccount
      const requiresConnection = bulkDeleteConnectionRequirements.get(habitIds) ?? true
      bulkDeleteConnectionRequirements.delete(habitIds)
      const results: BulkDeleteResponse['results'] = []
      const ambiguousIds: string[] = []
      const offlineFailureIds: string[] = []
      const queuedDeletes: BulkDeleteMutationOutcome['queuedDeletes'] = []
      for (let index = 0;index < habitIds.length;index += 4) {
        if (!account.stillCurrent()) break
        const chunk = habitIds.slice(index, index + 4)
        const outcomes = await Promise.allSettled(chunk.map(async (habitId) => {
          if (isCachedHabitDeleted(queryClient, habitId)) return
          const result = await performQueuedApiMutation<void>({
            type: requiresConnection ? 'bulkCascadeDeleteHabits' : 'deleteHabit',
            scope: 'habits',
            endpoint: API.habits.delete(habitId),
            method: 'DELETE',
            payload: requiresConnection ? null : { queuedAsChildless: true },
            entityType: 'habit',
            targetEntityId: habitId,
            execute: (mutation) => apiClient<void>(mutation.endpoint, {
              method: 'DELETE', idempotencyKey: mutation.id,
            }),
          })
          if (account.stillCurrent() && !isQueuedResult(result)) await removeDeletedHabitQueries(queryClient, habitId, undefined, account.stillCurrent)
          return result
        }))
        outcomes.forEach((outcome, itemIndex) => {
          const habitId = chunk[itemIndex]
          if (!habitId) return
          if (outcome.status === 'rejected') {
            recordBulkFailure(outcome.reason, [habitId], { ambiguousIds, offlineFailureIds })
            return
          }
          if (isQueuedResult(outcome.value)) {
            queuedDeletes.push({ habitId, mutationId: outcome.value.queuedMutationId })
          }
          results.push({
            index: index + itemIndex,
            status: 'Success',
            habitId,
            error: null,
          })
        })
      }
      const queuedDelete = queuedDeletes[0]
      return {
        results, ambiguousIds, offlineFailureIds, queuedDeletes,
        ...(queuedDelete ? createQueuedAck(queuedDelete.mutationId) : {}),
      }

    })
  }
  return callback
}

function createBulkDeleteHabitsOnSuccess(context: ReturnType<typeof useBulkDeleteHabitsContext>) {
  const { queryClient, t, restoreHabit, showUndoToast } = context
  const callback: NonNullable<BulkDeleteOptions['onSuccess']> = async (result, _vars, context) => {
    const queuedIds = new Set(result.queuedDeletes.map((item) => item.habitId))
    for (const item of result.results) {
      if (!context.account.stillCurrent()) return
      if (item.status === 'Success' && !queuedIds.has(item.habitId)) {
        await removeDeletedHabitQueries(queryClient, item.habitId, cachedHabitDeletionIds(queryClient, [item.habitId], context.previousLists.flatMap(([, items]) => items ?? [])), context.account.stillCurrent)
      }
    }
    if (!context.account.stillCurrent()) return
    const failedIds = new Set(
      result.results.flatMap((item) => item.status === 'Failed' ? [item.habitId] : []),
    )
    for (const habitId of result.offlineFailureIds) failedIds.add(habitId)
    if (failedIds.size > 0) {
      for (const [key, snapshot] of context.previousLists) {
        if (!snapshot) continue
        queryClient.setQueryData<HabitScheduleItem[]>(key, (current) =>
          current ? restoreDeletedHabits(current, snapshot, failedIds) : current,
        )
      }
    }
    const deleted = result.results.filter((item) => item.status === 'Success')
    if (deleted.length === 0) return
    const message = plural(t('undo.habitsDeleted', { count: deleted.length }), deleted.length)
    showUndoToast(message, () => {
      if (!context.account.stillCurrent()) return
      void (async () => {
        const queuedByHabit = new Map(result.queuedDeletes.map(({ habitId, mutationId }) => [habitId, mutationId]))
        const locallyRestored = new Set<string>()
        const serverRestoreIds = new Set<string>()
        const droppedRestoreIds = new Set<string>()
        await Promise.all(deleted.map(async (item) => {
          const mutationId = queuedByHabit.get(item.habitId)
          if (!mutationId) {
            serverRestoreIds.add(item.habitId)
            return
          }
          const outcome = await cancelQueuedDeleteForUndo(mutationId)
          if (!context.account.stillCurrent()) return
          if (outcome !== 'replayed') locallyRestored.add(item.habitId)
          if (outcome === 'dropped') {
            useOfflineSyncStore.getState().dismissDrop(mutationId)
            droppedRestoreIds.add(item.habitId)
            serverRestoreIds.add(item.habitId)
          }
          if (outcome === 'replayed' || outcome === 'uncertain') serverRestoreIds.add(item.habitId)
        }))
        if (!context.account.stillCurrent()) return
        for (const [key, snapshot] of context.previousLists) {
          if (!snapshot || locallyRestored.size === 0) continue
          queryClient.setQueryData<HabitScheduleItem[]>(key, (current) =>
            current ? restoreDeletedHabits(current, snapshot, locallyRestored) : current,
          )
        }
        if (locallyRestored.size > 0) {
          void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
          void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
        }
        const selectedDescendants = selectedDescendantsInSnapshots(context.previousLists, serverRestoreIds)
        for (const habitId of serverRestoreIds) {
          if (!selectedDescendants.has(habitId)) {
            restoreHabit.mutate(droppedRestoreIds.has(habitId)
              ? { habitId, reconcileNotFound: true }
              : habitId)
          }
        }
      })()
    })
  }
  return callback
}
