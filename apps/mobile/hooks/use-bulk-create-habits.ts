import type { HabitListSnapshots } from '@orbit/shared/query'
import { useQueryClient } from '@tanstack/react-query'
import { useHabitMutation } from './use-habit-mutation'
import { habitKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { BulkCreateResponse,BulkCreateRequest } from '@orbit/shared/types/habit'
import { createTempEntityId,type QueuedMarker } from '@/lib/offline-mutations'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { optimisticInsertHabit } from '@/lib/habit-optimistic-helpers'
import { snapshotHabitLists,buildOptimisticHabit,updateHabitLists,restoreHabitLists,finalizeHabitMutation } from '@/lib/habit-mutation-helpers'

type BulkCreateHabitMutationInput = BulkCreateRequest & { __offlineTempIds?: string[] }

export function useBulkCreateHabits() {
  const queryClient = useQueryClient()

  return useHabitMutation<
    BulkCreateResponse,
    Error,
    BulkCreateHabitMutationInput,
    { previousLists: HabitListSnapshots; createdCount: number }
  >({
    mutationFn: async (input) => {
      const { __offlineTempIds, ...data } = input
      const tempIds =
        __offlineTempIds ?? data.habits.map(() => createTempEntityId('habit'))

      return performQueuedApiMutation<BulkCreateResponse, BulkCreateResponse & QueuedMarker>({
        type: 'bulkCreateHabits',
        scope: 'habits',
        endpoint: API.habits.bulk,
        method: 'POST',
        payload: data,
        queuedResultFactory: (mutationId) => ({
          results: data.habits.map((habit, index) => ({
            index,
            status: 'Success' as const,
            habitId: tempIds[index] ?? null,
            title: habit.title,
            error: null,
            field: null,
          })),
          queued: true as const,
          queuedMutationId: mutationId,
        }),
      })
    },

    onMutate: async (data, _context, account) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })
      account.assertCurrent()

      const previousLists = snapshotHabitLists(queryClient)
      const tempIds = data.habits.map(() => createTempEntityId('habit'))
      data.__offlineTempIds = tempIds

      const optimisticHabits = data.habits.map((habit, index) =>
        buildOptimisticHabit(queryClient, tempIds[index]!, {
          title: habit.title,
          description: habit.description ?? undefined,
          frequencyUnit: habit.frequencyUnit ?? undefined,
          frequencyQuantity: habit.frequencyQuantity ?? undefined,
          days: habit.days ?? undefined,
          isBadHabit: habit.isBadHabit ?? undefined,
          isGeneral: habit.isGeneral ?? undefined,
          isFlexible: habit.isFlexible ?? undefined,
          dueDate: habit.dueDate ?? undefined,
          dueTime: habit.dueTime ?? undefined,
          dueEndTime: habit.dueEndTime ?? undefined,
          reminderEnabled: habit.reminderEnabled ?? undefined,
          reminderTimes: habit.reminderTimes ?? undefined,
          scheduledReminders: habit.scheduledReminders ?? undefined,
          relativeReminders: habit.relativeReminders ?? undefined,
          checklistItems: habit.checklistItems ?? undefined,
          subHabits: habit.subHabits?.map((subHabit) => subHabit.title) ?? undefined,
          endDate: habit.endDate ?? undefined,
        }),
      )

      updateHabitLists(queryClient, (items) =>
        optimisticHabits.reduce(
          (nextItems, optimisticHabit) => optimisticInsertHabit(nextItems, optimisticHabit),
          items,
        ),
      )

      return { previousLists, createdCount: optimisticHabits.length }
    },

    onError: (_err, _vars, context) => {
      if (!context) return
      restoreHabitLists(queryClient, context.previousLists)
    },

    onSettled: (data, error) =>
      finalizeHabitMutation(queryClient, data, error, { includeCount: true }),
  })
}
