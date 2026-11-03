import type { HabitListSnapshots } from '@orbit/shared/query'
import { useQueryClient } from '@tanstack/react-query'
import { useHabitMutation } from './use-habit-mutation'
import { habitKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { validateApiRequest,createHabitRequestSchema } from '@orbit/shared'
import type { CreateHabitRequest } from '@orbit/shared/types/habit'
import { createTempEntityId,type QueuedMarker } from '@/lib/offline-mutations'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { optimisticInsertHabit } from '@/lib/habit-optimistic-helpers'
import { snapshotHabitLists,buildOptimisticHabit,updateHabitLists,restoreHabitLists,finalizeHabitMutation } from '@/lib/habit-mutation-helpers'
import { useUIStore } from '@/stores/ui-store'

type CreateHabitMutationInput = CreateHabitRequest & { __offlineTempId?: string; __offlineDependsOn?: string[] }

export function useCreateHabit() {
  const queryClient = useQueryClient()

  return useHabitMutation<
    { id: string },
    Error,
    CreateHabitMutationInput,
    { previousLists: HabitListSnapshots; tempId: string }
  >({
    mutationFn: async (input) => {
      const { __offlineTempId, __offlineDependsOn, ...data } = input
      const request = validateApiRequest(data, createHabitRequestSchema)
      const tempId = __offlineTempId ?? createTempEntityId('habit')

      return performQueuedApiMutation<{ id: string }, { id: string } & QueuedMarker>({
        type: 'createHabit',
        scope: 'habits',
        endpoint: API.habits.create,
        method: 'POST',
        payload: request,
        entityType: 'habit',
        clientEntityId: tempId,
        dependsOn: __offlineDependsOn,
        queuedResultFactory: (mutationId) => ({
          id: tempId,
          queued: true,
          queuedMutationId: mutationId,
        }),
      })
    },

    onMutate: async (data, _context, account) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })
      account.assertCurrent()

      const previousLists = snapshotHabitLists(queryClient)
      const tempId = createTempEntityId('habit')
      data.__offlineTempId = tempId
      const optimisticHabit = buildOptimisticHabit(queryClient, tempId, data)

      updateHabitLists(queryClient, (items) => optimisticInsertHabit(items, optimisticHabit))

      return { previousLists, tempId }
    },

    onError: (_err, _vars, context) => {
      if (!context) return
      restoreHabitLists(queryClient, context.previousLists)
    },

    onSuccess: (result) => {
      useUIStore.getState().setLastCreatedHabitId(result.id)
    },

    onSettled: (data, error) =>
      finalizeHabitMutation(queryClient, data, error, { includeCount: true }),
  })
}
