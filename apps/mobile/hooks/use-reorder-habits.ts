import type { HabitListSnapshots } from '@orbit/shared/query'
import { useQueryClient } from '@tanstack/react-query'
import { useHabitMutation } from './use-habit-mutation'
import { habitKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { ReorderHabitsRequest } from '@orbit/shared/types/habit'
import { type QueuedMarker } from '@/lib/offline-mutations'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { optimisticReorderHabits } from '@/lib/habit-optimistic-helpers'
import { snapshotHabitLists,updateHabitLists,restoreHabitLists,finalizeHabitMutation } from '@/lib/habit-mutation-helpers'

export function useReorderHabits() {
  const queryClient = useQueryClient()

  return useHabitMutation<
    void | QueuedMarker,
    Error,
    ReorderHabitsRequest,
    { previousLists: HabitListSnapshots }
  >({
    mutationFn: (data) =>
      performQueuedApiMutation<void>({
        type: 'reorderHabits',
        scope: 'habits',
        endpoint: API.habits.reorder,
        method: 'PUT',
        payload: data,
        dedupeKey: 'habits:reorder',
      }),

    onMutate: async (data, _context, account) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })
      account.assertCurrent()

      const previousLists = snapshotHabitLists(queryClient)
      updateHabitLists(queryClient, (items) => optimisticReorderHabits(items, data.positions))

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
