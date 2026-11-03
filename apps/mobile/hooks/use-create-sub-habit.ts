import type { HabitListSnapshots } from '@orbit/shared/query'
import { useQueryClient } from '@tanstack/react-query'
import { useHabitMutation } from './use-habit-mutation'
import { habitKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import { appendHabitDetailChild } from '@orbit/shared/utils'
import type { CreateSubHabitRequest,HabitDetail } from '@orbit/shared/types/habit'
import { type QueuedMarker,createTempEntityId } from '@/lib/offline-mutations'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { optimisticInsertSubHabit,optimisticPatchHabit } from '@/lib/habit-optimistic-helpers'
import { snapshotHabitLists,buildOptimisticSubHabit,updateHabitLists,restoreHabitLists,finalizeHabitMutation } from '@/lib/habit-mutation-helpers'

type CreateSubHabitMutationInput = {
  parentId: string
  data: CreateSubHabitRequest
  __offlineTempId?: string
}

export function useCreateSubHabit() {
  const queryClient = useQueryClient()

  return useHabitMutation<
    void | QueuedMarker,
    Error,
    CreateSubHabitMutationInput,
    { previousLists: HabitListSnapshots; previousDetail: HabitDetail | undefined }
  >({
    mutationFn: async ({ parentId, data, __offlineTempId }) => {
      const tempId = __offlineTempId ?? createTempEntityId('habit')

      return performQueuedApiMutation<void>({
        type: 'createSubHabit',
        scope: 'habits',
        endpoint: API.habits.subHabits(parentId),
        method: 'POST',
        payload: data,
        entityType: 'habit',
        targetEntityId: parentId,
        clientEntityId: tempId,
        dependsOn: parentId.startsWith('offline-') ? [parentId] : [],
      })
    },

    onMutate: async (input, _context, account) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: habitKeys.lists() }),
        queryClient.cancelQueries({ queryKey: habitKeys.detail(input.parentId) }),
      ])
      account.assertCurrent()

      const { parentId, data } = input
      const previousLists = snapshotHabitLists(queryClient)
      const previousDetail = queryClient.getQueryData<HabitDetail>(habitKeys.detail(parentId))
      const tempId = createTempEntityId('habit')
      input.__offlineTempId = tempId
      const optimisticChild = buildOptimisticSubHabit(queryClient, parentId, tempId, data)
      updateHabitLists(queryClient, (items) =>
        optimisticInsertSubHabit(
          optimisticPatchHabit(items, parentId, { hasSubHabits: true }),
          parentId,
          optimisticChild,
        ),
      )
      queryClient.setQueryData<HabitDetail>(habitKeys.detail(parentId), (detail) =>
        detail ? appendHabitDetailChild(detail, tempId, data) : detail,
      )

      return { previousLists, previousDetail }
    },

    onError: (_err, variables, context) => {
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
      if (context?.previousDetail) {
        queryClient.setQueryData(habitKeys.detail(variables.parentId), context.previousDetail)
      }
    },

    onSettled: (data, error, { parentId }) =>
      finalizeHabitMutation(queryClient, data, error, { habitId: parentId }),
  })
}
