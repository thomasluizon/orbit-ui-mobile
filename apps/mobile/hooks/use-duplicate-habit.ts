import type { HabitListSnapshots } from '@orbit/shared/query'
import { useQueryClient } from '@tanstack/react-query'
import { useHabitMutation } from './use-habit-mutation'
import { habitKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { type QueuedMarker,createTempEntityId } from '@/lib/offline-mutations'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { optimisticInsertHabit } from '@/lib/habit-optimistic-helpers'
import { snapshotHabitLists,buildOptimisticDuplicateHabit,updateHabitLists,adjustHabitCount,restoreHabitLists,finalizeHabitMutation } from '@/lib/habit-mutation-helpers'

export function useDuplicateHabit() {
  const queryClient = useQueryClient()

  return useHabitMutation<
    void | QueuedMarker,
    Error,
    string,
    { previousLists: HabitListSnapshots; tempId: string | null }
  >({
    mutationFn: (habitId) =>
      performQueuedApiMutation<void>({
        type: 'duplicateHabit',
        scope: 'habits',
        endpoint: API.habits.duplicate(habitId),
        method: 'POST',
        payload: null,
        entityType: 'habit',
        targetEntityId: habitId,
      }),

    onMutate: async (habitId, _context, account) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })
      account.assertCurrent()

      const previousLists = snapshotHabitLists(queryClient)
      const tempId = createTempEntityId('habit')
      const optimisticDuplicate = buildOptimisticDuplicateHabit(queryClient, habitId, tempId)

      if (optimisticDuplicate) {
        updateHabitLists(queryClient, (items) => optimisticInsertHabit(items, optimisticDuplicate))
        adjustHabitCount(queryClient, 1)
      }

      return { previousLists, tempId: optimisticDuplicate ? tempId : null }
    },

    onError: (_err, _vars, context) => {
      if (!context) return
      restoreHabitLists(queryClient, context.previousLists)
      if (context.tempId) {
        adjustHabitCount(queryClient, -1)
      }
    },

    onSettled: (data, error) => finalizeHabitMutation(queryClient, data, error),
  })
}
