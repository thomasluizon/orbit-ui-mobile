import type { HabitListSnapshots } from '@orbit/shared/query'
import { useQueryClient } from '@tanstack/react-query'
import { useHabitMutation } from './use-habit-mutation'
import { habitKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { MoveHabitParentRequest } from '@orbit/shared/types/habit'
import { type QueuedMarker } from '@/lib/offline-mutations'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { snapshotHabitLists,updateHabitLists,optimisticMoveHabitParent,restoreHabitLists,finalizeHabitMutation } from '@/lib/habit-mutation-helpers'

export function useMoveHabitParent() {
  const queryClient = useQueryClient()

  return useHabitMutation<void | QueuedMarker, Error, {
    habitId: string
    data: MoveHabitParentRequest
  }, {
    previousLists: HabitListSnapshots
  }>({
    mutationFn: async ({ habitId, data }) => {
      const targetEntityId =
        data.parentId?.startsWith('offline-') ? data.parentId : habitId

      return performQueuedApiMutation<void>({
        type: 'moveHabitParent',
        scope: 'habits',
        endpoint: API.habits.parent(habitId),
        method: 'PUT',
        payload: data,
        entityType: 'habit',
        targetEntityId,
        dependsOn: data.parentId ? [data.parentId] : [],
      })
    },

    onMutate: async ({ habitId, data }, _context, account) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })
      account.assertCurrent()

      const previousLists = snapshotHabitLists(queryClient)
      updateHabitLists(queryClient, (items) =>
        optimisticMoveHabitParent(items, habitId, data.parentId),
      )

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
    },

    onSettled: (data, error) => finalizeHabitMutation(queryClient, data, error),
  })
}
