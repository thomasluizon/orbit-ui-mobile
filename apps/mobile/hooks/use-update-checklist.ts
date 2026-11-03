import { applyHabitChecklistDetails } from '@orbit/shared/hooks'
import type { HabitListSnapshots } from '@orbit/shared/query'
import { useQueryClient } from '@tanstack/react-query'
import { useHabitMutation } from './use-habit-mutation'
import { habitKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { ChecklistItem,HabitDetail,HabitFullDetail } from '@orbit/shared/types/habit'
import { type QueuedMarker } from '@/lib/offline-mutations'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { optimisticUpdateChecklist } from '@/lib/habit-optimistic-helpers'
import { snapshotHabitLists,updateHabitLists,restoreHabitLists,finalizeHabitMutation } from '@/lib/habit-mutation-helpers'

export function useUpdateChecklist() {
  const queryClient = useQueryClient()

  return useHabitMutation<
    void | QueuedMarker,
    Error,
    { habitId: string; items: ChecklistItem[] },
    {
      previousLists: HabitListSnapshots
      previousDetail: HabitDetail | undefined
      previousFullDetail: HabitFullDetail | undefined
    }
  >({
    mutationFn: ({ habitId, items }) =>
      performQueuedApiMutation<void>({
        type: 'updateChecklist',
        scope: 'habits',
        endpoint: API.habits.checklist(habitId),
        method: 'PUT',
        payload: { checklistItems: items },
        entityType: 'habit',
        targetEntityId: habitId,
      }),

    onMutate: async ({ habitId, items }, _context, account) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: habitKeys.lists() }),
        queryClient.cancelQueries({ queryKey: habitKeys.detail(habitId) }),
        queryClient.cancelQueries({ queryKey: habitKeys.fullDetail(habitId) }),
      ])
      account.assertCurrent()

      const previousLists = snapshotHabitLists(queryClient)


      updateHabitLists(queryClient, (oldItems) =>
        optimisticUpdateChecklist(oldItems, habitId, items),
      )
      const { previousDetail, previousFullDetail } = applyHabitChecklistDetails(queryClient, habitId, items)

      return { previousLists, previousDetail, previousFullDetail }
    },

    onError: (_err, { habitId }, context) => {
      if (!context) return
      restoreHabitLists(queryClient, context.previousLists)
      if (context.previousDetail) {
        queryClient.setQueryData(habitKeys.detail(habitId), context.previousDetail)
      }
      if (context.previousFullDetail) {
        queryClient.setQueryData(habitKeys.fullDetail(habitId), context.previousFullDetail)
      }
    },

    onSettled: (data, error, variables) =>
      finalizeHabitMutation(queryClient, data, error, { habitId: variables.habitId, includeProfile: true }),
  })
}
